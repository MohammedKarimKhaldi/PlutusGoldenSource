import { normalizeCompanyWebsites } from "@/lib/company-websites";
import { DEFAULT_COMPANY_TAG_COLOR } from "@/lib/enrichment/company-tags";
import { normalizePersonCategories, normalizePersonEmails } from "@/lib/person-update";
import { buildAccountingSummaries } from "@/lib/accounting";
import {
  ACCOUNTING_DIRECTION_LABELS,
  ACCOUNTING_DOCUMENT_STATUS_LABELS,
  ACCOUNTING_DOCUMENT_TYPE_LABELS,
  ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS,
  AccountingLedgerDraft,
  amountInputFromMinor,
  formatChangeCount,
  formatNumber,
  INVESTMENT_DEAL_STATUS_LABELS,
  normalizeSearchValue,
  searchTextMatches,
} from "@/components/shared";
import type { DealPipelineRow } from "@/lib/deal-pipeline";
import type {
  AccountingData,
  AccountingDocument,
  AccountingLedgerEntry,
  Company,
  CompanyEnrichment,
  InvestmentDealStatus,
  InvestmentRelationship,
  Person,
  Tag,
} from "@/lib/types";
import type {
  EnrichmentDraft,
  InvestmentDraft,
  PeopleDirectoryRow,
  TagSummary,
} from "@/components/shared";
import type {
  PendingChange,
  PendingChangeRecord,
  PendingPersonUpdate,
} from "@/lib/crm-types";

export const INCORRECT_EMAIL_TAG = "Incorrect email";
export const EMAIL_IN_TEXT_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const ENRICHMENT_KEYWORD_SEPARATOR = /[;,\n]+/;
export const COMPANY_PAGE_SIZE_OPTIONS = [50, 100, 250, 500, "all"] as const;
export const PUSH_BATCH_SIZE = 100;
export const DEBUG_DRAFT_VERSION = 1;
export const DEBUG_MODE_STORAGE_KEY = "golden-source-debug-mode";
export const DEBUG_DRAFT_STORAGE_KEY = "golden-source-debug-draft";
export const DEBUG_DRAFT_DB_NAME = "golden-source-debug";
export const DEBUG_DRAFT_STORE_NAME = "drafts";
export const DEBUG_DRAFT_RECORD_KEY = "current";

export const SOURCE_QUALITY_RANK: Record<Company["sourceQuality"], number> = {
  review: 0,
  low: 1,
  medium: 2,
  high: 3,
};

export function uniqueValues(companies: Company[], selector: (company: Company) => string | null) {
  return [...new Set(companies.map(selector).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "en-US"));
}

export function formatDealStatusSummary(dealName: string, fromStatus: InvestmentDealStatus, toStatus: InvestmentDealStatus) {
  return fromStatus === toStatus
    ? `Investment deal "${dealName}" status update: ${INVESTMENT_DEAL_STATUS_LABELS[toStatus]}.`
    : `Investment deal "${dealName}" changed from ${INVESTMENT_DEAL_STATUS_LABELS[fromStatus]} to ${INVESTMENT_DEAL_STATUS_LABELS[toStatus]}.`;
}

export function emptyAccountingData(): AccountingData {
  return { documents: [], ledgerEntries: [], summaries: [] };
}

