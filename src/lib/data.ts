import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildAccountingSummaries } from "@/lib/accounting";
import { normalizeCompanyWebsites } from "@/lib/company-websites";
import { localEnrichmentEnabled } from "@/lib/enrichment-config";
import { mockDashboardData } from "@/lib/mock-data";
import { normalizePersonName } from "@/lib/import/normalization";
import { createSupabaseServerClient, hasSupabaseBrowserConfig } from "@/lib/supabase/server";
import type {
  AccountingAccess,
  AccountingData,
  AccountingDocument,
  AccountingLedgerEntry,
  AccountingRole,
  Activity,
  Company,
  CompanyEnrichment,
  DashboardData,
  ImportSummary,
  InvestmentDeal,
  InvestmentRelationship,
  Person,
  Tag,
  Task,
} from "@/lib/types";

type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type SupabaseError = { code?: string; details?: string | null; message: string };
type SupabasePage<T> = PromiseLike<{ data: T[] | null; error: SupabaseError | null }>;

const PAGE_SIZE = 1000;
const DASHBOARD_CACHE_VERSION = 4;
const DASHBOARD_CACHE_REVALIDATE_MS = 5 * 60 * 1000;
const DASHBOARD_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const dashboardMemoryCache = new Map<string, { savedAt: number; data: DashboardData }>();
const dashboardRefreshes = new Set<string>();
const dashboardCacheDir = join(process.cwd(), ".next", "cache", "golden-source-dashboard");
const NO_ACCOUNTING_ACCESS: AccountingAccess = {
  canView: false,
  canEdit: false,
  canAdmin: false,
  role: null,
};

type StoredDashboardCache = {
  version: number;
  savedAt: number;
  data: DashboardData;
};

type CompanyRow = {
  id: string;
  name: string;
  normalized_name: string;
  website_domain: string | null;
  description: string | null;
  country: string | null;
  categories: string[] | null;
  status: "active" | "review" | "archived";
  source_quality: "high" | "medium" | "low" | "review";
  owner_id: string | null;
  merge_confidence: number | null;
};

type OutreachRow = {
  company_id: string;
  stage: Company["outreachStage"];
  owner_id: string | null;
};

type CompanyTagRow = {
  company_id: string;
  tags: Tag | Tag[] | null;
};

type PersonRelation = {
  id: string;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  linkedin_url: string | null;
  job_title: string | null;
  phone_numbers: string | null;
  country: string | null;
  categories: string[] | null;
};

type CompanyPersonRow = {
  company_id: string;
  is_highlighted: boolean;
  role_title: string | null;
  relationship_strength: string | null;
  people: PersonRelation | PersonRelation[] | null;
};

type PersonEmailRow = {
  person_id: string;
  email: string;
  is_primary: boolean;
};

type ActivityRow = {
  id: string;
  company_id: string | null;
  activity_type: Activity["type"];
  summary: string;
  occurred_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  status: "open" | "done";
  company_id: string;
  person_id: string | null;
};

type CompanyEnrichmentRow = {
  company_id: string;
  status: CompanyEnrichment["status"];
  summary: string | null;
  industry: string | null;
  subsector: string | null;
  company_type: string | null;
  location: string | null;
  keywords: string[] | null;
  source_url: string | null;
  model: string | null;
  confidence: number | null;
  error_message: string | null;
  generated_at: string | null;
  reviewed_at: string | null;
  updated_at: string | null;
};

type InvestmentRelationshipRow = {
  id: string;
  company_id: string | null;
  person_id: string | null;
  investment_status: InvestmentRelationship["investmentStatus"];
  capacity_status: InvestmentRelationship["capacityStatus"];
  notes: string | null;
  last_invested_date: string | null;
};

type InvestmentDealRelation = {
  id: string;
  name: string;
  status: InvestmentDeal["status"];
  invested_at: string | null;
  notes: string | null;
};

