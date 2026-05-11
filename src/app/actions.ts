"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { serializeCompanyWebsites } from "@/lib/company-websites";
import { clearDashboardDataCache } from "@/lib/data";
import { applyCompanyEnrichmentTags } from "@/lib/enrichment/company-tags";
import { normalizeCompanyName, normalizePersonName } from "@/lib/import/normalization";
import { buildPersonEmailUpdateRows, normalizePersonCategories } from "@/lib/person-update";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";
import type { AccountingDocument, AccountingLedgerEntry, AccountingRole, InvestmentDealStatus } from "@/lib/types";
import {
  activitySchema,
  accountingDeleteSchema,
  accountingDocumentSchema,
  accountingLedgerEntrySchema,
  accountingVoidSchema,
  companyEnrichmentUpdateSchema,
  companyUpdateSchema,
  investmentDealStatusUpdateSchema,
  highlightSchema,
  investmentDealSchema,
  investmentRelationshipSchema,
  mergeCompaniesSchema,
  mergePeopleSchema,
  noteSchema,
  peopleUpdateSchema,
  personUpdateSchema,
  stageSchema,
  tagRenameSchema,
  tagSchema,
  taskSchema,
} from "@/lib/validation";

type ActionResult = {
  ok: boolean;
  message: string;
};
type AccountingDocumentActionResult = ActionResult & {
  document?: AccountingDocument;
};
type AccountingLedgerEntryActionResult = ActionResult & {
  entry?: AccountingLedgerEntry;
};
type AccountingVoidActionResult = ActionResult & {
  document?: AccountingDocument;
  entry?: AccountingLedgerEntry;
};
type AccountingDeleteActionResult = ActionResult & {
  deletedId?: string;
  entityType?: "document" | "ledger_entry";
};
type PersonUpdateInput = {
  organizationId: string;
  personId: string;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  emails: string[];
  jobTitle?: string | null;
  linkedinUrl?: string | null;
  phone?: string | null;
  country?: string | null;
  categories: string[];
  syncEmails?: boolean;
};
type SupabaseAdminClient = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;
type PersonCategoryRow = {
  id: string;
  display_name: string;
  categories: string[] | null;
};
type ExistingPersonRow = {
  id: string;
  source_record_id: string;
};
type SupabaseQueryError = {
  message: string;
};
type SupabaseQueryResponse<T> = {
  data: T | null;
  error: SupabaseQueryError | null;
};
type SupabaseServerClient = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
type CompanyMergeCompanyRow = {
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
type SupabaseWriteClient = SupabaseAdminClient | SupabaseServerClient;
type CompanyMergePeopleRow = {
  company_id: string;
  person_id: string;
  role_title: string | null;
  relationship_strength: string | null;
  is_highlighted: boolean;
};
type CompanyMergeTagRow = {
  company_id: string;
  tag_id: string;
};
type CompanyMergeOutreachRow = {
  id: string;
  company_id: string;
  stage: string;
  status: string;
  owner_id: string | null;
  next_step: string | null;
};
type InvestmentDealStatusRow = {
  name: string;
  status: InvestmentDealStatus;
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
type AccountingLinkedDocumentRow = {
  id: string;
  company_id: string | null;
  currency: string;
  status: AccountingDocument["status"];
  voided_at: string | null;
};

const WRITE_CHUNK_SIZE = 500;
const PERSON_UPDATE_CONCURRENCY = 25;
const SOURCE_QUALITY_RANK: Record<CompanyMergeCompanyRow["source_quality"], number> = {
  review: 0,
  low: 1,
  medium: 2,
  high: 3,
};
const INVESTMENT_DEAL_STATUS_LABELS: Record<InvestmentDealStatus, string> = {
  prospective: "Prospective",
  active: "Active",
  closed: "Closed",
  passed: "Passed",
};
const ACCOUNTING_DOCUMENT_COLUMNS =
  "id,company_id,document_type,status,title,amount_minor,currency,issued_on,due_on,external_reference,document_url,notes,created_by,updated_by,voided_at,voided_by,void_reason,created_at,updated_at";
const ACCOUNTING_LEDGER_COLUMNS =
  "id,document_id,company_id,entry_type,direction,amount_minor,currency,occurred_on,external_reference,document_url,notes,created_by,updated_by,voided_at,voided_by,void_reason,created_at,updated_at";

function unavailable(): ActionResult {
  return {
    ok: false,
    message: "Supabase is not configured yet. Add environment variables from .env.example to persist changes.",
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
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

async function createSupabaseWriteClient(): Promise<SupabaseWriteClient | null> {
  const adminClient = createSupabaseAdminClient();
  if (adminClient) return adminClient;
  return createSupabaseServerClient();
}

async function runSupabaseQuery<T>(label: string, query: () => PromiseLike<T>, attempts = 3): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await query();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(150 * attempt);
        continue;
      }
    }
  }

  throw new Error(`${label}: ${formatUnknownError(lastError)}`);
}

async function revalidateDashboard() {
  await clearDashboardDataCache();
  revalidatePath("/");
  revalidatePath("/companies");
  revalidatePath("/companies/[id]", "page");
}

async function requireAccountingEditor(supabase: SupabaseServerClient, organizationId: string): Promise<{ ok: true; userId: string; role: AccountingRole } | { ok: false; result: ActionResult }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, result: { ok: false, message: "Sign in with a finance-enabled account before changing accounting data." } };
  }

  const { data, error } = await supabase
    .from("accounting_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { ok: false, result: { ok: false, message: error.message } };

  const role = (data as AccountingMemberRow | null)?.role;
  if (role !== "editor" && role !== "admin") {
    return { ok: false, result: { ok: false, message: "Your finance access is read-only." } };
  }

  return { ok: true, userId: user.id, role };
}

async function ensureAccountingCompany(supabase: SupabaseServerClient, organizationId: string, companyId: string | null | undefined) {
  if (!companyId) return null;

  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", companyId)
    .maybeSingle();

  if (error) return error.message;
  if (!data) return "Could not find this company in the selected organization.";
  return null;
}

async function insertAccountingAuditEvent({
  supabase,
  organizationId,
  userId,
  action,
  entityType,
  entityId,
  beforeData,
  afterData,
}: {
  supabase: SupabaseServerClient;
  organizationId: string;
  userId: string;
  action: "create" | "update" | "void" | "delete";
  entityType: "document" | "ledger_entry";
  entityId: string;
  beforeData: unknown;
  afterData: unknown;
}) {
  const { error } = await supabase.from("accounting_audit_events").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before_data: beforeData ?? null,
    after_data: afterData ?? null,
  });

  return error;
}

export async function refreshDashboardAction(): Promise<ActionResult> {
  await revalidateDashboard();
  return { ok: true, message: "Dashboard cache refreshed." };
}

