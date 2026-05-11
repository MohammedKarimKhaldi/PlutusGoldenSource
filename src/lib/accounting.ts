import type { AccountingCurrencySummary, AccountingDocument, AccountingLedgerEntry } from "./types";

const EMPTY_SUMMARY: Omit<AccountingCurrencySummary, "currency"> = {
  retainerIncomeMinor: 0,
  commissionIncomeMinor: 0,
  expensesMinor: 0,
  adjustmentsMinor: 0,
  netCashMinor: 0,
  outstandingMinor: 0,
};

function summaryFor(summaries: Map<string, AccountingCurrencySummary>, currency: string) {
  const normalizedCurrency = currency.toUpperCase();
  const existing = summaries.get(normalizedCurrency);
  if (existing) return existing;

  const summary = { currency: normalizedCurrency, ...EMPTY_SUMMARY };
  summaries.set(normalizedCurrency, summary);
  return summary;
}

function signedAmount(entry: AccountingLedgerEntry) {
  return entry.direction === "incoming" ? entry.amountMinor : -entry.amountMinor;
}

function ledgerPaidByDocument(entries: AccountingLedgerEntry[]) {
  const paidByDocument = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.documentId || entry.voidedAt) continue;
    paidByDocument.set(entry.documentId, (paidByDocument.get(entry.documentId) ?? 0) + Math.abs(entry.amountMinor));
  }

  return paidByDocument;
}

export function buildAccountingSummaries(documents: AccountingDocument[], ledgerEntries: AccountingLedgerEntry[]) {
  const summaries = new Map<string, AccountingCurrencySummary>();
  const paidByDocument = ledgerPaidByDocument(ledgerEntries);

  for (const entry of ledgerEntries) {
    if (entry.voidedAt) continue;
    const summary = summaryFor(summaries, entry.currency);

    if (entry.entryType === "retainer_payment" && entry.direction === "incoming") {
      summary.retainerIncomeMinor += entry.amountMinor;
    } else if (entry.entryType === "commission_payment" && entry.direction === "incoming") {
      summary.commissionIncomeMinor += entry.amountMinor;
    } else if (entry.entryType === "expense_payment" && entry.direction === "outgoing") {
      summary.expensesMinor += entry.amountMinor;
    } else if (entry.entryType === "adjustment") {
      summary.adjustmentsMinor += signedAmount(entry);
    }

    summary.netCashMinor = summary.retainerIncomeMinor + summary.commissionIncomeMinor - summary.expensesMinor + summary.adjustmentsMinor;
  }

  for (const document of documents) {
    if (document.status !== "open" && document.status !== "partially_paid") continue;
    if (document.voidedAt) continue;

    const paidMinor = paidByDocument.get(document.id) ?? 0;
    const outstandingMinor = Math.max(0, document.amountMinor - paidMinor);
    if (outstandingMinor === 0) continue;

    summaryFor(summaries, document.currency).outstandingMinor += outstandingMinor;
  }

  return [...summaries.values()].sort((left, right) => left.currency.localeCompare(right.currency));
}
