import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseAdminClient } from "../src/lib/supabase/server";

import { updateInvestmentDealStatusAction } from "../src/app/actions";

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
const dealId = "33333333-3333-4333-8333-333333333333";

type DealUpdate = {
  status: string;
  updated_at: string;
};

type ActivityInsert = {
  organization_id: string;
  company_id: string;
  person_id: string | null;
  outreach_id: string | null;
  activity_type: string;
  summary: string;
  body: string | null;
  occurred_at: string;
};

class FakeDealSelectQuery {
  readonly filters: Array<[string, string]> = [];

  constructor(private readonly database: FakeSupabase) {}

  eq(column: string, value: string) {
    this.filters.push([column, value]);
    this.database.dealSelectFilters.push([column, value]);
    return this;
  }

  maybeSingle() {
    return Promise.resolve({
      data: this.database.existingDeal,
      error: null,
    });
  }
}

class FakeDealUpdateQuery {
  readonly filters: Array<[string, string]> = [];

  constructor(private readonly database: FakeSupabase) {}

  eq(column: string, value: string) {
    this.filters.push([column, value]);
    this.database.dealUpdateFilters.push([column, value]);
    return this;
  }

  then<TResult1 = { error: null }, TResult2 = never>(
    onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({ error: null }).then(onfulfilled, onrejected);
  }
}

class FakeInvestmentDealsTable {
  constructor(private readonly database: FakeSupabase) {}

  select() {
    return new FakeDealSelectQuery(this.database);
  }

  update(row: DealUpdate) {
    this.database.dealUpdates.push(row);
    return new FakeDealUpdateQuery(this.database);
  }
}

class FakeActivitiesTable {
  constructor(private readonly database: FakeSupabase) {}

  insert(row: ActivityInsert) {
    this.database.activityInserts.push(row);
    return Promise.resolve({ error: null });
  }
}

class FakeSupabase {
  readonly existingDeal = {
    name: "Growth Deal",
    status: "prospective",
  };
  readonly dealSelectFilters: Array<[string, string]> = [];
  readonly dealUpdateFilters: Array<[string, string]> = [];
  readonly dealUpdates: DealUpdate[] = [];
  readonly activityInserts: ActivityInsert[] = [];

  from(table: string) {
    if (table === "investment_deals") return new FakeInvestmentDealsTable(this);
    if (table === "activities") return new FakeActivitiesTable(this);
    throw new Error(`Unexpected table ${table}`);
  }
}

describe("investment deal status action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates the deal status and inserts a company status-change activity", async () => {
    const supabase = new FakeSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(supabase as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const result = await updateInvestmentDealStatusAction({
      organizationId,
      companyId,
      dealId,
      status: "active",
      note: "Intro call completed.",
    });

    expect(result).toEqual({ ok: true, message: "Deal status updated." });
    expect(supabase.dealSelectFilters).toEqual([
      ["organization_id", organizationId],
      ["id", dealId],
    ]);
    expect(supabase.dealUpdates[0]).toMatchObject({ status: "active" });
    expect(supabase.dealUpdateFilters).toEqual([
      ["organization_id", organizationId],
      ["id", dealId],
    ]);
    expect(supabase.activityInserts[0]).toMatchObject({
      organization_id: organizationId,
      company_id: companyId,
      person_id: null,
      outreach_id: null,
      activity_type: "status_change",
      summary: 'Investment deal "Growth Deal" changed from Prospective to Active.',
      body: "Intro call completed.",
    });
  });
});
