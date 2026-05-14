import type {
  AccountingData,
  AccountingDocument,
  AccountingLedgerEntry,
  Company,
  CompanyEnrichment,
  DashboardData,
  InvestmentDealStatus,
  InvestmentRelationship,
  OutreachStage,
  Person,
  Tag,
} from "@/lib/types";
import type {
  AccountingDocumentDraft,
  AccountingLedgerDraft,
  EnrichmentBatchProgress,
  EnrichmentDraft,
  InvestmentDraft,
  PeopleDirectoryRow,
  PeoplePageSize,
  PipelineStatusDraft,
  TagSummary,
} from "@/components/shared";

export type CrmShellProps = {
  initialData: DashboardData;
  authSuccess?: boolean;
  companyId?: string;
  fundraisingClientId?: string;
  hideDetailPanel?: boolean;
  hideTable?: boolean;
  activeView?: ActiveView;
};

export type ActiveView = "companies" | "people" | "tags" | "pipeline" | "clients" | "tasks" | "import" | "accounting";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type PendingPersonUpdate = {
  organizationId: string;
  personId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  emails?: string[];
  jobTitle?: string | null;
  linkedinUrl?: string | null;
  phone?: string | null;
  country?: string | null;
  categories: string[];
  syncEmails?: boolean;
};

export type PendingChangeRecord =
  | {
      kind: "person";
      key: string;
      label: string;
      personUpdate: PendingPersonUpdate;
    }
  | {
      kind: "stage";
      key: string;
      label: string;
      organizationId: string | null;
      companyIds: string[];
      stage: OutreachStage;
    }
  | {
      kind: "company-tag";
      key: string;
      label: string;
      organizationId: string | null;
      companyIds: string[];
      tagName: string;
      color: string;
    }
  | {
      kind: "highlight";
      key: string;
      label: string;
      companyId: string;
      personId: string;
      highlighted: boolean;
    }
  | {
      kind: "company-update";
      key: string;
      label: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "company-enrichment-update";
      key: string;
      label: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "investment-relationship";
      key: string;
      label: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "investment-deal";
      key: string;
      label: string;
      payload: Record<string, unknown>;
      localDeal: {
        companyId: string | null;
        personId: string | null;
        relationshipId: string;
        dealId: string;
        dealName: string;
        dealStatus: InvestmentDealStatus;
        investedAt: string | null;
        role: string | null;
        notes: string | null;
      };
    }
  | {
      kind: "investment-deal-status";
      key: string;
      label: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "company-tag-rename";
      key: string;
      label: string;
      organizationId: string | null;
      tagId: string;
      name: string;
    }
  | {
      kind: "activity-note";
      key: string;
      label: string;
      organizationId: string | null;
      companyId: string;
      summary: string;
    }
  | {
      kind: "company-merge";
      key: string;
      label: string;
      organizationId: string | null;
      targetCompanyId: string;
      sourceCompanyIds: string[];
    }
  | {
      kind: "people-merge";
      key: string;
      label: string;
      organizationId: string | null;
      targetPersonId: string;
      sourcePersonId: string;
    }
  | {
      kind: "accounting-document-save";
      key: string;
      label: string;
      localId: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "accounting-ledger-entry-save";
      key: string;
      label: string;
      localId: string;
      payload: Record<string, unknown>;
    }
  | {
      kind: "accounting-record-action";
      key: string;
      label: string;
      action: "void" | "delete";
      entityType: "document" | "ledger_entry";
      id: string;
      reason: string;
    }
  | {
      kind: "fundraising-client-save";
      key: string;
      label: string;
      localId: string;
      localCompanyId?: string | null;
      localPrimaryContactPersonId?: string | null;
      payload: Record<string, unknown>;
    }
  | {
      kind: "fundraising-target-save";
      key: string;
      label: string;
      localId: string;
      localInvestorCompanyId?: string | null;
      localInvestorPersonId?: string | null;
      payload: Record<string, unknown>;
    }
  | {
      kind: "fundraising-delete";
      key: string;
      label: string;
      entityType: "client" | "target";
      id: string;
    };

export type PendingPushContext = {
  resolveId: (id: string | null | undefined) => string | null;
  rememberId: (localId: string | null | undefined, remoteId: string | null | undefined) => void;
};

export type PendingChange = {
  key: string;
  label: string;
  run: (context: PendingPushContext) => Promise<ActionResult>;
  runBeforePersonBatch?: boolean;
  record: PendingChangeRecord;
  type?: "person";
  personUpdate?: PendingPersonUpdate;
};

export type DebugDraft = {
  version: number;
  companies: Company[];
  pendingChanges: PendingChangeRecord[];
  syncMessage: string | null;
};

export type EnrichmentApiResponse = {
  enrichment?: CompanyEnrichment;
  skipped?: boolean;
  status?: string;
  error?: string;
  tagNames?: string[];
  tags?: Tag[];
};

export type AccountingTab = "documents" | "ledger";

export type AccountingRecordActionTarget = {
  action: "void" | "delete";
  entityType: "document" | "ledger_entry";
  id: string;
  title: string;
};

export type CompanyPageSize = number | "all";

export type { DashboardData } from "@/lib/types";
