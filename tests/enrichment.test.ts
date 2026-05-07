import { describe, expect, it } from "vitest";

import { enrichCompany, extractWebsiteText, parseCompanyEnrichmentJson } from "../src/lib/enrichment/company-enrichment";

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
});