function chunks<T>(items: T[], size = WRITE_CHUNK_SIZE) {
  const grouped: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    grouped.push(items.slice(index, index + size));
  }
  return grouped;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function bestSourceQuality(companies: CompanyMergeCompanyRow[]) {
  return companies.reduce<CompanyMergeCompanyRow["source_quality"]>(
    (best, company) => (SOURCE_QUALITY_RANK[company.source_quality] > SOURCE_QUALITY_RANK[best] ? company.source_quality : best),
    "review",
  );
}

function firstPresent<T>(values: Array<T | null | undefined>) {
  return values.find((value): value is T => value != null && value !== "");
}

function uniqueNormalizedValues(values: string[]) {
  return normalizePersonCategories(values);
}

async function applyCompanyTagToMembers({
  supabase,
  organizationId,
  companyIds,
  tagName,
  previousTagName,
}: {
  supabase: SupabaseAdminClient;
  organizationId: string;
  companyIds: string[];
  tagName: string;
  previousTagName?: string;
}) {
  if (companyIds.length === 0) return null;

  const personIds = new Set<string>();
  for (const companyIdGroup of chunks(companyIds)) {
    const { data, error } = await supabase
      .from("company_people")
      .select("person_id")
      .eq("organization_id", organizationId)
      .in("company_id", companyIdGroup);

    if (error) return error;
    data?.forEach((row) => personIds.add(row.person_id));
  }

  if (personIds.size === 0) return null;

  const people: PersonCategoryRow[] = [];
  for (const personIdGroup of chunks([...personIds])) {
    const { data, error } = await supabase
      .from("people")
      .select("id,display_name,categories")
      .eq("organization_id", organizationId)
      .in("id", personIdGroup);

    if (error) return error;
    people.push(...((data ?? []) as PersonCategoryRow[]));
  }

  const updates = people
    .map((person) => {
      const currentCategories = person.categories ?? [];
      const renamedCategories = previousTagName
        ? currentCategories.map((category) => (category === previousTagName ? tagName : category))
        : currentCategories;
      const categories = normalizePersonCategories([...renamedCategories, tagName]);
      return arraysEqual(currentCategories, categories) ? null : { id: person.id, categories };
    })
    .filter((person): person is { id: string; categories: string[] } => Boolean(person));

  for (const group of chunks(updates, PERSON_UPDATE_CONCURRENCY)) {
    const results = await Promise.all(
      group.map((person) =>
        supabase
          .from("people")
          .update({ categories: person.categories, updated_at: new Date().toISOString() })
          .eq("organization_id", organizationId)
          .eq("id", person.id),
      ),
    );

    const firstError = results.find((result) => result.error)?.error;
    if (firstError) return firstError;
  }

  return null;
}

