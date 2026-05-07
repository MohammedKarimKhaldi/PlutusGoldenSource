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

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type Person = {
  id: string;
  sourcePersonIds: string[];
  displayName: string;
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
  authMode: "demo" | "supabase";
  dataMode: "demo" | "supabase";
  localEnrichmentEnabled: boolean;
  dataWarning?: string;
};
