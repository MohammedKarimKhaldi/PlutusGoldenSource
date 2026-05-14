import { describe, expect, it, vi } from "vitest";

import { enrichCompany, extractWebsiteText, fetchCompanyWebsiteText, parseCompanyEnrichmentJson } from "../src/lib/enrichment/company-enrichment";
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

  it("extracts text from malformed builder html without logging xmldom errors", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const text = extractWebsiteText(`
        <html>
          <head>
            <title>Example Ventures</title>
            <meta name="description" content="Venture fund of funds and LP allocator." />
            <script>window.__builder = "&beckyExperiments &blocksBuilderManifestGeneratorVersion";</script>
          </head>
          <body><p>We invest in specialist venture funds and co-investments.</body></link>
        </html>
      `);

      expect(text).toContain("Example Ventures");
      expect(text).toContain("Venture fund of funds and LP allocator.");
      expect(text).toContain("specialist venture funds");
      expect(text).not.toContain("beckyExperiments");
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("parses strict or fenced Ollama JSON", () => {
    const parsed = parseCompanyEnrichmentJson(
      '```json\n{"summary":"Biotech investor","industry":"Biotech","keywords":["therapeutics"],"classificationTags":["Life Sciences VC"],"confidence":0.8}\n```',
    );

    expect(parsed.industry).toBe("Biotech");
    expect(parsed.keywords).toEqual(["therapeutics"]);
    expect(parsed.classificationTags).toEqual(["Life Sciences VC"]);
    expect(parsed.confidence).toBe(0.8);
  });

  it("normalizes object locations returned by Ollama", () => {
    const parsed = parseCompanyEnrichmentJson(
      JSON.stringify({
        summary: "NHS hospital trust.",
        industry: "Healthcare",
        subsector: "Hospitals",
        location: {
          name: "Royal Liverpool and Broadgreen University Hospital NHS Trust",
          city: "Liverpool",
          area: "Broadgreen",
          country: "United Kingdom",
        },
        keywords: ["NHS Trust"],
        confidence: 0.84,
      }),
    );

    expect(parsed.location).toBe("Liverpool, Broadgreen, United Kingdom");
  });

  it("uses geographic fields instead of company-name fields in object locations", () => {
    const parsed = parseCompanyEnrichmentJson(
      JSON.stringify({
        summary: "Bakery group.",
        industry: "Food and Beverage",
        location: { name: "Paris Baguette Co Ltd", city: "Seoul", country: "South Korea" },
        keywords: ["Bakery"],
        confidence: 0.78,
      }),
    );

    expect(parsed.location).toBe("Seoul, South Korea");
  });

  it("compacts verbose location strings returned by Ollama", () => {
    const parsed = parseCompanyEnrichmentJson(
      JSON.stringify({
        summary: "Delivery platform.",
        industry: "Technology",
        subsector: "Local Delivery",
        location:
          "Headquartered in Barcelona, Spain and operates in multiple countries across Europe, Africa, and Asia, including Spain, Italy, Portugal, Morocco, Kenya, Romania, Poland, Ukraine, Kazakhstan, Georgia, and several other markets.",
        keywords: ["Delivery"],
        confidence: 0.8,
      }),
    );

    expect(parsed.location).toBe("Barcelona, Spain");
  });

  it("returns completed enrichment from website text and mocked Ollama", async () => {
    let ollamaPrompt = "";
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://example.com")) {
        return new Response("<html><body>Biotech therapeutics venture capital fund manager investing in life sciences startups.</body></html>", { status: 200 });
      }
      if (textUrl.endsWith("/api/generate")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { prompt?: string };
        ollamaPrompt = body.prompt ?? "";
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              summary: "Investor focused on biotech therapeutics.",
              industry: "Biotech",
              subsector: "Therapeutics",
              companyType: "Investor",
              location: "United Kingdom",
              keywords: ["biotech", "therapeutics"],
              classificationTags: ["Venture Capital", "Life Sciences VC", "Unknown Investor Tag"],
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
    expect(enrichment.keywords).toContain("Venture Capital");
    expect(enrichment.keywords).toContain("Life Sciences VC");
    expect(enrichment.keywords).not.toContain("Unknown Investor Tag");
    expect(enrichment.errorMessage).toBeNull();
    expect(ollamaPrompt).toContain("classificationTags");
    expect(ollamaPrompt).toContain("Venture Fund of Funds");
  });

  it("keeps omitted summaries blank but derives useful operating-company keywords", async () => {
    const fetcher = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://glovo.app")) {
        return new Response(
          "<html><head><title>Glovo</title><meta name=\"description\" content=\"Glovo is the food delivery site that will get you anything you want to your doorstep.\" /></head><body>Login Enter your address. Food delivery and more.</body></html>",
          { status: 200 },
        );
      }
      if (textUrl.endsWith("/api/generate")) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              summary: null,
              industry: "Technology",
              subsector: "Local Delivery",
              companyType: "Marketplace",
              location: "Barcelona, Spain",
              keywords: ["Delivery"],
              confidence: 0.74,
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
        name: "Glovo",
        websiteDomains: ["glovo.app"],
        description: null,
        country: "Morocco",
        categories: [],
      },
      fetcher as typeof fetch,
    );

    expect(enrichment.status).toBe("completed");
    expect(enrichment.summary).toBeNull();
    expect(enrichment.keywords).toContain("Food Delivery");
    expect(enrichment.keywords).toContain("Delivery");
  });

  it("strips unsupported investor classifications from operating companies", async () => {
    const fetcher = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://example.com")) {
        return new Response("<html><body>Workflow automation software for restaurant teams.</body></html>", { status: 200 });
      }
      if (textUrl.endsWith("/api/generate")) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              summary: "Software platform for operations teams.",
              industry: "Financial Services",
              subsector: "Private Equity",
              companyType: "Asset Manager",
              location: "United Kingdom",
              keywords: ["investment management", "workflow automation"],
              classificationTags: ["Private Equity", "Asset Manager"],
              confidence: 0.72,
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
        name: "Example Ops",
        websiteDomains: ["example.com"],
        description: "Workflow automation software",
        country: "United Kingdom",
        categories: ["Software"],
      },
      fetcher as typeof fetch,
    );

    expect(enrichment.status).toBe("completed");
    expect(enrichment.industry).toBeNull();
    expect(enrichment.subsector).toBeNull();
    expect(enrichment.companyType).toBeNull();
    expect(enrichment.keywords).toContain("workflow automation");
    expect(enrichment.keywords).toContain("Software");
  });

  it("does not treat investor relations text as investment activity", async () => {
    const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://example.com")) {
        return new Response("<html><body>Industrial sensors for factories. Investor Relations and press resources.</body></html>", { status: 200 });
      }
      if (textUrl.endsWith("/api/generate")) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              summary: "Industrial sensor manufacturer.",
              industry: "Financial Services",
              subsector: "Asset Manager",
              companyType: "Investment Fund",
              location: "United States",
              keywords: ["investor relations", "factory sensors"],
              classificationTags: ["Asset Manager", "Investment Fund"],
              confidence: 0.66,
            }),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      void init;
      return new Response("", { status: 404 });
    };

    const enrichment = await enrichCompany(
      {
        companyId: "11111111-1111-4111-8111-111111111111",
        name: "Example Sensors",
        websiteDomains: ["example.com"],
        description: "Industrial sensor manufacturer",
        country: "United States",
        categories: ["Manufacturing"],
      },
      fetcher as typeof fetch,
    );

    expect(enrichment.status).toBe("completed");
    expect(enrichment.industry).toBeNull();
    expect(enrichment.subsector).toBeNull();
    expect(enrichment.companyType).toBeNull();
    expect(enrichment.keywords).toContain("investor relations");
    expect(enrichment.keywords).toContain("factory sensors");
    expect(enrichment.keywords).toContain("Manufacturing");
  });

  it("keeps place-containing NHS trust names as healthcare organizations", async () => {
    const trustName = "Royal Liverpool and Broadgreen University Hospital NHS Trust";
    const fetcher = async (url: string | URL | Request) => {
      const textUrl = String(url);
      if (textUrl.startsWith("https://example.com")) {
        return new Response("<html><body>NHS trust providing university hospital services in Liverpool and Broadgreen.</body></html>", { status: 200 });
      }
      if (textUrl.endsWith("/api/generate")) {
        return new Response(
          JSON.stringify({
            response: JSON.stringify({
              summary: "University hospital trust serving Liverpool and Broadgreen.",
              industry: "Financial Services",
              subsector: "Investment Management",
              companyType: "Investment Fund",
              location: {
                name: trustName,
                city: "Liverpool",
                area: "Broadgreen",
                country: "United Kingdom",
              },
              keywords: ["investment management", "NHS Trust"],
              classificationTags: ["Investment Fund"],
              confidence: 0.71,
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
        name: trustName,
        websiteDomains: ["example.com"],
        description: "University hospital NHS trust",
        country: "United Kingdom",
        categories: ["Healthcare"],
      },
      fetcher as typeof fetch,
    );

    expect(enrichment.status).toBe("completed");
    expect(enrichment.industry).toBe("Healthcare");
    expect(enrichment.subsector).toBe("University Hospitals");
    expect(enrichment.companyType).toBe("NHS Trust");
    expect(enrichment.location).toBe("Liverpool, Broadgreen, United Kingdom");
    expect(enrichment.keywords).toContain("NHS Trust");
    expect(enrichment.keywords).toContain("Healthcare");
    expect(enrichment.keywords).toContain("Hospitals");
    expect(enrichment.keywords).not.toContain("Education");
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

  it("tries www website variants before failing enrichment fetches", async () => {
    const requestedUrls: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
      const textUrl = String(url);
      requestedUrls.push(textUrl);
      if (textUrl === "https://example.com") throw new TypeError("fetch failed");
      if (textUrl === "https://www.example.com") {
        return new Response("<html><body>Example venture fund manager.</body></html>", { status: 200 });
      }
      return new Response("", { status: 404 });
    };

    const result = await fetchCompanyWebsiteText(["example.com"], fetcher as typeof fetch);

    expect(result.sourceUrl).toBe("https://www.example.com");
    expect(result.text).toContain("Example venture fund manager.");
    expect(requestedUrls).toEqual(["https://example.com", "https://www.example.com"]);
  });

  it("returns a useful website fetch failure instead of raw fetch failed", async () => {
    await expect(
      fetchCompanyWebsiteText(["example.com"], (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch),
    ).rejects.toThrow(/Could not fetch company website\. Tried 4 URLs\. Last error: http:\/\/www\.example\.com: fetch failed/);
  });

  it("derives company tag names from completed industry, subsector, and company type", () => {
    expect(companyEnrichmentTagNames({ status: "completed", industry: "  Life   Sciences ", subsector: "Biotech", companyType: "Platform" })).toEqual(["Life Sciences", "Biotech", "Platform"]);
    expect(companyEnrichmentTagNames({ status: "failed", industry: "Life Sciences", subsector: "Biotech" })).toEqual([]);
    expect(companyEnrichmentTagNames({ status: "needs_review", industry: "Life Sciences", subsector: "Biotech" })).toEqual([]);
  });

  it("dedupes generated company tag names case-insensitively and ignores blank values", () => {
    expect(companyEnrichmentTagNames({ status: "completed", industry: "Biotech", subsector: " biotech " })).toEqual(["Biotech"]);
    expect(companyEnrichmentTagNames({ status: "completed", industry: "   ", subsector: null })).toEqual([]);
  });

  it("creates precise venture capital tags and suppresses broad financial services", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: "Financial Services",
        subsector: "Venture Capital",
        companyType: "Fund Manager",
        keywords: ["Seed", "Europe Focus", "free text keyword"],
      }),
    ).toEqual(["Venture Capital", "Fund Manager", "Seed", "Europe Focus"]);
  });

  it("creates precise private equity strategy tags", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: "Financial Services",
        subsector: "Private Equity",
        companyType: "Asset Manager",
        keywords: ["Growth Equity", "Middle Market"],
      }),
    ).toEqual(["Private Equity", "Asset Manager", "Growth Equity", "Middle Market"]);
  });

  it("classifies fund-of-funds allocators as LPs instead of generic venture firms", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: "Financial Services",
        subsector: "Fund of Funds",
        companyType: "Institutional Investor",
        keywords: ["Venture Fund of Funds", "LP Investor", "LP Allocator", "Multi-Manager"],
      }),
    ).toEqual(["Fund of Funds", "Institutional Investor", "Venture Fund of Funds", "LP Investor", "LP Allocator", "Multi-Manager"]);
  });

  it("does not create asset-manager tags from company type alone", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: "Software",
        subsector: "Workflow Automation",
        companyType: "Asset Manager",
        keywords: ["customer analytics"],
      }),
    ).toEqual(["Software", "Workflow Automation"]);
  });

  it("suppresses broad financial tags when investor evidence is weak", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: "Financial Services",
        subsector: null,
        companyType: "Asset Manager",
        keywords: [],
      }),
    ).toEqual([]);
  });

  it("does not create investor tags from one top-level investor label alone", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: "Software",
        subsector: "Private Equity",
        companyType: "Platform",
        keywords: ["workflow automation"],
      }),
    ).toEqual(["Software", "Platform"]);
  });

  it("uses relevant keyword tags instead of generic private-company tags", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: null,
        subsector: null,
        companyType: "Private Company",
        keywords: ["Private Company", "Food Delivery", "mobile app"],
      }),
    ).toEqual(["Food Delivery", "Mobile App"]);
  });

  it("does not add arbitrary keyword tags when specific base tags already exist", () => {
    expect(
      companyEnrichmentTagNames({
        status: "completed",
        industry: "Food and Beverage",
        subsector: "Restaurants",
        companyType: "Private Company",
        keywords: ["mobile app"],
      }),
    ).toEqual(["Food and Beverage", "Restaurants"]);
  });

  it("creates missing enrichment tags and reuses existing tags without overwriting colors", async () => {
    const supabase = fakeSupabase([{ id: "tag-biotech", name: "Biotech", color: "#dc2626" }]);

    const result = await applyCompanyEnrichmentTags({
      supabase,
      organizationId,
      companyId,
      enrichment: { status: "completed", industry: "Biotech", subsector: "Therapeutics", companyType: "Platform", keywords: ["not a tag"] },
    });

    const database = supabase as unknown as FakeSupabase;
    expect(result.tagNames).toEqual(["Biotech", "Therapeutics", "Platform"]);
    expect(result.tags.map((tag) => tag.name)).toEqual(["Biotech", "Therapeutics", "Platform"]);
    expect(database.tags.find((tag) => tag.name === "Biotech")?.color).toBe("#dc2626");
    expect(database.tagInserts).toEqual([
      { organization_id: organizationId, name: "Therapeutics", color: "#2563eb" },
      { organization_id: organizationId, name: "Platform", color: "#2563eb" },
    ]);
    expect(database.companyTags).toHaveLength(3);
  });

  it("applies enrichment company tags idempotently", async () => {
    const supabase = fakeSupabase();

    await applyCompanyEnrichmentTags({
      supabase,
      organizationId,
      companyId,
      enrichment: { status: "completed", industry: "Financial Services", subsector: "Private Equity", keywords: ["Buyout", "Large Cap", "random keyword"] },
    });
    await applyCompanyEnrichmentTags({
      supabase,
      organizationId,
      companyId,
      enrichment: { status: "completed", industry: "Financial Services", subsector: "Private Equity", keywords: ["Buyout", "Large Cap", "random keyword"] },
    });

    const database = supabase as unknown as FakeSupabase;
    expect(database.tagInserts.map((row) => row.name)).toEqual(["Private Equity", "Buyout", "Large Cap"]);
    expect(database.companyTags).toHaveLength(3);
  });
});