async function updatePeopleInSupabase(updates: PersonUpdateInput[]): Promise<ActionResult> {
  const supabase = await createSupabaseWriteClient();
  if (!supabase) return unavailable();

  try {
    const organizationId = updates[0]?.organizationId;
    if (!organizationId || updates.some((update) => update.organizationId !== organizationId)) {
      return { ok: false, message: "Contact updates must belong to one organization." };
    }

    const dedupedUpdates = [...new Map(updates.map((update) => [update.personId, update])).values()];
    const personIds = dedupedUpdates.map((update) => update.personId);
    const emailUpdates = dedupedUpdates.filter((update) => update.syncEmails !== false);
    const emailOwners = new Map<string, string>();

    for (const update of emailUpdates) {
      for (const email of update.emails) {
        const existingOwner = emailOwners.get(email);
        if (existingOwner && existingOwner !== update.personId) {
          return { ok: false, message: `Email appears on more than one queued contact: ${email}.` };
        }
        emailOwners.set(email, update.personId);
      }
    }

    for (const emailGroup of chunks([...emailOwners.keys()])) {
      const { data: conflicts, error } = await runSupabaseQuery<SupabaseQueryResponse<Array<{ email: string; person_id: string }>>>("checking email ownership", () =>
        supabase
          .from("person_emails")
          .select("email,person_id")
          .eq("organization_id", organizationId)
          .in("email", emailGroup),
      );

      if (error) return { ok: false, message: error.message };

      const conflictingEmails = (conflicts ?? [])
        .filter((row) => row.person_id !== emailOwners.get(row.email))
        .map((row) => row.email);

      if (conflictingEmails.length > 0) {
        return { ok: false, message: `Email already belongs to another contact: ${conflictingEmails.join(", ")}.` };
      }
    }

    const existingPeople = new Map<string, ExistingPersonRow>();
    for (const personIdGroup of chunks(personIds)) {
      const { data, error } = await runSupabaseQuery<SupabaseQueryResponse<ExistingPersonRow[]>>("loading contacts for bulk update", () =>
        supabase
          .from("people")
          .select("id,source_record_id")
          .eq("organization_id", organizationId)
          .in("id", personIdGroup),
      );

      if (error) return { ok: false, message: error.message };
      ((data ?? []) as ExistingPersonRow[]).forEach((row) => existingPeople.set(row.id, row));
    }

    const missingPersonIds = personIds.filter((personId) => !existingPeople.has(personId));
    if (missingPersonIds.length > 0) {
      return { ok: false, message: `Could not find ${missingPersonIds.length} queued contact${missingPersonIds.length === 1 ? "" : "s"} in the selected organization.` };
    }

    const currentEmailRows: Array<{ person_id: string; email: string }> = [];
    for (const personIdGroup of chunks(emailUpdates.map((update) => update.personId))) {
      const { data, error } = await runSupabaseQuery<SupabaseQueryResponse<Array<{ person_id: string; email: string }>>>("loading current contact emails", () =>
        supabase
          .from("person_emails")
          .select("person_id,email")
          .eq("organization_id", organizationId)
          .in("person_id", personIdGroup),
      );

      if (error) return { ok: false, message: error.message };
      currentEmailRows.push(...(data ?? []));
    }

    const now = new Date();
    const peopleRows = dedupedUpdates.map((update) => {
      const existingPerson = existingPeople.get(update.personId);
      if (!existingPerson) return null;

      return {
        id: update.personId,
        organization_id: organizationId,
        source_record_id: existingPerson.source_record_id,
        display_name: update.displayName,
        normalized_name: normalizePersonName(update.displayName),
        first_name: update.firstName ?? null,
        last_name: update.lastName ?? null,
        ...(update.jobTitle !== undefined ? { job_title: update.jobTitle } : {}),
        ...(update.linkedinUrl !== undefined ? { linkedin_url: update.linkedinUrl } : {}),
        ...(update.phone !== undefined ? { phone_numbers: update.phone } : {}),
        ...(update.country !== undefined ? { country: update.country } : {}),
        categories: update.categories,
        updated_at: now.toISOString(),
      };
    });

    for (const peopleRowGroup of chunks(peopleRows.filter(Boolean) as NonNullable<(typeof peopleRows)[number]>[])) {
      const { error } = await runSupabaseQuery<SupabaseQueryResponse<null>>("writing contact updates", () =>
        supabase.from("people").upsert(peopleRowGroup, { onConflict: "id" }),
      );
      if (error) return { ok: false, message: error.message };
    }

    const emailRows = emailUpdates.flatMap((update) =>
      buildPersonEmailUpdateRows({ organizationId, personId: update.personId, emails: update.emails, now }),
    );

    for (const emailRowGroup of chunks(emailRows)) {
      const { error } = await runSupabaseQuery<SupabaseQueryResponse<null>>("writing contact emails", () =>
        supabase.from("person_emails").upsert(emailRowGroup, { onConflict: "organization_id,email" }),
      );
      if (error) return { ok: false, message: error.message };
    }

    const nextEmailsByPersonId = new Map(emailUpdates.map((update) => [update.personId, new Set(update.emails)]));
    const removedEmails = currentEmailRows
      .filter((row) => !nextEmailsByPersonId.get(row.person_id)?.has(row.email))
      .map((row) => row.email);

    for (const removedEmailGroup of chunks(removedEmails)) {
      const { error } = await runSupabaseQuery<SupabaseQueryResponse<null>>("removing outdated contact emails", () =>
        supabase
          .from("person_emails")
          .delete()
          .eq("organization_id", organizationId)
          .in("email", removedEmailGroup),
      );

      if (error) return { ok: false, message: error.message };
    }

    await revalidateDashboard();
    return { ok: true, message: `Updated ${dedupedUpdates.length} contact${dedupedUpdates.length === 1 ? "" : "s"}.` };
  } catch (error) {
    return { ok: false, message: formatUnknownError(error) };
  }
}

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    redirect("/login?error=auth_unavailable");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function saveAccountingDocumentAction(input: unknown): Promise<AccountingDocumentActionResult> {
  const parsed = accountingDocumentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid accounting document." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const access = await requireAccountingEditor(supabase, parsed.data.organizationId);
  if (!access.ok) return access.result;
  if (parsed.data.status === "void") return { ok: false, message: "Use the void action for accounting documents." };

  const companyError = await ensureAccountingCompany(supabase, parsed.data.organizationId, parsed.data.companyId);
  if (companyError) return { ok: false, message: companyError };

  const row = {
    organization_id: parsed.data.organizationId,
    company_id: parsed.data.companyId ?? null,
    document_type: parsed.data.documentType,
    status: parsed.data.status,
    title: parsed.data.title,
    amount_minor: parsed.data.amountMinor,
    currency: parsed.data.currency,
    issued_on: parsed.data.issuedOn ?? null,
    due_on: parsed.data.dueOn ?? null,
    external_reference: parsed.data.externalReference ?? null,
    document_url: parsed.data.documentUrl ?? null,
    notes: parsed.data.notes ?? null,
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.documentId) {
    const { data: existing, error: existingError } = await supabase
      .from("accounting_documents")
      .select(ACCOUNTING_DOCUMENT_COLUMNS)
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.documentId)
      .maybeSingle();

    if (existingError) return { ok: false, message: existingError.message };
    if (!existing) return { ok: false, message: "Could not find this accounting document." };

    const existingRow = existing as AccountingDocumentRow;
    if (existingRow.status === "void" || existingRow.voided_at) return { ok: false, message: "Voided accounting documents cannot be edited." };

    const { data: updated, error: updateError } = await supabase
      .from("accounting_documents")
      .update(row)
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.documentId)
      .select(ACCOUNTING_DOCUMENT_COLUMNS)
      .single();

    if (updateError) return { ok: false, message: updateError.message };

    const auditError = await insertAccountingAuditEvent({
      supabase,
      organizationId: parsed.data.organizationId,
      userId: access.userId,
      action: "update",
      entityType: "document",
      entityId: parsed.data.documentId,
      beforeData: existingRow,
      afterData: updated,
    });
    if (auditError) return { ok: false, message: auditError.message };

    await revalidateDashboard();
    return { ok: true, message: "Accounting document saved.", document: mapAccountingDocument(updated as AccountingDocumentRow) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("accounting_documents")
    .insert({
      ...row,
      created_by: access.userId,
    })
    .select(ACCOUNTING_DOCUMENT_COLUMNS)
    .single();

  if (insertError) return { ok: false, message: insertError.message };

  const insertedRow = inserted as AccountingDocumentRow;
  const auditError = await insertAccountingAuditEvent({
    supabase,
    organizationId: parsed.data.organizationId,
    userId: access.userId,
    action: "create",
    entityType: "document",
    entityId: insertedRow.id,
    beforeData: null,
    afterData: insertedRow,
  });
  if (auditError) return { ok: false, message: auditError.message };

  await revalidateDashboard();
  return { ok: true, message: "Accounting document created.", document: mapAccountingDocument(insertedRow) };
}

export async function saveAccountingLedgerEntryAction(input: unknown): Promise<AccountingLedgerEntryActionResult> {
  const parsed = accountingLedgerEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid accounting ledger entry." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const access = await requireAccountingEditor(supabase, parsed.data.organizationId);
  if (!access.ok) return access.result;

  let linkedDocument: AccountingLinkedDocumentRow | null = null;
  if (parsed.data.documentId) {
    const { data, error } = await supabase
      .from("accounting_documents")
      .select("id,company_id,currency,status,voided_at")
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.documentId)
      .maybeSingle();

    if (error) return { ok: false, message: error.message };
    if (!data) return { ok: false, message: "Could not find the linked accounting document." };

    linkedDocument = data as AccountingLinkedDocumentRow;
    if (linkedDocument.status === "void" || linkedDocument.voided_at) return { ok: false, message: "Cannot link payments to a voided document." };
    if (linkedDocument.currency !== parsed.data.currency) return { ok: false, message: "Ledger entry currency must match the linked document." };
    if (linkedDocument.company_id && parsed.data.companyId && linkedDocument.company_id !== parsed.data.companyId) {
      return { ok: false, message: "Ledger entry company must match the linked document." };
    }
  }

  const companyId = parsed.data.companyId ?? linkedDocument?.company_id ?? null;
  const companyError = await ensureAccountingCompany(supabase, parsed.data.organizationId, companyId);
  if (companyError) return { ok: false, message: companyError };

  const row = {
    organization_id: parsed.data.organizationId,
    document_id: parsed.data.documentId ?? null,
    company_id: companyId,
    entry_type: parsed.data.entryType,
    direction: parsed.data.direction,
    amount_minor: parsed.data.amountMinor,
    currency: parsed.data.currency,
    occurred_on: parsed.data.occurredOn,
    external_reference: parsed.data.externalReference ?? null,
    document_url: parsed.data.documentUrl ?? null,
    notes: parsed.data.notes ?? null,
    updated_by: access.userId,
    updated_at: new Date().toISOString(),
  };

  if (parsed.data.entryId) {
    const { data: existing, error: existingError } = await supabase
      .from("accounting_ledger_entries")
      .select(ACCOUNTING_LEDGER_COLUMNS)
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.entryId)
      .maybeSingle();

    if (existingError) return { ok: false, message: existingError.message };
    if (!existing) return { ok: false, message: "Could not find this accounting ledger entry." };

    const existingRow = existing as AccountingLedgerEntryRow;
    if (existingRow.voided_at) return { ok: false, message: "Voided ledger entries cannot be edited." };

    const { data: updated, error: updateError } = await supabase
      .from("accounting_ledger_entries")
      .update(row)
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.entryId)
      .select(ACCOUNTING_LEDGER_COLUMNS)
      .single();

    if (updateError) return { ok: false, message: updateError.message };

    const auditError = await insertAccountingAuditEvent({
      supabase,
      organizationId: parsed.data.organizationId,
      userId: access.userId,
      action: "update",
      entityType: "ledger_entry",
      entityId: parsed.data.entryId,
      beforeData: existingRow,
      afterData: updated,
    });
    if (auditError) return { ok: false, message: auditError.message };

    await revalidateDashboard();
    return { ok: true, message: "Ledger entry saved.", entry: mapAccountingLedgerEntry(updated as AccountingLedgerEntryRow) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("accounting_ledger_entries")
    .insert({
      ...row,
      created_by: access.userId,
    })
    .select(ACCOUNTING_LEDGER_COLUMNS)
    .single();

  if (insertError) return { ok: false, message: insertError.message };

  const insertedRow = inserted as AccountingLedgerEntryRow;
  const auditError = await insertAccountingAuditEvent({
    supabase,
    organizationId: parsed.data.organizationId,
    userId: access.userId,
    action: "create",
    entityType: "ledger_entry",
    entityId: insertedRow.id,
    beforeData: null,
    afterData: insertedRow,
  });
  if (auditError) return { ok: false, message: auditError.message };

  await revalidateDashboard();
  return { ok: true, message: "Ledger entry created.", entry: mapAccountingLedgerEntry(insertedRow) };
}

