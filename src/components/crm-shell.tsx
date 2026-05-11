"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  CircleDot,
  CreditCard,
  FlaskConical,
  Download,
  FileSpreadsheet,
  Filter,
  Flag,
  GitMerge,
  Handshake,
  ListChecks,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Tags,
  Trash2,
  Upload,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import clsx from "clsx";

import {
  addActivityAction,
  addCompanyTagAction,
  addInvestmentDealAction,
  deleteFundraisingClientAction,
  deleteFundraisingTargetAction,
  deleteAccountingRecordAction,
  saveAccountingDocumentAction,
  saveFundraisingClientAction,
  saveFundraisingTargetAction,
  saveAccountingLedgerEntryAction,
  highlightPersonAction,
  mergeCompaniesAction,
  mergePeopleAction,
  moveStageAction,
  renameCompanyTagAction,
  refreshDashboardAction,
  signOut,
  updateCompanyAction,
  updateCompanyEnrichmentAction,
  updateInvestmentDealStatusAction,
  updateInvestmentRelationshipAction,
  updatePeopleAction,
  updatePersonAction,
  voidAccountingRecordAction,
} from "@/app/actions";
import { buildAccountingSummaries } from "@/lib/accounting";
import { normalizeCompanyWebsites } from "@/lib/company-websites";
import { buildDealPipelineRows, groupDealPipelineRows, type DealPipelineRow } from "@/lib/deal-pipeline";
import { DEFAULT_COMPANY_TAG_COLOR } from "@/lib/enrichment/company-tags";
import { withFundraisingSummaries } from "@/lib/fundraising";
import {
  CONTACT_EXPORT_LABELS,
  contactExportValues,
  filterContactExportRows,
  type ContactExportCriterion,
} from "@/lib/export/contacts";
import { isValidPersonEmail, normalizePersonCategories, normalizePersonEmails } from "@/lib/person-update";
import type {
  AccountingData,
  AccountingDirection,
  AccountingDocument,
  AccountingDocumentStatus,
  AccountingDocumentType,
  AccountingLedgerEntry,
  AccountingLedgerEntryType,
  CapacityStatus,
  Company,
  CompanyEnrichment,
  DashboardData,
  FundraisingClient,
  FundraisingClientStage,
  FundraisingClientTarget,
  FundraisingTargetStage,
  InvestmentDealStatus,
  InvestmentRelationship,
  InvestmentStatus,
  OutreachStage,
  Person,
  Tag,
} from "@/lib/types";
import {
  ACCOUNTING_DIRECTIONS,
  ACCOUNTING_DOCUMENT_STATUSES,
  ACCOUNTING_DOCUMENT_TYPES,
  ACCOUNTING_LEDGER_ENTRY_TYPES,
  CAPACITY_STATUSES,
  FUNDRAISING_CLIENT_STAGES,
  FUNDRAISING_TARGET_STAGES,
  INVESTMENT_DEAL_STATUSES,
  INVESTMENT_STATUSES,
  OUTREACH_STAGES,
} from "@/lib/types";

type CrmShellProps = {
  initialData: DashboardData;
  authSuccess?: boolean;
  companyId?: string;
  hideDetailPanel?: boolean;
  hideTable?: boolean;
  activeView?: ActiveView;
};

export type ActiveView = "companies" | "people" | "tags" | "pipeline" | "clients" | "tasks" | "import" | "accounting";
type PeopleDirectoryRow = {
  person: Person;
  company: Company;
  companies: Company[];
};
type TagSummary =
  | {
      key: string;
      type: "company";
      id: string;
      name: string;
      color: string;
      count: number;
    }
  | {
      key: string;
      type: "contact";
      name: string;
      count: number;
    };
type ActionResult = {
  ok: boolean;
  message: string;
};
type PendingPersonUpdate = {
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
type PendingChangeRecord =
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
    };