type InvestmentDealParticipantRow = {
  relationship_id: string;
  role: string | null;
  notes: string | null;
  investment_deals: InvestmentDealRelation | InvestmentDealRelation[] | null;
};

type AccountingMemberRow = {
  role: AccountingRole;
};

type AccountingDocumentRow = {
  id: string;
  company_id: string | null;
  document_type: AccountingDocument["documentType"];
  status: AccountingDocument["status"];
  title: string;
  amount_minor: number;
  currency: string;
  issued_on: string | null;
  due_on: string | null;
  external_reference: string | null;
  document_url: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

type AccountingLedgerEntryRow = {
  id: string;
  document_id: string | null;
  company_id: string | null;
  entry_type: AccountingLedgerEntry["entryType"];
  direction: AccountingLedgerEntry["direction"];
  amount_minor: number;
  currency: string;
  occurred_on: string;
  external_reference: string | null;
  document_url: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardRows = {
  companyRows: CompanyRow[];
  outreachRows: OutreachRow[];
  companyTagRows: CompanyTagRow[];
  companyPersonRows: CompanyPersonRow[];
  personEmailRows: PersonEmailRow[];
  activityRows: ActivityRow[];
  taskRows: TaskRow[];
  tags: Tag[];
  enrichmentRows: CompanyEnrichmentRow[];
  investmentRelationshipRows: InvestmentRelationshipRow[];
  investmentDealParticipantRows: InvestmentDealParticipantRow[];
  importStats?: Partial<ImportSummary>;
  importRowCount?: number;
  importDate: string | null;
};

function dashboardCacheKey(organizationId: string, userId: string) {
  return createHash("sha256").update(`${organizationId}:${userId}`).digest("hex");
}

function dashboardCachePath(cacheKey: string) {
  return join(dashboardCacheDir, `${cacheKey}.json`);
}

async function readDashboardCache(cacheKey: string) {
  const cached = dashboardMemoryCache.get(cacheKey);
  if (cached) return cached;

  try {
    const raw = await readFile(dashboardCachePath(cacheKey), "utf8");
    const parsed = JSON.parse(raw) as StoredDashboardCache;
    if (parsed.version !== DASHBOARD_CACHE_VERSION) return null;
    if (Date.now() - parsed.savedAt > DASHBOARD_CACHE_MAX_AGE_MS) return null;

    const value = { savedAt: parsed.savedAt, data: parsed.data };
    dashboardMemoryCache.set(cacheKey, value);
    return value;
  } catch {
    return null;
  }
}

async function writeDashboardCache(cacheKey: string, data: DashboardData) {
  const savedAt = Date.now();
  dashboardMemoryCache.set(cacheKey, { savedAt, data });

  try {
    await mkdir(dashboardCacheDir, { recursive: true });
    await writeFile(dashboardCachePath(cacheKey), JSON.stringify({ version: DASHBOARD_CACHE_VERSION, savedAt, data } satisfies StoredDashboardCache), "utf8");
  } catch (error) {
    console.warn("Could not write dashboard cache", error instanceof Error ? error.message : error);
  }
}

export async function clearDashboardDataCache() {
  dashboardMemoryCache.clear();
  dashboardRefreshes.clear();

  try {
    await rm(dashboardCacheDir, { recursive: true, force: true });
  } catch (error) {
    console.warn("Could not clear dashboard cache", error instanceof Error ? error.message : error);
  }
}

function errorMessage(label: string, error: SupabaseError) {
  const code = error.code ? `${error.code}: ` : "";
  const details = error.details ? ` ${error.details}` : "";
  return `${label}: ${code}${error.message}${details}`;
}

async function fetchPaged<T>(label: string, buildQuery: (from: number, to: number) => SupabasePage<T>) {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await buildQuery(from, to);

    if (error) {
      throw new Error(errorMessage(label, error));
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) {
      return rows;
    }
  }
}

function mapTask(task: TaskRow): Task {
  return {
    id: task.id,
    title: task.title,
    dueDate: task.due_date,
    status: task.status,
    companyId: task.company_id,
    personId: task.person_id,
  };
}

function mapCompanyEnrichment(row: CompanyEnrichmentRow): CompanyEnrichment {
  return {
    companyId: row.company_id,
    status: row.status,
    summary: row.summary,
    industry: row.industry,
    subsector: row.subsector,
    companyType: row.company_type,
    location: row.location,
    keywords: row.keywords ?? [],
    sourceUrl: row.source_url,
    model: row.model,
    confidence: row.confidence,
    errorMessage: row.error_message,
    generatedAt: row.generated_at,
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
  };
}

function accountingAccessFromRole(role: AccountingRole | null): AccountingAccess {
  return {
    canView: Boolean(role),
    canEdit: role === "editor" || role === "admin",
    canAdmin: role === "admin",
    role,
  };
}

function isMissingAccountingTable(error: SupabaseError) {
  return error.code === "42P01" || error.code === "PGRST205";
}

function mapAccountingDocument(row: AccountingDocumentRow): AccountingDocument {
  return {
    id: row.id,
    companyId: row.company_id,
    documentType: row.document_type,
    status: row.status,
    title: row.title,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    externalReference: row.external_reference,
    documentUrl: row.document_url,
    notes: row.notes,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAccountingLedgerEntry(row: AccountingLedgerEntryRow): AccountingLedgerEntry {
  return {
    id: row.id,
    documentId: row.document_id,
    companyId: row.company_id,
    entryType: row.entry_type,
    direction: row.direction,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    occurredOn: row.occurred_on,
    externalReference: row.external_reference,
    documentUrl: row.document_url,
    notes: row.notes,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    voidedAt: row.voided_at,
    voidedBy: row.voided_by,
    voidReason: row.void_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadAccountingForUser(supabase: SupabaseServerClient, organizationId: string, userId: string): Promise<{ access: AccountingAccess; accounting: AccountingData | null }> {
  const memberResult = await supabase
    .from("accounting_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (memberResult.error) {
    if (!isMissingAccountingTable(memberResult.error)) {
      console.warn("Could not load accounting access", memberResult.error.message);
    }
    return { access: NO_ACCOUNTING_ACCESS, accounting: null };
  }

  const role = (memberResult.data as AccountingMemberRow | null)?.role ?? null;
  const access = accountingAccessFromRole(role);
  if (!access.canView) return { access, accounting: null };

  try {
    const [documentRows, ledgerRows] = await Promise.all([
      fetchPaged<AccountingDocumentRow>("accounting documents", (from, to) =>
        supabase
          .from("accounting_documents")
          .select("id,company_id,document_type,status,title,amount_minor,currency,issued_on,due_on,external_reference,document_url,notes,created_by,updated_by,voided_at,voided_by,void_reason,created_at,updated_at")
          .eq("organization_id", organizationId)
          .order("issued_on", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      fetchPaged<AccountingLedgerEntryRow>("accounting ledger entries", (from, to) =>
        supabase
          .from("accounting_ledger_entries")
          .select("id,document_id,company_id,entry_type,direction,amount_minor,currency,occurred_on,external_reference,document_url,notes,created_by,updated_by,voided_at,voided_by,void_reason,created_at,updated_at")
          .eq("organization_id", organizationId)
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
    ]);

    const documents = documentRows.map(mapAccountingDocument);
    const ledgerEntries = ledgerRows.map(mapAccountingLedgerEntry);
    return {
      access,
      accounting: {
        documents,
        ledgerEntries,
        summaries: buildAccountingSummaries(documents, ledgerEntries),
      },
    };
  } catch (error) {
    console.warn("Could not load accounting data", error instanceof Error ? error.message : error);
    return { access, accounting: { documents: [], ledgerEntries: [], summaries: [] } };
  }
}

function buildInvestmentRelationships(rows: DashboardRows) {
  const dealsByRelationship = new Map<string, InvestmentDeal[]>();

  rows.investmentDealParticipantRows.forEach((row) => {
    const deal = singleRelation(row.investment_deals);
    if (!deal) return;
    addToGroup(dealsByRelationship, row.relationship_id, {
      id: deal.id,
      name: deal.name,
      status: deal.status,
      investedAt: deal.invested_at,
      notes: row.notes ?? deal.notes,
      role: row.role,
    });
  });

  return rows.investmentRelationshipRows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    personId: row.person_id,
    investmentStatus: row.investment_status,
    capacityStatus: row.capacity_status,
    notes: row.notes,
    lastInvestedDate: row.last_invested_date,
    deals: (dealsByRelationship.get(row.id) ?? []).sort((left, right) => (right.investedAt ?? "").localeCompare(left.investedAt ?? "")),
  } satisfies InvestmentRelationship));
}

function addToGroup<TKey, TValue>(groups: Map<TKey, TValue[]>, key: TKey, value: TValue) {
  const current = groups.get(key);
  if (current) current.push(value);
  else groups.set(key, [value]);
}

function singleRelation<T>(value: T | T[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function normalizeUrlKey(value: string | null | undefined) {
  if (!value) return "";
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function personSourceIds(person: Person) {
  return [...new Set(Array.isArray(person.sourcePersonIds) && person.sourcePersonIds.length > 0 ? person.sourcePersonIds : [person.id])];
}

function uniqueInvestmentRelationships(relationships: InvestmentRelationship[]) {
  return relationships.filter((relationship, index) => relationships.findIndex((item) => item.id === relationship.id) === index);
}

function groupPeople(people: Person[]): Person[] {
  const grouped = new Map<string, Person>();

  for (const person of people) {
    const key = normalizeUrlKey(person.linkedinUrl) || `${normalizePersonName(person.displayName)}:${(person.jobTitle ?? "").trim().toLowerCase()}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...person,
        sourcePersonIds: personSourceIds(person),
        emails: [...new Set(person.emails)],
        investmentRelationships: uniqueInvestmentRelationships(person.investmentRelationships),
      });
      continue;
    }

    const emails = [...new Set([...existing.emails, ...person.emails])];
    existing.emails = emails;
    existing.email = existing.email ?? person.email ?? emails[0] ?? null;
    if (!existing.linkedinUrl && person.linkedinUrl) existing.linkedinUrl = person.linkedinUrl;
    if (!existing.jobTitle && person.jobTitle) existing.jobTitle = person.jobTitle;
    if (!existing.country && person.country) existing.country = person.country;
    if (!existing.phone && person.phone) existing.phone = person.phone;
    if (!existing.connectionStrength && person.connectionStrength) existing.connectionStrength = person.connectionStrength;
    existing.categories = [...new Set([...existing.categories, ...person.categories])];
    existing.sourcePersonIds = [...new Set([...personSourceIds(existing), ...personSourceIds(person)])];
    existing.highlighted ||= person.highlighted;
    existing.investmentRelationships = uniqueInvestmentRelationships([...existing.investmentRelationships, ...person.investmentRelationships]);
  }

  return [...grouped.values()];
}

function buildCompanies(rows: DashboardRows): Company[] {
  const outreachByCompany = new Map(rows.outreachRows.map((row) => [row.company_id, row]));
  const enrichmentByCompany = new Map(rows.enrichmentRows.map((row) => [row.company_id, mapCompanyEnrichment(row)]));
  const investmentRelationships = buildInvestmentRelationships(rows);
  const investmentsByCompany = new Map<string, InvestmentRelationship[]>();
  const investmentsByPerson = new Map<string, InvestmentRelationship[]>();
  const tagsByCompany = new Map<string, Tag[]>();
  const peopleByCompany = new Map<string, CompanyPersonRow[]>();
  const emailsByPerson = new Map<string, PersonEmailRow[]>();
  const activitiesByCompany = new Map<string, Activity[]>();
  const tasksByCompany = new Map<string, TaskRow[]>();

  rows.companyTagRows.forEach((row) => {
    const tag = singleRelation(row.tags);
    if (tag) addToGroup(tagsByCompany, row.company_id, tag);
  });

  rows.companyPersonRows.forEach((row) => {
    addToGroup(peopleByCompany, row.company_id, row);
  });

  rows.personEmailRows.forEach((row) => {
    addToGroup(emailsByPerson, row.person_id, row);
  });

  rows.activityRows.forEach((row) => {
    if (!row.company_id) return;
    addToGroup(activitiesByCompany, row.company_id, {
      id: row.id,
      type: row.activity_type,
      summary: row.summary,
      occurredAt: row.occurred_at,
    });
  });

  rows.taskRows.forEach((row) => {
    addToGroup(tasksByCompany, row.company_id, row);
  });

  investmentRelationships.forEach((relationship) => {
    if (relationship.companyId) addToGroup(investmentsByCompany, relationship.companyId, relationship);
    if (relationship.personId) addToGroup(investmentsByPerson, relationship.personId, relationship);
  });

  return rows.companyRows.map((row) => {
    const opportunity = outreachByCompany.get(row.id);
    const activities = activitiesByCompany.get(row.id) ?? [];
    const task = tasksByCompany.get(row.id)?.[0] ?? null;
    const tags = tagsByCompany.get(row.id) ?? [];
    const companyTagNames = tags.map((tag) => tag.name);
    const websiteDomains = normalizeCompanyWebsites(row.website_domain);
    const people = groupPeople(
      peopleByCompany
        .get(row.id)
        ?.map((item) => {
          const person = singleRelation(item.people);
          if (!person) return null;
          const emailRows = [...(emailsByPerson.get(person.id) ?? [])].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
          const emails = emailRows.map((email) => email.email);

          return {
            id: person.id,
            sourcePersonIds: [person.id],
            displayName: person.display_name,
            firstName: person.first_name ?? null,
            lastName: person.last_name ?? null,
            email: emails[0] ?? null,
            emails,
            phone: person.phone_numbers,
            linkedinUrl: person.linkedin_url,
            jobTitle: item.role_title ?? person.job_title,
            country: person.country,
            categories: [...new Set([...(person.categories ?? []), ...companyTagNames])],
            connectionStrength: item.relationship_strength,
            highlighted: item.is_highlighted,
            investmentRelationships: investmentsByPerson.get(person.id) ?? [],
          };
        })
        .filter(isPresent) ?? [],
    );

    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      websiteDomain: websiteDomains[0] ?? null,
      websiteDomains,
      description: row.description,
      country: row.country,
      categories: row.categories ?? [],
      status: row.status,
      ownerName: opportunity?.owner_id ? "Assigned" : null,
      sourceQuality: row.source_quality,
      outreachStage: opportunity?.stage ?? "Research",
      tags,
      people,
      activities,
      nextTask: task ? mapTask(task) : null,
      lastActivityAt: activities[0]?.occurredAt ?? null,
      mergeConfidence: row.merge_confidence,
      enrichment: enrichmentByCompany.get(row.id) ?? null,
      investmentRelationships: investmentsByCompany.get(row.id) ?? [],
    };
  });
}

async function loadDashboardRows(supabase: SupabaseServerClient, organizationId: string): Promise<DashboardRows> {
  const [
    companyRows,
    outreachRows,
    companyTagRows,
    companyPersonRows,
    personEmailRows,
    activityRows,
    taskRows,
    enrichmentRows,
    investmentRelationshipRows,
    investmentDealParticipantRows,
    tagResult,
    importResult,
  ] = await Promise.all([
    fetchPaged<CompanyRow>("companies", (from, to) =>
      supabase
        .from("companies")
        .select("id,name,normalized_name,website_domain,description,country,categories,status,source_quality,owner_id,merge_confidence")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .range(from, to),
    ),
    fetchPaged<OutreachRow>("outreach", (from, to) =>
      supabase
        .from("outreach_opportunities")
        .select("company_id,stage,owner_id")
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: false })
        .range(from, to),
    ),
    fetchPaged<CompanyTagRow>("company tags", (from, to) =>
      supabase.from("company_tags").select("company_id,tags(id,name,color)").eq("organization_id", organizationId).range(from, to),
    ),
    fetchPaged<CompanyPersonRow>("company people", (from, to) =>
      supabase
        .from("company_people")
        .select("company_id,is_highlighted,role_title,relationship_strength,people(id,display_name,linkedin_url,job_title,phone_numbers,country,categories)")
        .eq("organization_id", organizationId)
        .range(from, to),
    ),
    fetchPaged<PersonEmailRow>("person emails", (from, to) =>
      supabase
        .from("person_emails")
        .select("person_id,email,is_primary")
        .eq("organization_id", organizationId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .range(from, to),
    ),
    fetchPaged<ActivityRow>("activities", (from, to) =>
      supabase
        .from("activities")
        .select("id,company_id,activity_type,summary,occurred_at")
        .eq("organization_id", organizationId)
        .order("occurred_at", { ascending: false })
        .range(from, to),
    ),
    fetchPaged<TaskRow>("tasks", (from, to) =>
      supabase
        .from("tasks")
        .select("id,title,due_date,status,company_id,person_id")
        .eq("organization_id", organizationId)
        .eq("status", "open")
        .order("due_date")
        .range(from, to),
    ),
    fetchPaged<CompanyEnrichmentRow>("company enrichments", (from, to) =>
      supabase
        .from("company_enrichments")
        .select("company_id,status,summary,industry,subsector,company_type,location,keywords,source_url,model,confidence,error_message,generated_at,reviewed_at,updated_at")
        .eq("organization_id", organizationId)
        .range(from, to),
    ),
    fetchPaged<InvestmentRelationshipRow>("investment relationships", (from, to) =>
      supabase
        .from("investment_relationships")
        .select("id,company_id,person_id,investment_status,capacity_status,notes,last_invested_date")
        .eq("organization_id", organizationId)
        .range(from, to),
    ),
    fetchPaged<InvestmentDealParticipantRow>("investment deal participants", (from, to) =>
      supabase
        .from("investment_deal_participants")
        .select("relationship_id,role,notes,investment_deals(id,name,status,invested_at,notes)")
        .eq("organization_id", organizationId)
        .range(from, to),
    ),
    supabase.from("tags").select("id,name,color").eq("organization_id", organizationId).order("name"),
    supabase.from("import_batches").select("row_count,stats,completed_at,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(1),
  ]);

  if (tagResult.error) {
    throw new Error(errorMessage("tags", tagResult.error));
  }

  if (importResult.error) {
    throw new Error(errorMessage("import batch", importResult.error));
  }

  const latestImport = importResult.data?.[0];

  return {
    companyRows,
    outreachRows,
    companyTagRows,
    companyPersonRows,
    personEmailRows,
    activityRows,
    taskRows,
    tags: (tagResult.data ?? []) as Tag[],
    enrichmentRows,
    investmentRelationshipRows,
    investmentDealParticipantRows,
    importStats: latestImport?.stats as Partial<ImportSummary> | undefined,
    importRowCount: latestImport?.row_count,
    importDate: latestImport?.completed_at ?? latestImport?.created_at ?? null,
  };
}

async function fetchDashboardDataFromSupabase({
  supabase,
  organizationId,
  userId,
  currentUserName,
}: {
  supabase: SupabaseServerClient;
  organizationId: string;
  userId: string;
  currentUserName: string;
}): Promise<DashboardData> {
  const [rows, accountingResult] = await Promise.all([loadDashboardRows(supabase, organizationId), loadAccountingForUser(supabase, organizationId, userId)]);
  const importStats = rows.importStats;

  return {
    currentUserName,
    authMode: "supabase",
    dataMode: "supabase",
    localEnrichmentEnabled: localEnrichmentEnabled(),
    companies: buildCompanies(rows),
    tags: rows.tags,
    tasks: rows.taskRows.map(mapTask),
    accountingAccess: accountingResult.access,
    accounting: accountingResult.accounting,
    importSummary: {
      totalRows: rows.importRowCount ?? importStats?.totalRows ?? 0,
      rawRows: importStats?.rawRows ?? 0,
      normalizedCompanies: importStats?.normalizedCompanies ?? 0,
      normalizedPeople: importStats?.normalizedPeople ?? 0,
      suspiciousMerges: importStats?.suspiciousMerges ?? 0,
      unmatchedRows: importStats?.unmatchedRows ?? 0,
      lastImportedAt: rows.importDate,
    },
  };
}

function refreshDashboardCacheInBackground({
  cacheKey,
  supabase,
  organizationId,
  userId,
  currentUserName,
}: {
  cacheKey: string;
  supabase: SupabaseServerClient;
  organizationId: string;
  userId: string;
  currentUserName: string;
}) {
  if (dashboardRefreshes.has(cacheKey)) return;
  dashboardRefreshes.add(cacheKey);

  void fetchDashboardDataFromSupabase({ supabase, organizationId, userId, currentUserName })
    .then((data) => writeDashboardCache(cacheKey, data))
    .catch((error) => {
      console.warn("Could not refresh dashboard cache", error instanceof Error ? error.message : error);
    })
    .finally(() => {
      dashboardRefreshes.delete(cacheKey);
    });
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!hasSupabaseBrowserConfig()) {
    return { ...mockDashboardData, localEnrichmentEnabled: localEnrichmentEnabled() };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ...mockDashboardData, localEnrichmentEnabled: localEnrichmentEnabled() };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;

  if (!user) {
    return {
      ...mockDashboardData,
      authMode: "supabase",
      dataMode: "demo",
      localEnrichmentEnabled: localEnrichmentEnabled(),
      currentUserName: "Not signed in",
      dataWarning: "Sign in to load Supabase contacts.",
    };
  }

  if (!organizationId) {
    return {
      ...mockDashboardData,
      authMode: "supabase",
      dataMode: "demo",
      localEnrichmentEnabled: localEnrichmentEnabled(),
      accountingAccess: NO_ACCOUNTING_ACCESS,
      accounting: null,
      currentUserName: user.email ?? "Signed in",
      dataWarning: "Add NEXT_PUBLIC_DEFAULT_ORG_ID to load Supabase contacts.",
    };
  }

  const currentUserName = user.email ?? "Signed in";
  const cacheKey = dashboardCacheKey(organizationId, user.id);
  const cached = await readDashboardCache(cacheKey);

  if (cached) {
    const isFresh = Date.now() - cached.savedAt < DASHBOARD_CACHE_REVALIDATE_MS;
    if (!isFresh) {
      refreshDashboardCacheInBackground({ cacheKey, supabase, organizationId, userId: user.id, currentUserName });
    }

    return {
      ...cached.data,
      currentUserName,
      localEnrichmentEnabled: localEnrichmentEnabled(),
      dataWarning: cached.data.dataWarning,
    };
  }

  try {
    const data = await fetchDashboardDataFromSupabase({ supabase, organizationId, userId: user.id, currentUserName });
    await writeDashboardCache(cacheKey, data);
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Supabase error";
    console.error("Could not load Supabase contacts", message);

    return {
      ...mockDashboardData,
      authMode: "supabase",
      dataMode: "demo",
      localEnrichmentEnabled: localEnrichmentEnabled(),
      accountingAccess: NO_ACCOUNTING_ACCESS,
      accounting: null,
      currentUserName: user.email ?? "Signed in",
      dataWarning: `Could not load Supabase contacts: ${message}`,
    };
  }
}