export async function voidAccountingRecordAction(input: unknown): Promise<AccountingVoidActionResult> {
  const parsed = accountingVoidSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid accounting void request." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const access = await requireAccountingEditor(supabase, parsed.data.organizationId);
  if (!access.ok) return access.result;

  const now = new Date().toISOString();
  if (parsed.data.entityType === "document") {
    const { data: existing, error: existingError } = await supabase
      .from("accounting_documents")
      .select(ACCOUNTING_DOCUMENT_COLUMNS)
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (existingError) return { ok: false, message: existingError.message };
    if (!existing) return { ok: false, message: "Could not find this accounting document." };

    const existingRow = existing as AccountingDocumentRow;
    if (existingRow.status === "void" || existingRow.voided_at) return { ok: false, message: "This accounting document is already voided." };

    const { data: updated, error: updateError } = await supabase
      .from("accounting_documents")
      .update({
        status: "void",
        voided_at: now,
        voided_by: access.userId,
        void_reason: parsed.data.reason,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.id)
      .select(ACCOUNTING_DOCUMENT_COLUMNS)
      .single();

    if (updateError) return { ok: false, message: updateError.message };

    const auditError = await insertAccountingAuditEvent({
      supabase,
      organizationId: parsed.data.organizationId,
      userId: access.userId,
      action: "void",
      entityType: "document",
      entityId: parsed.data.id,
      beforeData: existingRow,
      afterData: updated,
    });
    if (auditError) return { ok: false, message: auditError.message };

    await revalidateDashboard();
    return { ok: true, message: "Accounting document voided.", document: mapAccountingDocument(updated as AccountingDocumentRow) };
  }

  const { data: existing, error: existingError } = await supabase
    .from("accounting_ledger_entries")
    .select(ACCOUNTING_LEDGER_COLUMNS)
    .eq("organization_id", parsed.data.organizationId)
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (existingError) return { ok: false, message: existingError.message };
  if (!existing) return { ok: false, message: "Could not find this accounting ledger entry." };

  const existingRow = existing as AccountingLedgerEntryRow;
  if (existingRow.voided_at) return { ok: false, message: "This ledger entry is already voided." };

  const { data: updated, error: updateError } = await supabase
    .from("accounting_ledger_entries")
    .update({
      voided_at: now,
      voided_by: access.userId,
      void_reason: parsed.data.reason,
      updated_by: access.userId,
      updated_at: now,
    })
    .eq("organization_id", parsed.data.organizationId)
    .eq("id", parsed.data.id)
    .select(ACCOUNTING_LEDGER_COLUMNS)
    .single();

  if (updateError) return { ok: false, message: updateError.message };

  const auditError = await insertAccountingAuditEvent({
    supabase,
    organizationId: parsed.data.organizationId,
    userId: access.userId,
    action: "void",
    entityType: "ledger_entry",
    entityId: parsed.data.id,
    beforeData: existingRow,
    afterData: updated,
  });
  if (auditError) return { ok: false, message: auditError.message };

  await revalidateDashboard();
  return { ok: true, message: "Ledger entry voided.", entry: mapAccountingLedgerEntry(updated as AccountingLedgerEntryRow) };
}

export async function deleteAccountingRecordAction(input: unknown): Promise<AccountingDeleteActionResult> {
  const parsed = accountingDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid accounting delete request." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const access = await requireAccountingEditor(supabase, parsed.data.organizationId);
  if (!access.ok) return access.result;

  const deletedAt = new Date().toISOString();
  if (parsed.data.entityType === "document") {
    const { data: existing, error: existingError } = await supabase
      .from("accounting_documents")
      .select(ACCOUNTING_DOCUMENT_COLUMNS)
      .eq("organization_id", parsed.data.organizationId)
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (existingError) return { ok: false, message: existingError.message };
    if (!existing) return { ok: false, message: "Could not find this accounting document." };

    const existingRow = existing as AccountingDocumentRow;
    const auditError = await insertAccountingAuditEvent({
      supabase,
      organizationId: parsed.data.organizationId,
      userId: access.userId,
      action: "delete",
      entityType: "document",
      entityId: parsed.data.id,
      beforeData: existingRow,
      afterData: { deleted_at: deletedAt, delete_reason: parsed.data.reason },
    });
    if (auditError) return { ok: false, message: auditError.message };

    const { error: deleteError } = await supabase.from("accounting_documents").delete().eq("organization_id", parsed.data.organizationId).eq("id", parsed.data.id).select("id").single();
    if (deleteError) return { ok: false, message: deleteError.message };

    await revalidateDashboard();
    return { ok: true, message: "Accounting document deleted.", deletedId: parsed.data.id, entityType: "document" };
  }

  const { data: existing, error: existingError } = await supabase
    .from("accounting_ledger_entries")
    .select(ACCOUNTING_LEDGER_COLUMNS)
    .eq("organization_id", parsed.data.organizationId)
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (existingError) return { ok: false, message: existingError.message };
  if (!existing) return { ok: false, message: "Could not find this accounting ledger entry." };

  const existingRow = existing as AccountingLedgerEntryRow;
  const auditError = await insertAccountingAuditEvent({
    supabase,
    organizationId: parsed.data.organizationId,
    userId: access.userId,
    action: "delete",
    entityType: "ledger_entry",
    entityId: parsed.data.id,
    beforeData: existingRow,
    afterData: { deleted_at: deletedAt, delete_reason: parsed.data.reason },
  });
  if (auditError) return { ok: false, message: auditError.message };

  const { error: deleteError } = await supabase.from("accounting_ledger_entries").delete().eq("organization_id", parsed.data.organizationId).eq("id", parsed.data.id).select("id").single();
  if (deleteError) return { ok: false, message: deleteError.message };

  await revalidateDashboard();
  return { ok: true, message: "Ledger entry deleted.", deletedId: parsed.data.id, entityType: "ledger_entry" };
}

export async function updateCompanyAction(input: unknown): Promise<ActionResult> {
  const parsed = companyUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid company update." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const { companyId, ...updates } = parsed.data;
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) updatePayload.name = updates.name;
  if (updates.websiteDomains !== undefined) updatePayload.website_domain = serializeCompanyWebsites(updates.websiteDomains);
  if (updates.description !== undefined) updatePayload.description = updates.description;
  if (updates.country !== undefined) updatePayload.country = updates.country;
  if (updates.status !== undefined) updatePayload.status = updates.status;
  if (updates.categories !== undefined) updatePayload.categories = updates.categories;

  const { error } = await supabase.from("companies").update(updatePayload).eq("id", companyId);

  if (error) return { ok: false, message: error.message };
  await revalidateDashboard();
  return { ok: true, message: "Company updated." };
}