export function accountingLedgerDraftFromEntry(entry: AccountingLedgerEntry): AccountingLedgerDraft {
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

export function accountingSearchParts(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

export function isPendingPersonChange(change: PendingChange): change is PendingChange & { type: "person"; personUpdate: PendingPersonUpdate } {
  return change.type === "person" && Boolean(change.personUpdate);
}

export function mergePendingPersonUpdate(existing: PendingPersonUpdate, next: PendingPersonUpdate): PendingPersonUpdate {
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

export function emailDomain(email: string) {
  return email.split("@").pop()?.toLowerCase() ?? "";
}

export function extractEmailsFromText(value: string) {
  return normalizePersonEmails(value.match(EMAIL_IN_TEXT_PATTERN) ?? []);
}

export function buildCompanySearchText(company: Company) {
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

export function companyMatches(
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

export function personMatches({
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

export function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCompanies(companies: Company[]) {
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

export function exportDealPipeline(rows: DealPipelineRow[]) {
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

export function exportPeople(rows: PeopleDirectoryRow[]) {
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

export function normalizeEnrichmentKeywords(value: string) {
  return [...new Set(value.split(ENRICHMENT_KEYWORD_SEPARATOR).map((item) => item.trim()).filter(Boolean))].slice(0, 30);
}

export function defaultCompanyEnrichment(company: Company): CompanyEnrichment {
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

export function relationshipMatches(relationship: InvestmentRelationship, companyId: string | null, personId: string | null) {
  return relationship.companyId === companyId && relationship.personId === personId;
}

export function defaultInvestmentRelationship({
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

export function relationshipForCompany(company: Company) {
  return company.investmentRelationships.find((relationship) => relationshipMatches(relationship, company.id, null)) ?? defaultInvestmentRelationship({ companyId: company.id, personId: null });
}

export function enrichmentDraftForCompany(company: Company): EnrichmentDraft {
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

export function investmentDraftForRelationship(relationship: InvestmentRelationship): InvestmentDraft {
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

export function uniqueList(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

export function chunkItems<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

export function personSourceIds(person: Person) {
  return uniqueList(Array.isArray(person.sourcePersonIds) && person.sourcePersonIds.length > 0 ? person.sourcePersonIds : [person.id]);
}

export function isPendingChangeRecord(value: unknown): value is PendingChangeRecord {
  if (!value || typeof value !== "object") return false;
  return typeof (value as { kind?: string }).kind === "string";
}

export function firstPresent<T>(values: Array<T | null | undefined>) {
  return values.find((value): value is T => value != null && value !== "");
}

export function bestSourceQuality(companies: Company[]) {
  return companies.reduce<Company["sourceQuality"]>(
    (best, company) => (SOURCE_QUALITY_RANK[company.sourceQuality] > SOURCE_QUALITY_RANK[best] ? company.sourceQuality : best),
    "review",
  );
}

export function uniqueTags(tags: Tag[]) {
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

export function tagIdForGeneratedName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `local-enrichment-tag-${slug || "tag"}`;
}

export function enrichmentResponseTags(tags: Tag[] | undefined, tagNames: string[] | undefined) {
  if (tags && tags.length > 0) return tags;
  return (tagNames ?? []).map((name) => ({
    id: tagIdForGeneratedName(name),
    name,
    color: DEFAULT_COMPANY_TAG_COLOR,
  }));
}

export function mergeInvestmentRelationships(relationships: InvestmentRelationship[]) {
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

export function mergeCompanyPeople(companies: Company[]) {
  const peopleById = new Map<string, Person>();
  for (const company of companies) {
    for (const person of company.people) {
      const existing = peopleById.get(person.id);
      peopleById.set(person.id, existing ? mergePersonDetails(existing, person, existing.id) : person);
    }
  }
  return [...peopleById.values()];
}

export function mergeCompanyActivities(companies: Company[]) {
  const activitiesById = new Map<string, Company["activities"][number]>();
  for (const company of companies) {
    for (const activity of company.activities) {
      activitiesById.set(activity.id, activity);
    }
  }
  return [...activitiesById.values()].sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
}

export function latestActivityDate(companies: Company[]) {
  return (
    companies
      .map((company) => company.lastActivityAt)
      .filter((date): date is string => Boolean(date))
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null
  );
}

export function bestNextTask(companies: Company[]) {
  const tasks = companies.map((company) => company.nextTask).filter((task): task is NonNullable<Company["nextTask"]> => Boolean(task));
  if (tasks.length === 0) return null;
  return [...tasks].sort((left, right) => {
    if (!left.dueDate && !right.dueDate) return 0;
    if (!left.dueDate) return 1;
    if (!right.dueDate) return -1;
    return left.dueDate.localeCompare(right.dueDate);
  })[0];
}

export function mergeCompanyDetails(target: Company, sources: Company[]): Company {
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

export function mergePersonDetails(target: Person, source: Person, forcedId = target.id): Person {
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

export function groupPeopleDirectory(rows: Array<{ person: Person; company: Company }>): PeopleDirectoryRow[] {
  const grouped = new Map<string, PeopleDirectoryRow>();
  for (const row of rows) {
    const existing = grouped.get(row.person.id);
    if (!existing) {
      grouped.set(row.person.id, {
        person: { ...row.person, sourcePersonIds: personSourceIds(row.person), emails: uniqueList(row.person.emails), categories: uniqueList(row.person.categories) },
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

export function initialCompanyIdFor(companies: Company[], companyId?: string) {
  if (companyId && companies.some((company) => company.id === companyId)) return companyId;
  return companies[0]?.id ?? "";
}

export function buildTagSummaries(companies: Company[], peopleDirectory: PeopleDirectoryRow[]): TagSummary[] {
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
}

export function withAccountingSummaries(data: AccountingData): AccountingData {
  return {
    ...data,
    summaries: buildAccountingSummaries(data.documents, data.ledgerEntries),
  };
}
