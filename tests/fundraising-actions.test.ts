import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteFundraisingClientAction, saveFundraisingClientAction, saveFundraisingTargetAction } from "../src/app/actions";
import { createSupabaseAdminClient, createSupabaseServerClient } from "../src/lib/supabase/server";

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
const clientId = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown>;

class FakeFundraisingQuery {
  private readonly filters: Record<string, string> = {};

  constructor(
    private readonly database: FakeFundraisingSupabase,
    private readonly table: string,
    private readonly operation: "select" | "insert" | "update" | "delete",
    private readonly row?: Row,
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: string) {
    this.filters[column] = value;
    return this;
  }

  limit() {
    if (this.table === "accounting_documents") {
      return Promise.resolve({ data: this.database.hasAccounting ? [{ id: "doc-1" }] : [], error: null });
    }
    if (this.table === "accounting_ledger_entries") {
      return Promise.resolve({ data: [], error: null });
    }
    return Promise.resolve({ data: [], error: null });
  }

  then(resolve: (value: { data?: Row[] | null; error: null }) => void) {
    if (this.table === "accounting_documents" && this.operation === "select") {
      resolve({ data: this.database.accountingDocuments, error: null });
      return;
    }
    if (this.table === "accounting_documents" && this.operation === "insert") {
      this.database.accountingDocumentInserts.push(this.row ?? {});
      this.database.accountingDocuments.push(accountingDocumentRow(this.row ?? {}, `doc-${this.database.accountingDocumentInserts.length}`));
      resolve({ error: null });
      return;
    }
    if (this.table === "accounting_documents" && this.operation === "update") {
      this.database.accountingDocumentUpdates.push({ row: this.row ?? {}, filters: { ...this.filters } });
      this.database.accountingDocuments = this.database.accountingDocuments.map((document) =>
        document.id === this.filters.id ? { ...document, ...(this.row ?? {}) } : document,
      );
      resolve({ error: null });
      return;
    }
    if (this.table === "accounting_ledger_entries" && this.operation === "insert") {
      this.database.accountingLedgerInserts.push(this.row ?? {});
      resolve({ error: null });
      return;
    }
    if (this.operation === "delete") this.database.deletes.push({ table: this.table, filters: this.filters });
    resolve({ error: null });
  }