export async function updatePersonAction(input: unknown): Promise<ActionResult> {
  const parsed = personUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid contact update." };

  return updatePeopleInSupabase([parsed.data]);
}

export async function updatePeopleAction(input: unknown): Promise<ActionResult> {
  const parsed = peopleUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid contact updates." };

  return updatePeopleInSupabase(parsed.data.updates);
}

export async function addCompanyTagAction(input: unknown): Promise<ActionResult> {
  const parsed = tagSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid tag." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const { organizationId, companyIds, tagName, color } = parsed.data;
  const { data: tag, error: tagError } = await supabase
    .from("tags")
    .upsert({ organization_id: organizationId, name: tagName, color }, { onConflict: "organization_id,name" })
    .select("id")
    .single();

  if (tagError) return { ok: false, message: tagError.message };

  const { error } = await supabase.from("company_tags").upsert(
    companyIds.map((companyId) => ({
      organization_id: organizationId,
      company_id: companyId,
      tag_id: tag.id,
    })),
    { onConflict: "organization_id,company_id,tag_id" },
  );

  if (error) return { ok: false, message: error.message };

  const memberTagError = await applyCompanyTagToMembers({ supabase, organizationId, companyIds, tagName });
  if (memberTagError) return { ok: false, message: memberTagError.message };

  await revalidateDashboard();
  return { ok: true, message: "Tag applied." };
}

