import { describe, expect, it } from "vitest";

import { normalizeCompanyWebsites, serializeCompanyWebsites } from "../src/lib/company-websites";
import { companyUpdateSchema, mergeCompaniesSchema } from "../src/lib/validation";

const organizationId = "11111111-1111-4111-8111-111111111111";

describe("company website normalization", () => {
  it("normalizes, dedupes, and serializes multiple company websites", () => {
    const websites = normalizeCompanyWebsites([" https://www.Example.com/path ", "example.com", "second.example.org; https://third.example.net"]);

    expect(websites).toEqual(["example.com", "second.example.org", "third.example.net"]);
    expect(serializeCompanyWebsites(websites)).toBe("example.com; second.example.org; third.example.net");
  });

  it("validates company updates with multiple websites", () => {
    const result = companyUpdateSchema.safeParse({
      companyId: "11111111-1111-4111-8111-111111111111",
      websiteDomains: [" https://www.Example.com ", " second.example.org "],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.websiteDomains).toEqual(["example.com", "second.example.org"]);
  });
});

describe("company merge validation", () => {
  it("accepts a keeper company and multiple duplicate companies", () => {
    const result = mergeCompaniesSchema.safeParse({
      organizationId,
      targetCompanyId: "22222222-2222-4222-8222-222222222222",
      sourceCompanyIds: ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate source companies or merging the keeper into itself", () => {
    const duplicateSource = mergeCompaniesSchema.safeParse({
      organizationId,
      targetCompanyId: "22222222-2222-4222-8222-222222222222",
      sourceCompanyIds: ["33333333-3333-4333-8333-333333333333", "33333333-3333-4333-8333-333333333333"],
    });
    const keeperAsSource = mergeCompaniesSchema.safeParse({
      organizationId,
      targetCompanyId: "22222222-2222-4222-8222-222222222222",
      sourceCompanyIds: ["22222222-2222-4222-8222-222222222222"],
    });

    expect(duplicateSource.success).toBe(false);
    expect(keeperAsSource.success).toBe(false);
  });
});