type PendingChange = {
  key: string;
  label: string;
  run: () => Promise<ActionResult>;
  runBeforePersonBatch?: boolean;
  record: PendingChangeRecord;
  type?: "person";
  personUpdate?: PendingPersonUpdate;
};
type DebugDraft = {
  version: number;
  companies: Company[];
  pendingChanges: PendingChangeRecord[];
  syncMessage: string | null;
};
type EnrichmentDraft = {
  companyId: string;
  summary: string;
  industry: string;
  subsector: string;
  companyType: string;
  location: string;
  keywords: string;
};
type EnrichmentApiResponse = {
  enrichment?: CompanyEnrichment;
  skipped?: boolean;
  status?: string;
  error?: string;
  tagNames?: string[];
  tags?: Tag[];
};
type InvestmentDraft = {
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
type AccountingTab = "documents" | "ledger";
type AccountingDocumentDraft = {
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
type AccountingLedgerDraft = {
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
type AccountingRecordActionTarget = {
  action: "void" | "delete";
  entityType: "document" | "ledger_entry";
  id: string;
  title: string;
};
type FundraisingTab = "clients" | "targets" | "finance";
type FundraisingClientDraft = {
  clientId: string | null;
  companyId: string;
  newCompanyName: string;
  newCompanyWebsites: string;
  newCompanyCountry: string;
  mandateName: string;
  stage: FundraisingClientStage;
  primaryContactPersonId: string;
  newPrimaryContactName: string;
  newPrimaryContactEmail: string;
  newPrimaryContactJobTitle: string;
  signedOn: string;
  targetRaiseAmount: string;
  targetRaiseCurrency: string;
  materialsUrl: string;
  dataRoomUrl: string;
  notes: string;
};
type FundraisingTargetDraft = {
  targetId: string | null;
  clientId: string;
  investorCompanyId: string;
  newInvestorCompanyName: string;
  newInvestorCompanyWebsites: string;
  newInvestorCompanyCountry: string;
  investorPersonId: string;
  newInvestorPersonName: string;
  newInvestorPersonEmail: string;
  newInvestorPersonJobTitle: string;
  investorName: string;
  investorEmail: string;
  investorType: string;
  stage: FundraisingTargetStage;
  ticketSizeMin: string;
  ticketSizeMax: string;
  ticketSizeCurrency: string;
  lastContactedAt: string;
  nextStep: string;
  notes: string;
};
type PipelineStatusDraft = {
  status: InvestmentDealStatus;
  note: string;
};
type EnrichmentBatchProgress = {
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  currentName: string | null;
  stopRequested: boolean;
  stopped: boolean;
};

const INCORRECT_EMAIL_TAG = "Incorrect email";
const EMAIL_IN_TEXT_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const SOURCE_QUALITY_LABELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
  review: "Review",
};

const INVESTMENT_STATUS_LABELS: Record<InvestmentStatus, string> = {
  prospect: "Prospect",
  past_investor: "Past investor",
  current_investor: "Current investor",
};

const CAPACITY_STATUS_LABELS: Record<CapacityStatus, string> = {
  unknown: "Unknown capacity",
  available: "Available",
  fully_allocated: "Fully allocated",
};

const INVESTMENT_DEAL_STATUS_LABELS: Record<InvestmentDealStatus, string> = {
  prospective: "Prospective",
  active: "Active",
  closed: "Closed",
  passed: "Passed",
};

const ACCOUNTING_DOCUMENT_TYPE_LABELS: Record<AccountingDocumentType, string> = {
  retainer: "Retainer",
  commission: "Cash commission",
  expense: "Expense",
  adjustment: "Adjustment",
};

const ACCOUNTING_DOCUMENT_STATUS_LABELS: Record<AccountingDocumentStatus, string> = {
  draft: "Draft",
  open: "Open",
  partially_paid: "Part paid",
  paid: "Paid",
  void: "Void",
};

const ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS: Record<AccountingLedgerEntryType, string> = {
  retainer_payment: "Retainer payment",
  commission_payment: "Commission payment",
  expense_payment: "Expense payment",
  adjustment: "Adjustment",
};

const ACCOUNTING_DIRECTION_LABELS: Record<AccountingDirection, string> = {
  incoming: "Incoming",
  outgoing: "Outgoing",
};

const FUNDRAISING_CLIENT_STAGE_LABELS: Record<FundraisingClientStage, string> = {
  signed: "Signed",
  onboarding: "Onboarding",
  materials: "Materials",
  investor_outreach: "Investor outreach",
  meetings: "Meetings",
  term_sheet: "Term sheet",
  closing: "Closing",
  completed: "Completed",
  paused: "Paused",
};

const FUNDRAISING_TARGET_STAGE_LABELS: Record<FundraisingTargetStage, string> = {
  target: "Target",
  contact_started: "Contact started",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting",
  diligence: "Diligence",
  soft_commit: "Soft commit",
  passed: "Passed",
  closed: "Closed",
};

const ACTIVE_FUNDRAISING_CLIENT_STAGES = new Set<FundraisingClientStage>(["signed", "onboarding", "materials", "investor_outreach", "meetings", "term_sheet", "closing"]);
const CONTACTED_TARGET_STAGES = new Set<FundraisingTargetStage>(["contacted", "replied", "meeting", "diligence", "soft_commit", "closed"]);

const ENRICHMENT_KEYWORD_SEPARATOR = /[;,\n]+/;

const VIEW_TITLES: Record<ActiveView, string> = {
  companies: "Company golden source",
  people: "People directory",
  tags: "Tag manager",
  pipeline: "Outreach pipeline",
  clients: "Fundraising clients",
  tasks: "Tasks and next steps",
  import: "Import admin",
  accounting: "Accounting and payments",
};

const COMPANY_PAGE_SIZE_OPTIONS = [50, 100, 250, 500, "all"] as const;
const PEOPLE_PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000, "all"] as const;
const PUSH_BATCH_SIZE = 100;
const DEBUG_DRAFT_VERSION = 1;
const DEBUG_MODE_STORAGE_KEY = "golden-source-debug-mode";
const DEBUG_DRAFT_STORAGE_KEY = "golden-source-debug-draft";
const DEBUG_DRAFT_DB_NAME = "golden-source-debug";
const DEBUG_DRAFT_STORE_NAME = "drafts";
const DEBUG_DRAFT_RECORD_KEY = "current";
type CompanyPageSize = (typeof COMPANY_PAGE_SIZE_OPTIONS)[number];
type PeoplePageSize = (typeof PEOPLE_PAGE_SIZE_OPTIONS)[number];

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function uniqueValues(companies: Company[], selector: (company: Company) => string | null) {
  return [...new Set(companies.map(selector).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "en-US"));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formatDate(value: string | null) {
  if (!value) return "No activity";
  return DATE_FORMATTER.format(new Date(value));
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatMinorMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amountMinor / 100);
}

function amountInputFromMinor(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatChangeCount(count: number) {
  return `${formatNumber(count)} pending change${count === 1 ? "" : "s"}`;
}

function formatDealStatusSummary(dealName: string, fromStatus: InvestmentDealStatus, toStatus: InvestmentDealStatus) {
  return fromStatus === toStatus
    ? `Investment deal "${dealName}" status update: ${INVESTMENT_DEAL_STATUS_LABELS[toStatus]}.`
    : `Investment deal "${dealName}" changed from ${INVESTMENT_DEAL_STATUS_LABELS[fromStatus]} to ${INVESTMENT_DEAL_STATUS_LABELS[toStatus]}.`;
}

function formatCompanyWebsites(company: Company) {
  if (company.websiteDomains.length === 0) return company.country ?? "No domain";
  if (company.websiteDomains.length === 1) return company.websiteDomains[0];
  return `${company.websiteDomains[0]} +${company.websiteDomains.length - 1}`;
}

function emptyAccountingData(): AccountingData {
  return {
    documents: [],
    ledgerEntries: [],
    summaries: [],
  };
}

function withAccountingSummaries(data: AccountingData): AccountingData {
  return {
    ...data,
    summaries: buildAccountingSummaries(data.documents, data.ledgerEntries),
  };
}

function defaultAccountingDocumentDraft(): AccountingDocumentDraft {
  return {
    documentId: null,
    documentType: "retainer",
    status: "open",
    companyId: "",
    title: "",
    amount: "",
    currency: "GBP",
    issuedOn: todayIsoDate(),
    dueOn: "",
    externalReference: "",
    documentUrl: "",
    notes: "",
  };
}

function defaultAccountingLedgerDraft(): AccountingLedgerDraft {
  return {
    entryId: null,
    documentId: "",
    entryType: "retainer_payment",
    direction: "incoming",
    companyId: "",
    amount: "",
    currency: "GBP",
    occurredOn: todayIsoDate(),
    externalReference: "",
    documentUrl: "",
    notes: "",
  };
}

function defaultFundraisingClientDraft(): FundraisingClientDraft {
  return {
    clientId: null,
    companyId: "",
    newCompanyName: "",
    newCompanyWebsites: "",
    newCompanyCountry: "",
    mandateName: "",
    stage: "signed",
    primaryContactPersonId: "",
    newPrimaryContactName: "",
    newPrimaryContactEmail: "",
    newPrimaryContactJobTitle: "",
    signedOn: todayIsoDate(),
    targetRaiseAmount: "",
    targetRaiseCurrency: "GBP",
    materialsUrl: "",
    dataRoomUrl: "",
    notes: "",
  };
}

function defaultFundraisingTargetDraft(clientId = ""): FundraisingTargetDraft {
  return {
    targetId: null,
    clientId,
    investorCompanyId: "",
    newInvestorCompanyName: "",
    newInvestorCompanyWebsites: "",
    newInvestorCompanyCountry: "",
    investorPersonId: "",
    newInvestorPersonName: "",
    newInvestorPersonEmail: "",
    newInvestorPersonJobTitle: "",
    investorName: "",
    investorEmail: "",
    investorType: "",
    stage: "target",
    ticketSizeMin: "",
    ticketSizeMax: "",
    ticketSizeCurrency: "GBP",
    lastContactedAt: "",
    nextStep: "",
    notes: "",
  };
}

function accountingDocumentDraftFromDocument(document: AccountingDocument): AccountingDocumentDraft {
  return {
    documentId: document.id,
    documentType: document.documentType,
    status: document.status === "void" ? "open" : document.status,
    companyId: document.companyId ?? "",
    title: document.title,
    amount: amountInputFromMinor(document.amountMinor),
    currency: document.currency,
    issuedOn: document.issuedOn ?? "",
    dueOn: document.dueOn ?? "",
    externalReference: document.externalReference ?? "",
    documentUrl: document.documentUrl ?? "",
    notes: document.notes ?? "",
  };
}

function fundraisingClientDraftFromClient(client: FundraisingClient): FundraisingClientDraft {
  return {
    clientId: client.id,
    companyId: client.companyId,
    newCompanyName: "",
    newCompanyWebsites: "",
    newCompanyCountry: "",
    mandateName: client.mandateName,
    stage: client.stage,
    primaryContactPersonId: client.primaryContactPersonId ?? "",
    newPrimaryContactName: "",
    newPrimaryContactEmail: "",
    newPrimaryContactJobTitle: "",
    signedOn: client.signedOn ?? "",
    targetRaiseAmount: client.targetRaiseAmountMinor == null ? "" : amountInputFromMinor(client.targetRaiseAmountMinor),
    targetRaiseCurrency: client.targetRaiseCurrency ?? "GBP",
    materialsUrl: client.materialsUrl ?? "",
    dataRoomUrl: client.dataRoomUrl ?? "",
    notes: client.notes ?? "",
  };
}

function fundraisingTargetDraftFromTarget(target: FundraisingClientTarget): FundraisingTargetDraft {
  return {
    targetId: target.id,
    clientId: target.clientId,
    investorCompanyId: target.investorCompanyId ?? "",
    newInvestorCompanyName: "",
    newInvestorCompanyWebsites: "",
    newInvestorCompanyCountry: "",
    investorPersonId: target.investorPersonId ?? "",
    newInvestorPersonName: "",
    newInvestorPersonEmail: "",
    newInvestorPersonJobTitle: "",
    investorName: target.investorName,
    investorEmail: target.investorEmail ?? "",
    investorType: target.investorType ?? "",
    stage: target.stage,
    ticketSizeMin: target.ticketSizeMinMinor == null ? "" : amountInputFromMinor(target.ticketSizeMinMinor),
    ticketSizeMax: target.ticketSizeMaxMinor == null ? "" : amountInputFromMinor(target.ticketSizeMaxMinor),
    ticketSizeCurrency: target.ticketSizeCurrency ?? "GBP",
    lastContactedAt: target.lastContactedAt ? target.lastContactedAt.slice(0, 10) : "",
    nextStep: target.nextStep ?? "",
    notes: target.notes ?? "",
  };
}

function accountingLedgerDraftFromEntry(entry: AccountingLedgerEntry): AccountingLedgerDraft {
  return {
    entryId: entry.id,
    documentId: entry.documentId ?? "",
    entryType: entry.entryType,
    direction: entry.direction,
    companyId: entry.companyId ?? "",
    amount: amountInputFromMinor(entry.amountMinor),
    currency: entry.currency,
    occurredOn: entry.occurredOn,
    externalReference: entry.externalReference ?? "",
    documentUrl: entry.documentUrl ?? "",
    notes: entry.notes ?? "",
  };
}

function accountingSearchParts(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function fundraisingSearchParts(values: Array<string | null | undefined>) {
  return normalizeSearchValue(values.filter(Boolean).join(" "));
}

function isPendingPersonChange(change: PendingChange): change is PendingChange & { type: "person"; personUpdate: PendingPersonUpdate } {
  return change.type === "person" && Boolean(change.personUpdate);
}

function mergePendingPersonUpdate(existing: PendingPersonUpdate, next: PendingPersonUpdate): PendingPersonUpdate {
  const syncEmails = existing.syncEmails !== false || next.syncEmails !== false;

  return {
    organizationId: next.organizationId,
    personId: next.personId,
    displayName: next.displayName,
    firstName: "firstName" in next ? next.firstName : existing.firstName,
    lastName: "lastName" in next ? next.lastName : existing.lastName,
    jobTitle: "jobTitle" in next ? next.jobTitle : existing.jobTitle,
    linkedinUrl: "linkedinUrl" in next ? next.linkedinUrl : existing.linkedinUrl,
    phone: "phone" in next ? next.phone : existing.phone,
    country: "country" in next ? next.country : existing.country,
    categories: next.categories,
    syncEmails,
    ...(syncEmails ? { emails: next.syncEmails !== false ? next.emails ?? [] : existing.emails ?? [] } : {}),
  };
}

function emailDomain(email: string) {
  return email.split("@").pop()?.toLowerCase() ?? "";
}

function extractEmailsFromText(value: string) {
  return normalizePersonEmails(value.match(EMAIL_IN_TEXT_PATTERN) ?? []);
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function searchTokens(query: string) {
  return normalizeSearchValue(query).split(" ").filter(Boolean);
}

function searchTextMatches(text: string, query: string) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => text.includes(token));
}

function buildCompanySearchText(company: Company) {
  return normalizeSearchValue([
    company.name,
    company.normalizedName,
    company.websiteDomain,
    company.websiteDomains.join(" "),
    company.description,
    company.country,
    company.status,
    company.sourceQuality,
    company.outreachStage,
    company.categories.join(" "),
    company.tags.map((item) => item.name).join(" "),
    company.nextTask?.title,
    company.activities.map((activity) => `${activity.type} ${activity.summary}`).join(" "),
    company.enrichment ? [company.enrichment.industry, company.enrichment.subsector, company.enrichment.companyType, company.enrichment.keywords.join(" "), company.enrichment.summary, company.enrichment.location].join(" ") : "",
    company.investmentRelationships.map((relationship) => `${relationship.investmentStatus} ${relationship.capacityStatus} ${relationship.notes ?? ""} ${relationship.deals.map((deal) => `${deal.name} ${deal.role ?? ""} ${deal.notes ?? ""}`).join(" ")}`).join(" "),
    company.people.map((person) => `${person.displayName} ${person.firstName ?? ""} ${person.lastName ?? ""} ${person.emails.join(" ")} ${person.email ?? ""} ${person.jobTitle ?? ""} ${person.country ?? ""} ${person.categories.join(" ")} ${person.connectionStrength ?? ""}`).join(" "),
  ]
    .filter(Boolean)
    .join(" "));
}

function companyMatches(
  company: Company,
  text: string,
  query: string,
  stageFilters: Set<string>,
  countryFilters: Set<string>,
  tagFilters: Set<string>,
  qualityFilters: Set<string>,
) {
  return (
    searchTextMatches(text, query) &&
    (stageFilters.size === 0 || stageFilters.has(company.outreachStage)) &&
    (countryFilters.size === 0 || (company.country ? countryFilters.has(company.country) : false)) &&
    (tagFilters.size === 0 || company.tags.some((item) => tagFilters.has(item.name))) &&
    (qualityFilters.size === 0 || qualityFilters.has(company.sourceQuality))
  );
}

function personMatches({
  person,
  companies,
  query,
  companyFilter,
  domainFilter,
  stageFilter,
  highlightFilter,
}: {
  person: Person;
  companies: Company[];
  query: string;
  companyFilter: string;
  domainFilter: string;
  stageFilter: string;
  highlightFilter: string;
}) {
  const companyText = companies.map((company) => `${company.name} ${company.websiteDomains.join(" ")} ${company.outreachStage}`).join(" ");
  const text = normalizeSearchValue([
    person.displayName,
    person.firstName,
    person.lastName,
    person.jobTitle,
    person.country,
    person.connectionStrength,
    person.categories.join(" "),
    person.investmentRelationships.map((relationship) => `${relationship.investmentStatus} ${relationship.capacityStatus} ${relationship.deals.map((deal) => deal.name).join(" ")}`).join(" "),
    person.emails.join(" "),
    companyText,
  ]
    .filter(Boolean)
    .join(" "));

  return (
    searchTextMatches(text, query) &&
    (!companyFilter || companies.some((company) => company.name === companyFilter)) &&
    (!domainFilter || person.emails.some((email) => emailDomain(email) === domainFilter)) &&
    (!stageFilter || companies.some((company) => company.outreachStage === stageFilter)) &&
    (!highlightFilter || (highlightFilter === "Highlighted" ? person.highlighted : !person.highlighted))
  );
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportCompanies(companies: Company[]) {
  const header = ["Company", "Websites", "Country", "Stage", "Tags", "Highlighted people", "Next task"];
  const rows = companies.map((company) => [
    company.name,
    company.websiteDomains.join("; "),
    company.country ?? "",
    company.outreachStage,
    company.tags.map((tag) => tag.name).join("; "),
    company.people.filter((person) => person.highlighted).map((person) => person.displayName).join("; "),
    company.nextTask?.title ?? "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "golden-source-companies.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportDealPipeline(rows: DealPipelineRow[]) {
  const header = ["Company", "Deal", "Deal status", "Company outreach stage", "Linked contacts", "Role", "Date", "Deal notes", "Relationship notes"];
  const csvRows = rows.map((row) => [
    row.companyName,
    row.dealName,
    INVESTMENT_DEAL_STATUS_LABELS[row.status],
    row.outreachStage,
    row.contacts.join("; "),
    row.roles.join("; "),
    row.investedAt ?? "",
    row.dealNotes.join("; "),
    row.relationshipNotes.join("; "),
  ]);
  const csv = [header, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "golden-source-deal-pipeline.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function exportPeople(rows: PeopleDirectoryRow[]) {
  const header = ["Person", "Companies", "Job title", "Stages", "Emails", "Contact tags", "Highlighted"];
  const csvRows = rows.map(({ person, companies }) => [
    person.displayName,
    companies.map((company) => company.name).join("; "),
    person.jobTitle ?? "",
    [...new Set(companies.map((company) => company.outreachStage))].join("; "),
    person.emails.join("; "),
    person.categories.join("; "),
    person.highlighted ? "Yes" : "No",
  ]);
  const csv = [header, ...csvRows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "golden-source-people.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeEnrichmentKeywords(value: string) {
  return [...new Set(value.split(ENRICHMENT_KEYWORD_SEPARATOR).map((item) => item.trim()).filter(Boolean))].slice(0, 30);
}

function defaultCompanyEnrichment(company: Company): CompanyEnrichment {
  const now = new Date().toISOString();
  return {
    companyId: company.id,
    status: "needs_review",
    summary: null,
    industry: null,
    subsector: null,
    companyType: null,
    location: company.country,
    keywords: [],
    sourceUrl: company.websiteDomains[0] ? `https://${company.websiteDomains[0]}` : null,
    model: null,
    confidence: null,
    errorMessage: null,
    generatedAt: null,
    reviewedAt: null,
    updatedAt: now,
  };
}

function relationshipMatches(relationship: InvestmentRelationship, companyId: string | null, personId: string | null) {
  return relationship.companyId === companyId && relationship.personId === personId;
}

function defaultInvestmentRelationship({
  companyId,
  personId,
}: {
  companyId: string | null;
  personId: string | null;
}): InvestmentRelationship {
  return {
    id: `local-investment-${companyId ?? "none"}-${personId ?? "none"}`,
    companyId,
    personId,
    investmentStatus: "prospect",
    capacityStatus: "unknown",
    notes: null,
    lastInvestedDate: null,
    deals: [],
  };
}

function relationshipForCompany(company: Company) {
  return company.investmentRelationships.find((relationship) => relationshipMatches(relationship, company.id, null)) ?? defaultInvestmentRelationship({ companyId: company.id, personId: null });
}

function relationshipForPerson(person: Person) {
  return person.investmentRelationships.find((relationship) => relationshipMatches(relationship, null, person.id)) ?? defaultInvestmentRelationship({ companyId: null, personId: person.id });
}

function relationshipChipLabel(relationship: InvestmentRelationship) {
  const labels = [INVESTMENT_STATUS_LABELS[relationship.investmentStatus], CAPACITY_STATUS_LABELS[relationship.capacityStatus]];
  if (relationship.deals.length > 0) labels.push(`${relationship.deals.length} deal${relationship.deals.length === 1 ? "" : "s"}`);
  return labels.join(" • ");
}

function enrichmentDraftForCompany(company: Company): EnrichmentDraft {
  const enrichment = company.enrichment ?? defaultCompanyEnrichment(company);
  return {
    companyId: company.id,
    summary: enrichment.summary ?? "",
    industry: enrichment.industry ?? "",
    subsector: enrichment.subsector ?? "",
    companyType: enrichment.companyType ?? "",
    location: enrichment.location ?? "",
    keywords: enrichment.keywords.join("; "),
  };
}

function investmentDraftForRelationship(relationship: InvestmentRelationship): InvestmentDraft {
  return {
    targetKey: `${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}`,
    investmentStatus: relationship.investmentStatus,
    capacityStatus: relationship.capacityStatus,
    notes: relationship.notes ?? "",
    lastInvestedDate: relationship.lastInvestedDate ?? "",
    dealName: "",
    dealStatus: "closed",
    dealDate: relationship.lastInvestedDate ?? "",
    dealRole: "Investor",
    dealNotes: "",
  };
}

function uniqueList(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function chunkItems<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function personSourceIds(person: Person) {
  return uniqueList(Array.isArray(person.sourcePersonIds) && person.sourcePersonIds.length > 0 ? person.sourcePersonIds : [person.id]);
}

function isPendingChangeRecord(value: unknown): value is PendingChangeRecord {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { kind?: string }).kind === "string";
}

function openDebugDraftDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = window.indexedDB.open(DEBUG_DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DEBUG_DRAFT_STORE_NAME)) {
        database.createObjectStore(DEBUG_DRAFT_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

async function readDebugDraftFromStorage() {
  if (typeof window === "undefined") return null;
  const fallbackStorage = window.localStorage;

  if ("indexedDB" in window) {
    try {
      const database = await openDebugDraftDatabase();
      const result = await new Promise<DebugDraft | null>((resolve, reject) => {
        const transaction = database.transaction(DEBUG_DRAFT_STORE_NAME, "readonly");
        const store = transaction.objectStore(DEBUG_DRAFT_STORE_NAME);
        const request = store.get(DEBUG_DRAFT_RECORD_KEY);
        request.onsuccess = () => resolve((request.result as DebugDraft | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("Failed to read debug draft."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("Failed to read debug draft."));
      });

      if (result) return result;
    } catch {
      // Fall back to localStorage migration path below.
    }
  }

  const rawDraft = fallbackStorage.getItem(DEBUG_DRAFT_STORAGE_KEY);
  if (!rawDraft) return null;

  try {
    const parsed = JSON.parse(rawDraft) as DebugDraft;
    return parsed;
  } catch {
    return null;
  }
}

async function writeDebugDraftToStorage(draft: DebugDraft) {
  if (typeof window === "undefined") return;
  const fallbackStorage = window.localStorage;

  if ("indexedDB" in window) {
    const database = await openDebugDraftDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(DEBUG_DRAFT_STORE_NAME, "readwrite");
      const store = transaction.objectStore(DEBUG_DRAFT_STORE_NAME);
      store.put(draft, DEBUG_DRAFT_RECORD_KEY);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to save debug draft."));
    });
    fallbackStorage.removeItem(DEBUG_DRAFT_STORAGE_KEY);
    return;
  }

  fallbackStorage.setItem(DEBUG_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

async function clearDebugDraftFromStorage() {
  if (typeof window === "undefined") return;
  const fallbackStorage = window.localStorage;

  if ("indexedDB" in window) {
    try {
      const database = await openDebugDraftDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(DEBUG_DRAFT_STORE_NAME, "readwrite");
        const store = transaction.objectStore(DEBUG_DRAFT_STORE_NAME);
        store.delete(DEBUG_DRAFT_RECORD_KEY);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error("Failed to clear debug draft."));
      });
    } catch {
      // Ignore and still clear the localStorage fallback.
    }
  }

  fallbackStorage.removeItem(DEBUG_DRAFT_STORAGE_KEY);
}

const SOURCE_QUALITY_RANK: Record<Company["sourceQuality"], number> = {
  review: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function firstPresent<T>(values: Array<T | null | undefined>) {
  return values.find((value): value is T => value != null && value !== "");
}

function bestSourceQuality(companies: Company[]) {
  return companies.reduce<Company["sourceQuality"]>(
    (best, company) => (SOURCE_QUALITY_RANK[company.sourceQuality] > SOURCE_QUALITY_RANK[best] ? company.sourceQuality : best),
    "review",
  );
}

function uniqueTags(tags: Tag[]) {
  const seen = new Set<string>();
  const nextTags: Tag[] = [];

  for (const tag of tags) {
    const key = tag.name.trim().toLowerCase() || tag.id;
    if (seen.has(key)) continue;
    seen.add(key);
    nextTags.push(tag);
  }

  return nextTags;
}

function tagIdForGeneratedName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `local-enrichment-tag-${slug || "tag"}`;
}

function enrichmentResponseTags(tags: Tag[] | undefined, tagNames: string[] | undefined) {
  if (tags && tags.length > 0) return tags;
  return (tagNames ?? []).map((name) => ({
    id: tagIdForGeneratedName(name),
    name,
    color: DEFAULT_COMPANY_TAG_COLOR,
  }));
}

function mergeInvestmentRelationships(relationships: InvestmentRelationship[]) {
  const byId = new Map<string, InvestmentRelationship>();
  for (const relationship of relationships) {
    const existing = byId.get(relationship.id);
    if (!existing) {
      byId.set(relationship.id, { ...relationship, deals: [...relationship.deals] });
      continue;
    }

    byId.set(relationship.id, {
      ...existing,
      investmentStatus: existing.investmentStatus === "current_investor" ? existing.investmentStatus : relationship.investmentStatus,
      capacityStatus: existing.capacityStatus === "fully_allocated" ? existing.capacityStatus : relationship.capacityStatus,
      notes: existing.notes ?? relationship.notes,
      lastInvestedDate: [existing.lastInvestedDate, relationship.lastInvestedDate].filter(Boolean).sort().at(-1) ?? null,
      deals: [...existing.deals, ...relationship.deals].filter((deal, index, deals) => deals.findIndex((item) => item.id === deal.id) === index),
    });
  }
  return [...byId.values()];
}

function mergeCompanyPeople(companies: Company[]) {
  const peopleById = new Map<string, Person>();

  for (const company of companies) {
    for (const person of company.people) {
      const existing = peopleById.get(person.id);
      peopleById.set(person.id, existing ? mergePersonDetails(existing, person, existing.id) : person);
    }
  }

  return [...peopleById.values()];
}

function mergeCompanyActivities(companies: Company[]) {
  const activitiesById = new Map<string, Company["activities"][number]>();

  for (const company of companies) {
    for (const activity of company.activities) {
      activitiesById.set(activity.id, activity);
    }
  }

  return [...activitiesById.values()].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
}

function latestActivityDate(companies: Company[]) {
  return (
    companies
      .map((company) => company.lastActivityAt)
      .filter((date): date is string => Boolean(date))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null
  );
}

function bestNextTask(companies: Company[]) {
  const tasks = companies.map((company) => company.nextTask).filter((task): task is NonNullable<Company["nextTask"]> => Boolean(task));
  if (tasks.length === 0) return null;

  return [...tasks].sort((left, right) => {
    if (!left.dueDate && !right.dueDate) return 0;
    if (!left.dueDate) return 1;
    if (!right.dueDate) return -1;
    return left.dueDate.localeCompare(right.dueDate);
  })[0];
}

function mergeCompanyDetails(target: Company, sources: Company[]): Company {
  const companies = [target, ...sources];
  const confidenceValues = companies.map((company) => company.mergeConfidence).filter((value): value is number => value != null);

  return {
    ...target,
    websiteDomains: normalizeCompanyWebsites(companies.flatMap((company) => company.websiteDomains)),
    websiteDomain: normalizeCompanyWebsites(companies.flatMap((company) => company.websiteDomains))[0] ?? null,
    description: target.description ?? firstPresent(sources.map((company) => company.description)) ?? null,
    country: target.country ?? firstPresent(sources.map((company) => company.country)) ?? null,
    categories: normalizePersonCategories(companies.flatMap((company) => company.categories)),
    sourceQuality: bestSourceQuality(companies),
    tags: uniqueTags(companies.flatMap((company) => company.tags)),
    people: mergeCompanyPeople(companies),
    activities: mergeCompanyActivities(companies),
    nextTask: target.nextTask ?? bestNextTask(sources) ?? null,
    lastActivityAt: latestActivityDate(companies),
    mergeConfidence: confidenceValues.length > 0 ? Math.max(...confidenceValues) : null,
    enrichment: target.enrichment ?? firstPresent(sources.map((company) => company.enrichment)) ?? null,
    investmentRelationships: mergeInvestmentRelationships(companies.flatMap((company) => company.investmentRelationships)),
  };
}

function mergePersonDetails(target: Person, source: Person, forcedId = target.id): Person {
  const emails = uniqueList([...target.emails, ...source.emails]);
  return {
    id: forcedId,
    sourcePersonIds: uniqueList([...personSourceIds(target), ...personSourceIds(source)]),
    displayName: target.displayName !== "Unnamed contact" ? target.displayName : source.displayName,
    firstName: target.firstName ?? source.firstName,
    lastName: target.lastName ?? source.lastName,
    email: target.email ?? source.email ?? emails[0] ?? null,
    emails,
    phone: target.phone ?? source.phone,
    linkedinUrl: target.linkedinUrl ?? source.linkedinUrl,
    jobTitle: target.jobTitle ?? source.jobTitle,
    country: target.country ?? source.country,
    categories: uniqueList([...target.categories, ...source.categories]),
    connectionStrength: target.connectionStrength ?? source.connectionStrength,
    highlighted: target.highlighted || source.highlighted,
    investmentRelationships: mergeInvestmentRelationships([...target.investmentRelationships, ...source.investmentRelationships]),
  };
}

function groupPeopleDirectory(rows: Array<{ person: Person; company: Company }>): PeopleDirectoryRow[] {
  const grouped = new Map<string, PeopleDirectoryRow>();

  for (const row of rows) {
    const existing = grouped.get(row.person.id);
    if (!existing) {
      grouped.set(row.person.id, {
        person: {
          ...row.person,
          sourcePersonIds: personSourceIds(row.person),
          emails: uniqueList(row.person.emails),
          categories: uniqueList(row.person.categories),
        },
        company: row.company,
        companies: [row.company],
      });
      continue;
    }

    existing.person = mergePersonDetails(existing.person, row.person, existing.person.id);
    if (!existing.companies.some((company) => company.id === row.company.id)) {
      existing.companies.push(row.company);
    }
  }

  return [...grouped.values()];
}

function initialCompanyIdFor(companies: Company[], companyId?: string) {
  if (companyId && companies.some((company) => company.id === companyId)) return companyId;
  return companies[0]?.id ?? "";
}

export function CrmShell({
  initialData,
  authSuccess = false,
  companyId,
  hideDetailPanel = false,
  hideTable = false,
  activeView: initialActiveView = "companies",
}: CrmShellProps) {
  const router = useRouter();
  const isSignedIn = initialData.authMode === "supabase" && initialData.currentUserName !== "Not signed in";
  const authLabel = initialData.authMode === "demo" ? "Demo data" : isSignedIn ? "Signed in" : "Signed out";
  const authDetail = initialData.authMode === "demo" ? "Local preview" : isSignedIn ? initialData.currentUserName : "Not signed in";
  const isDemoData = initialData.dataMode === "demo";
  const initialCompanyId = initialCompanyIdFor(initialData.companies, companyId);
  const [companies, setCompanies] = useState(initialData.companies);
  const [activeView, setActiveView] = useState<ActiveView>(initialActiveView);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(companyId && initialCompanyId ? [initialCompanyId] : []));
  const [activeCompanyId, setActiveCompanyId] = useState(initialCompanyId);
  const [query, setQuery] = useState("");
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set());
  const [countryFilters, setCountryFilters] = useState<Set<string>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [qualityFilters, setQualityFilters] = useState<Set<string>>(new Set());
  const [exportCriterion, setExportCriterion] = useState<ContactExportCriterion>("sector_category");
  const [exportValue, setExportValue] = useState("Biotech");
  const [companyPageSize, setCompanyPageSize] = useState<CompanyPageSize>(100);
  const [companyPage, setCompanyPage] = useState(1);
  const [companyMergeTargetId, setCompanyMergeTargetId] = useState<string | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleCompany, setPeopleCompany] = useState("");
  const [peopleDomain, setPeopleDomain] = useState("");
  const [peopleStage, setPeopleStage] = useState("");
  const [peopleHighlight, setPeopleHighlight] = useState("");
  const [peoplePageSize, setPeoplePageSize] = useState<PeoplePageSize>(250);
  const [peoplePage, setPeoplePage] = useState(1);
  const [personMergeTargetId, setPersonMergeTargetId] = useState<string | null>(null);
  const [personMergeQuery, setPersonMergeQuery] = useState("");
  const [peopleMessage, setPeopleMessage] = useState<string | null>(null);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmails, setEditEmails] = useState<string[]>([]);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editLinkedinUrl, setEditLinkedinUrl] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editCategoryInput, setEditCategoryInput] = useState("");
  const [personInvestmentDraft, setPersonInvestmentDraft] = useState<InvestmentDraft | null>(null);
  const [personEditMessage, setPersonEditMessage] = useState<string | null>(null);
  const [bulkTag, setBulkTag] = useState("");
  const [noteText, setNoteText] = useState("");
  const [pipelineDrafts, setPipelineDrafts] = useState<Record<string, PipelineStatusDraft>>({});
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isPushingChanges, setIsPushingChanges] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugModeReady, setDebugModeReady] = useState(false);
  const debugDraftHydratedRef = useRef(false);
  const [debugStorageIssue, setDebugStorageIssue] = useState<string | null>(null);
  const [incorrectEmails, setIncorrectEmails] = useState<Set<string>>(new Set());
  const [incorrectEmailMessage, setIncorrectEmailMessage] = useState<string | null>(null);
  const [companyModalId, setCompanyModalId] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState({ companyId: "", name: "", websites: "", description: "", country: "" });
  const [enrichmentDraft, setEnrichmentDraft] = useState<EnrichmentDraft | null>(null);
  const [companyInvestmentDraft, setCompanyInvestmentDraft] = useState<InvestmentDraft | null>(null);
  const [enrichmentMessage, setEnrichmentMessage] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<EnrichmentBatchProgress | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isRefreshingTable, setIsRefreshingTable] = useState(false);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [isSplittingNames, setIsSplittingNames] = useState(false);
  const [splitNamesProgress, setSplitNamesProgress] = useState<{ total: number; completed: number; failed: number } | null>(null);
  const [namesMessage, setNamesMessage] = useState<string | null>(null);
  const [accountingData, setAccountingData] = useState<AccountingData>(() => initialData.accounting ?? emptyAccountingData());
  const [clientDashboard, setClientDashboard] = useState(() => initialData.clientDashboard);
  const [fundraisingTab, setFundraisingTab] = useState<FundraisingTab>("clients");
  const [fundraisingQuery, setFundraisingQuery] = useState("");
  const [fundraisingClientStageFilter, setFundraisingClientStageFilter] = useState("");
  const [fundraisingTargetStageFilter, setFundraisingTargetStageFilter] = useState("");
  const [fundraisingCompanyFilter, setFundraisingCompanyFilter] = useState("");
  const [fundraisingCurrencyFilter, setFundraisingCurrencyFilter] = useState("");
  const [fundraisingInvestorTypeFilter, setFundraisingInvestorTypeFilter] = useState("");
  const [fundraisingClientDraft, setFundraisingClientDraft] = useState<FundraisingClientDraft>(() => defaultFundraisingClientDraft());
  const [fundraisingTargetDraft, setFundraisingTargetDraft] = useState<FundraisingTargetDraft>(() => defaultFundraisingTargetDraft(initialData.clientDashboard.clients[0]?.id ?? ""));
  const [fundraisingMessage, setFundraisingMessage] = useState<string | null>(null);
  const [isSavingFundraising, setIsSavingFundraising] = useState(false);
  const [accountingTab, setAccountingTab] = useState<AccountingTab>("documents");
  const [accountingQuery, setAccountingQuery] = useState("");
  const [accountingCompanyFilter, setAccountingCompanyFilter] = useState("");
  const [accountingTypeFilter, setAccountingTypeFilter] = useState("");
  const [accountingStatusFilter, setAccountingStatusFilter] = useState("");
  const [accountingCurrencyFilter, setAccountingCurrencyFilter] = useState("");
  const [accountingDateFrom, setAccountingDateFrom] = useState("");
  const [accountingDateTo, setAccountingDateTo] = useState("");
  const [accountingDocumentDraft, setAccountingDocumentDraft] = useState<AccountingDocumentDraft>(() => defaultAccountingDocumentDraft());
  const [accountingLedgerDraft, setAccountingLedgerDraft] = useState<AccountingLedgerDraft>(() => defaultAccountingLedgerDraft());
  const [accountingRecordActionTarget, setAccountingRecordActionTarget] = useState<AccountingRecordActionTarget | null>(null);
  const [accountingRecordActionReason, setAccountingRecordActionReason] = useState("");
  const [accountingMessage, setAccountingMessage] = useState<string | null>(null);
  const [isSavingAccounting, setIsSavingAccounting] = useState(false);
  const stopBatchRef = useRef(false);
  const batchAbortControllerRef = useRef<AbortController | null>(null);
  const deferredCompanyQuery = useDeferredValue(query.trim().toLowerCase());
  const deferredPeopleQuery = useDeferredValue(peopleQuery.trim().toLowerCase());
  const deferredAccountingQuery = useDeferredValue(accountingQuery.trim().toLowerCase());
  const deferredFundraisingQuery = useDeferredValue(fundraisingQuery.trim());
  const showCompanyTable = !hideTable;
  const showDetailPanel = !hideDetailPanel;

  const selectedCompanies = useMemo(() => companies.filter((company) => selectedIds.has(company.id)), [companies, selectedIds]);
  const companyMergeTarget = selectedCompanies.length >= 2
    ? selectedCompanies.find((company) => company.id === companyMergeTargetId) ?? selectedCompanies[0]
    : null;
  const companyMergeSources = companyMergeTarget ? selectedCompanies.filter((company) => company.id !== companyMergeTarget.id) : [];
  const companySearchTextById = useMemo(() => new Map(companies.map((company) => [company.id, buildCompanySearchText(company)])), [companies]);
  const filteredCompanies = useMemo(
    () => companies.filter((company) => companyMatches(company, companySearchTextById.get(company.id) ?? "", deferredCompanyQuery, stageFilters, countryFilters, tagFilters, qualityFilters)),
    [companies, companySearchTextById, countryFilters, deferredCompanyQuery, qualityFilters, stageFilters, tagFilters],
  );
  const activeCompanyFilterCount = stageFilters.size + countryFilters.size + tagFilters.size + qualityFilters.size;
  const companyTotalPages = companyPageSize === "all" ? 1 : Math.max(1, Math.ceil(filteredCompanies.length / companyPageSize));
  const effectiveCompanyPage = Math.min(companyPage, companyTotalPages);
  const visibleCompanies = useMemo(() => {
    if (companyPageSize === "all") return filteredCompanies;
    const start = (effectiveCompanyPage - 1) * companyPageSize;
    return filteredCompanies.slice(start, start + companyPageSize);
  }, [companyPageSize, effectiveCompanyPage, filteredCompanies]);
  const companyStart = filteredCompanies.length === 0 ? 0 : companyPageSize === "all" ? 1 : (effectiveCompanyPage - 1) * companyPageSize + 1;
  const companyEnd = companyPageSize === "all" ? filteredCompanies.length : Math.min(companyStart + companyPageSize - 1, filteredCompanies.length);
  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? filteredCompanies[0] ?? companies[0];
  const activeCompanyDraft =
    companyDraft.companyId === activeCompany?.id
      ? companyDraft
      : {
          companyId: activeCompany?.id ?? "",
          name: activeCompany?.name ?? "",
          websites: activeCompany?.websiteDomains.join("\n") ?? "",
          description: activeCompany?.description ?? "",
          country: activeCompany?.country ?? "",
        };
  const activeCompanyEnrichmentDraft = activeCompany && enrichmentDraft?.companyId === activeCompany.id ? enrichmentDraft : activeCompany ? enrichmentDraftForCompany(activeCompany) : null;
  const activeCompanyInvestment = activeCompany ? relationshipForCompany(activeCompany) : null;
  const activeCompanyInvestmentDraft =
    activeCompanyInvestment && companyInvestmentDraft?.targetKey === `${activeCompanyInvestment.companyId ?? "none"}:${activeCompanyInvestment.personId ?? "none"}`
      ? companyInvestmentDraft
      : activeCompanyInvestment
        ? investmentDraftForRelationship(activeCompanyInvestment)
        : null;
  const companyNameById = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const accountingCompanies = useMemo(
    () =>
      companies
        .filter((company) => accountingData.documents.some((document) => document.companyId === company.id) || accountingData.ledgerEntries.some((entry) => entry.companyId === company.id))
        .sort((left, right) => left.name.localeCompare(right.name, "en-US")),
    [accountingData.documents, accountingData.ledgerEntries, companies],
  );
  const accountingCurrencies = useMemo(
    () => [...new Set([...accountingData.documents.map((document) => document.currency), ...accountingData.ledgerEntries.map((entry) => entry.currency)])].sort(),
    [accountingData.documents, accountingData.ledgerEntries],
  );
  const filteredAccountingDocuments = useMemo(
    () =>
      accountingData.documents.filter((document) => {
        const dateValue = document.issuedOn ?? document.createdAt.slice(0, 10);
        if (accountingCompanyFilter && document.companyId !== accountingCompanyFilter) return false;
        if (accountingTypeFilter && document.documentType !== accountingTypeFilter) return false;
        if (accountingStatusFilter && document.status !== accountingStatusFilter) return false;
        if (accountingCurrencyFilter && document.currency !== accountingCurrencyFilter) return false;
        if (accountingDateFrom && dateValue < accountingDateFrom) return false;
        if (accountingDateTo && dateValue > accountingDateTo) return false;
        if (!deferredAccountingQuery) return true;
        const searchText = accountingSearchParts([
          document.title,
          document.externalReference,
          document.notes,
          document.currency,
          document.companyId ? companyNameById.get(document.companyId) : "General",
          ACCOUNTING_DOCUMENT_TYPE_LABELS[document.documentType],
          ACCOUNTING_DOCUMENT_STATUS_LABELS[document.status],
        ]);
        return searchText.includes(deferredAccountingQuery);
      }),
    [accountingCompanyFilter, accountingCurrencyFilter, accountingData.documents, accountingDateFrom, accountingDateTo, accountingStatusFilter, accountingTypeFilter, companyNameById, deferredAccountingQuery],
  );
  const filteredAccountingEntries = useMemo(
    () =>
      accountingData.ledgerEntries.filter((entry) => {
        if (accountingCompanyFilter && entry.companyId !== accountingCompanyFilter) return false;
        if (accountingTypeFilter && entry.entryType !== accountingTypeFilter) return false;
        if (accountingStatusFilter === "voided" && !entry.voidedAt) return false;
        if (accountingStatusFilter === "active" && entry.voidedAt) return false;
        if (accountingCurrencyFilter && entry.currency !== accountingCurrencyFilter) return false;
        if (accountingDateFrom && entry.occurredOn < accountingDateFrom) return false;
        if (accountingDateTo && entry.occurredOn > accountingDateTo) return false;
        if (!deferredAccountingQuery) return true;
        const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
        const searchText = accountingSearchParts([
          entry.externalReference,
          entry.notes,
          entry.currency,
          linkedDocument?.title,
          entry.companyId ? companyNameById.get(entry.companyId) : "General",
          ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType],
          ACCOUNTING_DIRECTION_LABELS[entry.direction],
        ]);
        return searchText.includes(deferredAccountingQuery);
      }),
    [accountingCompanyFilter, accountingCurrencyFilter, accountingData.documents, accountingData.ledgerEntries, accountingDateFrom, accountingDateTo, accountingStatusFilter, accountingTypeFilter, companyNameById, deferredAccountingQuery],
  );
  const fundraisingData = useMemo(
    () => withFundraisingSummaries(clientDashboard, initialData.accountingAccess.canView ? accountingData : null),
    [accountingData, clientDashboard, initialData.accountingAccess.canView],
  );
  const fundraisingClients = fundraisingData.clients;
  const fundraisingTargets = fundraisingData.targets;
  const fundraisingTargetsByClient = useMemo(() => {
    const groups = new Map<string, FundraisingClientTarget[]>();
    for (const target of fundraisingTargets) {
      const current = groups.get(target.clientId);
      if (current) current.push(target);
      else groups.set(target.clientId, [target]);
    }
    return groups;
  }, [fundraisingTargets]);
  const fundraisingClientById = useMemo(() => new Map(fundraisingClients.map((client) => [client.id, client])), [fundraisingClients]);
  const fundraisingClientCompanyIds = useMemo(() => new Set(fundraisingClients.map((client) => client.companyId)), [fundraisingClients]);
  const fundraisingClientCompanies = useMemo(
    () => companies.filter((company) => fundraisingClientCompanyIds.has(company.id)).sort((left, right) => left.name.localeCompare(right.name, "en-US")),
    [companies, fundraisingClientCompanyIds],
  );
  const fundraisingCurrencies = useMemo(
    () =>
      [
        ...new Set([
          ...fundraisingData.summaries.map((summary) => summary.currency),
          ...fundraisingClients.map((client) => client.targetRaiseCurrency).filter(Boolean),
          ...fundraisingTargets.map((target) => target.ticketSizeCurrency).filter(Boolean),
        ] as string[]),
      ].sort(),
    [fundraisingClients, fundraisingData.summaries, fundraisingTargets],
  );
  const fundraisingInvestorTypes = useMemo(
    () => [...new Set(fundraisingTargets.map((target) => target.investorType).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "en-US")),
    [fundraisingTargets],
  );
  const filteredFundraisingClients = useMemo(
    () =>
      fundraisingClients.filter((client) => {
        if (fundraisingClientStageFilter && client.stage !== fundraisingClientStageFilter) return false;
        if (fundraisingCompanyFilter && client.companyId !== fundraisingCompanyFilter) return false;
        if (fundraisingCurrencyFilter && client.targetRaiseCurrency !== fundraisingCurrencyFilter) return false;
        if (!deferredFundraisingQuery) return true;
        const text = fundraisingSearchParts([
          client.mandateName,
          companyNameById.get(client.companyId),
          FUNDRAISING_CLIENT_STAGE_LABELS[client.stage],
          client.notes,
        ]);
        return searchTextMatches(text, deferredFundraisingQuery);
      }),
    [companyNameById, deferredFundraisingQuery, fundraisingClientStageFilter, fundraisingClients, fundraisingCompanyFilter, fundraisingCurrencyFilter],
  );
  const filteredFundraisingTargets = useMemo(
    () =>
      fundraisingTargets.filter((target) => {
        const client = fundraisingClientById.get(target.clientId);
        if (fundraisingTargetStageFilter && target.stage !== fundraisingTargetStageFilter) return false;
        if (fundraisingCompanyFilter && client?.companyId !== fundraisingCompanyFilter) return false;
        if (fundraisingCurrencyFilter && target.ticketSizeCurrency !== fundraisingCurrencyFilter) return false;
        if (fundraisingInvestorTypeFilter && target.investorType !== fundraisingInvestorTypeFilter) return false;
        if (!deferredFundraisingQuery) return true;
        const text = fundraisingSearchParts([
          target.investorName,
          target.investorEmail,
          target.investorType,
          target.nextStep,
          target.notes,
          client?.mandateName,
          client ? companyNameById.get(client.companyId) : null,
          FUNDRAISING_TARGET_STAGE_LABELS[target.stage],
        ]);
        return searchTextMatches(text, deferredFundraisingQuery);
      }),
    [companyNameById, deferredFundraisingQuery, fundraisingClientById, fundraisingCompanyFilter, fundraisingCurrencyFilter, fundraisingInvestorTypeFilter, fundraisingTargetStageFilter, fundraisingTargets],
  );
  const fundraisingStats = useMemo(() => {
    const contactedTargets = fundraisingTargets.filter((target) => CONTACTED_TARGET_STAGES.has(target.stage)).length;
    return {
      signedClients: fundraisingClients.length,
      activeClients: fundraisingClients.filter((client) => ACTIVE_FUNDRAISING_CLIENT_STAGES.has(client.stage)).length,
      targets: fundraisingTargets.length,
      contactedTargets,
      repliedTargets: fundraisingTargets.filter((target) => target.stage === "replied").length,
      meetings: fundraisingTargets.filter((target) => target.stage === "meeting" || target.stage === "diligence").length,
    };
  }, [fundraisingClients, fundraisingTargets]);
  const exportOptions = useMemo(() => contactExportValues(companies, exportCriterion), [companies, exportCriterion]);
  const exportRows = useMemo(() => filterContactExportRows(companies, exportCriterion, exportValue), [companies, exportCriterion, exportValue]);
  const countries = uniqueValues(companies, (company) => company.country);
  const tagNames = [...new Set(companies.flatMap((company) => company.tags.map((item) => item.name)))].sort((a, b) => a.localeCompare(b, "en-US"));
  const pipelineCounts = OUTREACH_STAGES.map((item) => ({
    stage: item,
    count: companies.filter((company) => company.outreachStage === item).length,
  }));
  const peopleRelationRows = useMemo(
    () =>
      companies.flatMap((company) =>
        company.people.map((person) => ({
          person,
          company,
        })),
      ),
    [companies],
  );
  const batchTargetCompanies = selectedCompanies.length ? selectedCompanies : filteredCompanies;
  const isBatchEnriching = isEnriching && batchProgress !== null;
  const pendingEnrichmentCount = pendingChanges.filter((change) => change.record.kind === "company-enrichment-update").length;
  const batchProgressProcessed = batchProgress ? batchProgress.completed + batchProgress.skipped + batchProgress.failed : 0;
  const batchProgressPercent = batchProgress && batchProgress.total > 0 ? Math.round((batchProgressProcessed / batchProgress.total) * 100) : 0;
  const peopleDirectory = useMemo(() => groupPeopleDirectory(peopleRelationRows), [peopleRelationRows]);
  const tagSummaries = useMemo(() => {
    const companyTags = new Map<string, Extract<TagSummary, { type: "company" }>>();
    const contactTags = new Map<string, Extract<TagSummary, { type: "contact" }>>();

    companies.forEach((company) => {
      company.tags.forEach((tag) => {
        const key = `company:${tag.id}`;
        const current = companyTags.get(key);
        if (current) current.count += 1;
        else companyTags.set(key, { key, type: "company", id: tag.id, name: tag.name, color: tag.color, count: 1 });
      });
    });

    peopleDirectory.forEach(({ person }) => {
      person.categories.forEach((category) => {
        const key = `contact:${category.toLowerCase()}`;
        const current = contactTags.get(key);
        if (current) current.count += 1;
        else contactTags.set(key, { key, type: "contact", name: category, count: 1 });
      });
    });

    return [...companyTags.values(), ...contactTags.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name, "en-US");
    });
  }, [companies, peopleDirectory]);
  const peopleCompanyNames = useMemo(() => uniqueValues(companies, (company) => company.name), [companies]);
  const peopleEmailDomains = useMemo(
    () => [...new Set(peopleDirectory.flatMap(({ person }) => person.emails.map(emailDomain)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en-US")),
    [peopleDirectory],
  );
  const editingPerson = peopleDirectory.find(({ person }) => person.id === editingPersonId)?.person ?? null;
  const editingPersonInvestment = editingPerson ? relationshipForPerson(editingPerson) : null;
  const activePersonInvestmentDraft =
    editingPersonInvestment && personInvestmentDraft?.targetKey === `${editingPersonInvestment.companyId ?? "none"}:${editingPersonInvestment.personId ?? "none"}`
      ? personInvestmentDraft
      : editingPersonInvestment
        ? investmentDraftForRelationship(editingPersonInvestment)
        : null;
  const personMergeTarget = peopleDirectory.find(({ person }) => person.id === personMergeTargetId) ?? null;
  const personMergeCandidates = useMemo(() => {
    if (!personMergeTarget) return [];
    const query = personMergeQuery.trim().toLowerCase();

    return peopleDirectory
      .filter(({ person }) => person.id !== personMergeTarget.person.id)
      .filter(({ person, companies }) => {
        if (!query) return true;
        const text = [person.displayName, person.jobTitle, companies.map((company) => company.name).join(" "), person.emails.join(" "), person.linkedinUrl ?? ""].join(" ").toLowerCase();
        return text.includes(query);
      })
      .slice(0, 10);
  }, [peopleDirectory, personMergeQuery, personMergeTarget]);
  const filteredPeopleDirectory = useMemo(
    () =>
      peopleDirectory.filter(({ person, companies }) =>
        personMatches({
          person,
          companies,
          query: deferredPeopleQuery,
          companyFilter: peopleCompany,
          domainFilter: peopleDomain,
          stageFilter: peopleStage,
          highlightFilter: peopleHighlight,
        }),
      ),
    [deferredPeopleQuery, peopleCompany, peopleDirectory, peopleDomain, peopleHighlight, peopleStage],
  );
  const peopleTotalPages = peoplePageSize === "all" ? 1 : Math.max(1, Math.ceil(filteredPeopleDirectory.length / peoplePageSize));
  const effectivePeoplePage = Math.min(peoplePage, peopleTotalPages);
  const visiblePeopleDirectory = useMemo(() => {
    if (peoplePageSize === "all") return filteredPeopleDirectory;
    const start = (effectivePeoplePage - 1) * peoplePageSize;
    return filteredPeopleDirectory.slice(start, start + peoplePageSize);
  }, [effectivePeoplePage, filteredPeopleDirectory, peoplePageSize]);
  const peopleStart = filteredPeopleDirectory.length === 0 ? 0 : peoplePageSize === "all" ? 1 : (effectivePeoplePage - 1) * peoplePageSize + 1;
  const peopleEnd = peoplePageSize === "all" ? filteredPeopleDirectory.length : Math.min(peopleStart + peoplePageSize - 1, filteredPeopleDirectory.length);
  const taskRows = useMemo(
    () =>
      companies.flatMap((company) =>
        company.nextTask
          ? [
              {
                task: company.nextTask,
                company,
              },
            ]
          : [],
      ),
    [companies],
  );
  const dealPipelineRows = useMemo(() => buildDealPipelineRows(companies), [companies]);
  const dealPipelineGroups = useMemo(() => groupDealPipelineRows(dealPipelineRows), [dealPipelineRows]);

  const buildPendingChange = useCallback((record: PendingChangeRecord): PendingChange => {
    switch (record.kind) {
      case "person":
        return {
          key: record.key,
          label: record.label,
          type: "person",
          personUpdate: record.personUpdate,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updatePersonAction(record.personUpdate)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "stage":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && record.companyIds.every(isUuid)
              ? moveStageAction({ organizationId: record.organizationId, companyIds: record.companyIds, stage: record.stage })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-tag":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && record.companyIds.every(isUuid)
              ? addCompanyTagAction({
                organizationId: record.organizationId,
                companyIds: record.companyIds,
                tagName: record.tagName,
                color: record.color,
              })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "highlight":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && isUuid(record.companyId) && isUuid(record.personId)
              ? highlightPersonAction({ companyId: record.companyId, personId: record.personId, highlighted: record.highlighted })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-update":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateCompanyAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-enrichment-update":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateCompanyEnrichmentAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "investment-relationship":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateInvestmentRelationshipAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "investment-deal":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? addInvestmentDealAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "investment-deal-status":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateInvestmentDealStatusAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-tag-rename":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.tagId)
              ? renameCompanyTagAction({ organizationId: record.organizationId, tagId: record.tagId, name: record.name })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "activity-note":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.companyId)
              ? addActivityAction({
                organizationId: record.organizationId,
                companyId: record.companyId,
                activityType: "note",
                summary: record.summary,
              })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-merge":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.targetCompanyId) && record.sourceCompanyIds.every(isUuid)
              ? mergeCompaniesAction({
                organizationId: record.organizationId,
                targetCompanyId: record.targetCompanyId,
                sourceCompanyIds: record.sourceCompanyIds,
              })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "people-merge":
        return {
          key: record.key,
          label: record.label,
          runBeforePersonBatch: true,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.targetPersonId) && isUuid(record.sourcePersonId)
              ? mergePeopleAction({
                organizationId: record.organizationId,
                targetPersonId: record.targetPersonId,
                sourcePersonId: record.sourcePersonId,
              })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
    }
  }, [initialData.authMode]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) setActiveView(initialActiveView);
    });

    return () => {
      cancelled = true;
    };
  }, [initialActiveView]);

  useEffect(() => {
    if (!authSuccess) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "success") return;

    url.searchParams.delete("auth");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [authSuccess]);

  useEffect(() => {
    const companyIds = new Set(initialData.companies.map((company) => company.id));
    const nextActiveCompanyId = initialCompanyIdFor(initialData.companies, companyId);
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setCompanies(initialData.companies);
      setSelectedIds((current) => {
        const next = new Set([...current].filter((id) => companyIds.has(id)));
        if (companyId && nextActiveCompanyId) next.add(nextActiveCompanyId);
        return next;
      });
      setActiveCompanyId((current) => (companyIds.has(current) ? current : nextActiveCompanyId));
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, initialData.companies]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) setAccountingData(initialData.accounting ?? emptyAccountingData());
    });

    return () => {
      cancelled = true;
    };
  }, [initialData.accounting]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setClientDashboard(initialData.clientDashboard);
        setFundraisingTargetDraft((current) => (current.clientId ? current : defaultFundraisingTargetDraft(initialData.clientDashboard.clients[0]?.id ?? "")));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialData.clientDashboard]);

  useEffect(() => {
    if (!companyId) return;

    const routeCompanyId = initialCompanyIdFor(companies, companyId);
    if (!routeCompanyId) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setActiveCompanyId((current) => (current === routeCompanyId ? current : routeCompanyId));
      setSelectedIds((current) => (current.has(routeCompanyId) ? current : new Set([routeCompanyId])));
    });

    return () => {
      cancelled = true;
    };
  }, [companies, companyId]);

  useEffect(() => {
    let storedDebugMode = false;
    let cancelled = false;

    try {
      storedDebugMode = window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === "true";
    } catch {
      storedDebugMode = false;
    }

    if (storedDebugMode) {
      debugDraftHydratedRef.current = false;
    }

    queueMicrotask(() => {
      if (cancelled) return;
      setDebugMode(storedDebugMode);
      setDebugModeReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!debugModeReady) return;

    if (!debugMode) {
      debugDraftHydratedRef.current = true;
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const parsed = await readDebugDraftFromStorage();
        if (cancelled || !parsed) return;

        if (parsed.version !== DEBUG_DRAFT_VERSION || !Array.isArray(parsed.companies) || !Array.isArray(parsed.pendingChanges)) {
          await clearDebugDraftFromStorage();
          return;
        }

        const draftCompanies = parsed.companies as Company[];
        const draftPendingChanges = parsed.pendingChanges;

        queueMicrotask(() => {
          if (cancelled) return;
          setCompanies(draftCompanies);
          setPendingChanges(draftPendingChanges.filter(isPendingChangeRecord).map(buildPendingChange));
          setSyncMessage(parsed.syncMessage ?? "Restored debug draft.");
          setActiveCompanyId((current) => draftCompanies.some((company) => company.id === current) ? current : draftCompanies[0]?.id ?? "");
          setDebugStorageIssue(null);
        });
      } catch {
        if (!cancelled) {
          queueMicrotask(() => setDebugStorageIssue("Could not restore the local debug draft for this browser."));
        }
      } finally {
        debugDraftHydratedRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildPendingChange, debugMode, debugModeReady]);

  useEffect(() => {
    if (!debugModeReady) return;
    if (!debugDraftHydratedRef.current) return;

    if (!debugMode) {
      try {
        window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, "false");
      } catch {
        // Ignore tiny flag write failures.
      }
      void clearDebugDraftFromStorage();
      return;
    }
    try {
      window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, "true");
    } catch {
      // Ignore tiny flag write failures.
    }

    const timeoutId = window.setTimeout(() => {
      void writeDebugDraftToStorage({
        version: DEBUG_DRAFT_VERSION,
        companies,
        pendingChanges: pendingChanges.map((change) => change.record),
        syncMessage,
      } satisfies DebugDraft)
        .then(() => {
          setDebugStorageIssue((current) => (current ? null : current));
        })
        .catch((error) => {
          console.error(error);
          setDebugStorageIssue("This draft is too large to persist in browser storage. Your edits still exist in this tab, but they may not survive a reload.");
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [companies, debugMode, debugModeReady, pendingChanges, syncMessage]);

  function updateCompanies(updater: (company: Company) => Company) {
    setCompanies((current) => current.map(updater));
  }

  function toggleCompany(companyId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function toggleCompanyFilter(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setCompanyPage(1);
  }

  function clearCompanyFilters() {
    setStageFilters(new Set());
    setCountryFilters(new Set());
    setTagFilters(new Set());
    setQualityFilters(new Set());
    setCompanyPage(1);
  }

  async function refreshCompanyTable() {
    if (isRefreshingTable) return;

    setIsRefreshingTable(true);
    setSyncMessage("Refreshing company table from the database...");
    try {
      const result = await refreshDashboardAction();
      if (!result.ok) {
        setSyncMessage(`Refresh failed: ${result.message}`);
        return;
      }
      router.refresh();
      setSyncMessage("Company table refresh requested.");
    } catch (error) {
      setSyncMessage(error instanceof Error ? `Refresh failed: ${error.message}` : "Refresh failed.");
    } finally {
      setIsRefreshingTable(false);
    }
  }

  function openCompanyModal(companyId: string) {
    setActiveCompanyId(companyId);
    setCompanyModalId(companyId);
  }

  function closeCompanyModal() {
    setCompanyModalId(null);
  }

  function openCompany(companyId: string) {
    openCompanyModal(companyId);
  }

  function toggleDebugMode() {
    setDebugMode((current) => {
      const next = !current;
      if (next) debugDraftHydratedRef.current = false;
      if (!next) setDebugStorageIssue(null);
      setSyncMessage(next ? "Debug mode enabled. Draft edits now persist locally." : "Debug mode disabled. Local draft persistence is off.");
      return next;
    });
  }

  function resetDebugDraft() {
    setCompanies(initialData.companies);
    setPendingChanges([]);
    setSelectedIds(new Set(companyId && initialCompanyId ? [initialCompanyId] : []));
    setActiveCompanyId(initialCompanyId);
    setCompanyModalId(null);
    clearCompanyFilters();
    setBatchProgress(null);
    stopBatchRef.current = false;
    batchAbortControllerRef.current?.abort();
    batchAbortControllerRef.current = null;
    setCompanyDraft({ companyId: "", name: "", websites: "", description: "", country: "" });
    setEnrichmentDraft(null);
    setCompanyInvestmentDraft(null);
    setPersonInvestmentDraft(null);
    setPipelineDrafts({});
    setEnrichmentMessage(null);
    setTagDrafts({});
    setPeopleMessage(null);
    setPersonEditMessage(null);
    setIncorrectEmailMessage(null);
    setDebugStorageIssue(null);
    setSyncMessage("Debug draft reset to the latest loaded data.");
    void clearDebugDraftFromStorage();
  }

  function startCompanyMerge() {
    if (selectedCompanies.length < 2) return;
    setCompanyMergeTargetId(selectedIds.has(activeCompanyId) ? activeCompanyId : selectedCompanies[0]?.id ?? null);
  }

  function closeCompanyMerge() {
    setCompanyMergeTargetId(null);
  }

  function queuePendingChange(change: PendingChange) {
    setPendingChanges((current) => {
      const existingIndex = current.findIndex((item) => item.key === change.key);
      if (existingIndex === -1) return [...current, change];

      const next = [...current];
      const existingChange = current[existingIndex];
      if (isPendingPersonChange(existingChange) && isPendingPersonChange(change)) {
        const mergedPersonUpdate = mergePendingPersonUpdate(existingChange.personUpdate, change.personUpdate);
        next[existingIndex] = {
          ...change,
          personUpdate: mergedPersonUpdate,
          record: {
            kind: "person",
            key: change.key,
            label: change.label,
            personUpdate: mergedPersonUpdate,
          },
        };
      } else {
        next[existingIndex] = change;
      }
      return next;
    });
    setSyncMessage(`${change.label} queued locally.`);
  }

  async function pushPendingChanges() {
    if (pendingChanges.length === 0 || isPushingChanges) return;

    const changes = pendingChanges;
    const prePersonChanges = changes.filter((change) => change.runBeforePersonBatch);
    const personChanges = changes.filter(isPendingPersonChange);
    const otherChanges = changes.filter((change) => !isPendingPersonChange(change) && !change.runBeforePersonBatch);
    setIsPushingChanges(true);
    setSyncMessage(`Pushing ${formatChangeCount(changes.length)}...`);

    for (let index = 0; index < prePersonChanges.length; index += 1) {
      const change = prePersonChanges[index];
      const result = await change.run();
      if (!result.ok) {
        setPendingChanges(changes);
        setSyncMessage(`Push stopped at "${change.label}": ${result.message}`);
        setIsPushingChanges(false);
        return;
      }
    }

    if (personChanges.length > 0) {
      const personBatches = chunkItems(personChanges, PUSH_BATCH_SIZE);

      for (let batchIndex = 0; batchIndex < personBatches.length; batchIndex += 1) {
        const batch = personBatches[batchIndex];
        setSyncMessage(
          `Pushing contact batch ${formatNumber(batchIndex + 1)} of ${formatNumber(personBatches.length)} (${formatNumber(batch.length)} updates)...`,
        );
        const result = initialData.authMode === "supabase"
          ? await updatePeopleAction({ updates: batch.map((change) => change.personUpdate) })
          : { ok: false, message: "Sign in with Supabase configured before pushing changes." };

        if (!result.ok) {
          setPendingChanges([...personChanges.slice(batchIndex * PUSH_BATCH_SIZE), ...otherChanges]);
          setSyncMessage(`Push stopped at contact updates: ${result.message}`);
          setIsPushingChanges(false);
          return;
        }
      }
    }

    for (let index = 0; index < otherChanges.length; index += 1) {
      const change = otherChanges[index];
      const result = await change.run();
      if (!result.ok) {
        setPendingChanges(otherChanges.slice(index));
        setSyncMessage(`Push stopped at "${change.label}": ${result.message}`);
        setIsPushingChanges(false);
        return;
      }
    }

    setPendingChanges([]);
    setSyncMessage(`Pushed ${formatChangeCount(changes.length)}.`);
    setIsPushingChanges(false);
  }

  async function pushPendingEnrichments() {
    if (pendingEnrichmentCount === 0 || isPushingChanges) return;

    const changes = pendingChanges.filter((change) => change.record.kind === "company-enrichment-update");
    const changeKeys = new Set(changes.map((change) => change.key));
    setIsPushingChanges(true);
    setSyncMessage(`Pushing ${formatNumber(changes.length)} queued enrichment${changes.length === 1 ? "" : "s"}...`);

    for (let index = 0; index < changes.length; index += 1) {
      const change = changes[index];
      const result = await change.run();
      if (!result.ok) {
        setSyncMessage(`Push stopped at "${change.label}": ${result.message}`);
        setIsPushingChanges(false);
        return;
      }
    }

    setPendingChanges((current) => current.filter((change) => !changeKeys.has(change.key)));
    setSyncMessage(`Pushed ${formatNumber(changes.length)} enrichment${changes.length === 1 ? "" : "s"}.`);
    setIsPushingChanges(false);
  }

  function queuePersonUpdate(person: Person, label: string, options: { syncEmails?: boolean } = {}) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const syncEmails = options.syncEmails ?? true;
    for (const personId of personSourceIds(person)) {
      const personUpdate = organizationId && isUuid(personId)
        ? {
            organizationId,
            personId,
            displayName: person.displayName,
            categories: person.categories,
            jobTitle: person.jobTitle,
            linkedinUrl: person.linkedinUrl,
            phone: person.phone,
            country: person.country,
            syncEmails,
            ...(syncEmails ? { emails: person.emails } : {}),
          }
        : undefined;

      queuePendingChange({
        key: `person:${personId}`,
        label,
        type: "person",
        personUpdate,
        record: {
          kind: "person",
          key: `person:${personId}`,
          label,
          personUpdate: personUpdate ?? {
            organizationId: "",
            personId,
            displayName: person.displayName,
            categories: person.categories,
            jobTitle: person.jobTitle,
            linkedinUrl: person.linkedinUrl,
            phone: person.phone,
            country: person.country,
            syncEmails,
            ...(syncEmails ? { emails: person.emails } : {}),
          },
        },
        run: () =>
          initialData.authMode === "supabase" && personUpdate
            ? updatePersonAction(personUpdate)
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    }
  }

  async function importIncorrectEmailsCsv(file: File) {
    const text = await file.text();
    const uploadedEmails = extractEmailsFromText(text);
    const uploadedEmailSet = new Set(uploadedEmails);

    if (uploadedEmails.length === 0) {
      setIncorrectEmailMessage("No email addresses were found in that CSV.");
      return;
    }

    const matchedEmails = new Set<string>();
    const matchedPeople = new Map<string, Person>();

    for (const { person } of peopleDirectory) {
      const matchingPersonEmails = person.emails.filter((email) => uploadedEmailSet.has(email.toLowerCase()));
      if (matchingPersonEmails.length === 0) continue;

      matchingPersonEmails.forEach((email) => matchedEmails.add(email.toLowerCase()));
      matchedPeople.set(person.id, {
        ...person,
        categories: normalizePersonCategories([...person.categories, INCORRECT_EMAIL_TAG]),
      });
    }

    if (matchedPeople.size === 0) {
      setIncorrectEmailMessage(`Found ${formatNumber(uploadedEmails.length)} email${uploadedEmails.length === 1 ? "" : "s"} in the CSV, but none matched current contacts.`);
      return;
    }

    setIncorrectEmails((current) => new Set([...current, ...matchedEmails]));
    setPeoplePage(1);
    setPeopleQuery(INCORRECT_EMAIL_TAG);
    matchedPeople.forEach((person) => {
      updatePersonLocally(personSourceIds(person), {
        displayName: person.displayName,
        emails: person.emails,
        categories: person.categories,
      });
      queuePersonUpdate(person, "Incorrect email tag", { syncEmails: false });
    });

    setIncorrectEmailMessage(
      `Tagged ${formatNumber(matchedPeople.size)} contact${matchedPeople.size === 1 ? "" : "s"} from ${formatNumber(matchedEmails.size)} matching email${matchedEmails.size === 1 ? "" : "s"}.`,
    );
  }

  function handleIncorrectEmailCsvUpload(file: File | null) {
    if (!file) return;
    void importIncorrectEmailsCsv(file);
  }

  function applyStage(nextStage: OutreachStage) {
    const ids = selectedIds.size > 0 ? [...selectedIds] : activeCompany ? [activeCompany.id] : [];
    updateCompanies((company) => (ids.includes(company.id) ? { ...company, outreachStage: nextStage } : company));

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    ids.forEach((companyId) => {
      queuePendingChange({
        key: `stage:${companyId}`,
        label: "Stage update",
        record: {
          kind: "stage",
          key: `stage:${companyId}`,
          label: "Stage update",
          organizationId: organizationId ?? null,
          companyIds: [companyId],
          stage: nextStage,
        },
        run: () =>
          initialData.authMode === "supabase" && organizationId && isUuid(companyId)
            ? moveStageAction({ organizationId, companyIds: [companyId], stage: nextStage })
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    });
  }

  function applyBulkTag() {
    const cleanTag = bulkTag.trim();
    if (!cleanTag) return;
    const ids = [...selectedIds];
    const newTag: Tag = { id: `local-${cleanTag.toLowerCase().replace(/\s+/g, "-")}`, name: cleanTag, color: "#2563eb" };
    updateCompanies((company) =>
      ids.includes(company.id)
        ? {
            ...company,
            tags: company.tags.some((item) => item.name === cleanTag) ? company.tags : [...company.tags, newTag],
            people: applyCategoryToPeople(company.people, cleanTag),
          }
        : company,
    );
    setBulkTag("");

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    queuePendingChange({
      key: `company-tag:${cleanTag.toLowerCase()}:${ids.join(",")}`,
      label: "Company tag update",
      record: {
        kind: "company-tag",
        key: `company-tag:${cleanTag.toLowerCase()}:${ids.join(",")}`,
        label: "Company tag update",
        organizationId: organizationId ?? null,
        companyIds: ids,
        tagName: cleanTag,
        color: newTag.color,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && ids.length > 0 && ids.every(isUuid)
          ? addCompanyTagAction({ organizationId, companyIds: ids, tagName: cleanTag, color: newTag.color })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function toggleHighlight(companyId: string, person: Person) {
    const targetPersonIds = personSourceIds(person);
    updateCompanies((company) =>
      company.id === companyId
        ? {
            ...company,
            people: company.people.map((item) =>
              item.sourcePersonIds.some((personId) => targetPersonIds.includes(personId)) ? { ...item, highlighted: !item.highlighted } : item,
            ),
          }
        : company,
    );

    for (const personId of targetPersonIds) {
      queuePendingChange({
        key: `highlight:${companyId}:${personId}`,
        label: "Highlight update",
        record: {
          kind: "highlight",
          key: `highlight:${companyId}:${personId}`,
          label: "Highlight update",
          companyId,
          personId,
          highlighted: !person.highlighted,
        },
        run: () =>
          initialData.authMode === "supabase" && isUuid(companyId) && isUuid(personId)
            ? highlightPersonAction({ companyId, personId, highlighted: !person.highlighted })
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    }
  }

  function updateActiveCompany(field: "name" | "websites" | "description" | "country", value: string) {
    if (!activeCompany) return;
    const websites = field === "websites" ? normalizeCompanyWebsites(value) : [];
    const nextValue = field === "name" ? value.trim() : field === "websites" ? websites.join("\n") : value.trim() || null;
    const currentValue = field === "name" ? activeCompany.name : field === "websites" ? activeCompany.websiteDomains.join("\n") : activeCompany[field] ?? null;
    if (field === "name" && !nextValue) {
      setCompanyDraft((current) => ({ ...current, companyId: activeCompany.id, name: activeCompany.name }));
      return;
    }
    if (nextValue === currentValue) return;

    updateCompanies((company) =>
      company.id === activeCompany.id
        ? field === "websites"
          ? { ...company, websiteDomain: websites[0] ?? null, websiteDomains: websites }
          : { ...company, [field]: nextValue }
        : company,
    );

    const payload = field === "websites" ? { companyId: activeCompany.id, websiteDomains: websites } : { companyId: activeCompany.id, [field]: nextValue };
    queuePendingChange({
      key: `company:${activeCompany.id}:${field}`,
      label: "Company detail update",
      record: {
        kind: "company-update",
        key: `company:${activeCompany.id}:${field}`,
        label: "Company detail update",
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && isUuid(activeCompany.id)
          ? updateCompanyAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function updateCompanyEnrichmentLocally(companyId: string, enrichment: CompanyEnrichment, tags: Tag[] = []) {
    updateCompanies((company) => (company.id === companyId ? { ...company, enrichment, tags: uniqueTags([...company.tags, ...tags]) } : company));
  }

  function updateCompanyTagsLocally(companyId: string, tags: Tag[]) {
    if (tags.length === 0) return;
    updateCompanies((company) => (company.id === companyId ? { ...company, tags: uniqueTags([...company.tags, ...tags]) } : company));
  }

  function companyEnrichmentPayload(companyId: string, enrichment: CompanyEnrichment, reviewed: boolean) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    return {
      organizationId: organizationId ?? "",
      companyId,
      status: enrichment.status,
      summary: enrichment.summary,
      industry: enrichment.industry,
      subsector: enrichment.subsector,
      companyType: enrichment.companyType,
      location: enrichment.location,
      keywords: enrichment.keywords,
      sourceUrl: enrichment.sourceUrl,
      model: enrichment.model,
      confidence: enrichment.confidence,
      errorMessage: enrichment.errorMessage,
      generatedAt: enrichment.generatedAt,
      reviewed,
    };
  }

  function queueCompanyEnrichmentUpdate(companyId: string, enrichment: CompanyEnrichment, label: string, reviewed: boolean) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const payload = companyEnrichmentPayload(companyId, enrichment, reviewed);
    queuePendingChange({
      key: `company-enrichment:${companyId}`,
      label,
      record: {
        kind: "company-enrichment-update",
        key: `company-enrichment:${companyId}`,
        label,
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(companyId)
          ? updateCompanyEnrichmentAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function saveActiveCompanyEnrichment() {
    if (!activeCompany || !activeCompanyEnrichmentDraft) return;
    const enrichment: CompanyEnrichment = {
      ...(activeCompany.enrichment ?? defaultCompanyEnrichment(activeCompany)),
      status: "needs_review",
      summary: activeCompanyEnrichmentDraft.summary.trim() || null,
      industry: activeCompanyEnrichmentDraft.industry.trim() || null,
      subsector: activeCompanyEnrichmentDraft.subsector.trim() || null,
      companyType: activeCompanyEnrichmentDraft.companyType.trim() || null,
      location: activeCompanyEnrichmentDraft.location.trim() || null,
      keywords: normalizeEnrichmentKeywords(activeCompanyEnrichmentDraft.keywords),
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateCompanyEnrichmentLocally(activeCompany.id, enrichment);
    queueCompanyEnrichmentUpdate(activeCompany.id, enrichment, "Company enrichment update", true);
  }

  async function enrichActiveCompany(force = false) {
    if (!activeCompany || isEnriching) return;
    setIsEnriching(true);
    setBatchProgress(null);
    setEnrichmentMessage(`Enriching ${activeCompany.name} with local Ollama...`);
    try {
      const response = await fetch("/api/enrichment/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: activeCompany.id, force }),
      });
      const payload = (await response.json()) as EnrichmentApiResponse;
      if (!response.ok) {
        setEnrichmentMessage(payload.error ?? "Company enrichment failed.");
        return;
      }
      const responseTags = enrichmentResponseTags(payload.tags, payload.tagNames);
      if (payload.skipped) {
        updateCompanyTagsLocally(activeCompany.id, payload.tags ?? []);
        setEnrichmentMessage("Company already has completed enrichment. Use retry to force a refresh.");
        return;
      }
      if (payload.enrichment) {
        updateCompanyEnrichmentLocally(activeCompany.id, payload.enrichment, responseTags);
        setEnrichmentDraft(enrichmentDraftForCompany({ ...activeCompany, enrichment: payload.enrichment }));
        setEnrichmentMessage(payload.enrichment.status === "completed" ? "Company enrichment saved." : `Enrichment needs review: ${payload.enrichment.errorMessage ?? "No website text found."}`);
      }
    } catch (error) {
      setEnrichmentMessage(error instanceof Error ? error.message : "Company enrichment failed.");
    } finally {
      setIsEnriching(false);
    }
  }

  function requestStopEnrichmentBatch() {
    stopBatchRef.current = true;
    batchAbortControllerRef.current?.abort();
    setBatchProgress((current) => (current ? { ...current, stopRequested: true, currentName: "Stopping..." } : current));
    setEnrichmentMessage("Stopping enrichment batch...");
  }

  async function enrichCompanyBatch(targetCompanies: Company[]) {
    if (targetCompanies.length === 0 || isEnriching) return;
    setIsEnriching(true);
    stopBatchRef.current = false;
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    let stopped = false;
    setBatchProgress({
      total: targetCompanies.length,
      completed,
      skipped,
      failed,
      currentName: null,
      stopRequested: false,
      stopped: false,
    });

    for (const company of targetCompanies) {
      if (stopBatchRef.current) {
        stopped = true;
        break;
      }

      setEnrichmentMessage(`Enriching ${completed + skipped + failed + 1} of ${targetCompanies.length}: ${company.name}`);
      setBatchProgress({
        total: targetCompanies.length,
        completed,
        skipped,
        failed,
        currentName: company.name,
        stopRequested: false,
        stopped: false,
      });
      const abortController = new AbortController();
      batchAbortControllerRef.current = abortController;

      try {
        const response = await fetch("/api/enrichment/company", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId: company.id, force: false, persist: false }),
          signal: abortController.signal,
        });
        const payload = (await response.json()) as EnrichmentApiResponse;
        const responseTags = enrichmentResponseTags(payload.tags, payload.tagNames);
        if (!response.ok) {
          failed += 1;
        } else if (payload.skipped) {
          updateCompanyTagsLocally(company.id, payload.tags ?? []);
          skipped += 1;
        } else if (payload.enrichment) {
          updateCompanyEnrichmentLocally(company.id, payload.enrichment, responseTags);
          queueCompanyEnrichmentUpdate(company.id, payload.enrichment, "Company enrichment generated", false);
          completed += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        if (stopBatchRef.current || (error instanceof DOMException && error.name === "AbortError")) {
          stopped = true;
          break;
        }
        failed += 1;
      } finally {
        batchAbortControllerRef.current = null;
        setBatchProgress((current) =>
          current
            ? {
                ...current,
                completed,
                skipped,
                failed,
                currentName: null,
              }
            : current,
        );
      }
    }

    const processed = completed + skipped + failed;
    const statusText = stopped ? `Enrichment stopped after ${processed} of ${targetCompanies.length}` : "Enrichment finished";
    setBatchProgress({
      total: targetCompanies.length,
      completed,
      skipped,
      failed,
      currentName: null,
      stopRequested: false,
      stopped,
    });
    setEnrichmentMessage(`${statusText}: ${completed} queued${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} failed` : ""}.`);
    stopBatchRef.current = false;
    batchAbortControllerRef.current = null;
    setIsEnriching(false);
  }

  function updateAccountingDocumentLocally(document: AccountingDocument) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        documents: current.documents.some((item) => item.id === document.id)
          ? current.documents.map((item) => (item.id === document.id ? document : item))
          : [document, ...current.documents],
      }),
    );
  }

  function updateAccountingLedgerEntryLocally(entry: AccountingLedgerEntry) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        ledgerEntries: current.ledgerEntries.some((item) => item.id === entry.id)
          ? current.ledgerEntries.map((item) => (item.id === entry.id ? entry : item))
          : [entry, ...current.ledgerEntries],
      }),
    );
  }

  function deleteAccountingDocumentLocally(documentId: string) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        documents: current.documents.filter((document) => document.id !== documentId),
        ledgerEntries: current.ledgerEntries.map((entry) => (entry.documentId === documentId ? { ...entry, documentId: null } : entry)),
      }),
    );
  }

  function deleteAccountingLedgerEntryLocally(entryId: string) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        ledgerEntries: current.ledgerEntries.filter((entry) => entry.id !== entryId),
      }),
    );
  }

  function localAccountingDocumentFromDraft(draft: AccountingDocumentDraft, amountMinor: number): AccountingDocument {
    const now = new Date().toISOString();
    return {
      id: draft.documentId ?? `local-accounting-document-${Date.now()}`,
      companyId: draft.companyId || null,
      documentType: draft.documentType,
      status: draft.status,
      title: draft.title.trim(),
      amountMinor,
      currency: draft.currency.trim().toUpperCase(),
      issuedOn: draft.issuedOn || null,
      dueOn: draft.dueOn || null,
      externalReference: draft.externalReference.trim() || null,
      documentUrl: draft.documentUrl.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function localAccountingLedgerEntryFromDraft(draft: AccountingLedgerDraft, amountMinor: number): AccountingLedgerEntry {
    const now = new Date().toISOString();
    return {
      id: draft.entryId ?? `local-accounting-entry-${Date.now()}`,
      documentId: draft.documentId || null,
      companyId: draft.companyId || null,
      entryType: draft.entryType,
      direction: draft.direction,
      amountMinor,
      currency: draft.currency.trim().toUpperCase(),
      occurredOn: draft.occurredOn,
      externalReference: draft.externalReference.trim() || null,
      documentUrl: draft.documentUrl.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function saveAccountingDocument() {
    if (!initialData.accountingAccess.canEdit || isSavingAccounting) return;
    const amountMinor = parseMoneyInput(accountingDocumentDraft.amount);
    if (!amountMinor) {
      setAccountingMessage("Enter a positive amount with up to two decimals.");
      return;
    }
    if ((accountingDocumentDraft.documentType === "retainer" || accountingDocumentDraft.documentType === "commission") && !accountingDocumentDraft.companyId) {
      setAccountingMessage("Retainers and commissions must be linked to a company.");
      return;
    }

    const currency = accountingDocumentDraft.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setAccountingMessage("Use a 3-letter ISO currency code.");
      return;
    }

    setIsSavingAccounting(true);
    setAccountingMessage(null);
    try {
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving accounting data.");
          return;
        }

        const result = await saveAccountingDocumentAction({
          organizationId,
          documentId: accountingDocumentDraft.documentId ?? undefined,
          companyId: accountingDocumentDraft.companyId || null,
          documentType: accountingDocumentDraft.documentType,
          status: accountingDocumentDraft.status,
          title: accountingDocumentDraft.title,
          amountMinor,
          currency,
          issuedOn: accountingDocumentDraft.issuedOn || null,
          dueOn: accountingDocumentDraft.dueOn || null,
          externalReference: accountingDocumentDraft.externalReference || null,
          documentUrl: accountingDocumentDraft.documentUrl || null,
          notes: accountingDocumentDraft.notes || null,
        });
        setAccountingMessage(result.message);
        if (result.ok && result.document) {
          updateAccountingDocumentLocally(result.document);
          setAccountingDocumentDraft(defaultAccountingDocumentDraft());
        }
        return;
      }

      updateAccountingDocumentLocally(localAccountingDocumentFromDraft(accountingDocumentDraft, amountMinor));
      setAccountingDocumentDraft(defaultAccountingDocumentDraft());
      setAccountingMessage("Demo accounting document saved locally.");
    } finally {
      setIsSavingAccounting(false);
    }
  }

  async function saveAccountingLedgerEntry() {
    if (!initialData.accountingAccess.canEdit || isSavingAccounting) return;
    const amountMinor = parseMoneyInput(accountingLedgerDraft.amount);
    if (!amountMinor) {
      setAccountingMessage("Enter a positive amount with up to two decimals.");
      return;
    }

    const linkedDocument = accountingData.documents.find((document) => document.id === accountingLedgerDraft.documentId);
    const companyId = accountingLedgerDraft.companyId || linkedDocument?.companyId || "";
    const currency = accountingLedgerDraft.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setAccountingMessage("Use a 3-letter ISO currency code.");
      return;
    }
    if ((accountingLedgerDraft.entryType === "retainer_payment" || accountingLedgerDraft.entryType === "commission_payment") && !companyId) {
      setAccountingMessage("Retainer and commission payments must be linked to a company.");
      return;
    }

    setIsSavingAccounting(true);
    setAccountingMessage(null);
    try {
      const draft = { ...accountingLedgerDraft, companyId, currency };
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving accounting data.");
          return;
        }

        const result = await saveAccountingLedgerEntryAction({
          organizationId,
          entryId: draft.entryId ?? undefined,
          documentId: draft.documentId || null,
          companyId: draft.companyId || null,
          entryType: draft.entryType,
          direction: draft.direction,
          amountMinor,
          currency,
          occurredOn: draft.occurredOn,
          externalReference: draft.externalReference || null,
          documentUrl: draft.documentUrl || null,
          notes: draft.notes || null,
        });
        setAccountingMessage(result.message);
        if (result.ok && result.entry) {
          updateAccountingLedgerEntryLocally(result.entry);
          setAccountingLedgerDraft(defaultAccountingLedgerDraft());
        }
        return;
      }

      updateAccountingLedgerEntryLocally(localAccountingLedgerEntryFromDraft(draft, amountMinor));
      setAccountingLedgerDraft(defaultAccountingLedgerDraft());
      setAccountingMessage("Demo ledger entry saved locally.");
    } finally {
      setIsSavingAccounting(false);
    }
  }

  function openAccountingDocumentAction(document: AccountingDocument, action: AccountingRecordActionTarget["action"]) {
    if (!initialData.accountingAccess.canEdit || (action === "void" && (document.status === "void" || document.voidedAt))) return;
    setAccountingRecordActionTarget({ action, entityType: "document", id: document.id, title: document.title });
    setAccountingRecordActionReason("");
    setAccountingMessage(null);
  }

  function openAccountingLedgerAction(entry: AccountingLedgerEntry, action: AccountingRecordActionTarget["action"]) {
    if (!initialData.accountingAccess.canEdit || (action === "void" && entry.voidedAt)) return;
    const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
    setAccountingRecordActionTarget({
      action,
      entityType: "ledger_entry",
      id: entry.id,
      title: linkedDocument?.title ?? entry.externalReference ?? ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType],
    });
    setAccountingRecordActionReason("");
    setAccountingMessage(null);
  }

  function closeAccountingRecordActionDialog() {
    setAccountingRecordActionTarget(null);
    setAccountingRecordActionReason("");
  }

  async function confirmAccountingRecordAction() {
    const reason = accountingRecordActionReason.trim();
    if (!accountingRecordActionTarget || !reason) return;

    const target = accountingRecordActionTarget;
    setIsSavingAccounting(true);
    try {
      let ok = false;
      if (target.entityType === "document") {
        const document = accountingData.documents.find((item) => item.id === target.id);
        ok = target.action === "delete" ? await deleteAccountingDocument(document, reason) : await voidAccountingDocument(document, reason);
      } else {
        const entry = accountingData.ledgerEntries.find((item) => item.id === target.id);
        ok = target.action === "delete" ? await deleteAccountingLedgerEntry(entry, reason) : await voidAccountingLedgerEntry(entry, reason);
      }

      if (ok) closeAccountingRecordActionDialog();
    } catch (error) {
      setAccountingMessage(error instanceof Error ? error.message : `Could not ${target.action} accounting record.`);
    } finally {
      setIsSavingAccounting(false);
    }
  }

  async function voidAccountingDocument(document: AccountingDocument | undefined, reason: string) {
    if (!document || !initialData.accountingAccess.canEdit || document.status === "void" || document.voidedAt) return false;
    const voidReason = reason.trim();
    if (!voidReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before voiding accounting data.");
        return false;
      }

      const result = await voidAccountingRecordAction({ organizationId, entityType: "document", id: document.id, reason: voidReason });
      setAccountingMessage(result.message);
      if (result.ok && result.document) updateAccountingDocumentLocally(result.document);
      return result.ok;
    }

    updateAccountingDocumentLocally({
      ...document,
      status: "void",
      voidedAt: new Date().toISOString(),
      voidReason,
      updatedAt: new Date().toISOString(),
    });
    setAccountingMessage("Demo accounting document voided locally.");
    return true;
  }

  async function voidAccountingLedgerEntry(entry: AccountingLedgerEntry | undefined, reason: string) {
    if (!entry || !initialData.accountingAccess.canEdit || entry.voidedAt) return false;
    const voidReason = reason.trim();
    if (!voidReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before voiding accounting data.");
        return false;
      }

      const result = await voidAccountingRecordAction({ organizationId, entityType: "ledger_entry", id: entry.id, reason: voidReason });
      setAccountingMessage(result.message);
      if (result.ok && result.entry) updateAccountingLedgerEntryLocally(result.entry);
      return result.ok;
    }

    updateAccountingLedgerEntryLocally({
      ...entry,
      voidedAt: new Date().toISOString(),
      voidReason,
      updatedAt: new Date().toISOString(),
    });
    setAccountingMessage("Demo ledger entry voided locally.");
    return true;
  }

  async function deleteAccountingDocument(document: AccountingDocument | undefined, reason: string) {
    if (!document || !initialData.accountingAccess.canEdit) return false;
    const deleteReason = reason.trim();
    if (!deleteReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting accounting data.");
        return false;
      }

      const result = await deleteAccountingRecordAction({ organizationId, entityType: "document", id: document.id, reason: deleteReason });
      setAccountingMessage(result.message);
      if (result.ok) {
        deleteAccountingDocumentLocally(document.id);
        if (accountingDocumentDraft.documentId === document.id) setAccountingDocumentDraft(defaultAccountingDocumentDraft());
        if (accountingLedgerDraft.documentId === document.id) setAccountingLedgerDraft((current) => ({ ...current, documentId: "" }));
      }
      return result.ok;
    }

    deleteAccountingDocumentLocally(document.id);
    if (accountingDocumentDraft.documentId === document.id) setAccountingDocumentDraft(defaultAccountingDocumentDraft());
    if (accountingLedgerDraft.documentId === document.id) setAccountingLedgerDraft((current) => ({ ...current, documentId: "" }));
    setAccountingMessage("Demo accounting document deleted locally.");
    return true;
  }

  async function deleteAccountingLedgerEntry(entry: AccountingLedgerEntry | undefined, reason: string) {
    if (!entry || !initialData.accountingAccess.canEdit) return false;
    const deleteReason = reason.trim();
    if (!deleteReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting accounting data.");
        return false;
      }

      const result = await deleteAccountingRecordAction({ organizationId, entityType: "ledger_entry", id: entry.id, reason: deleteReason });
      setAccountingMessage(result.message);
      if (result.ok) {
        deleteAccountingLedgerEntryLocally(entry.id);
        if (accountingLedgerDraft.entryId === entry.id) setAccountingLedgerDraft(defaultAccountingLedgerDraft());
      }
      return result.ok;
    }

    deleteAccountingLedgerEntryLocally(entry.id);
    if (accountingLedgerDraft.entryId === entry.id) setAccountingLedgerDraft(defaultAccountingLedgerDraft());
    setAccountingMessage("Demo ledger entry deleted locally.");
    return true;
  }

  function handleLedgerDocumentChange(documentId: string) {
    const document = accountingData.documents.find((item) => item.id === documentId);
    setAccountingLedgerDraft((current) => ({
      ...current,
      documentId,
      companyId: document?.companyId ?? current.companyId,
      amount: document ? amountInputFromMinor(document.amountMinor) : current.amount,
      currency: document?.currency ?? current.currency,
      entryType:
        document?.documentType === "retainer"
          ? "retainer_payment"
          : document?.documentType === "commission"
            ? "commission_payment"
            : document?.documentType === "expense"
              ? "expense_payment"
              : current.entryType,
      direction: document?.documentType === "expense" ? "outgoing" : document ? "incoming" : current.direction,
    }));
  }

  function updateFundraisingClientLocally(client: FundraisingClient) {
    setClientDashboard((current) => ({
      ...current,
      clients: current.clients.some((item) => item.id === client.id)
        ? current.clients.map((item) => (item.id === client.id ? client : item))
        : [client, ...current.clients],
    }));
  }

  function updateFundraisingTargetLocally(target: FundraisingClientTarget) {
    setClientDashboard((current) => ({
      ...current,
      targets: current.targets.some((item) => item.id === target.id)
        ? current.targets.map((item) => (item.id === target.id ? target : item))
        : [target, ...current.targets],
    }));
  }

  function removeFundraisingClientLocally(clientId: string) {
    setClientDashboard((current) => ({
      ...current,
      clients: current.clients.filter((client) => client.id !== clientId),
      targets: current.targets.filter((target) => target.clientId !== clientId),
    }));
  }

  function removeFundraisingTargetLocally(targetId: string) {
    setClientDashboard((current) => ({
      ...current,
      targets: current.targets.filter((target) => target.id !== targetId),
    }));
  }

  function addCreatedCompanyLocally(companyId: string, name: string, websites: string, country: string, category: string) {
    if (companies.some((company) => company.id === companyId)) return;
    const websiteDomains = normalizeCompanyWebsites(websites);
    const newCompany: Company = {
      id: companyId,
      name,
      normalizedName: name.toLowerCase(),
      websiteDomain: websiteDomains[0] ?? null,
      websiteDomains,
      description: null,
      country: country.trim() || null,
      categories: [category],
      status: "active",
      ownerName: initialData.currentUserName,
      sourceQuality: "review",
      outreachStage: "Research",
      tags: [],
      people: [],
      activities: [],
      nextTask: null,
      lastActivityAt: null,
      mergeConfidence: null,
      enrichment: null,
      investmentRelationships: [],
    };
    setCompanies((current) => [newCompany, ...current]);
  }

  function addCreatedPersonLocally(companyId: string | null, personId: string, displayName: string, email: string, jobTitle: string) {
    if (!companyId || !displayName.trim()) return;
    const person: Person = {
      id: personId,
      sourcePersonIds: [personId],
      displayName: displayName.trim(),
      firstName: null,
      lastName: null,
      email: email.trim() || null,
      emails: email.trim() ? [email.trim().toLowerCase()] : [],
      phone: null,
      linkedinUrl: null,
      jobTitle: jobTitle.trim() || null,
      country: null,
      categories: [],
      connectionStrength: "Manual",
      highlighted: false,
      investmentRelationships: [],
    };
    setCompanies((current) =>
      current.map((company) => (company.id === companyId ? { ...company, people: company.people.some((item) => item.id === personId) ? company.people : [person, ...company.people] } : company)),
    );
  }

  function localFundraisingClientFromDraft(draft: FundraisingClientDraft, amountMinor: number | null, companyId: string, primaryContactPersonId: string | null): FundraisingClient {
    const now = new Date().toISOString();
    return {
      id: draft.clientId ?? `local-client-${Date.now()}`,
      companyId,
      mandateName: draft.mandateName.trim(),
      stage: draft.stage,
      ownerId: null,
      primaryContactPersonId,
      signedOn: draft.signedOn || null,
      targetRaiseAmountMinor: amountMinor,
      targetRaiseCurrency: amountMinor == null ? null : draft.targetRaiseCurrency.trim().toUpperCase(),
      materialsUrl: draft.materialsUrl.trim() || null,
      dataRoomUrl: draft.dataRoomUrl.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function localFundraisingTargetFromDraft(draft: FundraisingTargetDraft, minMinor: number | null, maxMinor: number | null, investorCompanyId: string | null, investorPersonId: string | null): FundraisingClientTarget {
    const now = new Date().toISOString();
    return {
      id: draft.targetId ?? `local-target-${Date.now()}`,
      clientId: draft.clientId,
      investorCompanyId,
      investorPersonId,
      investorName: draft.investorName.trim(),
      investorEmail: draft.investorEmail.trim() || draft.newInvestorPersonEmail.trim() || null,
      investorType: draft.investorType.trim() || null,
      ticketSizeMinMinor: minMinor,
      ticketSizeMaxMinor: maxMinor,
      ticketSizeCurrency: minMinor == null && maxMinor == null ? null : draft.ticketSizeCurrency.trim().toUpperCase(),
      stage: draft.stage,
      ownerId: null,
      lastContactedAt: draft.lastContactedAt ? `${draft.lastContactedAt}T00:00:00.000Z` : null,
      nextStep: draft.nextStep.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function saveFundraisingClient() {
    if (isSavingFundraising) return;
    const amountMinor = fundraisingClientDraft.targetRaiseAmount.trim() ? parseMoneyInput(fundraisingClientDraft.targetRaiseAmount) : null;
    const newCompanyName = fundraisingClientDraft.newCompanyName.trim();
    const newPrimaryContactName = fundraisingClientDraft.newPrimaryContactName.trim();
    if (!fundraisingClientDraft.mandateName.trim()) {
      setFundraisingMessage("Mandate name is required.");
      return;
    }
    if (!fundraisingClientDraft.companyId && !newCompanyName) {
      setFundraisingMessage("Choose a client company or enter a new company name.");
      return;
    }
    if (fundraisingClientDraft.targetRaiseAmount.trim() && !amountMinor) {
      setFundraisingMessage("Enter a positive target raise amount with up to two decimals.");
      return;
    }

    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving fundraising clients.");
          return;
        }
        const result = await saveFundraisingClientAction({
          organizationId,
          clientId: fundraisingClientDraft.clientId ?? undefined,
          companyId: fundraisingClientDraft.companyId || null,
          createCompany: fundraisingClientDraft.companyId
            ? undefined
            : {
                name: newCompanyName,
                websiteDomains: normalizeCompanyWebsites(fundraisingClientDraft.newCompanyWebsites),
                country: fundraisingClientDraft.newCompanyCountry || null,
                categories: ["Fundraising Client"],
              },
          mandateName: fundraisingClientDraft.mandateName,
          stage: fundraisingClientDraft.stage,
          primaryContactPersonId: fundraisingClientDraft.primaryContactPersonId || null,
          createPrimaryContact: newPrimaryContactName
            ? {
                displayName: newPrimaryContactName,
                email: fundraisingClientDraft.newPrimaryContactEmail || null,
                jobTitle: fundraisingClientDraft.newPrimaryContactJobTitle || null,
              }
            : undefined,
          signedOn: fundraisingClientDraft.signedOn || null,
          targetRaiseAmountMinor: amountMinor,
          targetRaiseCurrency: amountMinor == null ? null : fundraisingClientDraft.targetRaiseCurrency,
          materialsUrl: fundraisingClientDraft.materialsUrl || null,
          dataRoomUrl: fundraisingClientDraft.dataRoomUrl || null,
          notes: fundraisingClientDraft.notes || null,
        });
        setFundraisingMessage(result.message);
        if (result.ok && result.client) {
          updateFundraisingClientLocally(result.client);
          if (!fundraisingClientDraft.companyId) addCreatedCompanyLocally(result.client.companyId, newCompanyName, fundraisingClientDraft.newCompanyWebsites, fundraisingClientDraft.newCompanyCountry, "Fundraising Client");
          if (newPrimaryContactName && result.client.primaryContactPersonId) {
            addCreatedPersonLocally(result.client.companyId, result.client.primaryContactPersonId, newPrimaryContactName, fundraisingClientDraft.newPrimaryContactEmail, fundraisingClientDraft.newPrimaryContactJobTitle);
          }
          setFundraisingClientDraft(defaultFundraisingClientDraft());
          router.refresh();
        }
        return;
      }

      const companyId = fundraisingClientDraft.companyId || `local-fundraising-company-${Date.now()}`;
      const primaryContactPersonId = fundraisingClientDraft.primaryContactPersonId || (newPrimaryContactName ? `local-fundraising-person-${Date.now()}` : null);
      if (!fundraisingClientDraft.companyId) addCreatedCompanyLocally(companyId, newCompanyName, fundraisingClientDraft.newCompanyWebsites, fundraisingClientDraft.newCompanyCountry, "Fundraising Client");
      if (newPrimaryContactName && primaryContactPersonId) {
        addCreatedPersonLocally(companyId, primaryContactPersonId, newPrimaryContactName, fundraisingClientDraft.newPrimaryContactEmail, fundraisingClientDraft.newPrimaryContactJobTitle);
      }
      updateFundraisingClientLocally(localFundraisingClientFromDraft(fundraisingClientDraft, amountMinor, companyId, primaryContactPersonId));
      setFundraisingClientDraft(defaultFundraisingClientDraft());
      setFundraisingMessage("Demo fundraising client saved locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function saveFundraisingTarget() {
    if (isSavingFundraising) return;
    const minMinor = fundraisingTargetDraft.ticketSizeMin.trim() ? parseMoneyInput(fundraisingTargetDraft.ticketSizeMin) : null;
    const maxMinor = fundraisingTargetDraft.ticketSizeMax.trim() ? parseMoneyInput(fundraisingTargetDraft.ticketSizeMax) : null;
    const newInvestorCompanyName = fundraisingTargetDraft.newInvestorCompanyName.trim();
    const newInvestorPersonName = fundraisingTargetDraft.newInvestorPersonName.trim();
    if (!fundraisingTargetDraft.clientId) {
      setFundraisingMessage("Choose a fundraising client before adding an investor target.");
      return;
    }
    if (!fundraisingTargetDraft.investorName.trim()) {
      setFundraisingMessage("Investor name is required.");
      return;
    }
    if ((fundraisingTargetDraft.ticketSizeMin.trim() && !minMinor) || (fundraisingTargetDraft.ticketSizeMax.trim() && !maxMinor)) {
      setFundraisingMessage("Enter positive ticket amounts with up to two decimals.");
      return;
    }
    if (minMinor != null && maxMinor != null && maxMinor < minMinor) {
      setFundraisingMessage("Maximum ticket size must be greater than or equal to the minimum.");
      return;
    }

    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving investor targets.");
          return;
        }
        const result = await saveFundraisingTargetAction({
          organizationId,
          targetId: fundraisingTargetDraft.targetId ?? undefined,
          clientId: fundraisingTargetDraft.clientId,
          investorCompanyId: fundraisingTargetDraft.investorCompanyId || null,
          createInvestorCompany: fundraisingTargetDraft.investorCompanyId || !newInvestorCompanyName
            ? undefined
            : {
                name: newInvestorCompanyName,
                websiteDomains: normalizeCompanyWebsites(fundraisingTargetDraft.newInvestorCompanyWebsites),
                country: fundraisingTargetDraft.newInvestorCompanyCountry || null,
                categories: ["Investor Target"],
              },
          investorPersonId: fundraisingTargetDraft.investorPersonId || null,
          createInvestorPerson: fundraisingTargetDraft.investorPersonId || !newInvestorPersonName
            ? undefined
            : {
                displayName: newInvestorPersonName,
                email: fundraisingTargetDraft.newInvestorPersonEmail || null,
                jobTitle: fundraisingTargetDraft.newInvestorPersonJobTitle || null,
              },
          investorName: fundraisingTargetDraft.investorName,
          investorEmail: fundraisingTargetDraft.investorEmail || null,
          investorType: fundraisingTargetDraft.investorType || null,
          ticketSizeMinMinor: minMinor,
          ticketSizeMaxMinor: maxMinor,
          ticketSizeCurrency: minMinor == null && maxMinor == null ? null : fundraisingTargetDraft.ticketSizeCurrency,
          stage: fundraisingTargetDraft.stage,
          lastContactedAt: fundraisingTargetDraft.lastContactedAt ? `${fundraisingTargetDraft.lastContactedAt}T00:00:00.000Z` : null,
          nextStep: fundraisingTargetDraft.nextStep || null,
          notes: fundraisingTargetDraft.notes || null,
        });
        setFundraisingMessage(result.message);
        if (result.ok && result.target) {
          updateFundraisingTargetLocally(result.target);
          if (!fundraisingTargetDraft.investorCompanyId && newInvestorCompanyName && result.target.investorCompanyId) {
            addCreatedCompanyLocally(result.target.investorCompanyId, newInvestorCompanyName, fundraisingTargetDraft.newInvestorCompanyWebsites, fundraisingTargetDraft.newInvestorCompanyCountry, "Investor Target");
          }
          if (newInvestorPersonName && result.target.investorPersonId) {
            addCreatedPersonLocally(result.target.investorCompanyId, result.target.investorPersonId, newInvestorPersonName, fundraisingTargetDraft.newInvestorPersonEmail, fundraisingTargetDraft.newInvestorPersonJobTitle);
          }
          setFundraisingTargetDraft(defaultFundraisingTargetDraft(result.target.clientId));
          router.refresh();
        }
        return;
      }

      const investorCompanyId = fundraisingTargetDraft.investorCompanyId || (newInvestorCompanyName ? `local-investor-company-${Date.now()}` : null);
      const investorPersonId = fundraisingTargetDraft.investorPersonId || (newInvestorPersonName ? `local-investor-person-${Date.now()}` : null);
      if (!fundraisingTargetDraft.investorCompanyId && newInvestorCompanyName && investorCompanyId) {
        addCreatedCompanyLocally(investorCompanyId, newInvestorCompanyName, fundraisingTargetDraft.newInvestorCompanyWebsites, fundraisingTargetDraft.newInvestorCompanyCountry, "Investor Target");
      }
      if (newInvestorPersonName && investorPersonId) {
        addCreatedPersonLocally(investorCompanyId, investorPersonId, newInvestorPersonName, fundraisingTargetDraft.newInvestorPersonEmail, fundraisingTargetDraft.newInvestorPersonJobTitle);
      }
      updateFundraisingTargetLocally(localFundraisingTargetFromDraft(fundraisingTargetDraft, minMinor, maxMinor, investorCompanyId, investorPersonId));
      setFundraisingTargetDraft(defaultFundraisingTargetDraft(fundraisingTargetDraft.clientId));
      setFundraisingMessage("Demo investor target saved locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function deleteFundraisingClient(client: FundraisingClient) {
    if (isSavingFundraising) return;
    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting fundraising clients.");
          return;
        }
        const result = await deleteFundraisingClientAction({ organizationId, id: client.id });
        setFundraisingMessage(result.message);
        if (result.ok) {
          removeFundraisingClientLocally(client.id);
          router.refresh();
        }
        return;
      }
      const hasAccounting = accountingData.documents.some((document) => document.companyId === client.companyId) || accountingData.ledgerEntries.some((entry) => entry.companyId === client.companyId);
      if (hasAccounting) {
        setFundraisingMessage("This client has accounting records. Pause or complete the mandate instead of deleting it.");
        return;
      }
      removeFundraisingClientLocally(client.id);
      setFundraisingMessage("Demo fundraising client deleted locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function deleteFundraisingTarget(target: FundraisingClientTarget) {
    if (isSavingFundraising) return;
    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting investor targets.");
          return;
        }
        const result = await deleteFundraisingTargetAction({ organizationId, id: target.id });
        setFundraisingMessage(result.message);
        if (result.ok) {
          removeFundraisingTargetLocally(target.id);
          router.refresh();
        }
        return;
      }
      removeFundraisingTargetLocally(target.id);
      setFundraisingMessage("Demo investor target deleted locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  function editFundraisingClient(client: FundraisingClient) {
    setFundraisingClientDraft(fundraisingClientDraftFromClient(client));
    setFundraisingTab("clients");
    setFundraisingMessage(null);
  }

  function startFundraisingTarget(clientId: string) {
    setFundraisingTargetDraft(defaultFundraisingTargetDraft(clientId));
    setFundraisingTab("targets");
    setFundraisingMessage(null);
  }

  function editFundraisingTarget(target: FundraisingClientTarget) {
    setFundraisingTargetDraft(fundraisingTargetDraftFromTarget(target));
    setFundraisingTab("targets");
    setFundraisingMessage(null);
  }

  function openAccountingForFundraisingCompany(companyId: string) {
    if (!initialData.accountingAccess.canView) return;
    setAccountingCompanyFilter(companyId);
    setAccountingTab("documents");
    setActiveView("accounting");
  }

  async function splitPeopleNames() {
    const targetPeople = peopleDirectory.map((row) => row.person).filter((person) => !person.firstName);
    if (targetPeople.length === 0) {
      setNamesMessage("No contacts to split.");
      return;
    }

    setIsSplittingNames(true);
    setNamesMessage(null);
    stopBatchRef.current = false;
    let completed = 0;
    let failed = 0;
    setSplitNamesProgress({ total: targetPeople.length, completed, failed });

    for (const person of targetPeople) {
      if (stopBatchRef.current) break;

      setNamesMessage(`Splitting ${completed + failed + 1} of ${targetPeople.length}: ${person.displayName}`);
      setSplitNamesProgress({ total: targetPeople.length, completed, failed });

      try {
        const response = await fetch("/api/enrichment/split-name", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: person.displayName }),
        });

        if (!response.ok) {
          failed += 1;
          continue;
        }

        const { firstName, lastName } = (await response.json()) as { firstName: string; lastName: string };
        const sourceIds = personSourceIds(person);
        updatePersonLocally(sourceIds, { firstName, lastName });

        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (organizationId && isUuid(person.id)) {
          queuePendingChange({
            key: `person:${person.id}`,
            label: "Contact name split",
            type: "person",
            personUpdate: {
              organizationId,
              personId: person.id,
              displayName: person.displayName,
              firstName,
              lastName,
              categories: person.categories,
            },
            record: {
              kind: "person",
              key: `person:${person.id}`,
              label: "Contact name split",
              personUpdate: {
                organizationId,
                personId: person.id,
                displayName: person.displayName,
                firstName,
                lastName,
                categories: person.categories,
              },
            },
            run: () =>
              initialData.authMode === "supabase" && organizationId && isUuid(person.id)
                ? updatePersonAction({
                  organizationId,
                  personId: person.id,
                  displayName: person.displayName,
                  firstName,
                  lastName,
                  categories: person.categories,
                  emails: [],
                })
                : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
          });
        }

        completed += 1;
      } catch {
        if (stopBatchRef.current) break;
        failed += 1;
      }

      setSplitNamesProgress({ total: targetPeople.length, completed, failed });
    }

    setNamesMessage(`Name splitting done: ${completed} split${failed ? `, ${failed} failed` : ""}. Queue changes before pushing.`);
    setSplitNamesProgress(null);
    setIsSplittingNames(false);
  }

  function updateRelationshipInList(relationships: InvestmentRelationship[], relationship: InvestmentRelationship) {
    const existingIndex = relationships.findIndex((item) => relationshipMatches(item, relationship.companyId, relationship.personId) || item.id === relationship.id);
    if (existingIndex === -1) return [...relationships, relationship];
    const next = [...relationships];
    next[existingIndex] = relationship;
    return next;
  }

  function updateInvestmentRelationshipLocally(relationship: InvestmentRelationship) {
    updateCompanies((company) => ({
      ...company,
      investmentRelationships: relationship.companyId === company.id ? updateRelationshipInList(company.investmentRelationships, relationship) : company.investmentRelationships,
      people: company.people.map((person) =>
        relationship.personId === person.id
          ? {
              ...person,
              investmentRelationships: updateRelationshipInList(person.investmentRelationships, relationship),
            }
          : person,
      ),
    }));
  }

  function updateDealStatusInRelationships(relationships: InvestmentRelationship[], dealId: string, status: InvestmentDealStatus) {
    return relationships.map((relationship) => ({
      ...relationship,
      deals: relationship.deals.map((deal) => (deal.id === dealId ? { ...deal, status } : deal)),
    }));
  }

  function updateInvestmentDealStatusLocally(companyId: string, dealId: string, status: InvestmentDealStatus, summary: string) {
    const now = new Date().toISOString();
    const activityId = `local-status-${companyId}-${dealId}`;
    updateCompanies((company) => ({
      ...company,
      investmentRelationships: updateDealStatusInRelationships(company.investmentRelationships, dealId, status),
      people: company.people.map((person) => ({
        ...person,
        investmentRelationships: updateDealStatusInRelationships(person.investmentRelationships, dealId, status),
      })),
      activities:
        company.id === companyId
          ? [
              { id: activityId, type: "status_change", summary, occurredAt: now },
              ...company.activities.filter((activity) => activity.id !== activityId),
            ]
          : company.activities,
      lastActivityAt: company.id === companyId ? now : company.lastActivityAt,
    }));
  }

  function saveInvestmentRelationship(relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const nextRelationship: InvestmentRelationship = {
      ...relationship,
      investmentStatus: draft.investmentStatus,
      capacityStatus: draft.capacityStatus,
      notes: draft.notes.trim() || null,
      lastInvestedDate: draft.lastInvestedDate || null,
    };
    updateInvestmentRelationshipLocally(nextRelationship);

    const payload = {
      organizationId: organizationId ?? "",
      relationshipId: isUuid(relationship.id) ? relationship.id : undefined,
      companyId: relationship.companyId,
      personId: relationship.personId,
      investmentStatus: nextRelationship.investmentStatus,
      capacityStatus: nextRelationship.capacityStatus,
      notes: nextRelationship.notes,
      lastInvestedDate: nextRelationship.lastInvestedDate,
    };

    queuePendingChange({
      key: `investment:${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}`,
      label,
      record: {
        kind: "investment-relationship",
        key: `investment:${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}`,
        label,
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId
          ? updateInvestmentRelationshipAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function addInvestmentDealLocally(relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) {
    const dealName = draft.dealName.trim();
    if (!dealName) return;
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const localDealId = `local-deal-${relationship.id}-${dealName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${relationship.deals.length}`;
    const nextRelationship: InvestmentRelationship = {
      ...relationship,
      investmentStatus: draft.investmentStatus,
      capacityStatus: draft.capacityStatus,
      notes: draft.notes.trim() || relationship.notes,
      lastInvestedDate: draft.dealDate || draft.lastInvestedDate || relationship.lastInvestedDate,
      deals: [
        {
          id: localDealId,
          name: dealName,
          status: draft.dealStatus,
          investedAt: draft.dealDate || null,
          role: draft.dealRole.trim() || null,
          notes: draft.dealNotes.trim() || null,
        },
        ...relationship.deals,
      ],
    };
    updateInvestmentRelationshipLocally(nextRelationship);

    const payload = {
      organizationId: organizationId ?? "",
      relationshipId: isUuid(relationship.id) ? relationship.id : undefined,
      companyId: relationship.companyId,
      personId: relationship.personId,
      investmentStatus: draft.investmentStatus,
      capacityStatus: draft.capacityStatus,
      relationshipNotes: draft.notes.trim() || null,
      dealName,
      dealStatus: draft.dealStatus,
      investedAt: draft.dealDate || null,
      role: draft.dealRole.trim() || null,
      notes: draft.dealNotes.trim() || null,
    };
    const key = `investment-deal:${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}:${localDealId}`;

    queuePendingChange({
      key,
      label,
      record: {
        kind: "investment-deal",
        key,
        label,
        payload,
        localDeal: {
          companyId: relationship.companyId,
          personId: relationship.personId,
          relationshipId: relationship.id,
          dealId: localDealId,
          dealName,
          dealStatus: draft.dealStatus,
          investedAt: draft.dealDate || null,
          role: draft.dealRole.trim() || null,
          notes: draft.dealNotes.trim() || null,
        },
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId
          ? addInvestmentDealAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function updatePipelineDraft(row: DealPipelineRow, updates: Partial<PipelineStatusDraft>) {
    setPipelineDrafts((current) => ({
      ...current,
      [row.key]: {
        status: current[row.key]?.status ?? row.status,
        note: current[row.key]?.note ?? "",
        ...updates,
      },
    }));
  }

  function queueDealStatusUpdate(row: DealPipelineRow) {
    const draft = pipelineDrafts[row.key] ?? { status: row.status, note: "" };
    const note = draft.note.trim();
    const statusChanged = draft.status !== row.status;
    if (!statusChanged && !note) return;

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const summary = formatDealStatusSummary(row.dealName, row.status, draft.status);
    const payload = {
      organizationId: organizationId ?? "",
      companyId: row.companyId,
      dealId: row.dealId,
      status: draft.status,
      note: note || null,
    };

    updateInvestmentDealStatusLocally(row.companyId, row.dealId, draft.status, summary);
    queuePendingChange({
      key: `investment-deal-status:${row.companyId}:${row.dealId}`,
      label: "Deal status update",
      record: {
        kind: "investment-deal-status",
        key: `investment-deal-status:${row.companyId}:${row.dealId}`,
        label: "Deal status update",
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(row.companyId) && isUuid(row.dealId)
          ? updateInvestmentDealStatusAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    setPipelineDrafts((current) => {
      const next = { ...current };
      delete next[row.key];
      return next;
    });
  }

  function updatePersonLocally(targetPersonIds: string[], updates: Partial<Pick<Person, "displayName" | "firstName" | "lastName" | "emails" | "jobTitle" | "linkedinUrl" | "phone" | "country" | "categories" | "investmentRelationships">>) {
    const personIdSet = new Set(targetPersonIds);
    updateCompanies((company) => ({
      ...company,
      people: company.people.map((person) =>
        person.sourcePersonIds.some((personId) => personIdSet.has(personId))
          ? {
              ...person,
              ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
              ...(updates.firstName !== undefined ? { firstName: updates.firstName } : {}),
              ...(updates.lastName !== undefined ? { lastName: updates.lastName } : {}),
              ...(updates.emails !== undefined ? { email: updates.emails[0] ?? null, emails: updates.emails } : {}),
              ...(updates.jobTitle !== undefined ? { jobTitle: updates.jobTitle } : {}),
              ...(updates.linkedinUrl !== undefined ? { linkedinUrl: updates.linkedinUrl } : {}),
              ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
              ...(updates.country !== undefined ? { country: updates.country } : {}),
              ...(updates.categories !== undefined ? { categories: updates.categories } : {}),
              ...(updates.investmentRelationships !== undefined ? { investmentRelationships: updates.investmentRelationships } : {}),
            }
          : person,
      ),
    }));
  }

  function applyCategoryToPeople(people: Person[], category: string, previousCategory?: string) {
    return people.map((person) => {
      const renamedCategories = previousCategory
        ? person.categories.map((item) => (item === previousCategory ? category : item))
        : person.categories;
      return {
        ...person,
        categories: normalizePersonCategories([...renamedCategories, category]),
      };
    });
  }

  function renameCompanyTag(summary: Extract<TagSummary, { type: "company" }>, nextName: string) {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === summary.name) return;
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;

    updateCompanies((company) => ({
      ...company,
      tags: company.tags.map((tag) => (tag.id === summary.id ? { ...tag, name: cleanName } : tag)),
      people: company.tags.some((tag) => tag.id === summary.id) ? applyCategoryToPeople(company.people, cleanName, summary.name) : company.people,
    }));

    queuePendingChange({
      key: `company-tag-rename:${summary.id}`,
      label: "Company tag rename",
      record: {
        kind: "company-tag-rename",
        key: `company-tag-rename:${summary.id}`,
        label: "Company tag rename",
        organizationId: organizationId ?? null,
        tagId: summary.id,
        name: cleanName,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(summary.id)
          ? renameCompanyTagAction({ organizationId, tagId: summary.id, name: cleanName })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    setTagDrafts((current) => ({ ...current, [summary.key]: cleanName }));
  }

  function renameContactTag(summary: Extract<TagSummary, { type: "contact" }>, nextName: string) {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === summary.name) return;
    const oldName = summary.name;
    const affectedPeople = peopleDirectory
      .map(({ person }) =>
        person.categories.some((category) => category === oldName)
          ? {
              ...person,
              categories: normalizePersonCategories(person.categories.map((category) => (category === oldName ? cleanName : category))),
            }
          : null,
      )
      .filter((person): person is Person => Boolean(person));

    if (affectedPeople.length === 0) return;

    affectedPeople.forEach((person) => {
      updatePersonLocally(personSourceIds(person), {
        displayName: person.displayName,
        emails: person.emails,
        categories: person.categories,
      });
      queuePersonUpdate(person, "Contact tag rename", { syncEmails: false });
    });
    setTagDrafts((current) => ({ ...current, [summary.key]: cleanName }));
  }

  function renameTag(summary: TagSummary) {
    const nextName = tagDrafts[summary.key] ?? summary.name;
    if (summary.type === "company") renameCompanyTag(summary, nextName);
    else renameContactTag(summary, nextName);
  }

  function startPersonEdit(person: Person) {
    setPeopleMessage(null);
    setPersonEditMessage(null);
    setEditingPersonId(person.id);
    setEditDisplayName(person.displayName);
    setEditFirstName(person.firstName ?? "");
    setEditLastName(person.lastName ?? "");
    setEditEmails(person.emails.length > 0 ? [...person.emails] : []);
    setEditJobTitle(person.jobTitle ?? "");
    setEditLinkedinUrl(person.linkedinUrl ?? "");
    setEditPhone(person.phone ?? "");
    setEditCountry(person.country ?? "");
    setEditCategories([...person.categories]);
    setEditCategoryInput("");
    setPersonInvestmentDraft(investmentDraftForRelationship(relationshipForPerson(person)));
  }

  function closePersonEdit() {
    setEditingPersonId(null);
    setEditDisplayName("");
    setEditFirstName("");
    setEditLastName("");
    setEditEmails([]);
    setEditJobTitle("");
    setEditLinkedinUrl("");
    setEditPhone("");
    setEditCountry("");
    setEditCategories([]);
    setEditCategoryInput("");
    setPersonInvestmentDraft(null);
    setPersonEditMessage(null);
  }

  function updateEditEmail(index: number, value: string) {
    setEditEmails((current) => current.map((email, emailIndex) => (emailIndex === index ? value : email)));
  }

  function addEditEmail() {
    setEditEmails((current) => [...current, ""]);
  }

  function removeEditEmail(index: number) {
    setEditEmails((current) => current.filter((_, emailIndex) => emailIndex !== index));
  }

  function moveEditEmail(index: number, direction: -1 | 1) {
    setEditEmails((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addEditCategory() {
    const nextCategories = normalizePersonCategories([...editCategories, editCategoryInput]);
    setEditCategories(nextCategories);
    setEditCategoryInput("");
  }

  function removeEditCategory(category: string) {
    setEditCategories((current) => current.filter((item) => item !== category));
  }

  function saveEditedPerson() {
    if (!editingPerson) return;

    const displayName = editDisplayName.trim();
    const firstName = editFirstName.trim() || null;
    const lastName = editLastName.trim() || null;
    const emails = normalizePersonEmails(editEmails);
    const categories = normalizePersonCategories([...editCategories, editCategoryInput]);
    const jobTitle = editJobTitle.trim() || null;
    const linkedinUrl = editLinkedinUrl.trim() || null;
    const phone = editPhone.trim() || null;
    const countryValue = editCountry.trim() || null;
    const sourceIds = personSourceIds(editingPerson);
    const mergeSourceIds = sourceIds.filter((personId) => personId !== editingPerson.id);

    if (!displayName) {
      setPersonEditMessage("Contact name is required.");
      return;
    }

    if (emails.some((email) => !isValidPersonEmail(email))) {
      setPersonEditMessage("Enter valid email addresses.");
      return;
    }

    const updates = { displayName, firstName, lastName, emails, jobTitle, linkedinUrl, phone, country: countryValue, categories };
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const personUpdate = organizationId && isUuid(editingPerson.id)
      ? {
          organizationId,
          personId: editingPerson.id,
          displayName,
          firstName,
          lastName,
          emails,
          jobTitle,
          linkedinUrl,
          phone,
          country: countryValue,
          categories,
          syncEmails: true,
        }
      : undefined;

    updatePersonLocally(sourceIds, updates);

    for (const sourcePersonId of mergeSourceIds) {
      queuePendingChange({
        key: `merge:${editingPerson.id}:${sourcePersonId}`,
        label: "People merge",
        runBeforePersonBatch: true,
        record: {
          kind: "people-merge",
          key: `merge:${editingPerson.id}:${sourcePersonId}`,
          label: "People merge",
          organizationId: organizationId ?? null,
          targetPersonId: editingPerson.id,
          sourcePersonId,
        },
        run: () =>
          initialData.authMode === "supabase" && organizationId && isUuid(editingPerson.id) && isUuid(sourcePersonId)
            ? mergePeopleAction({ organizationId, targetPersonId: editingPerson.id, sourcePersonId })
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    }

    queuePendingChange({
      key: `person:${editingPerson.id}`,
      label: "Contact update",
      type: "person",
      personUpdate,
      record: {
        kind: "person",
        key: `person:${editingPerson.id}`,
        label: "Contact update",
        personUpdate: personUpdate ?? {
          organizationId: "",
          personId: editingPerson.id,
          displayName,
          firstName,
          lastName,
          emails,
          jobTitle,
          linkedinUrl,
          phone,
          country: countryValue,
          categories,
          syncEmails: true,
        },
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(editingPerson.id)
          ? updatePersonAction({
            organizationId,
            personId: editingPerson.id,
            displayName,
            firstName,
            lastName,
            emails,
            jobTitle,
            linkedinUrl,
            phone,
            country: countryValue,
            categories,
          })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    if (editingPersonInvestment && personInvestmentDraft) {
      saveInvestmentRelationship(editingPersonInvestment, personInvestmentDraft, "Contact investment update");
      if (personInvestmentDraft.dealName.trim()) {
        addInvestmentDealLocally(editingPersonInvestment, personInvestmentDraft, "Contact investment deal");
      }
    }
    setPeopleMessage(
      mergeSourceIds.length > 0 ? "Contact merge, update, and investment profile queued locally." : "Contact update queued locally.",
    );
    closePersonEdit();
  }

  function addManualNote() {
    if (!activeCompany || !noteText.trim()) return;
    const summary = noteText.trim();
    const actionKey = `activity:${activeCompany.id}:${Date.now()}`;
    updateCompanies((company) =>
      company.id === activeCompany.id
        ? {
            ...company,
            activities: [{ id: `local-${Date.now()}`, type: "note", summary, occurredAt: new Date().toISOString() }, ...company.activities],
            lastActivityAt: new Date().toISOString(),
          }
        : company,
    );
    setNoteText("");

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const companyId = activeCompany.id;
    queuePendingChange({
      key: actionKey,
      label: "Activity note",
      record: {
        kind: "activity-note",
        key: actionKey,
        label: "Activity note",
        organizationId: organizationId ?? null,
        companyId,
        summary,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(companyId)
          ? addActivityAction({
          organizationId,
          companyId,
          activityType: "note",
          summary,
        })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function mergeCompaniesLocally(targetCompanyId: string, sourceCompanyIds: string[]) {
    setCompanies((current) => {
      const target = current.find((company) => company.id === targetCompanyId);
      const sources = sourceCompanyIds
        .map((companyId) => current.find((company) => company.id === companyId))
        .filter((company): company is Company => Boolean(company));

      if (!target || sources.length === 0) return current;

      const mergedCompany = mergeCompanyDetails(target, sources);
      const sourceIdSet = new Set(sourceCompanyIds);

      return current
        .filter((company) => !sourceIdSet.has(company.id))
        .map((company) => (company.id === targetCompanyId ? mergedCompany : company));
    });
    setSelectedIds(new Set([targetCompanyId]));
    setActiveCompanyId(targetCompanyId);
    setCompanyDraft({ companyId: "", name: "", websites: "", description: "", country: "" });
  }

  function handleCompanyMerge() {
    if (!companyMergeTarget || companyMergeSources.length === 0) return;

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const targetCompanyId = companyMergeTarget.id;
    const sourceCompanyIds = companyMergeSources.map((company) => company.id);

    mergeCompaniesLocally(targetCompanyId, sourceCompanyIds);
    queuePendingChange({
      key: `company-merge:${targetCompanyId}:${sourceCompanyIds.join(",")}`,
      label: "Company merge",
      record: {
        kind: "company-merge",
        key: `company-merge:${targetCompanyId}:${sourceCompanyIds.join(",")}`,
        label: "Company merge",
        organizationId: organizationId ?? null,
        targetCompanyId,
        sourceCompanyIds,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(targetCompanyId) && sourceCompanyIds.every(isUuid)
          ? mergeCompaniesAction({ organizationId, targetCompanyId, sourceCompanyIds })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    closeCompanyMerge();
  }

  function mergePeopleLocally(targetPersonId: string, sourcePersonId: string) {
    const targetEntry = peopleDirectory.find(({ person }) => person.id === targetPersonId);
    const sourceEntry = peopleDirectory.find(({ person }) => person.id === sourcePersonId);
    if (!targetEntry || !sourceEntry) return;

    const mergedGlobalPerson = mergePersonDetails(targetEntry.person, sourceEntry.person, targetPersonId);
    setCompanies((current) =>
      current.map((company) => {
        const targetPerson = company.people.find((person) => person.id === targetPersonId) ?? null;
        const sourcePerson = company.people.find((person) => person.id === sourcePersonId) ?? null;
        if (!targetPerson && !sourcePerson) return company;

        const mergedCompanyPerson = targetPerson && sourcePerson
          ? mergePersonDetails(targetPerson, sourcePerson, targetPersonId)
          : targetPerson
            ? mergePersonDetails(targetPerson, mergedGlobalPerson, targetPersonId)
            : mergePersonDetails(mergedGlobalPerson, sourcePerson!, targetPersonId);

        const nextPeople: Person[] = [];
        let inserted = false;
        for (const person of company.people) {
          if (person.id === targetPersonId || person.id === sourcePersonId) {
            if (!inserted) {
              nextPeople.push(mergedCompanyPerson);
              inserted = true;
            }
            continue;
          }
          nextPeople.push(person);
        }

        if (!inserted) nextPeople.push(mergedCompanyPerson);
        return { ...company, people: nextPeople };
      }),
    );
  }

  function startManualMerge(targetPersonId: string, searchHint = "") {
    setPeopleMessage(null);
    setPersonMergeTargetId(targetPersonId);
    setPersonMergeQuery(searchHint);
  }

  function closeManualMerge() {
    setPersonMergeTargetId(null);
    setPersonMergeQuery("");
  }

  function handleManualMerge(sourcePersonId: string) {
    if (!personMergeTarget || sourcePersonId === personMergeTarget.person.id) return;

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const targetPersonId = personMergeTarget.person.id;

    mergePeopleLocally(targetPersonId, sourcePersonId);
    queuePendingChange({
      key: `merge:${targetPersonId}:${sourcePersonId}`,
      label: "People merge",
      runBeforePersonBatch: true,
      record: {
        kind: "people-merge",
        key: `merge:${targetPersonId}:${sourcePersonId}`,
        label: "People merge",
        organizationId: organizationId ?? null,
        targetPersonId,
        sourcePersonId,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(targetPersonId) && isUuid(sourcePersonId)
          ? mergePeopleAction({ organizationId, targetPersonId, sourcePersonId })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    setPeopleMessage("People merge queued locally.");
    closeManualMerge();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">GS</span>
          <div>
            <strong>Golden Source</strong>
            <span>Outreach CRM</span>
          </div>
        </div>
        <nav className="nav-list" aria-label="Primary">
          <NavButton active={activeView === "companies"} icon={<Building2 size={18} />} label="Companies" onClick={() => setActiveView("companies")} />
          <NavButton active={activeView === "people"} icon={<UsersRound size={18} />} label="People" onClick={() => setActiveView("people")} />
          <NavButton active={activeView === "tags"} icon={<Tags size={18} />} label="Tags" onClick={() => setActiveView("tags")} />
          <NavButton active={activeView === "pipeline"} icon={<CircleDot size={18} />} label="Pipeline" onClick={() => setActiveView("pipeline")} />
          <NavButton active={activeView === "clients"} icon={<Handshake size={18} />} label="Fundraising clients" onClick={() => setActiveView("clients")} />
          <NavButton active={activeView === "tasks"} icon={<ListChecks size={18} />} label="Tasks" onClick={() => setActiveView("tasks")} />
          <NavButton active={activeView === "import"} icon={<FileSpreadsheet size={18} />} label="Import Admin" onClick={() => setActiveView("import")} />
          <NavButton active={activeView === "accounting"} icon={<CreditCard size={18} />} label="Accounting" onClick={() => setActiveView("accounting")} />
        </nav>
        <div className="sidebar-footer">
          <span className={clsx("mode-dot", isSignedIn ? "signed-in" : "signed-out")} />
          <div>
            <strong>{authLabel}</strong>
            <span>{authDetail}</span>
          </div>
        </div>
      </aside>

      <main className={clsx("workspace", activeView === "companies" && showCompanyTable && !showDetailPanel && "companies-workspace")}>
        <header className="topbar">
          <div>
            <p className="eyebrow">Private team workspace</p>
            <h1>{VIEW_TITLES[activeView]}</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className={clsx("secondary-button", debugMode && "debug-toggle-active")} onClick={toggleDebugMode}>
              <FlaskConical size={16} /> {debugMode ? "Debug on" : "Debug off"}
            </button>
            {debugMode ? (
              <button type="button" className="secondary-button" onClick={resetDebugDraft}>
                <Trash2 size={16} /> Reset draft
              </button>
            ) : null}
            {isSignedIn ? (
              <div className="auth-status" aria-label={`Signed in as ${initialData.currentUserName}`}>
                <span>
                  <UserRound size={16} /> {initialData.currentUserName}
                </span>
                <form action={signOut}>
                  <button className="secondary-button" type="submit">
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <a className="secondary-button" href="/login">
                <UserRound size={16} /> Sign in
              </a>
            )}
            <button className="primary-button" type="button">
              <Upload size={16} /> Import XLSX
            </button>
          </div>
        </header>

        {debugMode ? (
          <div className="debug-banner" aria-live="polite">
            <FlaskConical size={16} />
            <span>
              {debugStorageIssue ?? "Debug mode is on. Edits and queued changes are saved in this browser until you push them to the database."}
            </span>
          </div>
        ) : null}

        {authSuccess && isSignedIn ? (
          <div className="data-notice success auth-flash" aria-live="polite">
            <Check size={16} />
            <span>Signed in successfully.</span>
          </div>
        ) : null}

        <section className="metrics-grid" aria-label="Import and CRM summary">
          <Metric label="Raw contacts" value={formatNumber(initialData.importSummary.rawRows)} />
          <Metric label="Companies" value={formatNumber(initialData.importSummary.normalizedCompanies)} />
          <Metric label="People" value={formatNumber(initialData.importSummary.normalizedPeople)} />
          <Metric label="Review queue" value={formatNumber(initialData.importSummary.suspiciousMerges)} tone="warn" />
        </section>

        <section className="pipeline-strip" aria-label="Pipeline stages">
          {pipelineCounts.map((item) => (
            <button
              key={item.stage}
              type="button"
              className={clsx("pipeline-pill", stageFilters.has(item.stage) && "active")}
              onClick={() => {
                toggleCompanyFilter(setStageFilters, item.stage);
                setActiveView("companies");
              }}
              title={`Filter ${item.stage}`}
            >
              <span>{item.stage}</span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </section>

        {activeView === "companies" ? (
          <section className={clsx("content-grid", !showCompanyTable && "detail-only", !showDetailPanel && "table-only")}>
            {showCompanyTable ? (
            <div className="company-surface">
            <div className="toolbar">
              <label className="search-box">
                <Search size={16} />
                <input
                  value={query}
                  onChange={(event) => {
                    setCompanyPage(1);
                    setQuery(event.target.value);
                  }}
                  placeholder="Search companies, people, tags, domains"
                />
              </label>
              <button
                type="button"
                className="secondary-button table-refresh-button"
                onClick={refreshCompanyTable}
                disabled={isRefreshingTable}
                aria-label="Refresh company table"
                title="Refresh company table from the database"
              >
                <RefreshCw size={15} className={clsx(isRefreshingTable && "spinning")} />
                {isRefreshingTable ? "Refreshing" : "Refresh"}
              </button>
              <MultiFilterSelect
                icon={<Filter size={15} />}
                label="Stage"
                options={OUTREACH_STAGES}
                selected={stageFilters}
                onToggle={(value) => toggleCompanyFilter(setStageFilters, value)}
              />
              <MultiFilterSelect
                label="Country"
                options={countries}
                selected={countryFilters}
                onToggle={(value) => toggleCompanyFilter(setCountryFilters, value)}
              />
              <MultiFilterSelect
                label="Tag"
                options={tagNames}
                selected={tagFilters}
                onToggle={(value) => toggleCompanyFilter(setTagFilters, value)}
              />
              <MultiFilterSelect
                label="Quality"
                options={Object.keys(SOURCE_QUALITY_LABELS)}
                selected={qualityFilters}
                onToggle={(value) => toggleCompanyFilter(setQualityFilters, value)}
                formatOption={(value) => SOURCE_QUALITY_LABELS[value as keyof typeof SOURCE_QUALITY_LABELS] ?? value}
              />
              {activeCompanyFilterCount > 0 ? (
                <button type="button" className="text-button filter-clear-button" onClick={clearCompanyFilters}>
                  <X size={14} /> Clear filters
                </button>
              ) : null}
            </div>

            <div className="exportbar">
              <div>
                <strong>{formatNumber(exportRows.length)} contacts match</strong>
                <span>Export every linked contact for one criterion, regardless of current page size.</span>
              </div>
              <label className="select-filter">
                <span>Criterion</span>
                <select
                  value={exportCriterion}
                  onChange={(event) => {
                    const nextCriterion = event.target.value as ContactExportCriterion;
                    setExportCriterion(nextCriterion);
                    setExportValue(contactExportValues(companies, nextCriterion)[0] ?? "");
                  }}
                >
                  {Object.entries(CONTACT_EXPORT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
              <label className="search-box export-value-box">
                <Search size={16} />
                <input
                  list="contact-export-values"
                  value={exportValue}
                  onChange={(event) => setExportValue(event.target.value)}
                  placeholder="Biotech"
                />
                <datalist id="contact-export-values">
                  {exportOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const params = new URLSearchParams({ criterion: exportCriterion, value: exportValue });
                  window.location.href = `/api/export/contacts?${params.toString()}`;
                }}
              >
                <Download size={15} /> Export matched contacts
              </button>
            </div>

            <div className="bulkbar">
              <span>{selectedIds.size} selected</span>
              <select onChange={(event) => event.target.value && applyStage(event.target.value as OutreachStage)} defaultValue="">
                <option value="">Move stage</option>
                {OUTREACH_STAGES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <label className="bulk-tag">
                <Tags size={15} />
                <input value={bulkTag} onChange={(event) => setBulkTag(event.target.value)} placeholder="Add tag" />
              </label>
              <button type="button" onClick={applyBulkTag}>
                <Plus size={15} /> Apply
              </button>
              <button type="button" onClick={startCompanyMerge} disabled={selectedCompanies.length < 2} title="Merge selected companies">
                <GitMerge size={15} /> Merge
              </button>
              <button
                type="button"
                className={clsx("batch-enrich-button", isBatchEnriching && "running")}
                style={{ "--batch-progress": `${batchProgressPercent}%` } as React.CSSProperties}
                onClick={isBatchEnriching ? requestStopEnrichmentBatch : () => enrichCompanyBatch(batchTargetCompanies)}
                disabled={!isBatchEnriching && (isEnriching || !initialData.localEnrichmentEnabled || !isSignedIn || batchTargetCompanies.length === 0)}
                title="Generate local LLM enrichments for selected companies, or all filtered companies if nothing is selected"
                aria-label={isBatchEnriching ? "Stop enrichment batch" : "Start enrichment batch"}
              >
                <span className="batch-enrich-progress" aria-hidden="true" />
                <FlaskConical size={15} />
                {isBatchEnriching
                  ? batchProgress?.stopRequested
                    ? "Stopping..."
                    : `Stop ${formatNumber(batchProgressProcessed)} / ${formatNumber(batchProgress?.total ?? 0)}`
                  : `Enrich ${formatNumber(batchTargetCompanies.length)}`}
              </button>
              <button type="button" onClick={() => exportCompanies(selectedCompanies.length ? selectedCompanies : filteredCompanies)}>
                <Download size={15} /> Export
              </button>
              {pendingChanges.length > 0 ? <span className="saving">{formatChangeCount(pendingChanges.length)}</span> : null}
            </div>

            {batchProgress ? (
              <div className="batch-progress-panel" aria-live="polite">
                <div>
                  <strong>{batchProgress.stopped ? "Batch stopped" : isBatchEnriching ? "Batch enriching" : "Batch complete"}</strong>
                  <span>
                    {formatNumber(batchProgress.completed)} queued
                    {batchProgress.skipped ? `, ${formatNumber(batchProgress.skipped)} skipped` : ""}
                    {batchProgress.failed ? `, ${formatNumber(batchProgress.failed)} failed` : ""}
                    {" "}of {formatNumber(batchProgress.total)}
                    {batchProgress.currentName ? ` • ${batchProgress.currentName}` : ""}
                  </span>
                </div>
                <progress value={batchProgressProcessed} max={batchProgress.total} />
                {!isBatchEnriching && pendingEnrichmentCount > 0 ? (
                  <button type="button" className="secondary-button" onClick={pushPendingEnrichments} disabled={isPushingChanges}>
                    <Upload size={15} /> {isPushingChanges ? "Pushing..." : `Push ${formatNumber(pendingEnrichmentCount)} enrichment${pendingEnrichmentCount === 1 ? "" : "s"}`}
                  </button>
                ) : null}
              </div>
            ) : null}

            {companyMergeTarget ? (
              <div className="people-merge-panel company-merge-panel">
                <div className="people-merge-header">
                  <div>
                    <strong>Merge {selectedCompanies.length} selected companies</strong>
                    <span>Choose the keeper. Websites, people, tags, activity, notes, tasks, and outreach history will move onto it.</span>
                  </div>
                  <button type="button" className="secondary-button" onClick={closeCompanyMerge}>
                    Cancel
                  </button>
                </div>
                <div className="people-merge-list">
                  {selectedCompanies.map((company) => (
                    <article key={company.id} className="merge-candidate-row company-merge-row">
                      <label className="merge-keeper-option">
                        <input
                          type="radio"
                          checked={companyMergeTarget.id === company.id}
                          onChange={() => setCompanyMergeTargetId(company.id)}
                          aria-label={`Keep ${company.name}`}
                        />
                        <span>
                          <strong>{company.name}</strong>
                          {formatCompanyWebsites(company)} • {company.people.length} people • {company.activities.length} activities
                        </span>
                      </label>
                      <div className="tag-list">
                        {company.tags.slice(0, 3).map((item) => (
                          <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
                            {item.name}
                          </span>
                        ))}
                        {company.tags.length > 3 ? <span className="email-more">+{company.tags.length - 3}</span> : null}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="company-merge-actions">
                  <button type="button" className="primary-button" onClick={handleCompanyMerge} disabled={companyMergeSources.length === 0}>
                    <GitMerge size={15} /> Queue merge
                  </button>
                </div>
              </div>
            ) : null}

            <div className="company-table-wrap">
              <table className="company-table">
                <colgroup>
                  <col className="select-column" />
                  <col className="company-column" />
                  <col className="stage-column" />
                  <col className="tags-column" />
                  <col className="people-column" />
                  <col className="quality-column" />
                  <col className="task-column" />
                  <col className="activity-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    <th>Company</th>
                    <th>Stage</th>
                    <th>Tags</th>
                    <th>People</th>
                    <th>Quality</th>
                    <th>Next task</th>
                    <th>Last touch</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCompanies.map((company) => (
                    <tr
                      key={company.id}
                      className={clsx(activeCompany?.id === company.id && "active-row")}
                      onClick={() => setActiveCompanyId(company.id)}
                      onDoubleClick={() => openCompanyModal(company.id)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(company.id)}
                          onChange={(event) => {
                            event.stopPropagation();
                            toggleCompany(company.id);
                          }}
                          aria-label={`Select ${company.name}`}
                        />
                      </td>
                      <td>
                        <div className="company-cell">
                          <strong>{company.name}</strong>
                          <span title={company.websiteDomains.join(", ")}>{formatCompanyWebsites(company)}</span>
                        </div>
                      </td>
                      <td>
                        <span className="stage-badge">{company.outreachStage}</span>
                      </td>
                      <td>
                        <div className="tag-list">
                          {company.tags.slice(0, 3).map((item) => (
                            <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
                              {item.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{company.people.length}</td>
                      <td>
                        <span className={clsx("quality-pill", company.sourceQuality)}>{SOURCE_QUALITY_LABELS[company.sourceQuality]}</span>
                      </td>
                      <td className="muted-cell">{company.nextTask?.title ?? "No open task"}</td>
                      <td className="muted-cell">{formatDate(company.lastActivityAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="company-countbar">
              <span>
                Showing {formatNumber(companyStart)}-{formatNumber(companyEnd)} of {formatNumber(filteredCompanies.length)}
              </span>
              <div className="people-pager">
                <label className="select-filter">
                  <span>Show</span>
                  <select
                    value={String(companyPageSize)}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setCompanyPage(1);
                      setCompanyPageSize(nextValue === "all" ? "all" : (Number(nextValue) as CompanyPageSize));
                    }}
                  >
                    {COMPANY_PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={String(option)} value={String(option)}>
                        {option === "all" ? "All" : option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <button type="button" className="pager-button" disabled={effectiveCompanyPage <= 1 || companyPageSize === "all"} onClick={() => setCompanyPage((current) => Math.max(1, current - 1))}>
                  Previous
                </button>
                <span>
                  Page {formatNumber(effectiveCompanyPage)} / {formatNumber(companyTotalPages)}
                </span>
                <button
                  type="button"
                  className="pager-button"
                  disabled={effectiveCompanyPage >= companyTotalPages || companyPageSize === "all"}
                  onClick={() => setCompanyPage((current) => Math.min(companyTotalPages, current + 1))}
                >
                  Next
                </button>
              </div>
            </div>
            </div>
            ) : null}

          {activeCompany && (showDetailPanel || companyModalId) ? (
            <div
              className={clsx("company-detail-host", !showDetailPanel && "modal-backdrop company-detail-backdrop")}
              role={!showDetailPanel ? "presentation" : undefined}
              onClick={!showDetailPanel ? closeCompanyModal : undefined}
            >
            <aside
              className={clsx("detail-panel", !showDetailPanel && "company-detail-modal")}
              aria-label="Company details"
              role={!showDetailPanel ? "dialog" : undefined}
              aria-modal={!showDetailPanel ? true : undefined}
              onClick={!showDetailPanel ? (event) => event.stopPropagation() : undefined}
            >
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Company detail</p>
                  <input
                    className="title-input"
                    aria-label="Company name"
                    value={activeCompanyDraft.name}
                    onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, name: event.target.value })}
                    onBlur={() => updateActiveCompany("name", activeCompanyDraft.name)}
                  />
                </div>
                <div className="detail-header-actions">
                  <span className={clsx("quality-pill", activeCompany.sourceQuality)}>{SOURCE_QUALITY_LABELS[activeCompany.sourceQuality]}</span>
                  {!showDetailPanel ? (
                    <button type="button" className="icon-button" onClick={closeCompanyModal} title="Close company details">
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="detail-fields">
                <label>
                  Description
                  <textarea
                    value={activeCompanyDraft.description}
                    onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, description: event.target.value })}
                    onBlur={() => updateActiveCompany("description", activeCompanyDraft.description)}
                    rows={4}
                  />
                </label>
                <label>
                  Country
                  <input
                    value={activeCompanyDraft.country}
                    onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, country: event.target.value })}
                    onBlur={() => updateActiveCompany("country", activeCompanyDraft.country)}
                  />
                </label>
                <label>
                  Websites
                  <textarea
                    value={activeCompanyDraft.websites}
                    onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, websites: event.target.value })}
                    onBlur={() => updateActiveCompany("websites", activeCompanyDraft.websites)}
                    rows={3}
                  />
                </label>
                <label>
                  Source
                  <input readOnly value={`${Math.round((activeCompany.mergeConfidence ?? 0) * 100)}% merge confidence`} />
                </label>
              </div>

              {activeCompanyEnrichmentDraft ? (
                <section className="detail-section enrichment-section">
                  <div className="section-heading">
                    <h2>LLM enrichment</h2>
                    <span>{activeCompany.enrichment?.status ?? "Pending"}</span>
                  </div>
                  {enrichmentMessage ? <div className="data-notice compact-notice"><Flag size={16} /><span>{enrichmentMessage}</span></div> : null}
                  <div className="enrichment-actions">
                    <button type="button" className="secondary-button" onClick={() => enrichActiveCompany(false)} disabled={isEnriching || !initialData.localEnrichmentEnabled || !isSignedIn}>
                      <FlaskConical size={15} /> {isEnriching ? "Enriching..." : "Enrich"}
                    </button>
                    <button type="button" className="secondary-button" onClick={() => enrichActiveCompany(true)} disabled={isEnriching || !initialData.localEnrichmentEnabled || !isSignedIn}>
                      Retry
                    </button>
                    <button type="button" className="text-button" onClick={saveActiveCompanyEnrichment}>
                      <Check size={14} /> Queue review
                    </button>
                  </div>
                  {!initialData.localEnrichmentEnabled || !isSignedIn ? (
                    <p className="muted helper-copy">Local Ollama enrichment is available only for signed-in local/admin sessions.</p>
                  ) : null}
                  <div className="detail-fields compact-fields">
                    <label>
                      Industry
                      <input value={activeCompanyEnrichmentDraft.industry} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, industry: event.target.value })} />
                    </label>
                    <label>
                      Subsector
                      <input value={activeCompanyEnrichmentDraft.subsector} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, subsector: event.target.value })} />
                    </label>
                    <label>
                      Company type
                      <input value={activeCompanyEnrichmentDraft.companyType} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, companyType: event.target.value })} />
                    </label>
                    <label>
                      Location
                      <input value={activeCompanyEnrichmentDraft.location} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, location: event.target.value })} />
                    </label>
                    <label className="wide-field">
                      Summary
                      <textarea value={activeCompanyEnrichmentDraft.summary} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, summary: event.target.value })} rows={3} />
                    </label>
                    <label className="wide-field">
                      Keywords
                      <input value={activeCompanyEnrichmentDraft.keywords} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, keywords: event.target.value })} placeholder="Biotech; diagnostics; therapeutics" />
                    </label>
                  </div>
                </section>
              ) : null}

              {activeCompanyInvestment && activeCompanyInvestmentDraft ? (
                <section className="detail-section investment-section">
                  <div className="section-heading">
                    <h2>Investment history</h2>
                    <span>{relationshipChipLabel(activeCompanyInvestment)}</span>
                  </div>
                  <div className="investment-grid">
                    <label className="select-filter">
                      <span>Status</span>
                      <select
                        value={activeCompanyInvestmentDraft.investmentStatus}
                        onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, investmentStatus: event.target.value as InvestmentStatus })}
                      >
                        {INVESTMENT_STATUSES.map((statusValue) => (
                          <option key={statusValue} value={statusValue}>
                            {INVESTMENT_STATUS_LABELS[statusValue]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <label className="select-filter">
                      <span>Capacity</span>
                      <select
                        value={activeCompanyInvestmentDraft.capacityStatus}
                        onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, capacityStatus: event.target.value as CapacityStatus })}
                      >
                        {CAPACITY_STATUSES.map((statusValue) => (
                          <option key={statusValue} value={statusValue}>
                            {CAPACITY_STATUS_LABELS[statusValue]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <label>
                      Last invested
                      <input type="date" value={activeCompanyInvestmentDraft.lastInvestedDate} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, lastInvestedDate: event.target.value })} />
                    </label>
                    <label className="wide-field">
                      Notes
                      <textarea value={activeCompanyInvestmentDraft.notes} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, notes: event.target.value })} rows={2} />
                    </label>
                  </div>
                  <div className="investment-deals">
                    {activeCompanyInvestment.deals.map((deal) => (
                      <div key={deal.id} className="deal-row">
                        <strong>{deal.name}</strong>
                        <span>{INVESTMENT_DEAL_STATUS_LABELS[deal.status]}{deal.investedAt ? ` • ${deal.investedAt}` : ""}</span>
                      </div>
                    ))}
                    {activeCompanyInvestment.deals.length === 0 ? <p className="empty-state compact">No deals linked yet.</p> : null}
                  </div>
                  <div className="investment-grid deal-editor-grid">
                    <label>
                      Deal name
                      <input value={activeCompanyInvestmentDraft.dealName} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealName: event.target.value })} placeholder="Deal name" />
                    </label>
                    <label className="select-filter">
                      <span>Deal status</span>
                      <select value={activeCompanyInvestmentDraft.dealStatus} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealStatus: event.target.value as InvestmentDealStatus })}>
                        {INVESTMENT_DEAL_STATUSES.map((statusValue) => (
                          <option key={statusValue} value={statusValue}>
                            {INVESTMENT_DEAL_STATUS_LABELS[statusValue]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <label>
                      Deal date
                      <input type="date" value={activeCompanyInvestmentDraft.dealDate} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealDate: event.target.value })} />
                    </label>
                    <label>
                      Role
                      <input value={activeCompanyInvestmentDraft.dealRole} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealRole: event.target.value })} />
                    </label>
                  </div>
                  <div className="investment-actions">
                    <button type="button" className="text-button" onClick={() => saveInvestmentRelationship(activeCompanyInvestment, activeCompanyInvestmentDraft, "Company investment update")}>
                      <Check size={14} /> Queue status
                    </button>
                    <button type="button" className="text-button" onClick={() => addInvestmentDealLocally(activeCompanyInvestment, activeCompanyInvestmentDraft, "Company investment deal")} disabled={!activeCompanyInvestmentDraft.dealName.trim()}>
                      <Plus size={14} /> Queue deal
                    </button>
                  </div>
                </section>
              ) : null}

              <section className="detail-section" id="people">
                <div className="section-heading">
                  <h2>People</h2>
                  <span>{activeCompany.people.filter((person) => person.highlighted).length} highlighted</span>
                </div>
              <div className="people-list">
                  {activeCompany.people.map((person) => (
                    <article key={person.id} className="person-row">
                      <button
                        type="button"
                        className={clsx("icon-button", person.highlighted && "active")}
                        onClick={() => toggleHighlight(activeCompany.id, person)}
                        title={person.highlighted ? "Remove highlight" : "Highlight person"}
                      >
                        <Star size={16} fill={person.highlighted ? "currentColor" : "none"} />
                      </button>
                      <div>
                        <strong>{person.displayName}</strong>
                        <span>{person.jobTitle ?? person.email ?? "No title"}</span>
                        {person.emails.length > 1 ? <span>{person.emails.length} emails</span> : null}
                        {person.categories.length > 0 ? (
                          <div className="contact-chip-list">
                            {person.categories.slice(0, 3).map((category) => (
                              <span key={category} className="contact-chip">
                                {category}
                              </span>
                            ))}
                            {person.categories.length > 3 ? <span className="email-more">+{person.categories.length - 3}</span> : null}
                          </div>
                        ) : null}
                        {person.investmentRelationships.length > 0 ? (
                          <div className="investment-chip-list">
                            {person.investmentRelationships.slice(0, 2).map((relationship) => (
                              <span key={relationship.id} className={clsx("investment-chip", relationship.capacityStatus === "fully_allocated" && "allocated")}>
                                {relationshipChipLabel(relationship)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="person-actions">
                        <button type="button" className="icon-button" onClick={() => startPersonEdit(person)} title="Edit contact">
                          <Pencil size={16} />
                        </button>
                        <a className="icon-link" href={person.email ? `mailto:${person.email}` : "#"} title="Email contact">
                          <Mail size={16} />
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="detail-section">
                <div className="section-heading">
                  <h2>Tags</h2>
                  <span>{activeCompany.tags.length}</span>
                </div>
                <div className="tag-list large">
                  {activeCompany.tags.map((item) => (
                    <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
                      {item.name}
                    </span>
                  ))}
                </div>
              </section>

              <section className="detail-section">
                <div className="section-heading">
                  <h2>Activity</h2>
                  <span>Manual tracking</span>
                </div>
                <div className="note-composer">
                  <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add note, call, email, or meeting summary" />
                  <button type="button" onClick={addManualNote}>
                    <Check size={15} /> Add
                  </button>
                </div>
                <div className="activity-list">
                  {activeCompany.activities.map((item) => (
                    <div key={item.id} className="activity-item">
                      <Activity size={15} />
                      <div>
                        <strong>{item.summary}</strong>
                        <span>{formatDate(item.occurredAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
            </div>
          ) : null}
          </section>
        ) : null}

        {activeView === "people" ? (
          <section className="view-surface">
            <div className="surface-header">
              <div>
                <p className="eyebrow">People</p>
                <h2>{formatNumber(filteredPeopleDirectory.length)} of {formatNumber(peopleDirectory.length)} contacts</h2>
              </div>
              <div className="surface-actions">
                <label className="secondary-button file-button">
                  <Upload size={15} /> Tag incorrect emails
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      handleIncorrectEmailCsvUpload(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <button type="button" className="secondary-button" onClick={() => exportPeople(filteredPeopleDirectory)}>
                  <Download size={15} /> Export people
                </button>
                <button
                  type="button"
                  className={clsx("secondary-button", isSplittingNames && "running")}
                  onClick={isSplittingNames ? () => { stopBatchRef.current = true; } : splitPeopleNames}
                  disabled={isSplittingNames || !initialData.localEnrichmentEnabled || !isSignedIn}
                >
                  <UserRound size={15} /> {isSplittingNames ? "Stopping..." : "Split names"}
                </button>
              </div>
            </div>
            {isDemoData ? (
              <div className="data-notice">
                <Flag size={16} />
                <span>{initialData.dataWarning ?? "Demo contacts are loaded."}</span>
              </div>
            ) : null}
            {incorrectEmailMessage ? <div className="data-notice"><Flag size={16} /><span>{incorrectEmailMessage}</span></div> : null}
            {isSplittingNames && splitNamesProgress ? (
              <div className="batch-progress-panel" aria-live="polite">
                <div>
                  <strong>Splitting names</strong>
                  <span>
                    {formatNumber(splitNamesProgress.completed)} done
                    {splitNamesProgress.failed ? `, ${formatNumber(splitNamesProgress.failed)} failed` : ""}
                    {" "}of {formatNumber(splitNamesProgress.total)}
                  </span>
                </div>
                <progress value={splitNamesProgress.completed + splitNamesProgress.failed} max={splitNamesProgress.total} />
              </div>
            ) : null}
            {namesMessage && !isSplittingNames ? <div className="data-notice"><Flag size={16} /><span>{namesMessage}</span></div> : null}
            <div className="people-filterbar">
              <label className="search-box">
                <Search size={16} />
                <input
                  value={peopleQuery}
                  onChange={(event) => {
                    setPeoplePage(1);
                    setPeopleQuery(event.target.value);
                  }}
                  placeholder="Search people, emails, titles, companies"
                />
              </label>
              <FilterSelect
                value={peopleCompany}
                onChange={(value) => {
                  setPeoplePage(1);
                  setPeopleCompany(value);
                }}
                label="Company"
                options={peopleCompanyNames}
              />
              <FilterSelect
                value={peopleDomain}
                onChange={(value) => {
                  setPeoplePage(1);
                  setPeopleDomain(value);
                }}
                label="Email domain"
                options={peopleEmailDomains}
              />
              <FilterSelect
                value={peopleStage}
                onChange={(value) => {
                  setPeoplePage(1);
                  setPeopleStage(value);
                }}
                label="Stage"
                options={OUTREACH_STAGES}
              />
              <FilterSelect
                value={peopleHighlight}
                onChange={(value) => {
                  setPeoplePage(1);
                  setPeopleHighlight(value);
                }}
                label="Highlight"
                options={["Highlighted", "Not highlighted"]}
              />
            </div>
            {personMergeTarget ? (
              <div className="people-merge-panel">
                <div className="people-merge-header">
                  <div>
                    <strong>Keep {personMergeTarget.person.displayName}</strong>
                    <span>Search for the duplicate person whose emails and history should move onto this record.</span>
                  </div>
                  <button type="button" className="secondary-button" onClick={closeManualMerge}>
                    Cancel
                  </button>
                </div>
                <label className="search-box">
                  <Search size={16} />
                  <input value={personMergeQuery} onChange={(event) => setPersonMergeQuery(event.target.value)} placeholder="Search duplicate by name, email, company, or LinkedIn" />
                </label>
                <div className="people-merge-list">
                  {personMergeCandidates.map(({ person, companies }) => (
                    <article key={person.id} className="merge-candidate-row">
                      <div>
                        <strong>{person.displayName}</strong>
                        <span>{companies.map((company) => company.name).join(", ")} • {person.jobTitle ?? person.email ?? "No title"}</span>
                      </div>
                      <div className="email-chip-list">
                        {person.emails.slice(0, 2).map((email) => (
                          <span key={email} className="email-chip" title={email}>
                            {email}
                          </span>
                        ))}
                        {person.emails.length > 2 ? <span className="email-more">+{person.emails.length - 2}</span> : null}
                      </div>
                      <button type="button" className="text-button" onClick={() => handleManualMerge(person.id)}>
                        Merge into keeper
                      </button>
                    </article>
                  ))}
                  {personMergeCandidates.length === 0 ? <p className="empty-state">No matching duplicate people found.</p> : null}
                </div>
              </div>
            ) : null}
            {peopleMessage ? <div className="data-notice"><Flag size={16} /><span>{peopleMessage}</span></div> : null}
            <div className="people-countbar">
              <span>
                Showing {formatNumber(peopleStart)}-{formatNumber(peopleEnd)} of {formatNumber(filteredPeopleDirectory.length)}
              </span>
              <div className="people-pager">
                <label className="select-filter">
                  <span>Show</span>
                  <select
                    value={String(peoplePageSize)}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setPeoplePage(1);
                      setPeoplePageSize(nextValue === "all" ? "all" : (Number(nextValue) as PeoplePageSize));
                    }}
                  >
                    {PEOPLE_PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={String(option)} value={String(option)}>
                        {option === "all" ? "All" : option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <button type="button" className="pager-button" disabled={effectivePeoplePage <= 1 || peoplePageSize === "all"} onClick={() => setPeoplePage((current) => Math.max(1, current - 1))}>
                  Previous
                </button>
                <span>
                  Page {formatNumber(effectivePeoplePage)} / {formatNumber(peopleTotalPages)}
                </span>
                <button
                  type="button"
                  className="pager-button"
                  disabled={effectivePeoplePage >= peopleTotalPages || peoplePageSize === "all"}
                  onClick={() => setPeoplePage((current) => Math.min(peopleTotalPages, current + 1))}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="people-directory">
              {visiblePeopleDirectory.map(({ person, company, companies }) => (
                <article key={person.id} className="directory-row">
                  <button
                    type="button"
                    className={clsx("icon-button", person.highlighted && "active")}
                    onClick={() => {
                      setActiveCompanyId(company.id);
                      toggleHighlight(company.id, person);
                    }}
                    title={person.highlighted ? "Remove highlight" : "Highlight person"}
                  >
                    <Star size={16} fill={person.highlighted ? "currentColor" : "none"} />
                  </button>
                  <div>
                    <strong>{person.displayName}</strong>
                    <span>{person.jobTitle ?? person.email ?? "No title"}</span>
                    {person.categories.length > 0 ? (
                      <div className="contact-chip-list">
                        {person.categories.slice(0, 3).map((category) => (
                          <span key={category} className="contact-chip">
                            {category}
                          </span>
                        ))}
                        {person.categories.length > 3 ? <span className="email-more">+{person.categories.length - 3}</span> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="email-chip-list">
                    {person.emails.length ? (
                      person.emails.slice(0, 3).map((email) => (
                        <a key={email} className={clsx("email-chip", incorrectEmails.has(email.toLowerCase()) && "incorrect")} href={`mailto:${email}`} title={email}>
                          {email}
                        </a>
                      ))
                    ) : (
                      <span className="muted-cell">No email</span>
                    )}
                    {person.emails.length > 3 ? <span className="email-more">+{person.emails.length - 3}</span> : null}
                  </div>
                  <div className="directory-actions">
                    <button type="button" className="text-button" onClick={() => startPersonEdit(person)}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button type="button" className="text-button" onClick={() => openCompany(company.id)}>
                      {companies.length === 1 ? company.name : `${company.name} +${companies.length - 1}`}
                    </button>
                    <button type="button" className="text-button" onClick={() => startManualMerge(person.id, person.displayName)}>
                      Link emails
                    </button>
                  </div>
                  <span className="stage-badge">{company.outreachStage}</span>
                </article>
              ))}
              {filteredPeopleDirectory.length === 0 ? <p className="empty-state">No people match these filters.</p> : null}
            </div>
          </section>
        ) : null}

        {activeView === "tags" ? (
          <section className="view-surface">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Tags</p>
                <h2>{formatNumber(tagSummaries.length)} tags in use</h2>
              </div>
              <span>{formatChangeCount(pendingChanges.length)}</span>
            </div>
            <div className="tag-manager">
              {tagSummaries.map((summary) => (
                <article key={summary.key} className="tag-manager-row">
                  <div>
                    <span className={clsx("tag-type", summary.type)}>{summary.type === "company" ? "Company" : "Contact"}</span>
                    <strong>{summary.name}</strong>
                    <span>{formatNumber(summary.count)} {summary.type === "company" ? "companies" : "contacts"}</span>
                  </div>
                  <label className="tag-rename-field">
                    <Tags size={15} />
                    <input
                      value={tagDrafts[summary.key] ?? summary.name}
                      onChange={(event) => setTagDrafts((current) => ({ ...current, [summary.key]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          renameTag(summary);
                        }
                      }}
                    />
                  </label>
                  <button type="button" className="text-button" onClick={() => renameTag(summary)}>
                    <Check size={14} /> Rename
                  </button>
                </article>
              ))}
              {tagSummaries.length === 0 ? <p className="empty-state">No tags are in use yet.</p> : null}
            </div>
          </section>
        ) : null}

        {activeView === "pipeline" ? (
          <section className="view-surface">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Pipeline</p>
                <h2>Deal outreach pipeline</h2>
                <span>{formatNumber(dealPipelineRows.length)} company-deal work items</span>
              </div>
              <button type="button" className="secondary-button" onClick={() => exportDealPipeline(dealPipelineRows)}>
                <Download size={15} /> Export pipeline
              </button>
            </div>
            <div className="pipeline-board">
              {dealPipelineGroups.map((group) => (
                <section key={group.status} className="pipeline-column">
                  <div className="pipeline-column-header">
                    <strong>{INVESTMENT_DEAL_STATUS_LABELS[group.status]}</strong>
                    <span>{group.total}</span>
                  </div>
                  {group.rows.map((row) => {
                    const draft = pipelineDrafts[row.key] ?? { status: row.status, note: "" };
                    const canQueue = draft.status !== row.status || draft.note.trim().length > 0;
                    const canPersist = isUuid(row.companyId) && isUuid(row.dealId);
                    const detailNotes = [...row.dealNotes, ...row.relationshipNotes];

                    return (
                      <article key={row.key} className="pipeline-card">
                        <div className="pipeline-card-header">
                          <div>
                            <strong>{row.dealName}</strong>
                            <button type="button" className="text-button compact" onClick={() => openCompany(row.companyId)}>
                              {row.companyName}
                            </button>
                          </div>
                          <span className={clsx("deal-status-pill", row.status)}>{INVESTMENT_DEAL_STATUS_LABELS[row.status]}</span>
                        </div>
                        <div className="pipeline-card-meta">
                          <span>
                            <UsersRound size={13} /> {row.contacts.length > 0 ? row.contacts.join(", ") : "No linked contact"}
                          </span>
                          <span>
                            <Flag size={13} /> {row.outreachStage}
                          </span>
                          <span>
                            <Activity size={13} /> {row.investedAt ? formatDate(row.investedAt) : "No deal date"}
                          </span>
                        </div>
                        {row.roles.length > 0 ? <p className="pipeline-card-note">Role: {row.roles.join("; ")}</p> : null}
                        {detailNotes.length > 0 ? <p className="pipeline-card-note">{detailNotes.join(" ")}</p> : null}
                        <div className="pipeline-status-controls">
                          <label>
                            <span>Status</span>
                            <select
                              value={draft.status}
                              onChange={(event) => updatePipelineDraft(row, { status: event.target.value as InvestmentDealStatus })}
                            >
                              {INVESTMENT_DEAL_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {INVESTMENT_DEAL_STATUS_LABELS[status]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>Update note</span>
                            <input
                              value={draft.note}
                              onChange={(event) => updatePipelineDraft(row, { note: event.target.value })}
                              placeholder="Optional note"
                            />
                          </label>
                          <button
                            type="button"
                            className="primary-button compact"
                            disabled={!canQueue || !canPersist}
                            title={canPersist ? "Queue status update" : "Push this deal before changing status"}
                            onClick={() => queueDealStatusUpdate(row)}
                          >
                            <Check size={14} /> Queue
                          </button>
                        </div>
                        {!canPersist ? <span className="pipeline-card-warning">Push this new deal before queueing status updates.</span> : null}
                      </article>
                    );
                  })}
                  {group.rows.length === 0 ? (
                    <div className="pipeline-empty">
                      <span>No deal outreach here yet.</span>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
            {dealPipelineRows.length === 0 ? (
              <p className="empty-state">No investment deals are linked to companies or company contacts yet.</p>
            ) : null}
          </section>
        ) : null}

        {activeView === "clients" ? (
          <section className="view-surface fundraising-view">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Fundraising clients</p>
                <h2>Signed mandates and investor outreach</h2>
                <span>
                  {formatNumber(fundraisingStats.activeClients)} active mandates, {formatNumber(fundraisingStats.targets)} investor targets
                </span>
              </div>
              <div className="surface-actions">
                <button type="button" className="secondary-button" onClick={() => setFundraisingClientDraft(defaultFundraisingClientDraft())}>
                  <Plus size={15} /> New client
                </button>
                <button type="button" className="secondary-button" onClick={() => setFundraisingTargetDraft(defaultFundraisingTargetDraft(fundraisingClients[0]?.id ?? ""))} disabled={fundraisingClients.length === 0}>
                  <Plus size={15} /> New target
                </button>
              </div>
            </div>

            <div className="fundraising-kpi-grid">
              <Metric label="Signed clients" value={formatNumber(fundraisingStats.signedClients)} />
              <Metric label="Active mandates" value={formatNumber(fundraisingStats.activeClients)} />
              <Metric label="Investor targets" value={formatNumber(fundraisingStats.targets)} />
              <Metric label="Contacted" value={formatNumber(fundraisingStats.contactedTargets)} />
              <Metric label="Replies" value={formatNumber(fundraisingStats.repliedTargets)} />
              <Metric label="Meetings" value={formatNumber(fundraisingStats.meetings)} />
            </div>

            <div className="accounting-summary-grid fundraising-summary-grid">
              {fundraisingData.summaries.map((summary) => (
                <article key={summary.currency} className="accounting-summary-card">
                  <div>
                    <span>{summary.currency}</span>
                    <strong>{formatMinorMoney(summary.targetRaiseMinor || summary.ticketSizeMaxMinor || summary.netCashMinor, summary.currency)}</strong>
                  </div>
                  <dl>
                    <div>
                      <dt>Target raise</dt>
                      <dd>{formatMinorMoney(summary.targetRaiseMinor, summary.currency)}</dd>
                    </div>
                    <div>
                      <dt>Target tickets</dt>
                      <dd>{formatMinorMoney(summary.ticketSizeMinMinor, summary.currency)} - {formatMinorMoney(summary.ticketSizeMaxMinor, summary.currency)}</dd>
                    </div>
                    {initialData.accountingAccess.canView ? (
                      <>
                        <div>
                          <dt>Retainers</dt>
                          <dd>{formatMinorMoney(summary.retainerIncomeMinor, summary.currency)}</dd>
                        </div>
                        <div>
                          <dt>Outstanding</dt>
                          <dd>{formatMinorMoney(summary.outstandingMinor, summary.currency)}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                </article>
              ))}
              {fundraisingData.summaries.length === 0 ? (
                <article className="accounting-summary-card empty">
                  <strong>No mandate totals yet.</strong>
                  <span>Add client target raises or investor ticket sizes to populate currency summaries.</span>
                </article>
              ) : null}
              {!initialData.accountingAccess.canView ? (
                <article className="accounting-summary-card empty locked-inline-card">
                  <strong>Finance figures restricted.</strong>
                  <span>Client workflow is visible; retainers, commissions, expenses, and ledger totals require accounting access.</span>
                </article>
              ) : null}
            </div>

            <div className="accounting-toolbar fundraising-toolbar">
              <div className="accounting-tabs" role="tablist" aria-label="Fundraising client sections">
                <button type="button" className={clsx(fundraisingTab === "clients" && "active")} onClick={() => setFundraisingTab("clients")}>
                  Clients
                </button>
                <button type="button" className={clsx(fundraisingTab === "targets" && "active")} onClick={() => setFundraisingTab("targets")}>
                  Investor targets
                </button>
                <button type="button" className={clsx(fundraisingTab === "finance" && "active")} onClick={() => setFundraisingTab("finance")}>
                  Finance
                </button>
              </div>
              <label className="search-box accounting-search">
                <Search size={16} />
                <input value={fundraisingQuery} onChange={(event) => setFundraisingQuery(event.target.value)} placeholder="Search clients, investors, next steps" />
              </label>
            </div>

            <div className="accounting-filters">
              <FilterSelect value={fundraisingClientStageFilter} onChange={setFundraisingClientStageFilter} label="Client stage" options={FUNDRAISING_CLIENT_STAGES.map((stage) => FUNDRAISING_CLIENT_STAGE_LABELS[stage])} optionValues={[...FUNDRAISING_CLIENT_STAGES]} />
              <FilterSelect value={fundraisingTargetStageFilter} onChange={setFundraisingTargetStageFilter} label="Target stage" options={FUNDRAISING_TARGET_STAGES.map((stage) => FUNDRAISING_TARGET_STAGE_LABELS[stage])} optionValues={[...FUNDRAISING_TARGET_STAGES]} />
              <FilterSelect value={fundraisingCompanyFilter} onChange={setFundraisingCompanyFilter} label="Client company" options={fundraisingClientCompanies.map((company) => company.name)} optionValues={fundraisingClientCompanies.map((company) => company.id)} />
              <FilterSelect value={fundraisingCurrencyFilter} onChange={setFundraisingCurrencyFilter} label="Currency" options={fundraisingCurrencies} />
              <FilterSelect value={fundraisingInvestorTypeFilter} onChange={setFundraisingInvestorTypeFilter} label="Investor type" options={fundraisingInvestorTypes} />
            </div>

            {fundraisingMessage ? (
              <div className="data-notice">
                <Flag size={16} />
                <span>{fundraisingMessage}</span>
              </div>
            ) : null}

            {fundraisingTab === "clients" ? (
              <div className="fundraising-grid">
                <form
                  className="accounting-form fundraising-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveFundraisingClient();
                  }}
                >
                  <div className="accounting-form-header">
                    <h2>{fundraisingClientDraft.clientId ? "Edit client" : "New client"}</h2>
                    {fundraisingClientDraft.clientId ? (
                      <button type="button" className="text-button compact" onClick={() => setFundraisingClientDraft(defaultFundraisingClientDraft())}>
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <label>
                    <span>Client company</span>
                    <select
                      value={fundraisingClientDraft.companyId}
                      onChange={(event) => {
                        const company = companies.find((item) => item.id === event.target.value);
                        setFundraisingClientDraft((current) => ({
                          ...current,
                          companyId: event.target.value,
                          mandateName: current.mandateName || (company ? `${company.name} fundraising mandate` : current.mandateName),
                        }));
                      }}
                    >
                      <option value="">Create new company</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!fundraisingClientDraft.companyId ? (
                    <>
                      <label>
                        <span>New client company</span>
                        <input value={fundraisingClientDraft.newCompanyName} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, newCompanyName: event.target.value }))} />
                      </label>
                      <label>
                        <span>Company domains</span>
                        <input value={fundraisingClientDraft.newCompanyWebsites} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, newCompanyWebsites: event.target.value }))} placeholder="example.com" />
                      </label>
                      <label>
                        <span>Company country</span>
                        <input value={fundraisingClientDraft.newCompanyCountry} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, newCompanyCountry: event.target.value }))} />
                      </label>
                    </>
                  ) : null}
                  <label>
                    <span>Mandate name</span>
                    <input value={fundraisingClientDraft.mandateName} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, mandateName: event.target.value }))} required />
                  </label>
                  <label>
                    <span>Stage</span>
                    <select value={fundraisingClientDraft.stage} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, stage: event.target.value as FundraisingClientStage }))}>
                      {FUNDRAISING_CLIENT_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {FUNDRAISING_CLIENT_STAGE_LABELS[stage]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="accounting-form-row">
                    <label>
                      <span>Target raise</span>
                      <input inputMode="decimal" value={fundraisingClientDraft.targetRaiseAmount} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, targetRaiseAmount: event.target.value }))} placeholder="0.00" />
                    </label>
                    <label>
                      <span>Currency</span>
                      <input value={fundraisingClientDraft.targetRaiseCurrency} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, targetRaiseCurrency: event.target.value.toUpperCase() }))} maxLength={3} />
                    </label>
                  </div>
                  <div className="accounting-form-row">
                    <label>
                      <span>Signed on</span>
                      <input type="date" value={fundraisingClientDraft.signedOn} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, signedOn: event.target.value }))} />
                    </label>
                    <label>
                      <span>Primary contact</span>
                      <select value={fundraisingClientDraft.primaryContactPersonId} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, primaryContactPersonId: event.target.value }))}>
                        <option value="">None</option>
                        {peopleDirectory.map(({ person, companies }) => (
                          <option key={person.id} value={person.id}>
                            {person.displayName} - {companies.map((company) => company.name).join(", ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>New primary contact</span>
                    <input value={fundraisingClientDraft.newPrimaryContactName} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, newPrimaryContactName: event.target.value }))} placeholder="Optional contact name" />
                  </label>
                  <div className="accounting-form-row">
                    <label>
                      <span>Contact email</span>
                      <input value={fundraisingClientDraft.newPrimaryContactEmail} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, newPrimaryContactEmail: event.target.value }))} />
                    </label>
                    <label>
                      <span>Contact title</span>
                      <input value={fundraisingClientDraft.newPrimaryContactJobTitle} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, newPrimaryContactJobTitle: event.target.value }))} />
                    </label>
                  </div>
                  <div className="accounting-form-row">
                    <label>
                      <span>Materials URL</span>
                      <input value={fundraisingClientDraft.materialsUrl} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, materialsUrl: event.target.value }))} />
                    </label>
                    <label>
                      <span>Data room URL</span>
                      <input value={fundraisingClientDraft.dataRoomUrl} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, dataRoomUrl: event.target.value }))} />
                    </label>
                  </div>
                  <label>
                    <span>Notes</span>
                    <textarea value={fundraisingClientDraft.notes} onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                  </label>
                  <button type="submit" className="primary-button" disabled={isSavingFundraising}>
                    <Check size={15} /> {isSavingFundraising ? "Saving..." : "Save client"}
                  </button>
                </form>

                <div className="fundraising-client-list">
                  {filteredFundraisingClients.map((client) => {
                    const companyName = companyNameById.get(client.companyId) ?? "Unknown company";
                    const targets = fundraisingTargetsByClient.get(client.id) ?? [];
                    const primaryContact = peopleDirectory.find(({ person }) => person.id === client.primaryContactPersonId)?.person ?? null;
                    return (
                      <article key={client.id} className="fundraising-client-card">
                        <div className="fundraising-card-header">
                          <div>
                            <strong>{client.mandateName}</strong>
                            <button type="button" className="text-button compact" onClick={() => openCompany(client.companyId)}>
                              {companyName}
                            </button>
                          </div>
                          <span className={clsx("fundraising-stage-pill", client.stage)}>{FUNDRAISING_CLIENT_STAGE_LABELS[client.stage]}</span>
                        </div>
                        <div className="fundraising-card-meta">
                          <span><UsersRound size={13} /> {formatNumber(targets.length)} targets</span>
                          <span><Activity size={13} /> {client.signedOn ? formatDate(client.signedOn) : "No signed date"}</span>
                          <span><UserRound size={13} /> {primaryContact?.displayName ?? "No primary contact"}</span>
                          <span><Flag size={13} /> {client.targetRaiseAmountMinor && client.targetRaiseCurrency ? formatMinorMoney(client.targetRaiseAmountMinor, client.targetRaiseCurrency) : "No target raise"}</span>
                        </div>
                        {client.notes ? <p className="pipeline-card-note">{client.notes}</p> : null}
                        <div className="fundraising-row-actions">
                          <button type="button" className="text-button compact" onClick={() => editFundraisingClient(client)}>
                            <Pencil size={13} /> Edit
                          </button>
                          <button type="button" className="text-button compact" onClick={() => startFundraisingTarget(client.id)}>
                            <Plus size={13} /> Add target
                          </button>
                          <button type="button" className="text-button compact" onClick={() => openAccountingForFundraisingCompany(client.companyId)} disabled={!initialData.accountingAccess.canView}>
                            <CreditCard size={13} /> Accounting
                          </button>
                          <button type="button" className="text-button compact danger" onClick={() => deleteFundraisingClient(client)} disabled={isSavingFundraising}>
                            Delete
                          </button>
                        </div>
                      </article>
                    );
                  })}
                  {filteredFundraisingClients.length === 0 ? <p className="empty-state">No fundraising clients match these filters.</p> : null}
                </div>
              </div>
            ) : null}

            {fundraisingTab === "targets" ? (
              <div className="fundraising-grid">
                <form
                  className="accounting-form fundraising-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveFundraisingTarget();
                  }}
                >
                  <div className="accounting-form-header">
                    <h2>{fundraisingTargetDraft.targetId ? "Edit target" : "New investor target"}</h2>
                    {fundraisingTargetDraft.targetId ? (
                      <button type="button" className="text-button compact" onClick={() => setFundraisingTargetDraft(defaultFundraisingTargetDraft(fundraisingClients[0]?.id ?? ""))}>
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <label>
                    <span>Fundraising client</span>
                    <select value={fundraisingTargetDraft.clientId} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, clientId: event.target.value }))} required>
                      <option value="">Choose client</option>
                      {fundraisingClients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.mandateName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Investor company</span>
                    <select
                      value={fundraisingTargetDraft.investorCompanyId}
                      onChange={(event) => {
                        const company = companies.find((item) => item.id === event.target.value);
                        setFundraisingTargetDraft((current) => ({
                          ...current,
                          investorCompanyId: event.target.value,
                          investorName: current.investorName || company?.name || current.investorName,
                        }));
                      }}
                    >
                      <option value="">Create new or snapshot only</option>
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!fundraisingTargetDraft.investorCompanyId ? (
                    <>
                      <label>
                        <span>New investor company</span>
                        <input value={fundraisingTargetDraft.newInvestorCompanyName} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, newInvestorCompanyName: event.target.value, investorName: current.investorName || event.target.value }))} />
                      </label>
                      <div className="accounting-form-row">
                        <label>
                          <span>Investor domains</span>
                          <input value={fundraisingTargetDraft.newInvestorCompanyWebsites} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, newInvestorCompanyWebsites: event.target.value }))} />
                        </label>
                        <label>
                          <span>Investor country</span>
                          <input value={fundraisingTargetDraft.newInvestorCompanyCountry} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, newInvestorCompanyCountry: event.target.value }))} />
                        </label>
                      </div>
                    </>
                  ) : null}
                  <label>
                    <span>Investor name</span>
                    <input value={fundraisingTargetDraft.investorName} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, investorName: event.target.value }))} required />
                  </label>
                  <div className="accounting-form-row">
                    <label>
                      <span>Investor type</span>
                      <input value={fundraisingTargetDraft.investorType} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, investorType: event.target.value }))} placeholder="VC, family office, PE..." />
                    </label>
                    <label>
                      <span>Stage</span>
                      <select value={fundraisingTargetDraft.stage} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, stage: event.target.value as FundraisingTargetStage }))}>
                        {FUNDRAISING_TARGET_STAGES.map((stage) => (
                          <option key={stage} value={stage}>
                            {FUNDRAISING_TARGET_STAGE_LABELS[stage]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>Investor contact</span>
                    <select value={fundraisingTargetDraft.investorPersonId} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, investorPersonId: event.target.value }))}>
                      <option value="">None</option>
                      {peopleDirectory.map(({ person, companies }) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName} - {companies.map((company) => company.name).join(", ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>New investor contact</span>
                    <input value={fundraisingTargetDraft.newInvestorPersonName} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, newInvestorPersonName: event.target.value }))} />
                  </label>
                  <div className="accounting-form-row">
                    <label>
                      <span>Contact email</span>
                      <input value={fundraisingTargetDraft.newInvestorPersonEmail} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, newInvestorPersonEmail: event.target.value, investorEmail: current.investorEmail || event.target.value }))} />
                    </label>
                    <label>
                      <span>Contact title</span>
                      <input value={fundraisingTargetDraft.newInvestorPersonJobTitle} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, newInvestorPersonJobTitle: event.target.value }))} />
                    </label>
                  </div>
                  <div className="accounting-form-row">
                    <label>
                      <span>Min ticket</span>
                      <input inputMode="decimal" value={fundraisingTargetDraft.ticketSizeMin} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, ticketSizeMin: event.target.value }))} placeholder="0.00" />
                    </label>
                    <label>
                      <span>Max ticket</span>
                      <input inputMode="decimal" value={fundraisingTargetDraft.ticketSizeMax} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, ticketSizeMax: event.target.value }))} placeholder="0.00" />
                    </label>
                  </div>
                  <div className="accounting-form-row">
                    <label>
                      <span>Currency</span>
                      <input value={fundraisingTargetDraft.ticketSizeCurrency} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, ticketSizeCurrency: event.target.value.toUpperCase() }))} maxLength={3} />
                    </label>
                    <label>
                      <span>Last contacted</span>
                      <input type="date" value={fundraisingTargetDraft.lastContactedAt} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, lastContactedAt: event.target.value }))} />
                    </label>
                  </div>
                  <label>
                    <span>Next step</span>
                    <input value={fundraisingTargetDraft.nextStep} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, nextStep: event.target.value }))} />
                  </label>
                  <label>
                    <span>Notes</span>
                    <textarea value={fundraisingTargetDraft.notes} onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                  </label>
                  <button type="submit" className="primary-button" disabled={isSavingFundraising || fundraisingClients.length === 0}>
                    <Check size={15} /> {isSavingFundraising ? "Saving..." : "Save target"}
                  </button>
                </form>

                <div className="accounting-table-wrap fundraising-targets-table">
                  <table className="accounting-table">
                    <thead>
                      <tr>
                        <th>Investor</th>
                        <th>Client</th>
                        <th>Stage</th>
                        <th>Ticket</th>
                        <th>Next step</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFundraisingTargets.map((target) => {
                        const client = fundraisingClientById.get(target.clientId);
                        return (
                          <tr key={target.id}>
                            <td>
                              <strong>{target.investorName}</strong>
                              <span>{target.investorType ?? target.investorEmail ?? "Investor target"}</span>
                            </td>
                            <td>{client?.mandateName ?? "Unknown client"}</td>
                            <td>
                              <span className={clsx("fundraising-stage-pill", target.stage)}>{FUNDRAISING_TARGET_STAGE_LABELS[target.stage]}</span>
                            </td>
                            <td>
                              {target.ticketSizeCurrency && (target.ticketSizeMinMinor || target.ticketSizeMaxMinor)
                                ? `${target.ticketSizeMinMinor ? formatMinorMoney(target.ticketSizeMinMinor, target.ticketSizeCurrency) : "?"} - ${target.ticketSizeMaxMinor ? formatMinorMoney(target.ticketSizeMaxMinor, target.ticketSizeCurrency) : "?"}`
                                : "No ticket"}
                            </td>
                            <td>{target.nextStep ?? "No next step"}</td>
                            <td>
                              <div className="accounting-row-actions">
                                <button type="button" className="text-button compact" onClick={() => editFundraisingTarget(target)}>
                                  <Pencil size={13} /> Edit
                                </button>
                                {target.investorCompanyId ? (
                                  <button type="button" className="text-button compact" onClick={() => openCompany(target.investorCompanyId!)}>
                                    Open CRM
                                  </button>
                                ) : null}
                                <button type="button" className="text-button compact danger" onClick={() => deleteFundraisingTarget(target)} disabled={isSavingFundraising}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredFundraisingTargets.length === 0 ? <p className="empty-state">No investor targets match these filters.</p> : null}
                </div>
              </div>
            ) : null}

            {fundraisingTab === "finance" ? (
              !initialData.accountingAccess.canView ? (
                <div className="locked-panel">
                  <CreditCard size={24} />
                  <div>
                    <strong>Finance details are restricted.</strong>
                    <span>Your account can use the client dashboard, but retainers, commissions, expenses, and ledger movements require accounting access.</span>
                  </div>
                </div>
              ) : (
                <div className="accounting-table-wrap fundraising-finance-table">
                  <table className="accounting-table">
                    <thead>
                      <tr>
                        <th>Client</th>
                        <th>Documents</th>
                        <th>Ledger</th>
                        <th>Open items</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFundraisingClients.map((client) => {
                        const documents = accountingData.documents.filter((document) => document.companyId === client.companyId);
                        const ledgerEntries = accountingData.ledgerEntries.filter((entry) => entry.companyId === client.companyId);
                        const openDocuments = documents.filter((document) => document.status !== "paid" && document.status !== "void" && !document.voidedAt);
                        return (
                          <tr key={client.id}>
                            <td>
                              <strong>{client.mandateName}</strong>
                              <span>{companyNameById.get(client.companyId) ?? "Unknown company"}</span>
                            </td>
                            <td>{formatNumber(documents.length)}</td>
                            <td>{formatNumber(ledgerEntries.length)}</td>
                            <td>{formatNumber(openDocuments.length)}</td>
                            <td>
                              <button type="button" className="text-button compact" onClick={() => openAccountingForFundraisingCompany(client.companyId)}>
                                Open accounting
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredFundraisingClients.length === 0 ? <p className="empty-state">No client finance rows match these filters.</p> : null}
                </div>
              )
            ) : null}
          </section>
        ) : null}

        {activeView === "accounting" ? (
          <section className="view-surface accounting-view">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Accounting</p>
                <h2>{initialData.accountingAccess.canView ? "Retainers, commissions, expenses, and cash" : "Restricted finance area"}</h2>
                <span>
                  {initialData.accountingAccess.canView
                    ? `${formatNumber(accountingData.documents.length)} documents, ${formatNumber(accountingData.ledgerEntries.length)} ledger entries`
                    : "Finance allowlist access required"}
                </span>
              </div>
              {initialData.accountingAccess.canView ? (
                <span className={clsx("accounting-role-pill", initialData.accountingAccess.canEdit && "can-edit")}>
                  {initialData.accountingAccess.role ?? "viewer"}
                </span>
              ) : null}
            </div>

            {!initialData.accountingAccess.canView ? (
              <div className="locked-panel">
                <CreditCard size={24} />
                <div>
                  <strong>Accounting is only available to finance users.</strong>
                  <span>Your account can use the CRM, but it is not on the accounting allowlist.</span>
                </div>
              </div>
            ) : (
              <>
                <div className="accounting-summary-grid">
                  {accountingData.summaries.map((summary) => (
                    <article key={summary.currency} className="accounting-summary-card">
                      <div>
                        <span>{summary.currency}</span>
                        <strong>{formatMinorMoney(summary.netCashMinor, summary.currency)}</strong>
                      </div>
                      <dl>
                        <div>
                          <dt>Retainers</dt>
                          <dd>{formatMinorMoney(summary.retainerIncomeMinor, summary.currency)}</dd>
                        </div>
                        <div>
                          <dt>Commissions</dt>
                          <dd>{formatMinorMoney(summary.commissionIncomeMinor, summary.currency)}</dd>
                        </div>
                        <div>
                          <dt>Expenses</dt>
                          <dd>{formatMinorMoney(summary.expensesMinor, summary.currency)}</dd>
                        </div>
                        <div>
                          <dt>Outstanding</dt>
                          <dd>{formatMinorMoney(summary.outstandingMinor, summary.currency)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                  {accountingData.summaries.length === 0 ? (
                    <article className="accounting-summary-card empty">
                      <strong>No accounting totals yet.</strong>
                      <span>Create documents and ledger entries to populate currency summaries.</span>
                    </article>
                  ) : null}
                </div>

                <div className="accounting-toolbar">
                  <div className="accounting-tabs" role="tablist" aria-label="Accounting sections">
                    <button
                      type="button"
                      className={clsx(accountingTab === "documents" && "active")}
                      onClick={() => {
                        setAccountingTab("documents");
                        setAccountingTypeFilter("");
                        setAccountingStatusFilter("");
                      }}
                    >
                      Documents
                    </button>
                    <button
                      type="button"
                      className={clsx(accountingTab === "ledger" && "active")}
                      onClick={() => {
                        setAccountingTab("ledger");
                        setAccountingTypeFilter("");
                        setAccountingStatusFilter("");
                      }}
                    >
                      Ledger
                    </button>
                  </div>
                  <label className="search-box accounting-search">
                    <Search size={16} />
                    <input value={accountingQuery} onChange={(event) => setAccountingQuery(event.target.value)} placeholder="Search accounting" />
                  </label>
                </div>

                <div className="accounting-filters">
                  <FilterSelect value={accountingCompanyFilter} onChange={setAccountingCompanyFilter} label="Company" options={accountingCompanies.map((company) => company.name)} optionValues={accountingCompanies.map((company) => company.id)} />
                  <FilterSelect
                    value={accountingTypeFilter}
                    onChange={setAccountingTypeFilter}
                    label="Type"
                    options={accountingTab === "documents" ? ACCOUNTING_DOCUMENT_TYPES.map((type) => ACCOUNTING_DOCUMENT_TYPE_LABELS[type]) : ACCOUNTING_LEDGER_ENTRY_TYPES.map((type) => ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[type])}
                    optionValues={accountingTab === "documents" ? [...ACCOUNTING_DOCUMENT_TYPES] : [...ACCOUNTING_LEDGER_ENTRY_TYPES]}
                  />
                  <FilterSelect
                    value={accountingStatusFilter}
                    onChange={setAccountingStatusFilter}
                    label="Status"
                    options={accountingTab === "documents" ? ACCOUNTING_DOCUMENT_STATUSES.map((status) => ACCOUNTING_DOCUMENT_STATUS_LABELS[status]) : ["Active", "Voided"]}
                    optionValues={accountingTab === "documents" ? [...ACCOUNTING_DOCUMENT_STATUSES] : ["active", "voided"]}
                  />
                  <FilterSelect value={accountingCurrencyFilter} onChange={setAccountingCurrencyFilter} label="Currency" options={accountingCurrencies} />
                  <label className="select-filter accounting-date-filter">
                    <span>From</span>
                    <input type="date" value={accountingDateFrom} onChange={(event) => setAccountingDateFrom(event.target.value)} />
                  </label>
                  <label className="select-filter accounting-date-filter">
                    <span>To</span>
                    <input type="date" value={accountingDateTo} onChange={(event) => setAccountingDateTo(event.target.value)} />
                  </label>
                </div>

                {accountingMessage ? (
                  <div className="data-notice">
                    <Flag size={16} />
                    <span>{accountingMessage}</span>
                  </div>
                ) : null}

                {accountingTab === "documents" ? (
                  <div className="accounting-grid">
                    <form
                      className="accounting-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveAccountingDocument();
                      }}
                    >
                      <div className="accounting-form-header">
                        <h2>{accountingDocumentDraft.documentId ? "Edit document" : "New document"}</h2>
                        {accountingDocumentDraft.documentId ? (
                          <button type="button" className="text-button compact" onClick={() => setAccountingDocumentDraft(defaultAccountingDocumentDraft())}>
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <label>
                        <span>Type</span>
                        <select value={accountingDocumentDraft.documentType} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, documentType: event.target.value as AccountingDocumentType }))}>
                          {ACCOUNTING_DOCUMENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {ACCOUNTING_DOCUMENT_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Status</span>
                        <select value={accountingDocumentDraft.status} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, status: event.target.value as AccountingDocumentDraft["status"] }))}>
                          {ACCOUNTING_DOCUMENT_STATUSES.filter((status) => status !== "void").map((status) => (
                            <option key={status} value={status}>
                              {ACCOUNTING_DOCUMENT_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Company</span>
                        <select value={accountingDocumentDraft.companyId} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, companyId: event.target.value }))}>
                          <option value="">General</option>
                          {companies.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Title</span>
                        <input value={accountingDocumentDraft.title} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, title: event.target.value }))} required />
                      </label>
                      <div className="accounting-form-row">
                        <label>
                          <span>Amount</span>
                          <input inputMode="decimal" value={accountingDocumentDraft.amount} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" required />
                        </label>
                        <label>
                          <span>Currency</span>
                          <input value={accountingDocumentDraft.currency} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} maxLength={3} required />
                        </label>
                      </div>
                      <div className="accounting-form-row">
                        <label>
                          <span>Issued</span>
                          <input type="date" value={accountingDocumentDraft.issuedOn} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, issuedOn: event.target.value }))} />
                        </label>
                        <label>
                          <span>Due</span>
                          <input type="date" value={accountingDocumentDraft.dueOn} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, dueOn: event.target.value }))} />
                        </label>
                      </div>
                      <label>
                        <span>Reference</span>
                        <input value={accountingDocumentDraft.externalReference} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, externalReference: event.target.value }))} />
                      </label>
                      <label>
                        <span>Document URL</span>
                        <input value={accountingDocumentDraft.documentUrl} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, documentUrl: event.target.value }))} />
                      </label>
                      <label>
                        <span>Notes</span>
                        <textarea value={accountingDocumentDraft.notes} onChange={(event) => setAccountingDocumentDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                      </label>
                      <button type="submit" className="primary-button" disabled={!initialData.accountingAccess.canEdit || isSavingAccounting}>
                        <Check size={15} /> {isSavingAccounting ? "Saving..." : "Save document"}
                      </button>
                    </form>

                    <div className="accounting-table-wrap">
                      <table className="accounting-table">
                        <thead>
                          <tr>
                            <th>Document</th>
                            <th>Company</th>
                            <th>Status</th>
                            <th>Amount</th>
                            <th>Issued</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAccountingDocuments.map((document) => (
                            <tr key={document.id} className={clsx(document.status === "void" && "voided")}>
                              <td>
                                <strong>{document.title}</strong>
                                <span>{ACCOUNTING_DOCUMENT_TYPE_LABELS[document.documentType]}{document.externalReference ? ` - ${document.externalReference}` : ""}</span>
                              </td>
                              <td>{document.companyId ? companyNameById.get(document.companyId) ?? "Unknown company" : "General"}</td>
                              <td>
                                <span className={clsx("accounting-status-pill", document.status)}>{ACCOUNTING_DOCUMENT_STATUS_LABELS[document.status]}</span>
                              </td>
                              <td>{formatMinorMoney(document.amountMinor, document.currency)}</td>
                              <td>{document.issuedOn ? formatDate(document.issuedOn) : "No date"}</td>
                              <td>
                                <div className="accounting-row-actions">
                                  <button type="button" className="text-button compact" onClick={() => setAccountingDocumentDraft(accountingDocumentDraftFromDocument(document))} disabled={document.status === "void"}>
                                    <Pencil size={13} /> Edit
                                  </button>
                                  <button type="button" className="text-button compact danger" onClick={() => openAccountingDocumentAction(document, "void")} disabled={!initialData.accountingAccess.canEdit || document.status === "void"}>
                                    Void
                                  </button>
                                  <button type="button" className="text-button compact danger" onClick={() => openAccountingDocumentAction(document, "delete")} disabled={!initialData.accountingAccess.canEdit}>
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {filteredAccountingDocuments.length === 0 ? <p className="empty-state">No accounting documents match these filters.</p> : null}
                    </div>
                  </div>
                ) : (
                  <div className="accounting-grid">
                    <form
                      className="accounting-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveAccountingLedgerEntry();
                      }}
                    >
                      <div className="accounting-form-header">
                        <h2>{accountingLedgerDraft.entryId ? "Edit ledger entry" : "New ledger entry"}</h2>
                        {accountingLedgerDraft.entryId ? (
                          <button type="button" className="text-button compact" onClick={() => setAccountingLedgerDraft(defaultAccountingLedgerDraft())}>
                            Clear
                          </button>
                        ) : null}
                      </div>
                      <label>
                        <span>Document</span>
                        <select value={accountingLedgerDraft.documentId} onChange={(event) => handleLedgerDocumentChange(event.target.value)}>
                          <option value="">No document</option>
                          {accountingData.documents.filter((document) => document.status !== "void").map((document) => (
                            <option key={document.id} value={document.id}>
                              {document.title}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Type</span>
                        <select
                          value={accountingLedgerDraft.entryType}
                          onChange={(event) => {
                            const nextType = event.target.value as AccountingLedgerEntryType;
                            setAccountingLedgerDraft((current) => ({
                              ...current,
                              entryType: nextType,
                              direction: nextType === "expense_payment" ? "outgoing" : nextType === "adjustment" ? current.direction : "incoming",
                            }));
                          }}
                        >
                          {ACCOUNTING_LEDGER_ENTRY_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Direction</span>
                        <select value={accountingLedgerDraft.direction} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, direction: event.target.value as AccountingDirection }))}>
                          {ACCOUNTING_DIRECTIONS.map((direction) => (
                            <option key={direction} value={direction}>
                              {ACCOUNTING_DIRECTION_LABELS[direction]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Company</span>
                        <select value={accountingLedgerDraft.companyId} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, companyId: event.target.value }))}>
                          <option value="">General</option>
                          {companies.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="accounting-form-row">
                        <label>
                          <span>Amount</span>
                          <input inputMode="decimal" value={accountingLedgerDraft.amount} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" required />
                        </label>
                        <label>
                          <span>Currency</span>
                          <input value={accountingLedgerDraft.currency} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} maxLength={3} required />
                        </label>
                      </div>
                      <label>
                        <span>Date</span>
                        <input type="date" value={accountingLedgerDraft.occurredOn} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, occurredOn: event.target.value }))} required />
                      </label>
                      <label>
                        <span>Reference</span>
                        <input value={accountingLedgerDraft.externalReference} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, externalReference: event.target.value }))} />
                      </label>
                      <label>
                        <span>Document URL</span>
                        <input value={accountingLedgerDraft.documentUrl} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, documentUrl: event.target.value }))} />
                      </label>
                      <label>
                        <span>Notes</span>
                        <textarea value={accountingLedgerDraft.notes} onChange={(event) => setAccountingLedgerDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                      </label>
                      <button type="submit" className="primary-button" disabled={!initialData.accountingAccess.canEdit || isSavingAccounting}>
                        <Check size={15} /> {isSavingAccounting ? "Saving..." : "Save ledger entry"}
                      </button>
                    </form>

                    <div className="accounting-table-wrap">
                      <table className="accounting-table">
                        <thead>
                          <tr>
                            <th>Entry</th>
                            <th>Company</th>
                            <th>Direction</th>
                            <th>Amount</th>
                            <th>Date</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAccountingEntries.map((entry) => {
                            const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
                            return (
                              <tr key={entry.id} className={clsx(entry.voidedAt && "voided")}>
                                <td>
                                  <strong>{ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType]}</strong>
                                  <span>{linkedDocument?.title ?? entry.externalReference ?? "Ledger entry"}</span>
                                </td>
                                <td>{entry.companyId ? companyNameById.get(entry.companyId) ?? "Unknown company" : "General"}</td>
                                <td>
                                  <span className={clsx("accounting-direction-pill", entry.direction)}>{ACCOUNTING_DIRECTION_LABELS[entry.direction]}</span>
                                </td>
                                <td>{formatMinorMoney(entry.amountMinor, entry.currency)}</td>
                                <td>{formatDate(entry.occurredOn)}</td>
                                <td>
                                  <div className="accounting-row-actions">
                                    <button type="button" className="text-button compact" onClick={() => setAccountingLedgerDraft(accountingLedgerDraftFromEntry(entry))} disabled={Boolean(entry.voidedAt)}>
                                      <Pencil size={13} /> Edit
                                    </button>
                                    <button type="button" className="text-button compact danger" onClick={() => openAccountingLedgerAction(entry, "void")} disabled={!initialData.accountingAccess.canEdit || Boolean(entry.voidedAt)}>
                                      Void
                                    </button>
                                    <button type="button" className="text-button compact danger" onClick={() => openAccountingLedgerAction(entry, "delete")} disabled={!initialData.accountingAccess.canEdit}>
                                      Delete
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {filteredAccountingEntries.length === 0 ? <p className="empty-state">No ledger entries match these filters.</p> : null}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        ) : null}

        {activeView === "tasks" ? (
          <section className="view-surface">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Tasks</p>
                <h2>{formatNumber(taskRows.length)} open next steps</h2>
              </div>
              <button type="button" className="secondary-button">
                <Plus size={15} /> New task
              </button>
            </div>
            <div className="task-list">
              {taskRows.map(({ task, company }) => (
                <article key={task.id} className="task-row">
                  <ListChecks size={18} />
                  <div>
                    <strong>{task.title}</strong>
                    <span>{company.name}</span>
                  </div>
                  <span>{task.dueDate ? formatDate(task.dueDate) : "No due date"}</span>
                  <button type="button" className="text-button" onClick={() => openCompany(company.id)}>
                    Open company
                  </button>
                </article>
              ))}
              {taskRows.length === 0 ? <p className="empty-state">No open tasks yet.</p> : null}
            </div>
          </section>
        ) : null}

        {activeView === "import" ? (
          <section className="view-surface import-view">
            <div className="surface-header">
              <div>
                <p className="eyebrow">Import admin</p>
                <h2>XLSX seed and cleanup queue</h2>
              </div>
              <button type="button" className="primary-button">
                <Upload size={16} /> Upload workbook
              </button>
            </div>
            <div className="import-grid">
              <Metric label="Workbook rows" value={formatNumber(initialData.importSummary.rawRows)} />
              <Metric label="Normalized companies" value={formatNumber(initialData.importSummary.normalizedCompanies)} />
              <Metric label="Unmatched rows" value={formatNumber(initialData.importSummary.unmatchedRows)} tone="warn" />
              <Metric label="Suspicious merges" value={formatNumber(initialData.importSummary.suspiciousMerges)} tone="warn" />
            </div>
            <div className="cleanup-panel">
              <div>
                <h2>Cleanup signals</h2>
                <p>Duplicate headers, corporate-domain merges, personal email domains, and low-confidence records remain traceable through raw import and merge audit rows.</p>
              </div>
              <div className="admin-actions">
                <button type="button">
                  <FileSpreadsheet size={16} /> Current workbook: 18,623 rows
                </button>
                <button type="button">
                  <Flag size={16} /> {formatNumber(initialData.importSummary.unmatchedRows)} unmatched
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {pendingChanges.length > 0 ? (
          <div className="sync-dock" aria-live="polite">
            <div>
              <strong>{formatChangeCount(pendingChanges.length)}</strong>
              <span>{syncMessage ?? (debugMode ? "Debug draft changes are stored locally until you push them to the database." : "Changes are stored locally until you push them.")}</span>
            </div>
            <button type="button" className="primary-button" onClick={pushPendingChanges} disabled={isPushingChanges}>
              <Upload size={16} /> {isPushingChanges ? "Pushing..." : debugMode ? "Push to database" : "Push changes"}
            </button>
          </div>
        ) : syncMessage ? (
          <div className="sync-dock complete" aria-live="polite">
            <div>
              <strong>All changes pushed</strong>
              <span>{syncMessage}</span>
            </div>
          </div>
        ) : null}

        {accountingRecordActionTarget ? (
          <div className="modal-backdrop" role="presentation">
            <section className="contact-editor accounting-void-dialog" role="dialog" aria-modal="true" aria-labelledby="accounting-void-title">
              <form
                className="contact-editor-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  confirmAccountingRecordAction();
                }}
              >
                <div className="contact-editor-header">
                  <div>
                    <p className="eyebrow">Accounting</p>
                    <h2 id="accounting-void-title">{accountingRecordActionTarget.action === "delete" ? "Delete accounting record" : "Void accounting record"}</h2>
                  </div>
                  <button type="button" className="icon-button" onClick={closeAccountingRecordActionDialog} title="Close accounting action dialog" disabled={isSavingAccounting}>
                    <X size={16} />
                  </button>
                </div>

                <p className="accounting-void-summary">
                  {accountingRecordActionTarget.action === "delete" ? "Permanently delete" : "Void"} {accountingRecordActionTarget.entityType === "document" ? "document" : "ledger entry"}{" "}
                  <strong>{accountingRecordActionTarget.title}</strong>.{" "}
                  {accountingRecordActionTarget.action === "delete" ? "A snapshot and reason stay in the audit trail." : "The record stays in the audit trail."}
                </p>

                <label className="editor-field">
                  {accountingRecordActionTarget.action === "delete" ? "Delete reason" : "Void reason"}
                  <textarea
                    value={accountingRecordActionReason}
                    onChange={(event) => setAccountingRecordActionReason(event.target.value)}
                    rows={4}
                    maxLength={1000}
                    required
                    autoFocus
                    placeholder={accountingRecordActionTarget.action === "delete" ? "Reason for deleting this mistaken record" : "Reason for voiding this record"}
                  />
                </label>

                <div className="contact-editor-footer">
                  <button type="button" className="secondary-button" onClick={closeAccountingRecordActionDialog} disabled={isSavingAccounting}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button danger" disabled={accountingRecordActionReason.trim().length === 0 || isSavingAccounting}>
                    <Check size={15} /> {isSavingAccounting ? (accountingRecordActionTarget.action === "delete" ? "Deleting..." : "Voiding...") : accountingRecordActionTarget.action === "delete" ? "Delete record" : "Void record"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {editingPerson ? (
          <div className="modal-backdrop" role="presentation">
            <section className="contact-editor" role="dialog" aria-modal="true" aria-labelledby="contact-editor-title">
              <form
                className="contact-editor-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveEditedPerson();
                }}
              >
                <div className="contact-editor-header">
                  <div>
                    <p className="eyebrow">Edit contact</p>
                    <h2 id="contact-editor-title">{editingPerson.displayName}</h2>
                  </div>
                  <button type="button" className="icon-button" onClick={closePersonEdit} title="Close editor">
                    <X size={16} />
                  </button>
                </div>

                <label className="editor-field">
                  Name
                  <input value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} placeholder="Contact name" />
                </label>

                <div className="editor-grid">
                  <label className="editor-field">
                    First name
                    <input value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} placeholder="First name" />
                  </label>
                  <label className="editor-field">
                    Last name
                    <input value={editLastName} onChange={(event) => setEditLastName(event.target.value)} placeholder="Last name" />
                  </label>
                  <label className="editor-field">
                    Job title
                    <input value={editJobTitle} onChange={(event) => setEditJobTitle(event.target.value)} placeholder="Partner" />
                  </label>
                  <label className="editor-field">
                    LinkedIn
                    <input value={editLinkedinUrl} onChange={(event) => setEditLinkedinUrl(event.target.value)} placeholder="https://www.linkedin.com/in/..." />
                  </label>
                  <label className="editor-field">
                    Phone
                    <input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="+44..." />
                  </label>
                  <label className="editor-field">
                    Country
                    <input value={editCountry} onChange={(event) => setEditCountry(event.target.value)} placeholder="United Kingdom" />
                  </label>
                </div>

                <div className="editor-section">
                  <div className="section-heading">
                    <h2>Email addresses</h2>
                    <button type="button" className="text-button" onClick={addEditEmail}>
                      <Plus size={14} /> Add email
                    </button>
                  </div>
                  <div className="email-editor-list">
                    {editEmails.map((email, index) => (
                      <div key={index} className="email-editor-row">
                        <span className="email-position">{index === 0 ? "Primary" : `#${index + 1}`}</span>
                        <input value={email} onChange={(event) => updateEditEmail(index, event.target.value)} placeholder="name@example.com" />
                        <button type="button" className="icon-button" onClick={() => moveEditEmail(index, -1)} disabled={index === 0} title="Move email up">
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => moveEditEmail(index, 1)}
                          disabled={index === editEmails.length - 1}
                          title="Move email down"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button type="button" className="icon-button danger" onClick={() => removeEditEmail(index)} title="Remove email">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    {editEmails.length === 0 ? <p className="empty-state compact">No email addresses on this contact.</p> : null}
                  </div>
                </div>

                <div className="editor-section">
                  <div className="section-heading">
                    <h2>Contact tags</h2>
                    <span>{editCategories.length}</span>
                  </div>
                  <div className="tag-editor">
                    <div className="contact-chip-list editor">
                      {editCategories.map((category) => (
                        <button key={category} type="button" className="contact-chip removable" onClick={() => removeEditCategory(category)} title={`Remove ${category}`}>
                          {category}
                          <X size={12} />
                        </button>
                      ))}
                      {editCategories.length === 0 ? <span className="muted-cell">No contact tags</span> : null}
                    </div>
                    <label className="tag-add-row">
                      <Tags size={15} />
                      <input
                        value={editCategoryInput}
                        onChange={(event) => setEditCategoryInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addEditCategory();
                          }
                        }}
                        placeholder="Add tag"
                      />
                      <button type="button" className="text-button" onClick={addEditCategory}>
                        <Plus size={14} /> Add
                      </button>
                    </label>
                  </div>
                </div>

                {editingPersonInvestment && activePersonInvestmentDraft ? (
                  <div className="editor-section">
                    <div className="section-heading">
                      <h2>Investment profile</h2>
                      <span>{relationshipChipLabel(editingPersonInvestment)}</span>
                    </div>
                    <div className="investment-grid editor-investment-grid">
                      <label className="select-filter">
                        <span>Status</span>
                        <select
                          value={activePersonInvestmentDraft.investmentStatus}
                          onChange={(event) => setPersonInvestmentDraft({ ...activePersonInvestmentDraft, investmentStatus: event.target.value as InvestmentStatus })}
                        >
                          {INVESTMENT_STATUSES.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>
                              {INVESTMENT_STATUS_LABELS[statusValue]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                      <label className="select-filter">
                        <span>Capacity</span>
                        <select
                          value={activePersonInvestmentDraft.capacityStatus}
                          onChange={(event) => setPersonInvestmentDraft({ ...activePersonInvestmentDraft, capacityStatus: event.target.value as CapacityStatus })}
                        >
                          {CAPACITY_STATUSES.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>
                              {CAPACITY_STATUS_LABELS[statusValue]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                      <label className="editor-field">
                        Last invested
                        <input type="date" value={activePersonInvestmentDraft.lastInvestedDate} onChange={(event) => setPersonInvestmentDraft({ ...activePersonInvestmentDraft, lastInvestedDate: event.target.value })} />
                      </label>
                      <label className="editor-field wide-field">
                        Notes
                        <textarea value={activePersonInvestmentDraft.notes} onChange={(event) => setPersonInvestmentDraft({ ...activePersonInvestmentDraft, notes: event.target.value })} rows={2} />
                      </label>
                      <label className="editor-field">
                        Deal name
                        <input value={activePersonInvestmentDraft.dealName} onChange={(event) => setPersonInvestmentDraft({ ...activePersonInvestmentDraft, dealName: event.target.value })} placeholder="Deal name" />
                      </label>
                      <label className="select-filter">
                        <span>Deal status</span>
                        <select value={activePersonInvestmentDraft.dealStatus} onChange={(event) => setPersonInvestmentDraft({ ...activePersonInvestmentDraft, dealStatus: event.target.value as InvestmentDealStatus })}>
                          {INVESTMENT_DEAL_STATUSES.map((statusValue) => (
                            <option key={statusValue} value={statusValue}>
                              {INVESTMENT_DEAL_STATUS_LABELS[statusValue]}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                      <label className="editor-field">
                        Deal date
                        <input type="date" value={activePersonInvestmentDraft.dealDate} onChange={(event) => setPersonInvestmentDraft({ ...activePersonInvestmentDraft, dealDate: event.target.value })} />
                      </label>
                    </div>
                  </div>
                ) : null}

                {personEditMessage ? (
                  <div className="data-notice error">
                    <Flag size={16} />
                    <span>{personEditMessage}</span>
                  </div>
                ) : null}

                <div className="contact-editor-footer">
                  <button type="button" className="secondary-button" onClick={closePersonEdit}>
                    Cancel
                  </button>
                  <button type="submit" className="primary-button" disabled={isPushingChanges}>
                    <Check size={15} /> Queue contact update
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" className={clsx("nav-item", active && "active")} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={clsx("metric", tone)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MultiFilterSelect({
  icon,
  label,
  options,
  selected,
  onToggle,
  formatOption = (value) => value,
}: {
  icon?: React.ReactNode;
  label: string;
  options: readonly string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  formatOption?: (value: string) => string;
}) {
  const selectedLabels = options.filter((option) => selected.has(option)).map(formatOption);
  const valueLabel =
    selectedLabels.length === 0
      ? "All"
      : selectedLabels.length > 2
        ? `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`
        : selectedLabels.join(", ");

  return (
    <details className={clsx("multi-filter", selected.size > 0 && "active")}>
      <summary>
        <span className="multi-filter-icon">{icon ?? <Filter size={15} />}</span>
        <span className="multi-filter-copy">
          <span>{label}</span>
          <strong>{valueLabel}</strong>
        </span>
        <ChevronDown size={14} />
      </summary>
      <div className="multi-filter-menu">
        <div className="multi-filter-menu-header">
          <span>{label}</span>
          <strong>{selected.size === 0 ? "All" : `${selected.size} selected`}</strong>
        </div>
        {options.map((option) => (
          <label key={option} className="multi-filter-option">
            <input type="checkbox" checked={selected.has(option)} onChange={() => onToggle(option)} />
            <span className="multi-filter-check" aria-hidden="true">
              <Check size={13} />
            </span>
            <span>{formatOption(option)}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function FilterSelect({
  icon,
  value,
  onChange,
  label,
  options,
  optionValues,
}: {
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: readonly string[];
  optionValues?: readonly string[];
}) {
  return (
    <label className="select-filter">
      {icon}
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option, index) => (
          <option key={optionValues?.[index] ?? option} value={optionValues?.[index] ?? option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
