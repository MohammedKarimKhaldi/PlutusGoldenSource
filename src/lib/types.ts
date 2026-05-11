export const OUTREACH_STAGES = [
  "Research",
  "Selected",
  "Ready to Contact",
  "Contacted",
  "Follow-up",
  "Meeting",
  "Qualified",
  "Not Relevant",
  "Closed",
] as const;

export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export const ENRICHMENT_STATUSES = ["pending", "completed", "needs_review", "failed"] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

export const INVESTMENT_STATUSES = ["prospect", "past_investor", "current_investor"] as const;
export type InvestmentStatus = (typeof INVESTMENT_STATUSES)[number];

export const CAPACITY_STATUSES = ["unknown", "available", "fully_allocated"] as const;
export type CapacityStatus = (typeof CAPACITY_STATUSES)[number];

export const INVESTMENT_DEAL_STATUSES = ["prospective", "active", "closed", "passed"] as const;
export type InvestmentDealStatus = (typeof INVESTMENT_DEAL_STATUSES)[number];

export const ACCOUNTING_ROLES = ["viewer", "editor", "admin"] as const;
export type AccountingRole = (typeof ACCOUNTING_ROLES)[number];

export const ACCOUNTING_DOCUMENT_TYPES = ["retainer", "commission", "expense", "adjustment"] as const;
export type AccountingDocumentType = (typeof ACCOUNTING_DOCUMENT_TYPES)[number];

export const ACCOUNTING_DOCUMENT_STATUSES = ["draft", "open", "partially_paid", "paid", "void"] as const;
export type AccountingDocumentStatus = (typeof ACCOUNTING_DOCUMENT_STATUSES)[number];

export const ACCOUNTING_LEDGER_ENTRY_TYPES = ["retainer_payment", "commission_payment", "expense_payment", "adjustment"] as const;
export type AccountingLedgerEntryType = (typeof ACCOUNTING_LEDGER_ENTRY_TYPES)[number];

export const ACCOUNTING_DIRECTIONS = ["incoming", "outgoing"] as const;
export type AccountingDirection = (typeof ACCOUNTING_DIRECTIONS)[number];

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type Person = {
  id: string;
  sourcePersonIds: string[];
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  emails: string[];
  phone: string | null;
  linkedinUrl: string | null;
  jobTitle: string | null;
  country: string | null;
  categories: string[];
  connectionStrength: string | null;
  highlighted: boolean;
  investmentRelationships: InvestmentRelationship[];
};

export type Activity = {
  id: string;
  type: "email" | "call" | "meeting" | "note" | "status_change";
  summary: string;
  occurredAt: string;
};

export type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  status: "open" | "done";
  companyId: string;
  personId?: string | null;
};

export type Company = {
  id: string;
  name: string;
  normalizedName: string;
  websiteDomain: string | null;
  websiteDomains: string[];
  description: string | null;
  country: string | null;
  categories: string[];
  status: "active" | "review" | "archived";
  ownerName: string | null;
  sourceQuality: "high" | "medium" | "low" | "review";
  outreachStage: OutreachStage;
  tags: Tag[];
  people: Person[];
  activities: Activity[];
  nextTask: Task | null;
  lastActivityAt: string | null;
  mergeConfidence: number | null;
  enrichment: CompanyEnrichment | null;
  investmentRelationships: InvestmentRelationship[];
};

export type CompanyEnrichment = {
  companyId: string;
  status: EnrichmentStatus;
  summary: string | null;
  industry: string | null;
  subsector: string | null;
  companyType: string | null;
  location: string | null;
  keywords: string[];
  sourceUrl: string | null;
  model: string | null;
  confidence: number | null;
  errorMessage: string | null;
  generatedAt: string | null;
  reviewedAt: string | null;
  updatedAt: string | null;
};

export type InvestmentDeal = {
  id: string;
  name: string;
  status: InvestmentDealStatus;
  investedAt: string | null;
  notes: string | null;
  role: string | null;
};

export type InvestmentRelationship = {
  id: string;
  companyId: string | null;
  personId: string | null;
  investmentStatus: InvestmentStatus;
  capacityStatus: CapacityStatus;
  notes: string | null;
  lastInvestedDate: string | null;
  deals: InvestmentDeal[];
};

export type AccountingAccess = {
  canView: boolean;
  canEdit: boolean;
  canAdmin: boolean;
  role: AccountingRole | null;
};

export type AccountingDocument = {
  id: string;
  companyId: string | null;
  documentType: AccountingDocumentType;
  status: AccountingDocumentStatus;
  title: string;
  amountMinor: number;
  currency: string;
  issuedOn: string | null;
  dueOn: string | null;
  externalReference: string | null;
  documentUrl: string | null;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountingLedgerEntry = {
  id: string;
  documentId: string | null;
  companyId: string | null;
  entryType: AccountingLedgerEntryType;
  direction: AccountingDirection;
  amountMinor: number;
  currency: string;
  occurredOn: string;
  externalReference: string | null;
  documentUrl: string | null;
  notes: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AccountingCurrencySummary = {
  currency: string;
  retainerIncomeMinor: number;
  commissionIncomeMinor: number;
  expensesMinor: number;
  adjustmentsMinor: number;
  netCashMinor: number;
  outstandingMinor: number;
};

export type AccountingData = {
  documents: AccountingDocument[];
  ledgerEntries: AccountingLedgerEntry[];
  summaries: AccountingCurrencySummary[];
};

export type ImportSummary = {
  totalRows: number;
  rawRows: number;
  normalizedCompanies: number;
  normalizedPeople: number;
  suspiciousMerges: number;
  unmatchedRows: number;
  lastImportedAt: string | null;
};

export type DashboardData = {
  currentUserName: string;
  companies: Company[];
  tags: Tag[];
  tasks: Task[];
  importSummary: ImportSummary;
  accountingAccess: AccountingAccess;
  accounting: AccountingData | null;
  authMode: "demo" | "supabase";
  dataMode: "demo" | "supabase";
  localEnrichmentEnabled: boolean;
  dataWarning?: string;
};
