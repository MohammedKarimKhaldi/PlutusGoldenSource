import { describe, expect, it } from "vitest";

import { enrichCompany, extractWebsiteText, parseCompanyEnrichmentJson } from "../src/lib/enrichment/company-enrichment";
import { applyCompanyEnrichmentTags, companyEnrichmentTagNames } from "../src/lib/enrichment/company-tags";
import type { Tag } from "../src/lib/types";

const organizationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

type QueryError = { message: string };
type QueryRows<T> = { data: T[] | null; error: QueryError | null };
type TagInsert = { organization_id: string; name: string; color: string };
type CompanyTagInsert = { organization_id: string; company_id: string; tag_id: string };

class FakeTagFilter implements PromiseLike<QueryRows<Tag>> {
  constructor(
    private readonly database: FakeSupabase,
    private readonly targetOrganizationId: string,
  ) {}

  in(_column: string, names: string[]) {
    return Promise.resolve({
      data: this.database.tags.filter((tag) => names.includes(tag.name)),
      error: null,
    });
  }

  then<TResult1 = QueryRows<Tag>, TResult2 = never>(
    onfulfilled?: ((value: QueryRows<Tag>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve({
      data: this.database.tags.filter(() => this.targetOrganizationId === organizationId),
      error: null,
    }).then(onfulfilled, onrejected);
  }
}

class FakeTagsTable {
  constructor(private readonly database: FakeSupabase) {}

  select() {
    return {
      eq: (_column: string, targetOrganizationId: string) => new FakeTagFilter(this.database, targetOrganizationId),
    };
  }

  upsert(rows: TagInsert[]) {
    rows.forEach((row) => {
      if (row.organization_id !== organizationId) return;
      if (this.database.tags.some((tag) => tag.name === row.name)) return;
      const tag = { id: `tag-${row.name.toLowerCase().replace(/\s+/g, "-")}`, name: row.name, color: row.color };
      this.database.tags.push(tag);
      this.database.tagInserts.push(row);
    });

    return Promise.resolve({ error: null });
  }
}

class FakeCompanyTagsTable {
  constructor(private readonly database: FakeSupabase) {}

  upsert(rows: CompanyTagInsert[]) {
    rows.forEach((row) => {
      const key = `${row.organization_id}:${row.company_id}:${row.tag_id}`;
      if (this.database.companyTagKeys.has(key)) return;
      this.database.companyTagKeys.add(key);
      this.database.companyTags.push(row);
    });

    return Promise.resolve({ error: null });
  }
}

class FakeSupabase {
  readonly tags: Tag[];
  readonly tagInserts: TagInsert[] = [];
  readonly companyTags: CompanyTagInsert[] = [];
  readonly companyTagKeys = new Set<string>();

  constructor(tags: Tag[]) {
    this.tags = [...tags];
  }

  from(table: string) {
    if (table === "tags") return new FakeTagsTable(this);
    if (table === "company_tags") return new FakeCompanyTagsTable(this);
    throw new Error(`Unexpected table ${table}`);
  }
}

function fakeSupabase(tags: Tag[] = []) {
  return new FakeSupabase(tags) as unknown as Parameters<typeof applyCompanyEnrichmentTags>[0]["supabase"];
}

describe("company enrichment", () => {
  it("extracts useful text from website html", () => {
    const text = extractWebsiteText(`
      <html>
        <head>
          <title>Example Bio</title>
          <meta name="description" content="Biotech platform for diagnostics." />
          <script>ignoreMe()</script>
        </head>
        <body><h1>Precision diagnostics</h1><p>Clinical data and assays.</p></body>
      </html>
    `);

    expect(text).toContain("Example Bio");
    expect(text).toContain("Biotech platform for diagnostics.");
    expect(text).toContain("Precision diagnostics");
    expect(text).not.toContain("ignoreMe");
  });

  it("parses strict or fenced Ollama JSON", () => {
    const parsed = parseCompanyEnrichmentJson('```json\n{"summary":"Biotech investor","industry":"Biotech","keywords":["therapeutics"],"confidence":0.8}\n```');

    expect(parsed.industry).toBe("Biotech");
    expect(parsed.keywords).toEqual(["therapeutics"]);
    expect(parsed.confidence).toBe(0.8);
  });

  it("returns completed enrichment from website text and mocked Ollama", async () => {
    const fetcher = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://example.com")) {
        return new Response("<html><body>Biotech therapeutics investor</body></html>", { status: 200 });
      }
      if (textUrl.endsWith("/api/generate")) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              summary: "Investor focused on biotech therapeutics.",
              industry: "Biotech",
              subsector: "Therapeutics",
              companyType: "Investor",
              location: "United Kingdom",
              keywords: ["biotech", "therapeutics"],
              confidence: 0.86,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("", { status: 404 });
    };

    const enrichment = await enrichCompany(
      {
        companyId: "11111111-1111-4111-8111-111111111111",
        name: "Example Bio",
        websiteDomains: ["example.com"],
        description: null,
        country: "United Kingdom",
        categories: ["Healthcare"],
      },
      fetcher as typeof fetch,
    );

    expect(enrichment.status).toBe("completed");
    expect(enrichment.industry).toBe("Biotech");
    expect(enrichment.keywords).toContain("therapeutics");
    expect(enrichment.errorMessage).toBeNull();
  });

  it("marks missing websites for review without throwing", async () => {
    const enrichment = await enrichCompany({
      companyId: "11111111-1111-4111-8111-111111111111",
      name: "No Site",
      websiteDomains: [],
      description: null,
      country: null,
      categories: [],
    });

    expect(enrichment.status).toBe("needs_review");
    expect(enrichment.errorMessage).toContain("no website");
  });

  it("derives company tag names from completed industry and subsector only", () => {
    expect(companyEnrichmentTagNames({ status: "completed", industry: "  Life   Sciences ", subsector: "Biotech" })).toEqual(["Life Sciences", "Biotech"]);
    expect(companyEnrichmentTagNames({ status: "failed", industry: "Life Sciences", subsector: "Biotech" })).toEqual([]);
    expect(companyEnrichmentTagNames({ status: "needs_review", industry: "Life Sciences", subsector: "Biotech" })).toEqual([]);
  });

  it("dedupes generated company tag names case-insensitively and ignores blank values", () => {
    expect(companyEnrichmentTagNames({ status: "completed", industry: "Biotech", subsector: " biotech " })).toEqual(["Biotech"]);
    expect(companyEnrichmentTagNames({ status: "completed", industry: "   ", subsector: null })).toEqual([]);
  });

  it("creates missing enrichment tags and reuses existing tags without overwriting colors", async () => {
    const supabase = fakeSupabase([{ id: "tag-biotech", name: "Biotech", color: "#dc2626" }]);

    const result = await applyCompanyEnrichmentTags({
      supabase,
      organizationId,
      companyId,
      enrichment: { status: "completed", industry: "Biotech", subsector: "Therapeutics" },
    });

    const database = supabase as unknown as FakeSupabase;
    expect(result.tagNames).toEqual(["Biotech", "Therapeutics"]);
    expect(result.tags.map((tag) => tag.name)).toEqual(["Biotech", "Therapeutics"]);
    expect(database.tags.find((tag) => tag.name === "Biotech")?.color).toBe("#dc2626");
    expect(database.tagInserts).toEqual([{ organization_id: organizationId, name: "Therapeutics", color: "#2563eb" }]);
    expect(database.companyTags).toHaveLength(2);
  });

  it("applies enrichment company tags idempotently", async () => {
    const supabase = fakeSupabase();

    await applyCompanyEnrichmentTags({
      supabase,
      organizationId,
      companyId,
      enrichment: { status: "completed", industry: "Biotech", subsector: "Therapeutics" },
    });
    await applyCompanyEnrichmentTags({
      supabase,
      organizationId,
      companyId,
      enrichment: { status: "completed", industry: "Biotech", subsector: "Therapeutics" },
    });

    const database = supabase as unknown as FakeSupabase;
    expect(database.tagInserts.map((row) => row.name)).toEqual(["Biotech", "Therapeutics"]);
    expect(database.companyTags).toHaveLength(2);
  });
});
