import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAccountingRecordAction, saveAccountingDocumentAction } from "../src/app/actions";
import { createSupabaseServerClient } from "../src/lib/supabase/server";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  clearDashboardDataCache: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

const organizationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

type InsertRow = Record<string, unknown>;

class FakeSelectQuery {
  constructor(
    private readonly database: FakeAccountingSupabase,
    private readonly table: string,
  ) {}

  eq(column: string, value: string) {
    this.database.filters.push([this.table, column, value]);
    return this;
  }

  maybeSingle() {
    if (this.table === "accounting_members") {
      return Promise.resolve({ data: this.database.accountingRole ? { role: this.database.accountingRole } : null, error: null });
    }
    if (this.table === "companies") {
      return Promise.resolve({ data: { id: companyId }, error: null });
    }
    if (this.table === "accounting_documents") {
      return Promise.resolve({ data: this.database.existingDocument, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }
}

class FakeInsertQuery {
  constructor(
    private readonly database: FakeAccountingSupabase,
    private readonly table: string,
  ) {}

  select() {
    return this;
  }

  single() {
    if (this.table !== "accounting_documents") {
      return Promise.resolve({ data: null, error: null });
    }

    return Promise.resolve({
      data: {
        id: "44444444-4444-4444-8444-444444444444",
        company_id: this.database.documentInserts[0]?.company_id,
        fundraising_client_id: null,
        retainer_period_date: null,
        document_type: this.database.documentInserts[0]?.document_type,
        status: this.database.documentInserts[0]?.status,
        title: this.database.documentInserts[0]?.title,
        amount_minor: this.database.documentInserts[0]?.amount_minor,
        currency: this.database.documentInserts[0]?.currency,
        issued_on: this.database.documentInserts[0]?.issued_on,
        due_on: this.database.documentInserts[0]?.due_on,
        external_reference: this.database.documentInserts[0]?.external_reference,
        document_url: this.database.documentInserts[0]?.document_url,
        notes: this.database.documentInserts[0]?.notes,
        created_by: this.database.documentInserts[0]?.created_by,
        updated_by: this.database.documentInserts[0]?.updated_by,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
      },
      error: null,
    });
  }
}

class FakeTable {
  constructor(
    private readonly database: FakeAccountingSupabase,
    private readonly table: string,
  ) {}

  select() {
    return new FakeSelectQuery(this.database, this.table);
  }

  insert(row: InsertRow) {
    if (this.table === "accounting_documents") this.database.documentInserts.push(row);
    if (this.table === "accounting_audit_events") this.database.auditInserts.push(row);
    return new FakeInsertQuery(this.database, this.table);
  }

  delete() {
    return new FakeDeleteQuery(this.database, this.table);
  }
}

class FakeDeleteQuery {
  constructor(
    private readonly database: FakeAccountingSupabase,
    private readonly table: string,
  ) {}

  eq(column: string, value: string) {
    this.database.filters.push([this.table, column, value]);
    return this;
  }

  select() {
    return this;
  }

  single() {
    const id = String(this.database.existingDocument?.id ?? "");
    if (this.table === "accounting_documents") this.database.deletedDocuments.push(id);
    return Promise.resolve({ data: { id }, error: null });
  }
}

class FakeAccountingSupabase {
  readonly auth = {
    getUser: () => Promise.resolve({ data: { user: { id: userId, email: "finance@example.com" } }, error: null }),
  };
  readonly filters: Array<[string, string, string]> = [];
  readonly documentInserts: InsertRow[] = [];
  readonly auditInserts: InsertRow[] = [];
  readonly deletedDocuments: string[] = [];
  existingDocument: InsertRow | null = null;

  constructor(readonly accountingRole: "viewer" | "editor" | "admin" | null) {}

  from(table: string) {
    return new FakeTable(this, table);
  }
}

function existingDocumentRow(): InsertRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    company_id: companyId,
    fundraising_client_id: null,
    retainer_period_date: null,
    document_type: "retainer",
    status: "open",
    title: "Mistaken retainer",
    amount_minor: 100000,
    currency: "GBP",
    issued_on: "2026-04-01",
    due_on: null,
    external_reference: null,
    document_url: null,
    notes: null,
    created_by: userId,
    updated_by: userId,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  };
}

describe("accounting actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies writes for finance viewers", async () => {
    const supabase = new FakeAccountingSupabase("viewer");
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveAccountingDocumentAction({
      organizationId,
      companyId,
      documentType: "retainer",
      status: "open",
      title: "Retainer",
      amountMinor: 100000,
      currency: "GBP",
    });

    expect(result).toEqual({ ok: false, message: "Your finance access is read-only." });
    expect(supabase.documentInserts).toEqual([]);
  });

  it("creates documents for finance editors and writes audit events", async () => {
    const supabase = new FakeAccountingSupabase("editor");
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveAccountingDocumentAction({
      organizationId,
      companyId,
      documentType: "retainer",
      status: "open",
      title: "Retainer",
      amountMinor: 100000,
      currency: "GBP",
      issuedOn: "2026-04-01",
    });

    expect(result.ok).toBe(true);
    expect(result.document).toMatchObject({
      companyId,
      documentType: "retainer",
      title: "Retainer",
      amountMinor: 100000,
      currency: "GBP",
    });
    expect(supabase.documentInserts[0]).toMatchObject({
      organization_id: organizationId,
      company_id: companyId,
      created_by: userId,
      updated_by: userId,
    });
    expect(supabase.auditInserts[0]).toMatchObject({
      organization_id: organizationId,
      actor_user_id: userId,
      action: "create",
      entity_type: "document",
    });
  });

  it("deletes mistaken documents for finance editors and writes audit events", async () => {
    const supabase = new FakeAccountingSupabase("editor");
    supabase.existingDocument = existingDocumentRow();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await deleteAccountingRecordAction({
      organizationId,
      entityType: "document",
      id: "44444444-4444-4444-8444-444444444444",
      reason: "Entered twice",
    });

    expect(result).toMatchObject({
      ok: true,
      message: "Accounting document deleted.",
      deletedId: "44444444-4444-4444-8444-444444444444",
      entityType: "document",
    });
    expect(supabase.auditInserts[0]).toMatchObject({
      organization_id: organizationId,
      actor_user_id: userId,
      action: "delete",
      entity_type: "document",
      entity_id: "44444444-4444-4444-8444-444444444444",
      before_data: supabase.existingDocument,
      after_data: expect.objectContaining({ delete_reason: "Entered twice" }),
    });
    expect(supabase.deletedDocuments).toEqual(["44444444-4444-4444-8444-444444444444"]);
  });
});
