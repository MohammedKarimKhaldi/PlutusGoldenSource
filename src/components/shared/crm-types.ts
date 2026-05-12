import type {
  AccountingDirection,
  AccountingDocumentStatus,
  AccountingDocumentType,
  AccountingLedgerEntryType,
  CapacityStatus,
  Company,
  InvestmentDealStatus,
  InvestmentStatus,
  Person,
} from "@/lib/types";

export type PeoplePageSize = 50 | 100 | 250 | 500 | 1000 | "all";

export type InvestmentDraft = {
  targetKey: string;
  investmentStatus: InvestmentStatus;
  capacityStatus: CapacityStatus;
  notes: string;
  lastInvestedDate: string;
  dealName: string;
  dealStatus: InvestmentDealStatus;
  dealDate: string;
  dealRole: string;
  dealNotes: string;
};

export type AccountingDocumentDraft = {
  documentId: string | null;
  documentType: AccountingDocumentType;
  status: Exclude<AccountingDocumentStatus, "void">;
  companyId: string;
  title: string;
  amount: string;
  currency: string;
  issuedOn: string;
  dueOn: string;
  externalReference: string;
  documentUrl: string;
  notes: string;
};

export type AccountingLedgerDraft = {
  entryId: string | null;
  documentId: string;
  entryType: AccountingLedgerEntryType;
  direction: AccountingDirection;
  companyId: string;
  amount: string;
  currency: string;
  occurredOn: string;
  externalReference: string;
  documentUrl: string;
  notes: string;
};

export type PipelineStatusDraft = {
  status: InvestmentDealStatus;
  note: string;
};

export type TagSummary =
  | { key: string; type: "company"; id: string; name: string; color: string; count: number }
  | { key: string; type: "contact"; name: string; count: number };

export type EnrichmentDraft = {
  companyId: string;
  summary: string;
  industry: string;
  subsector: string;
  companyType: string;
  location: string;
  keywords: string;
};

export type PeopleDirectoryRow = {
  person: Person;
  company: Company;
  companies: Company[];
};
