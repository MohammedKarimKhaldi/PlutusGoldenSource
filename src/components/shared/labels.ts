import type {
  AccountingDirection,
  AccountingDocumentStatus,
  AccountingDocumentType,
  AccountingLedgerEntryType,
  CapacityStatus,
  InvestmentDealStatus,
  InvestmentRelationship,
  InvestmentStatus,
} from "@/lib/types";

export const SOURCE_QUALITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  review: "Review",
};

export const INVESTMENT_STATUS_LABELS: Record<InvestmentStatus, string> = {
  prospect: "Prospect",
  past_investor: "Past investor",
  current_investor: "Current investor",
};

export const CAPACITY_STATUS_LABELS: Record<CapacityStatus, string> = {
  unknown: "Unknown capacity",
  available: "Available",
  fully_allocated: "Fully allocated",
};

export const INVESTMENT_DEAL_STATUS_LABELS: Record<InvestmentDealStatus, string> = {
  prospective: "Prospective",
  active: "Active",
  closed: "Closed",
  passed: "Passed",
};

export const ACCOUNTING_DOCUMENT_TYPE_LABELS: Record<AccountingDocumentType, string> = {
  retainer: "Retainer",
  commission: "Cash commission",
  expense: "Expense",
  adjustment: "Adjustment",
};

export const ACCOUNTING_DOCUMENT_STATUS_LABELS: Record<AccountingDocumentStatus, string> = {
  draft: "Draft",
  open: "Open",
  partially_paid: "Part paid",
  paid: "Paid",
  void: "Void",
};

export const ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS: Record<AccountingLedgerEntryType, string> = {
  retainer_payment: "Retainer payment",
  commission_payment: "Commission payment",
  expense_payment: "Expense payment",
  adjustment: "Adjustment",
};

export const ACCOUNTING_DIRECTION_LABELS: Record<AccountingDirection, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
};

export const PEOPLE_PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000, "all"] as const;

export function relationshipChipLabel(relationship: InvestmentRelationship) {
  const labels = [INVESTMENT_STATUS_LABELS[relationship.investmentStatus], CAPACITY_STATUS_LABELS[relationship.capacityStatus]];
  if (relationship.deals.length > 0) labels.push(`${relationship.deals.length} deal${relationship.deals.length === 1 ? "" : "s"}`);
  return labels.join(" • ");
}
