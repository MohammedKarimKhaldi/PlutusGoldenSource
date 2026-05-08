import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyCompanyEnrichmentTags } from "../src/lib/enrichment/company-tags";
import { createSupabaseAdminClient } from "../src/lib/supabase/server";

import { updateCompanyEnrichmentAction } from "../src/app/actions";

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

vi.mock("@/lib/enrichment/company-tags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/enrichment/company-tags")>();
  return {
    ...actual,
    applyCompanyEnrichmentTags: vi.fn().mockResolvedValue({ tagNames: ["Biotech", "Therapeutics"], tags: [] }),
  };
});

const organizationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

type EnrichmentUpsert = {
  organization_id: string;
  company_id: string;
  status: string;
  industry: string | null;
  subsector: string | null;
};

class FakeCompanyEnrichmentsTable {
  constructor(private readonly database: FakeSupabase) {}

  upsert(row: EnrichmentUpsert) {
    this.database.enrichmentUpserts.push(row);
    return Promise.resolve({ error: null });
  }
}

class FakeSupabase {
  readonly enrichmentUpserts: EnrichmentUpsert[] = [];

  from(table: string) {
    if (table === "company_enrichments") return new FakeCompanyEnrichmentsTable(this);
    throw new Error(`Unexpected table ${table}`);
  }
}

describe("company enrichment action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves enrichment and applies generated company tags through the shared helper", async () => {
    const supabase = new FakeSupabase();
    vi.mocked(createSupabaseAdminClient).mockReturnValue(supabase as unknown as ReturnType<typeof createSupabaseAdminClient>);

    const result = await updateCompanyEnrichmentAction({
      organizationId,
      companyId,
      status: "completed",
      summary: "Specialist biotech investor.",
      industry: "Biotech",
      subsector: "Therapeutics",
      companyType: "Investor",
      location: "United Kingdom",
      keywords: ["biotech"],
      confidence: 0.84,
      reviewed: false,
    });

    expect(result).toEqual({ ok: true, message: "Company enrichment saved." });
    expect(supabase.enrichmentUpserts).toHaveLength(1);
    expect(applyCompanyEnrichmentTags).toHaveBeenCalledWith({
      supabase,
      organizationId,
      companyId,
      enrichment: {
        status: "completed",
        industry: "Biotech",
        subsector: "Therapeutics",
      },
    });
  });
});
