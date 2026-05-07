"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Building2,
  Check,
  ChevronDown,
  CircleDot,
  FlaskConical,
  Download,
  FileSpreadsheet,
  Filter,
  Flag,
  GitMerge,
  ListChecks,
  Mail,
  Pencil,
  Plus,
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
  highlightPersonAction,
  mergeCompaniesAction,
  mergePeopleAction,
  moveStageAction,
  renameCompanyTagAction,
  signOut,
  updateCompanyAction,
  updateCompanyEnrichmentAction,
  updateInvestmentRelationshipAction,
  updatePeopleAction,
  updatePersonAction,
} from "@/app/actions";
import { normalizeCompanyWebsites } from "@/lib/company-websites";
import {
  CONTACT_EXPORT_LABELS,
  contactExportValues,
  filterContactExportRows,
  type ContactExportCriterion,
} from "@/lib/export/contacts";
import { isValidPersonEmail, normalizePersonCategories, normalizePersonEmails } from "@/lib/person-update";
import type { CapacityStatus, Company, CompanyEnrichment, DashboardData, InvestmentDealStatus, InvestmentRelationship, InvestmentStatus, OutreachStage, Person, Tag } from "@/lib/types";
import { CAPACITY_STATUSES, INVESTMENT_DEAL_STATUSES, INVESTMENT_STATUSES, OUTREACH_STAGES } from "@/lib/types";

type CrmShellProps = {
  initialData: DashboardData;
};

type ActiveView = "companies" | "people" | "tags" | "pipeline" | "tasks" | "import";
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

const ENRICHMENT_KEYWORD_SEPARATOR = /[;,\n]+/;

const VIEW_TITLES: Record<ActiveView, string> = {
  companies: "Company golden source",
  people: "People directory",
  tags: "Tag manager",
  pipeline: "Outreach pipeline",
  tasks: "Tasks and next steps",
  import: "Import admin",
};

const COMPANY_PAGE_SIZE_OPTIONS = [50, 100, 250, 500, "all"] as const;
const PEOPLE_PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000, "all"] as const;
const PIPELINE_COLUMN_LIMIT = 60;
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

function formatChangeCount(count: number) {
  return `${formatNumber(count)} pending change${count === 1 ? "" : "s"}`;
}