export async function renameCompanyTagAction(input: unknown): Promise<ActionResult> {
  const parsed = tagRenameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid tag rename." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const { organizationId, tagId, name } = parsed.data;
  const { data: existingTag, error: existingTagError } = await supabase
    .from("tags")
    .select("id,name")
    .eq("organization_id", organizationId)
    .eq("id", tagId)
    .maybeSingle();

  if (existingTagError) return { ok: false, message: existingTagError.message };
  if (!existingTag) return { ok: false, message: "Could not find this tag in the selected organization." };

  const { data, error } = await supabase
    .from("tags")
    .update({ name })
    .eq("organization_id", organizationId)
    .eq("id", tagId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Could not find this tag in the selected organization." };

  const { data: companyTagRows, error: companyTagError } = await supabase
    .from("company_tags")
    .select("company_id")
    .eq("organization_id", organizationId)
    .eq("tag_id", tagId);

  if (companyTagError) return { ok: false, message: companyTagError.message };

  const memberTagError = await applyCompanyTagToMembers({
    supabase,
    organizationId,
    companyIds: [...new Set((companyTagRows ?? []).map((row) => row.company_id))],
    tagName: name,
    previousTagName: existingTag.name,
  });
  if (memberTagError) return { ok: false, message: memberTagError.message };

  await revalidateDashboard();
  return { ok: true, message: "Tag renamed." };
}

function investmentRelationshipKey(companyId: string | null | undefined, personId: string | null | undefined) {
  return `${companyId ?? "none"}:${personId ?? "none"}`;
}

async function upsertInvestmentRelationship(input: {
  organizationId: string;
  relationshipId?: string;
  companyId?: string | null;
  personId?: string | null;
  investmentStatus: "prospect" | "past_investor" | "current_investor";
  capacityStatus: "unknown" | "available" | "fully_allocated";
  notes?: string | null;
  lastInvestedDate?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return { result: unavailable(), relationshipId: null };

  const row = {
    organization_id: input.organizationId,
    relationship_key: investmentRelationshipKey(input.companyId, input.personId),
    company_id: input.companyId ?? null,
    person_id: input.personId ?? null,
    investment_status: input.investmentStatus,
    capacity_status: input.capacityStatus,
    notes: input.notes ?? null,
    last_invested_date: input.lastInvestedDate ?? null,
    updated_at: new Date().toISOString(),
  };

  const query = input.relationshipId
    ? supabase
        .from("investment_relationships")
        .update(row)
        .eq("organization_id", input.organizationId)
        .eq("id", input.relationshipId)
        .select("id")
        .maybeSingle()
    : supabase
        .from("investment_relationships")
        .upsert(row, { onConflict: "organization_id,relationship_key" })
        .select("id")
        .maybeSingle();

  const { data, error } = await query;
  if (error) return { result: { ok: false, message: error.message }, relationshipId: null };
  if (!data?.id) return { result: { ok: false, message: "Could not save investment relationship." }, relationshipId: null };

  return { result: { ok: true, message: "Investment relationship saved." }, relationshipId: data.id as string };
}

export async function updateCompanyEnrichmentAction(input: unknown): Promise<ActionResult> {
  const parsed = companyEnrichmentUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid enrichment update." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const now = new Date().toISOString();
  const { organizationId, companyId, generatedAt, reviewed, ...enrichment } = parsed.data;
  const { error } = await supabase.from("company_enrichments").upsert(
    {
      organization_id: organizationId,
      company_id: companyId,
      status: enrichment.status,
      summary: enrichment.summary ?? null,
      industry: enrichment.industry ?? null,
      subsector: enrichment.subsector ?? null,
      company_type: enrichment.companyType ?? null,
      location: enrichment.location ?? null,
      keywords: enrichment.keywords,
      source_url: enrichment.sourceUrl ?? null,
      model: enrichment.model ?? null,
      confidence: enrichment.confidence ?? null,
      error_message: enrichment.errorMessage ?? null,
      generated_at: generatedAt ?? now,
      reviewed_at: reviewed ? now : null,
      updated_at: now,
    },
    { onConflict: "organization_id,company_id" },
  );

  if (error) return { ok: false, message: error.message };

  try {
    await applyCompanyEnrichmentTags({
      supabase,
      organizationId,
      companyId,
      enrichment: {
        status: enrichment.status,
        summary: enrichment.summary ?? null,
        industry: enrichment.industry ?? null,
        subsector: enrichment.subsector ?? null,
        companyType: enrichment.companyType ?? null,
        keywords: enrichment.keywords,
      },
    });
  } catch (tagError) {
    return { ok: false, message: tagError instanceof Error ? tagError.message : String(tagError) };
  }

  await revalidateDashboard();
  return { ok: true, message: "Company enrichment saved." };
}

export async function updateInvestmentRelationshipAction(input: unknown): Promise<ActionResult> {
  const parsed = investmentRelationshipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid investment relationship." };

  const { result } = await upsertInvestmentRelationship(parsed.data);
  if (!result.ok) return result;
  await revalidateDashboard();
  return result;
}

export async function addInvestmentDealAction(input: unknown): Promise<ActionResult> {
  const parsed = investmentDealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid investment deal." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const { relationshipId: parsedRelationshipId, dealName, dealStatus, investedAt, role, notes, relationshipNotes, ...relationshipInput } = parsed.data;
  let relationshipId = parsedRelationshipId ?? null;

  if (!relationshipId) {
    const saved = await upsertInvestmentRelationship({
      ...relationshipInput,
      notes: relationshipNotes ?? null,
      lastInvestedDate: investedAt ?? null,
    });
    if (!saved.result.ok || !saved.relationshipId) return saved.result;
    relationshipId = saved.relationshipId;
  }

  const { data: deal, error: dealError } = await supabase
    .from("investment_deals")
    .insert({
      organization_id: parsed.data.organizationId,
      name: dealName,
      status: dealStatus,
      invested_at: investedAt ?? null,
      notes: notes ?? null,
    })
    .select("id")
    .single();

  if (dealError) return { ok: false, message: dealError.message };

  const { error: participantError } = await supabase.from("investment_deal_participants").insert({
    organization_id: parsed.data.organizationId,
    relationship_id: relationshipId,
    deal_id: deal.id,
    role: role ?? null,
    notes: notes ?? null,
  });

  if (participantError) return { ok: false, message: participantError.message };
  await revalidateDashboard();
  return { ok: true, message: "Investment deal added." };
}

export async function updateInvestmentDealStatusAction(input: unknown): Promise<ActionResult> {
  const parsed = investmentDealStatusUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid investment deal status update." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const { organizationId, companyId, dealId, status } = parsed.data;
  const note = parsed.data.note?.trim() || null;
  const now = new Date().toISOString();

  const { data: existingDeal, error: existingDealError } = await supabase
    .from("investment_deals")
    .select("name,status")
    .eq("organization_id", organizationId)
    .eq("id", dealId)
    .maybeSingle();

  if (existingDealError) return { ok: false, message: existingDealError.message };
  if (!existingDeal) return { ok: false, message: "Could not find this deal in the selected organization." };

  const currentDeal = existingDeal as InvestmentDealStatusRow;
  const { error: updateError } = await supabase
    .from("investment_deals")
    .update({
      status,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("id", dealId);

  if (updateError) return { ok: false, message: updateError.message };

  const summary =
    currentDeal.status === status
      ? `Investment deal "${currentDeal.name}" status update: ${INVESTMENT_DEAL_STATUS_LABELS[status]}.`
      : `Investment deal "${currentDeal.name}" changed from ${INVESTMENT_DEAL_STATUS_LABELS[currentDeal.status]} to ${INVESTMENT_DEAL_STATUS_LABELS[status]}.`;

  const { error: activityError } = await supabase.from("activities").insert({
    organization_id: organizationId,
    company_id: companyId,
    person_id: null,
    outreach_id: null,
    activity_type: "status_change",
    summary,
    body: note,
    occurred_at: now,
  });

  if (activityError) return { ok: false, message: activityError.message };
  await revalidateDashboard();
  return { ok: true, message: "Deal status updated." };
}

export async function addNoteAction(input: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid note." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const { error } = await supabase.from("notes").insert({
    organization_id: parsed.data.organizationId,
    company_id: parsed.data.companyId,
    person_id: parsed.data.personId ?? null,
    body: parsed.data.body,
  });

  if (error) return { ok: false, message: error.message };
  await revalidateDashboard();
  return { ok: true, message: "Note added." };
}

export async function highlightPersonAction(input: unknown): Promise<ActionResult> {
  const parsed = highlightSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid highlight update." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const { error } = await supabase
    .from("company_people")
    .update({ is_highlighted: parsed.data.highlighted })
    .eq("company_id", parsed.data.companyId)
    .eq("person_id", parsed.data.personId);

  if (error) return { ok: false, message: error.message };
  await revalidateDashboard();
  return { ok: true, message: "Person highlight updated." };
}

export async function moveStageAction(input: unknown): Promise<ActionResult> {
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid stage update." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const { organizationId, companyIds, stage } = parsed.data;
  const { error } = await supabase.from("outreach_opportunities").upsert(
    companyIds.map((companyId) => ({
      organization_id: organizationId,
      company_id: companyId,
      stage,
      status: stage === "Closed" || stage === "Not Relevant" ? "closed" : "active",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "organization_id,company_id" },
  );

  if (error) return { ok: false, message: error.message };
  await revalidateDashboard();
  return { ok: true, message: `Moved ${companyIds.length} compan${companyIds.length === 1 ? "y" : "ies"} to ${stage}.` };
}

export async function addActivityAction(input: unknown): Promise<ActionResult> {
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid activity." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const { error } = await supabase.from("activities").insert({
    organization_id: parsed.data.organizationId,
    company_id: parsed.data.companyId,
    person_id: parsed.data.personId ?? null,
    outreach_id: parsed.data.outreachId ?? null,
    activity_type: parsed.data.activityType,
    summary: parsed.data.summary,
    body: parsed.data.body ?? null,
    occurred_at: parsed.data.occurredAt ?? new Date().toISOString(),
  });

  if (error) return { ok: false, message: error.message };
  await revalidateDashboard();
  return { ok: true, message: "Activity logged." };
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid task." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return unavailable();

  const { error } = await supabase.from("tasks").insert({
    organization_id: parsed.data.organizationId,
    company_id: parsed.data.companyId,
    person_id: parsed.data.personId ?? null,
    outreach_id: parsed.data.outreachId ?? null,
    title: parsed.data.title,
    due_date: parsed.data.dueDate ?? null,
  });

  if (error) return { ok: false, message: error.message };
  await revalidateDashboard();
  return { ok: true, message: "Task created." };
}

export async function mergeCompaniesAction(input: unknown): Promise<ActionResult> {
  const parsed = mergeCompaniesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid company merge." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const { organizationId, targetCompanyId, sourceCompanyIds } = parsed.data;
  const allCompanyIds = [targetCompanyId, ...sourceCompanyIds];
  const now = new Date().toISOString();

  const { data: companyRows, error: companyError } = await supabase
    .from("companies")
    .select("id,name,normalized_name,website_domain,description,country,categories,status,source_quality,owner_id,merge_confidence")
    .eq("organization_id", organizationId)
    .in("id", allCompanyIds);

  if (companyError) return { ok: false, message: companyError.message };
  const companies = (companyRows ?? []) as CompanyMergeCompanyRow[];
  if (companies.length !== allCompanyIds.length) return { ok: false, message: "Could not find all selected companies in this organization." };

  const targetCompany = companies.find((company) => company.id === targetCompanyId);
  if (!targetCompany) return { ok: false, message: "Could not find the keeper company in this organization." };

  const sourceCompanies = sourceCompanyIds
    .map((companyId) => companies.find((company) => company.id === companyId))
    .filter((company): company is CompanyMergeCompanyRow => Boolean(company));
  const orderedCompanies = [targetCompany, ...sourceCompanies];
  const mergedWebsiteDomains = orderedCompanies.flatMap((company) => (company.website_domain ? [company.website_domain] : []));
  const mergedCategories = uniqueNormalizedValues(orderedCompanies.flatMap((company) => company.categories ?? []));
  const mergedConfidence = orderedCompanies.reduce<number | null>((best, company) => {
    if (company.merge_confidence == null) return best;
    return best == null ? company.merge_confidence : Math.max(best, company.merge_confidence);
  }, null);

  const { error: targetUpdateError } = await supabase
    .from("companies")
    .update({
      name: targetCompany.name,
      normalized_name: normalizeCompanyName(targetCompany.name),
      website_domain: serializeCompanyWebsites(mergedWebsiteDomains),
      description: targetCompany.description ?? firstPresent(sourceCompanies.map((company) => company.description)) ?? null,
      country: targetCompany.country ?? firstPresent(sourceCompanies.map((company) => company.country)) ?? null,
      categories: mergedCategories,
      status: targetCompany.status,
      source_quality: bestSourceQuality(orderedCompanies),
      owner_id: targetCompany.owner_id ?? firstPresent(sourceCompanies.map((company) => company.owner_id)) ?? null,
      merge_confidence: mergedConfidence,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("id", targetCompanyId);

  if (targetUpdateError) return { ok: false, message: targetUpdateError.message };

  const { data: companyPeopleRows, error: companyPeopleError } = await supabase
    .from("company_people")
    .select("company_id,person_id,role_title,relationship_strength,is_highlighted")
    .eq("organization_id", organizationId)
    .in("company_id", allCompanyIds);

  if (companyPeopleError) return { ok: false, message: companyPeopleError.message };

  const mergedPeopleById = new Map<string, CompanyMergePeopleRow>();
  for (const row of (companyPeopleRows ?? []) as CompanyMergePeopleRow[]) {
    const existing = mergedPeopleById.get(row.person_id);
    if (!existing || row.company_id === targetCompanyId) {
      mergedPeopleById.set(row.person_id, { ...row, company_id: targetCompanyId });
      continue;
    }

    mergedPeopleById.set(row.person_id, {
      company_id: targetCompanyId,
      person_id: row.person_id,
      role_title: existing.role_title ?? row.role_title,
      relationship_strength: existing.relationship_strength ?? row.relationship_strength,
      is_highlighted: Boolean(existing.is_highlighted || row.is_highlighted),
    });
  }

  const mergedPeopleRows = [...mergedPeopleById.values()].map((row) => ({
    organization_id: organizationId,
    company_id: targetCompanyId,
    person_id: row.person_id,
    role_title: row.role_title,
    relationship_strength: row.relationship_strength,
    is_highlighted: row.is_highlighted,
  }));

  for (const peopleGroup of chunks(mergedPeopleRows)) {
    const { error } = await supabase.from("company_people").upsert(peopleGroup, { onConflict: "organization_id,company_id,person_id" });
    if (error) return { ok: false, message: error.message };
  }

  const { data: companyTagRows, error: companyTagsError } = await supabase
    .from("company_tags")
    .select("company_id,tag_id")
    .eq("organization_id", organizationId)
    .in("company_id", allCompanyIds);

  if (companyTagsError) return { ok: false, message: companyTagsError.message };

  const mergedTagIds = [...new Set(((companyTagRows ?? []) as CompanyMergeTagRow[]).map((row) => row.tag_id))];
  const mergedTagRows = mergedTagIds.map((tagId) => ({
    organization_id: organizationId,
    company_id: targetCompanyId,
    tag_id: tagId,
  }));

  for (const tagGroup of chunks(mergedTagRows)) {
    const { error } = await supabase.from("company_tags").upsert(tagGroup, { onConflict: "organization_id,company_id,tag_id" });
    if (error) return { ok: false, message: error.message };
  }

  const { data: outreachRows, error: outreachFetchError } = await supabase
    .from("outreach_opportunities")
    .select("id,company_id,stage,status,owner_id,next_step")
    .eq("organization_id", organizationId)
    .in("company_id", allCompanyIds);

  if (outreachFetchError) return { ok: false, message: outreachFetchError.message };

  const outreach = (outreachRows ?? []) as CompanyMergeOutreachRow[];
  const targetOutreach = outreach.find((row) => row.company_id === targetCompanyId) ?? null;
  const sourceOutreach = outreach.filter((row) => sourceCompanyIds.includes(row.company_id));
  let targetOutreachId = targetOutreach?.id ?? null;

  if (!targetOutreach && sourceOutreach[0]) {
    const { error } = await supabase
      .from("outreach_opportunities")
      .update({ company_id: targetCompanyId, updated_at: now })
      .eq("organization_id", organizationId)
      .eq("id", sourceOutreach[0].id);

    if (error) return { ok: false, message: error.message };
    targetOutreachId = sourceOutreach[0].id;
  } else if (targetOutreach && sourceOutreach[0]) {
    const outreachUpdate: Record<string, unknown> = { updated_at: now };
    if (!targetOutreach.owner_id && sourceOutreach[0].owner_id) outreachUpdate.owner_id = sourceOutreach[0].owner_id;
    if (!targetOutreach.next_step && sourceOutreach[0].next_step) outreachUpdate.next_step = sourceOutreach[0].next_step;

    if (Object.keys(outreachUpdate).length > 1) {
      const { error } = await supabase
        .from("outreach_opportunities")
        .update(outreachUpdate)
        .eq("organization_id", organizationId)
        .eq("id", targetOutreach.id);

      if (error) return { ok: false, message: error.message };
    }
  }

  const dependentUpdates = await Promise.all([
    supabase.from("notes").update({ company_id: targetCompanyId }).eq("organization_id", organizationId).in("company_id", sourceCompanyIds),
    supabase
      .from("activities")
      .update({ company_id: targetCompanyId, outreach_id: targetOutreachId })
      .eq("organization_id", organizationId)
      .in("company_id", sourceCompanyIds),
    supabase
      .from("tasks")
      .update({ company_id: targetCompanyId, outreach_id: targetOutreachId })
      .eq("organization_id", organizationId)
      .in("company_id", sourceCompanyIds),
    supabase
      .from("investment_relationships")
      .update({ company_id: targetCompanyId, updated_at: now })
      .eq("organization_id", organizationId)
      .in("company_id", sourceCompanyIds),
  ]);

  const firstDependentUpdateError = dependentUpdates.find((result) => result.error)?.error;
  if (firstDependentUpdateError) return { ok: false, message: firstDependentUpdateError.message };

  const cleanupResults = await Promise.all([
    supabase.from("company_people").delete().eq("organization_id", organizationId).in("company_id", sourceCompanyIds),
    supabase.from("company_tags").delete().eq("organization_id", organizationId).in("company_id", sourceCompanyIds),
    supabase.from("outreach_opportunities").delete().eq("organization_id", organizationId).in("company_id", sourceCompanyIds),
  ]);

  const firstCleanupError = cleanupResults.find((result) => result.error)?.error;
  if (firstCleanupError) return { ok: false, message: firstCleanupError.message };

  if (mergedTagIds.length > 0) {
    const { data: tagRows, error: tagFetchError } = await supabase.from("tags").select("name").eq("organization_id", organizationId).in("id", mergedTagIds);
    if (tagFetchError) return { ok: false, message: tagFetchError.message };

    for (const tagRow of tagRows ?? []) {
      const memberTagError = await applyCompanyTagToMembers({
        supabase,
        organizationId,
        companyIds: [targetCompanyId],
        tagName: tagRow.name,
      });

      if (memberTagError) return { ok: false, message: memberTagError.message };
    }
  }

  const { error: deleteCompaniesError } = await supabase
    .from("companies")
    .delete()
    .eq("organization_id", organizationId)
    .in("id", sourceCompanyIds);

  if (deleteCompaniesError) return { ok: false, message: deleteCompaniesError.message };

  await revalidateDashboard();
  return {
    ok: true,
    message: `Merged ${sourceCompanyIds.length} compan${sourceCompanyIds.length === 1 ? "y" : "ies"} into ${targetCompany.name}.`,
  };
}

export async function mergePeopleAction(input: unknown): Promise<ActionResult> {
  const parsed = mergePeopleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid people merge." };

  const supabase = createSupabaseAdminClient();
  if (!supabase) return unavailable();

  const { organizationId, targetPersonId, sourcePersonId } = parsed.data;

  const { data: people, error: peopleError } = await supabase
    .from("people")
    .select("id,display_name,linkedin_url,job_title,phone_numbers,country,categories,connection_strength")
    .eq("organization_id", organizationId)
    .in("id", [targetPersonId, sourcePersonId]);

  if (peopleError) return { ok: false, message: peopleError.message };
  if ((people?.length ?? 0) !== 2) return { ok: false, message: "Could not find both people in this organization." };

  const targetPerson = people?.find((person) => person.id === targetPersonId);
  const sourcePerson = people?.find((person) => person.id === sourcePersonId);
  if (!targetPerson || !sourcePerson) return { ok: false, message: "Could not find both people in this organization." };

  const [sourceLinksResult, targetLinksResult] = await Promise.all([
    supabase
      .from("company_people")
      .select("company_id,role_title,relationship_strength,is_highlighted")
      .eq("organization_id", organizationId)
      .eq("person_id", sourcePersonId),
    supabase
      .from("company_people")
      .select("company_id,role_title,relationship_strength,is_highlighted")
      .eq("organization_id", organizationId)
      .eq("person_id", targetPersonId),
  ]);

  if (sourceLinksResult.error) return { ok: false, message: sourceLinksResult.error.message };
  if (targetLinksResult.error) return { ok: false, message: targetLinksResult.error.message };

  const targetLinksByCompanyId = new Map((targetLinksResult.data ?? []).map((link) => [link.company_id, link]));
  const mergedLinks = (sourceLinksResult.data ?? []).map((link) => {
    const targetLink = targetLinksByCompanyId.get(link.company_id);
    return {
      organization_id: organizationId,
      company_id: link.company_id,
      person_id: targetPersonId,
      role_title: targetLink?.role_title ?? link.role_title,
      relationship_strength: targetLink?.relationship_strength ?? link.relationship_strength,
      is_highlighted: Boolean(targetLink?.is_highlighted || link.is_highlighted),
    };
  });

  if (mergedLinks.length > 0) {
    const { error } = await supabase.from("company_people").upsert(mergedLinks, { onConflict: "organization_id,company_id,person_id" });
    if (error) return { ok: false, message: error.message };
  }

  const mergedCategories = [...new Set([...(targetPerson.categories ?? []), ...(sourcePerson.categories ?? [])])];
  const { error: updateTargetError } = await supabase
    .from("people")
    .update({
      display_name: targetPerson.display_name || sourcePerson.display_name,
      linkedin_url: targetPerson.linkedin_url ?? sourcePerson.linkedin_url,
      job_title: targetPerson.job_title ?? sourcePerson.job_title,
      phone_numbers: targetPerson.phone_numbers ?? sourcePerson.phone_numbers,
      country: targetPerson.country ?? sourcePerson.country,
      categories: mergedCategories,
      connection_strength: targetPerson.connection_strength ?? sourcePerson.connection_strength,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetPersonId)
    .eq("organization_id", organizationId);

  if (updateTargetError) return { ok: false, message: updateTargetError.message };

  const updates = await Promise.all([
    supabase.from("person_emails").update({ person_id: targetPersonId }).eq("organization_id", organizationId).eq("person_id", sourcePersonId),
    supabase.from("notes").update({ person_id: targetPersonId }).eq("organization_id", organizationId).eq("person_id", sourcePersonId),
    supabase.from("activities").update({ person_id: targetPersonId }).eq("organization_id", organizationId).eq("person_id", sourcePersonId),
    supabase.from("tasks").update({ person_id: targetPersonId }).eq("organization_id", organizationId).eq("person_id", sourcePersonId),
    supabase.from("investment_relationships").update({ person_id: targetPersonId }).eq("organization_id", organizationId).eq("person_id", sourcePersonId),
  ]);

  const firstUpdateError = updates.find((result) => result.error)?.error;
  if (firstUpdateError) return { ok: false, message: firstUpdateError.message };

  const { error: deleteLinksError } = await supabase
    .from("company_people")
    .delete()
    .eq("organization_id", organizationId)
    .eq("person_id", sourcePersonId);

  if (deleteLinksError) return { ok: false, message: deleteLinksError.message };

  const { error: deletePersonError } = await supabase
    .from("people")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", sourcePersonId);

  if (deletePersonError) return { ok: false, message: deletePersonError.message };

  await revalidateDashboard();
  return { ok: true, message: `Merged ${sourcePerson.display_name} into ${targetPerson.display_name}.` };
}