  maybeSingle() {
    if (this.table === "organization_members") {
      return Promise.resolve({ data: this.database.isOrgMember ? { role: "member" } : null, error: null });
    }
    if (this.table === "companies") {
      return Promise.resolve({ data: { id: this.filters.id ?? companyId }, error: null });
    }
    if (this.table === "people") {
      return Promise.resolve({ data: { id: this.filters.id ?? "person-1" }, error: null });
    }
    if (this.table === "fundraising_clients" && this.operation === "select") {
      return Promise.resolve({ data: { id: clientId, company_id: companyId }, error: null });
    }
    if (this.table === "fundraising_clients" && this.operation === "update") {
      return Promise.resolve({ data: fundraisingClientRow(this.row ?? {}, this.filters.id ?? clientId), error: null });
    }
    if (this.table === "fundraising_client_targets" && this.operation === "update") {
      return Promise.resolve({ data: fundraisingTargetRow(this.row ?? {}, this.filters.id ?? "target-1"), error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  single() {
    if (this.table === "companies") {
      this.database.companyInserts.push(this.row ?? {});
      return Promise.resolve({ data: { id: "55555555-5555-4555-8555-555555555555" }, error: null });
    }
    if (this.table === "fundraising_clients") {
      this.database.clientInserts.push(this.row ?? {});
      return Promise.resolve({ data: fundraisingClientRow(this.row ?? {}, clientId), error: null });
    }
    if (this.table === "fundraising_client_targets") {
      this.database.targetInserts.push(this.row ?? {});
      return Promise.resolve({ data: fundraisingTargetRow(this.row ?? {}, "66666666-6666-4666-8666-666666666666"), error: null });
    }
    return Promise.resolve({ data: { id: "row-1" }, error: null });
  }

}

class FakeFundraisingTable {
  constructor(
    private readonly database: FakeFundraisingSupabase,
    private readonly table: string,
  ) {}

  select() {
    return new FakeFundraisingQuery(this.database, this.table, "select");
  }

  insert(row: Row) {
    return new FakeFundraisingQuery(this.database, this.table, "insert", row);
  }

  update(row: Row) {
    return new FakeFundraisingQuery(this.database, this.table, "update", row);
  }

  delete() {
    return new FakeFundraisingQuery(this.database, this.table, "delete");
  }
}

class FakeFundraisingSupabase {
  readonly companyInserts: Row[] = [];
  readonly clientInserts: Row[] = [];
  readonly targetInserts: Row[] = [];
  readonly accountingDocumentInserts: Row[] = [];
  readonly accountingDocumentUpdates: Array<{ row: Row; filters: Record<string, string> }> = [];
  readonly accountingLedgerInserts: Row[] = [];
  readonly deletes: Array<{ table: string; filters: Record<string, string> }> = [];
  accountingDocuments: Row[] = [];

  constructor(
    readonly isOrgMember: boolean,
    readonly hasAccounting = false,
    readonly hasUser = true,
  ) {}

  readonly auth = {
    getUser: () => Promise.resolve({ data: { user: this.hasUser ? { id: userId, email: "member@example.com" } : null }, error: null }),
  };

  from(table: string) {
    return new FakeFundraisingTable(this, table);
  }
}

function fundraisingClientRow(row: Row, id: string) {
  return {
    id,
    company_id: row.company_id,
    mandate_name: row.mandate_name,
    stage: row.stage,
    owner_id: null,
    primary_contact_person_id: null,
    signed_on: row.signed_on,
    target_raise_amount_minor: row.target_raise_amount_minor,
    target_raise_currency: row.target_raise_currency,
    retainer_amount_minor: row.retainer_amount_minor,
    retainer_currency: row.retainer_currency,
    retainer_cadence: row.retainer_cadence,
    retainer_schedule: row.retainer_schedule,
    retainer_next_billing_date: row.retainer_next_billing_date,
    materials_url: null,
    data_room_url: null,
    notes: row.notes,
    created_by: userId,
    updated_by: userId,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  };
}

function accountingDocumentRow(row: Row, id: string) {
  return {
    id,
    company_id: row.company_id,
    fundraising_client_id: row.fundraising_client_id,
    retainer_period_date: row.retainer_period_date,
    document_type: row.document_type,
    status: row.status,
    title: row.title,
    amount_minor: row.amount_minor,
    currency: row.currency,
    issued_on: row.issued_on,
    due_on: row.due_on,
    external_reference: row.external_reference,
    document_url: row.document_url,
    notes: row.notes,
    created_by: row.created_by,
    updated_by: row.updated_by,
    voided_at: row.voided_at ?? null,
    voided_by: row.voided_by ?? null,
    void_reason: row.void_reason ?? null,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: row.updated_at ?? "2026-04-01T00:00:00Z",
  };
}

function fundraisingTargetRow(row: Row, id: string) {
  return {
    id,
    client_id: row.client_id,
    investor_company_id: row.investor_company_id,
    investor_person_id: null,
    investor_name: row.investor_name,
    investor_email: row.investor_email,
    investor_type: row.investor_type,
    ticket_size_min_minor: row.ticket_size_min_minor,
    ticket_size_max_minor: row.ticket_size_max_minor,
    ticket_size_currency: row.ticket_size_currency,
    stage: row.stage,
    owner_id: null,
    last_contacted_at: null,
    next_step: row.next_step,
    notes: row.notes,
    created_by: userId,
    updated_by: userId,
    created_at: "2026-04-01T00:00:00Z",
    updated_at: "2026-04-01T00:00:00Z",
  };
}

describe("fundraising actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(null);
  });

  it("denies writes for users outside the CRM organization", async () => {
    const supabase = new FakeFundraisingSupabase(false);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveFundraisingClientAction({
      organizationId,
      companyId,
      mandateName: "Client raise",
      stage: "signed",
    });

    expect(result).toEqual({ ok: false, message: "Your account is not a member of this CRM organization." });
    expect(supabase.clientInserts).toEqual([]);
  });

  it("creates clients with a newly linked CRM company", async () => {
    const supabase = new FakeFundraisingSupabase(true);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveFundraisingClientAction({
      organizationId,
      companyId: null,
      createCompany: { name: "Signed Client Ltd", websiteDomains: ["signed.example"], categories: [] },
      mandateName: "Signed Client raise",
      stage: "signed",
      targetRaiseAmountMinor: 500000,
      targetRaiseCurrency: "GBP",
    });

    expect(result.ok).toBe(true);
    expect(supabase.companyInserts[0]).toMatchObject({
      organization_id: organizationId,
      name: "Signed Client Ltd",
      categories: ["Fundraising Client"],
    });
    expect(supabase.clientInserts[0]).toMatchObject({
      company_id: "55555555-5555-4555-8555-555555555555",
      mandate_name: "Signed Client raise",
      created_by: userId,
    });
  });

  it("creates linked draft retainer invoices without ledger payments", async () => {
    const supabase = new FakeFundraisingSupabase(true);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveFundraisingClientAction({
      organizationId,
      companyId,
      mandateName: "Retained Client raise",
      stage: "signed",
      retainerAmountMinor: 250000,
      retainerCurrency: "GBP",
      retainerCadence: "quarterly",
      retainerNextBillingDate: "2026-01-15",
    });

    expect(result.ok).toBe(true);
    expect(supabase.accountingDocumentInserts).toHaveLength(3);
    expect(supabase.accountingDocumentInserts[0]).toMatchObject({
      organization_id: organizationId,
      company_id: companyId,
      fundraising_client_id: clientId,
      retainer_period_date: "2026-01-15",
      document_type: "retainer",
      status: "draft",
      amount_minor: 250000,
      currency: "GBP",
      issued_on: "2026-01-15",
      due_on: "2026-01-15",
    });
    expect(supabase.accountingDocumentInserts.map((row) => row.retainer_period_date)).toEqual(["2026-01-15", "2026-04-15", "2026-07-15"]);
    expect(supabase.accountingLedgerInserts).toEqual([]);
  });

  it("updates existing draft retainer forecasts without duplicating them", async () => {
    const supabase = new FakeFundraisingSupabase(true);
    supabase.accountingDocuments = [
      accountingDocumentRow(
        {
          organization_id: organizationId,
          company_id: companyId,
          fundraising_client_id: clientId,
          retainer_period_date: "2026-01-15",
          document_type: "retainer",
          status: "draft",
          title: "Old retainer",
          amount_minor: 100000,
          currency: "GBP",
          issued_on: "2026-01-15",
          due_on: "2026-01-15",
          external_reference: `fundraising-retainer:${clientId}:2026-01-15`,
        },
        "doc-existing",
      ),
    ];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveFundraisingClientAction({
      organizationId,
      clientId,
      companyId,
      mandateName: "Retained Client raise",
      stage: "signed",
      retainerAmountMinor: 300000,
      retainerCurrency: "GBP",
      retainerCadence: "annual",
      retainerNextBillingDate: "2026-01-15",
    });

    expect(result.ok).toBe(true);
    expect(supabase.accountingDocumentUpdates[0]).toMatchObject({
      filters: { organization_id: organizationId, id: "doc-existing" },
      row: expect.objectContaining({ amount_minor: 300000, retainer_period_date: "2026-01-15" }),
    });
    expect(supabase.accountingDocumentInserts).toEqual([]);
  });

  it("voids obsolete draft retainer forecasts while preserving non-draft documents", async () => {
    const supabase = new FakeFundraisingSupabase(true);
    supabase.accountingDocuments = [
      accountingDocumentRow(
        {
          company_id: companyId,
          fundraising_client_id: clientId,
          retainer_period_date: "2026-04-15",
          document_type: "retainer",
          status: "draft",
          amount_minor: 100000,
          currency: "GBP",
          external_reference: `fundraising-retainer:${clientId}:2026-04-15`,
        },
        "doc-obsolete-draft",
      ),
      accountingDocumentRow(
        {
          company_id: companyId,
          fundraising_client_id: clientId,
          retainer_period_date: "2026-07-15",
          document_type: "retainer",
          status: "open",
          amount_minor: 100000,
          currency: "GBP",
          external_reference: `fundraising-retainer:${clientId}:2026-07-15`,
        },
        "doc-open",
      ),
    ];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveFundraisingClientAction({
      organizationId,
      clientId,
      companyId,
      mandateName: "Retained Client raise",
      stage: "signed",
    });

    expect(result.ok).toBe(true);
    expect(supabase.accountingDocumentUpdates).toEqual([
      expect.objectContaining({
        filters: { organization_id: organizationId, id: "doc-obsolete-draft" },
        row: expect.objectContaining({ status: "void" }),
      }),
    ]);
  });

  it("creates investor targets with a newly linked CRM company", async () => {
    const supabase = new FakeFundraisingSupabase(true);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);

    const result = await saveFundraisingTargetAction({
      organizationId,
      clientId,
      investorCompanyId: null,
      createInvestorCompany: { name: "New Investor", websiteDomains: ["investor.example"], categories: [] },
      investorName: "New Investor",
      investorType: "Family Office",
      ticketSizeMinMinor: 100000,
      ticketSizeMaxMinor: 250000,
      ticketSizeCurrency: "USD",
      stage: "target",
    });

    expect(result.ok).toBe(true);
    expect(supabase.companyInserts[0]).toMatchObject({
      name: "New Investor",
      categories: ["Investor Target"],
    });
    expect(supabase.targetInserts[0]).toMatchObject({
      client_id: clientId,
      investor_company_id: "55555555-5555-4555-8555-555555555555",
      investor_name: "New Investor",
    });
  });

  it("blocks client deletion when accounting records exist", async () => {
    const serverSupabase = new FakeFundraisingSupabase(true);
    const adminSupabase = new FakeFundraisingSupabase(true, true);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(serverSupabase as unknown as NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>);
    vi.mocked(createSupabaseAdminClient).mockReturnValue(adminSupabase as unknown as NonNullable<ReturnType<typeof createSupabaseAdminClient>>);

    const result = await deleteFundraisingClientAction({ organizationId, id: clientId });

    expect(result).toEqual({
      ok: false,
      message: "This client has accounting records. Pause or complete the mandate instead of deleting it.",
    });
    expect(serverSupabase.deletes).toEqual([]);
  });
});
