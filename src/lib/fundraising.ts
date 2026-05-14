import { buildAccountingSummaries } from "@/lib/accounting";
import type { AccountingData, ClientDashboardData, FundraisingClient, FundraisingCurrencySummary, FundraisingClientTarget, FundraisingRetainerPeriod } from "@/lib/types";

function addCurrencySummary(summaries: Map<string, FundraisingCurrencySummary>, currency: string) {
  const existing = summaries.get(currency);
  if (existing) return existing;

  const summary: FundraisingCurrencySummary = {
    currency,
    targetRaiseMinor: 0,
    ticketSizeMinMinor: 0,
    ticketSizeMaxMinor: 0,
    retainerIncomeMinor: 0,
    commissionIncomeMinor: 0,
    expensesMinor: 0,
    netCashMinor: 0,
    outstandingMinor: 0,
    pendingRetainerMinor: 0,
    overdueRetainerMinor: 0,
  };
  summaries.set(currency, summary);
  return summary;
}

export function emptyClientDashboardData(): ClientDashboardData {
  return {
    clients: [],
    targets: [],
    retainerPeriods: [],
    summaries: [],
  };
}

export function buildFundraisingSummaries(
  clients: FundraisingClient[],
  targets: FundraisingClientTarget[],
  accounting: AccountingData | null,
  retainerPeriods: FundraisingRetainerPeriod[] = [],
): FundraisingCurrencySummary[] {
  const summaries = new Map<string, FundraisingCurrencySummary>();
  const clientCompanyIds = new Set(clients.map((client) => client.companyId));

  for (const client of clients) {
    if (!client.targetRaiseCurrency || client.targetRaiseAmountMinor == null || client.stage === "paused") continue;
    addCurrencySummary(summaries, client.targetRaiseCurrency).targetRaiseMinor += client.targetRaiseAmountMinor;
  }

  for (const target of targets) {
    if (!target.ticketSizeCurrency || target.stage === "passed") continue;
    const summary = addCurrencySummary(summaries, target.ticketSizeCurrency);
    summary.ticketSizeMinMinor += target.ticketSizeMinMinor ?? 0;
    summary.ticketSizeMaxMinor += target.ticketSizeMaxMinor ?? target.ticketSizeMinMinor ?? 0;
  }

  for (const period of retainerPeriods) {
    const summary = addCurrencySummary(summaries, period.currency);
    if (period.status === "pending") {
      summary.pendingRetainerMinor += period.expectedAmountMinor;
    } else if (period.status === "overdue") {
      summary.overdueRetainerMinor += period.expectedAmountMinor;
    }
  }

  if (accounting) {
    const accountingSummaries = buildAccountingSummaries(
      accounting.documents.filter((document) => document.companyId && clientCompanyIds.has(document.companyId)),
      accounting.ledgerEntries.filter((entry) => entry.companyId && clientCompanyIds.has(entry.companyId)),
    );

    for (const summary of accountingSummaries) {
      const nextSummary = addCurrencySummary(summaries, summary.currency);
      nextSummary.retainerIncomeMinor += summary.retainerIncomeMinor;
      nextSummary.commissionIncomeMinor += summary.commissionIncomeMinor;
      nextSummary.expensesMinor += summary.expensesMinor;
      nextSummary.netCashMinor += summary.netCashMinor;
      nextSummary.outstandingMinor += summary.outstandingMinor;
    }

    for (const document of accounting.documents) {
      if (!document.companyId || !clientCompanyIds.has(document.companyId) || document.status === "void" || document.voidedAt) continue;
      addCurrencySummary(summaries, document.currency);
    }
  }

  return [...summaries.values()].sort((left, right) => left.currency.localeCompare(right.currency, "en-US"));
}

export function withFundraisingSummaries(data: Omit<ClientDashboardData, "summaries">, accounting: AccountingData | null): ClientDashboardData {
  return {
    ...data,
    summaries: buildFundraisingSummaries(data.clients, data.targets, accounting, data.retainerPeriods),
  };
}