function formatCompanyWebsites(company: Company) {
  if (company.websiteDomains.length === 0) return company.country ?? "No domain";
  if (company.websiteDomains.length === 1) return company.websiteDomains[0];
  return `${company.websiteDomains[0]} +${company.websiteDomains.length - 1}`;
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

function buildCompanySearchText(company: Company) {
  return [
    company.name,
    company.websiteDomains.join(" "),
    company.country,
    company.categories.join(" "),
    company.tags.map((item) => item.name).join(" "),
    company.enrichment ? [company.enrichment.industry, company.enrichment.subsector, company.enrichment.companyType, company.enrichment.keywords.join(" "), company.enrichment.summary].join(" ") : "",
    company.investmentRelationships.map((relationship) => `${relationship.investmentStatus} ${relationship.capacityStatus} ${relationship.deals.map((deal) => deal.name).join(" ")}`).join(" "),
    company.people.map((person) => `${person.displayName} ${person.emails.join(" ")} ${person.email ?? ""} ${person.jobTitle ?? ""}`).join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

function companyMatches(company: Company, text: string, query: string, stage: string, country: string, tag: string, quality: string) {
  return (
    (!query || text.includes(query)) &&
    (!stage || company.outreachStage === stage) &&
    (!country || company.country === country) &&
    (!tag || company.tags.some((item) => item.name === tag)) &&
    (!quality || company.sourceQuality === quality)
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
  const text = [
    person.displayName,
    person.jobTitle,
    person.country,
    person.categories.join(" "),
    person.investmentRelationships.map((relationship) => `${relationship.investmentStatus} ${relationship.capacityStatus} ${relationship.deals.map((deal) => deal.name).join(" ")}`).join(" "),
    person.emails.join(" "),
    companyText,
  ]
    .join(" ")
    .toLowerCase();

  return (
    (!query || text.includes(query.toLowerCase())) &&
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

export function CrmShell({ initialData }: CrmShellProps) {
  const isSignedIn = initialData.authMode === "supabase" && initialData.currentUserName !== "Not signed in";
  const authLabel = initialData.authMode === "demo" ? "Demo data" : isSignedIn ? "Signed in" : "Signed out";
  const authDetail = initialData.authMode === "demo" ? "Local preview" : isSignedIn ? initialData.currentUserName : "Not signed in";
  const isDemoData = initialData.dataMode === "demo";
  const [companies, setCompanies] = useState(initialData.companies);
  const [activeView, setActiveView] = useState<ActiveView>("companies");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialData.companies.slice(0, 1).map((company) => company.id)));
  const [activeCompanyId, setActiveCompanyId] = useState(initialData.companies[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [country, setCountry] = useState("");
  const [tag, setTag] = useState("");
  const [quality, setQuality] = useState("");
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
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isPushingChanges, setIsPushingChanges] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState(false);
  const [debugModeReady, setDebugModeReady] = useState(false);
  const debugDraftHydratedRef = useRef(false);
  const [debugStorageIssue, setDebugStorageIssue] = useState<string | null>(null);
  const [incorrectEmails, setIncorrectEmails] = useState<Set<string>>(new Set());
  const [incorrectEmailMessage, setIncorrectEmailMessage] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState({ companyId: "", name: "", websites: "", description: "", country: "" });
  const [enrichmentDraft, setEnrichmentDraft] = useState<EnrichmentDraft | null>(null);
  const [companyInvestmentDraft, setCompanyInvestmentDraft] = useState<InvestmentDraft | null>(null);
  const [enrichmentMessage, setEnrichmentMessage] = useState<string | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const deferredCompanyQuery = useDeferredValue(query.trim().toLowerCase());
  const deferredPeopleQuery = useDeferredValue(peopleQuery.trim().toLowerCase());

  const selectedCompanies = useMemo(() => companies.filter((company) => selectedIds.has(company.id)), [companies, selectedIds]);
  const companyMergeTarget = selectedCompanies.length >= 2
    ? selectedCompanies.find((company) => company.id === companyMergeTargetId) ?? selectedCompanies[0]
    : null;
  const companyMergeSources = companyMergeTarget ? selectedCompanies.filter((company) => company.id !== companyMergeTarget.id) : [];
  const companySearchTextById = useMemo(() => new Map(companies.map((company) => [company.id, buildCompanySearchText(company)])), [companies]);
  const filteredCompanies = useMemo(
    () => companies.filter((company) => companyMatches(company, companySearchTextById.get(company.id) ?? "", deferredCompanyQuery, stage, country, tag, quality)),
    [companies, companySearchTextById, country, deferredCompanyQuery, quality, stage, tag],
  );
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
  const pipelineGroups = useMemo(
    () => {
      const groups = new Map<OutreachStage, Company[]>(OUTREACH_STAGES.map((stageName) => [stageName, []]));
      companies.forEach((company) => groups.get(company.outreachStage)?.push(company));

      return OUTREACH_STAGES.map((stageName) => {
        const stageCompanies = groups.get(stageName) ?? [];
        return {
          stage: stageName,
          companies: stageCompanies.slice(0, PIPELINE_COLUMN_LIMIT),
          total: stageCompanies.length,
        };
      });
    },
    [companies],
  );

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

  function openCompany(companyId: string) {
    setActiveCompanyId(companyId);
    setActiveView("companies");
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
    setSelectedIds(new Set(initialData.companies.slice(0, 1).map((company) => company.id)));
    setActiveCompanyId(initialData.companies[0]?.id ?? "");
    setCompanyDraft({ companyId: "", name: "", websites: "", description: "", country: "" });
    setEnrichmentDraft(null);
    setCompanyInvestmentDraft(null);
    setPersonInvestmentDraft(null);
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

  function updateCompanyEnrichmentLocally(companyId: string, enrichment: CompanyEnrichment) {
    updateCompanies((company) => (company.id === companyId ? { ...company, enrichment } : company));
  }

  function saveActiveCompanyEnrichment() {
    if (!activeCompany || !activeCompanyEnrichmentDraft) return;
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
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

    const payload = {
      organizationId: organizationId ?? "",
      companyId: activeCompany.id,
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
      reviewed: true,
    };

    queuePendingChange({
      key: `company-enrichment:${activeCompany.id}`,
      label: "Company enrichment update",
      record: {
        kind: "company-enrichment-update",
        key: `company-enrichment:${activeCompany.id}`,
        label: "Company enrichment update",
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(activeCompany.id)
          ? updateCompanyEnrichmentAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  async function enrichActiveCompany(force = false) {
    if (!activeCompany || isEnriching) return;
    setIsEnriching(true);
    setEnrichmentMessage(`Enriching ${activeCompany.name} with local Ollama...`);
    try {
      const response = await fetch("/api/enrichment/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: activeCompany.id, force }),
      });
      const payload = (await response.json()) as { enrichment?: CompanyEnrichment; skipped?: boolean; error?: string };
      if (!response.ok) {
        setEnrichmentMessage(payload.error ?? "Company enrichment failed.");
        return;
      }
      if (payload.skipped) {
        setEnrichmentMessage("Company already has completed enrichment. Use retry to force a refresh.");
        return;
      }
      if (payload.enrichment) {
        updateCompanyEnrichmentLocally(activeCompany.id, payload.enrichment);
        setEnrichmentDraft(enrichmentDraftForCompany({ ...activeCompany, enrichment: payload.enrichment }));
        setEnrichmentMessage(payload.enrichment.status === "completed" ? "Company enrichment saved." : `Enrichment needs review: ${payload.enrichment.errorMessage ?? "No website text found."}`);
      }
    } catch (error) {
      setEnrichmentMessage(error instanceof Error ? error.message : "Company enrichment failed.");
    } finally {
      setIsEnriching(false);
    }
  }

  async function enrichCompanyBatch(targetCompanies: Company[]) {
    if (targetCompanies.length === 0 || isEnriching) return;
    setIsEnriching(true);
    let completed = 0;
    let failed = 0;

    for (const company of targetCompanies) {
      setEnrichmentMessage(`Enriching ${completed + failed + 1} of ${targetCompanies.length}: ${company.name}`);
      try {
        const response = await fetch("/api/enrichment/company", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId: company.id, force: false }),
        });
        const payload = (await response.json()) as { enrichment?: CompanyEnrichment; skipped?: boolean; error?: string };
        if (!response.ok) {
          failed += 1;
          continue;
        }
        if (payload.enrichment) {
          updateCompanyEnrichmentLocally(company.id, payload.enrichment);
        }
        completed += 1;
      } catch {
        failed += 1;
      }
    }

    setEnrichmentMessage(`Enrichment finished: ${completed} saved or skipped${failed ? `, ${failed} failed` : ""}.`);
    setIsEnriching(false);
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

  function updatePersonLocally(targetPersonIds: string[], updates: Partial<Pick<Person, "displayName" | "emails" | "jobTitle" | "linkedinUrl" | "phone" | "country" | "categories" | "investmentRelationships">>) {
    const personIdSet = new Set(targetPersonIds);
    updateCompanies((company) => ({
      ...company,
      people: company.people.map((person) =>
        person.sourcePersonIds.some((personId) => personIdSet.has(personId))
          ? {
              ...person,
              ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
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

    const updates = { displayName, emails, jobTitle, linkedinUrl, phone, country: countryValue, categories };
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const personUpdate = organizationId && isUuid(editingPerson.id)
      ? {
          organizationId,
          personId: editingPerson.id,
          displayName,
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
          <NavButton active={activeView === "tasks"} icon={<ListChecks size={18} />} label="Tasks" onClick={() => setActiveView("tasks")} />
          <NavButton active={activeView === "import"} icon={<FileSpreadsheet size={18} />} label="Import Admin" onClick={() => setActiveView("import")} />
        </nav>
        <div className="sidebar-footer">
          <span className={clsx("mode-dot", isSignedIn ? "signed-in" : "signed-out")} />
          <div>
            <strong>{authLabel}</strong>
            <span>{authDetail}</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
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
              className={clsx("pipeline-pill", stage === item.stage && "active")}
              onClick={() => {
                setCompanyPage(1);
                setStage(stage === item.stage ? "" : item.stage);
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
          <section className="content-grid">
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
              <FilterSelect icon={<Filter size={15} />} value={stage} onChange={(value) => {
                setCompanyPage(1);
                setStage(value);
              }} label="Stage" options={OUTREACH_STAGES} />
              <FilterSelect value={country} onChange={(value) => {
                setCompanyPage(1);
                setCountry(value);
              }} label="Country" options={countries} />
              <FilterSelect value={tag} onChange={(value) => {
                setCompanyPage(1);
                setTag(value);
              }} label="Tag" options={tagNames} />
              <FilterSelect value={quality} onChange={(value) => {
                setCompanyPage(1);
                setQuality(value);
              }} label="Quality" options={Object.keys(SOURCE_QUALITY_LABELS)} />
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
                onClick={() => enrichCompanyBatch(selectedCompanies.length ? selectedCompanies : filteredCompanies)}
                disabled={isEnriching || !initialData.localEnrichmentEnabled || !isSignedIn}
                title="Run local LLM enrichment for selected companies, or all filtered companies if nothing is selected"
              >
                <FlaskConical size={15} /> Enrich
              </button>
              <button type="button" onClick={() => exportCompanies(selectedCompanies.length ? selectedCompanies : filteredCompanies)}>
                <Download size={15} /> Export
              </button>
              {pendingChanges.length > 0 ? <span className="saving">{formatChangeCount(pendingChanges.length)}</span> : null}
            </div>

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
                    <tr key={company.id} className={clsx(activeCompany?.id === company.id && "active-row")} onClick={() => setActiveCompanyId(company.id)}>
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

          {activeCompany ? (
            <aside className="detail-panel" aria-label="Company details">
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Company detail</p>
                  <input
                    className="title-input"
                    value={activeCompanyDraft.name}
                    onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, name: event.target.value })}
                    onBlur={() => updateActiveCompany("name", activeCompanyDraft.name)}
                  />
                </div>
                <span className={clsx("quality-pill", activeCompany.sourceQuality)}>{SOURCE_QUALITY_LABELS[activeCompany.sourceQuality]}</span>
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
              </div>
            </div>
            {isDemoData ? (
              <div className="data-notice">
                <Flag size={16} />
                <span>{initialData.dataWarning ?? "Demo contacts are loaded."}</span>
              </div>
            ) : null}
            {incorrectEmailMessage ? <div className="data-notice"><Flag size={16} /><span>{incorrectEmailMessage}</span></div> : null}
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
                <h2>Company outreach stages</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => exportCompanies(companies)}>
                <Download size={15} /> Export pipeline
              </button>
            </div>
            <div className="pipeline-board">
              {pipelineGroups.map((group) => (
                <section key={group.stage} className="pipeline-column">
                  <div className="pipeline-column-header">
                    <strong>{group.stage}</strong>
                    <span>{group.total}</span>
                  </div>
                  {group.companies.map((company) => (
                    <button key={company.id} type="button" className="pipeline-card" onClick={() => openCompany(company.id)}>
                      <strong>{company.name}</strong>
                      <span>{company.nextTask?.title ?? `${company.people.length} people linked`}</span>
                      <div className="tag-list">
                        {company.tags.slice(0, 2).map((item) => (
                          <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
                            {item.name}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                  {group.total > group.companies.length ? (
                    <button type="button" className="pipeline-more" onClick={() => {
                      setStage(group.stage);
                      setActiveView("companies");
                    }}>
                      View {formatNumber(group.total - group.companies.length)} more
                    </button>
                  ) : null}
                </section>
              ))}
            </div>
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

function FilterSelect({
  icon,
  value,
  onChange,
  label,
  options,
}: {
  icon?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: readonly string[];
}) {
  return (
    <label className="select-filter">
      {icon}
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
