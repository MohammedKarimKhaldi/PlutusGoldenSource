import { describe, expect, it } from "vitest";

import { buildContactsCsv, filterContactExportRows } from "../src/lib/export/contacts";
import type { Company, InvestmentRelationship, Person } from "../src/lib/types";

const investment: InvestmentRelationship = {
  id: "investment-1",
  companyId: "company-1",
  personId: null,
  investmentStatus: "past_investor",
  capacityStatus: "fully_allocated",
  notes: "Fully allocated right now.",
  lastInvestedDate: "2026-01-15",
  deals: [
    {
      id: "deal-1",
      name: "Biotech Growth I",
      status: "closed",
      investedAt: "2026-01-15",
      notes: null,
      role: "Investor",
    },
  ],
};

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    sourcePersonIds: ["person-1"],
    displayName: "Jane Investor",
    firstName: null,
    lastName: null,
    email: "jane@biocapital.example",
    emails: ["jane@biocapital.example"],
    phone: "+44 1",
    linkedinUrl: "https://linkedin.example/jane",
    jobTitle: "Partner",
    country: "United Kingdom",
    categories: ["Healthcare"],
    connectionStrength: "Strong",
    highlighted: true,
    investmentRelationships: [],
    ...overrides,
  };
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "BioCapital",
    normalizedName: "biocapital",
    websiteDomain: "biocapital.example",
    websiteDomains: ["biocapital.example"],
    description: "Investor in biotech companies.",
    country: "United Kingdom",
    categories: ["Life Sciences"],
    status: "active",
    ownerName: null,
    sourceQuality: "high",
    outreachStage: "Selected",
    tags: [{ id: "tag-biotech", name: "Biotech", color: "#2563eb" }],
    people: [person()],
    activities: [],
    nextTask: null,
    lastActivityAt: null,
    mergeConfidence: 0.9,
    enrichment: {
      companyId: "company-1",
      status: "completed",
      summary: "Specialist biotech investor.",
      industry: "Biotech",
      subsector: "Therapeutics",
      companyType: "Investor",
      location: "United Kingdom",
      keywords: ["biotech", "therapeutics"],
      sourceUrl: "https://biocapital.example",
      model: "llama3.1:8b",
      confidence: 0.82,
      errorMessage: null,
      generatedAt: "2026-05-01T10:00:00.000Z",
      reviewedAt: null,
      updatedAt: "2026-05-01T10:00:00.000Z",
    },
    investmentRelationships: [investment],
    ...overrides,
  };
}

describe("contacts export filters", () => {
  it("matches Biotech across tags and enrichment fields", () => {
    const rows = filterContactExportRows([company()], "sector_category", "Biotech");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.company.name).toBe("BioCapital");
    expect(rows[0]?.person.displayName).toBe("Jane Investor");
  });

  it("matches investment, capacity, and deal criteria", () => {
    const companies = [company()];

    expect(filterContactExportRows(companies, "investment_status", "past_investor")).toHaveLength(1);
    expect(filterContactExportRows(companies, "capacity_status", "fully_allocated")).toHaveLength(1);
    expect(filterContactExportRows(companies, "deal_name", "Growth")).toHaveLength(1);
  });

  it("exports all matching contact rows with investment columns and CSV escaping", () => {
    const rows = filterContactExportRows(
      [
        company({
          people: [person(), person({ id: "person-2", sourcePersonIds: ["person-2"], displayName: "Sam, LP", email: "sam@biocapital.example", emails: ["sam@biocapital.example"] })],
        }),
      ],
      "sector_category",
      "Biotech",
    );
    const csv = buildContactsCsv(rows);

    expect(rows).toHaveLength(2);
    expect(csv).toContain("investment_status,capacity_status,past_deals,current_deals,last_invested_date");
    expect(csv).toContain('"Sam, LP"');
    expect(csv).toContain("past investor,fully allocated,Biotech Growth I,,2026-01-15");
  });
});
