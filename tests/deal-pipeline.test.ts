import { describe, expect, it } from "vitest";

import { buildDealPipelineRows, groupDealPipelineRows } from "../src/lib/deal-pipeline";
import type { Company, InvestmentDeal, InvestmentRelationship, Person } from "../src/lib/types";

function makeDeal(overrides: Partial<InvestmentDeal> = {}): InvestmentDeal {
  return {
    id: "deal-1",
    name: "Growth Deal",
    status: "prospective",
    investedAt: null,
    notes: null,
    role: null,
    ...overrides,
  };
}

function makeRelationship(overrides: Partial<InvestmentRelationship> = {}): InvestmentRelationship {
  return {
    id: "relationship-1",
    companyId: "company-1",
    personId: null,
    investmentStatus: "prospect",
    capacityStatus: "unknown",
    notes: null,
    lastInvestedDate: null,
    deals: [makeDeal()],
    ...overrides,
  };
}

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    sourcePersonIds: [],
    displayName: "Avery Chen",
    email: null,
    emails: [],
    phone: null,
    linkedinUrl: null,
    jobTitle: null,
    country: null,
    categories: [],
    connectionStrength: null,
    highlighted: false,
    investmentRelationships: [],
    ...overrides,
  };
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "company-1",
    name: "Acme Capital",
    normalizedName: "acme capital",
    websiteDomain: null,
    websiteDomains: [],
    description: null,
    country: null,
    categories: [],
    status: "active",
    ownerName: null,
    sourceQuality: "high",
    outreachStage: "Contacted",
    tags: [],
    people: [],
    activities: [],
    nextTask: null,
    lastActivityAt: null,
    mergeConfidence: null,
    enrichment: null,
    investmentRelationships: [],
    ...overrides,
  };
}

describe("deal pipeline rows", () => {
  it("creates one card per company and deal", () => {
    const rows = buildDealPipelineRows([
      makeCompany({
        investmentRelationships: [
          makeRelationship({
            deals: [
              makeDeal({ id: "deal-1", name: "Seed Round" }),
              makeDeal({ id: "deal-2", name: "Series A", status: "active" }),
            ],
          }),
        ],
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.dealName)).toEqual(["Seed Round", "Series A"]);
  });

  it("deduplicates the same deal through multiple contacts at one company", () => {
    const sharedDeal = makeDeal({ id: "deal-shared", name: "Expansion Financing", role: "Co-investor" });
    const rows = buildDealPipelineRows([
      makeCompany({
        people: [
          makePerson({
            id: "person-1",
            displayName: "Avery Chen",
            investmentRelationships: [
              makeRelationship({
                id: "relationship-1",
                companyId: null,
                personId: "person-1",
                deals: [sharedDeal],
              }),
            ],
          }),
          makePerson({
            id: "person-2",
            displayName: "Morgan Lee",
            investmentRelationships: [
              makeRelationship({
                id: "relationship-2",
                companyId: null,
                personId: "person-2",
                notes: "Prefers email updates.",
                deals: [sharedDeal],
              }),
            ],
          }),
        ],
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.contacts).toEqual(["Avery Chen", "Morgan Lee"]);
    expect(rows[0]?.roles).toEqual(["Co-investor"]);
    expect(rows[0]?.relationshipNotes).toEqual(["Prefers email updates."]);
  });

  it("groups deals into status columns", () => {
    const rows = buildDealPipelineRows([
      makeCompany({
        investmentRelationships: [
          makeRelationship({
            deals: [
              makeDeal({ id: "deal-prospective", name: "Prospective Deal", status: "prospective" }),
              makeDeal({ id: "deal-active", name: "Active Deal", status: "active" }),
              makeDeal({ id: "deal-passed", name: "Passed Deal", status: "passed" }),
            ],
          }),
        ],
      }),
    ]);
    const groups = groupDealPipelineRows(rows);

    expect(groups.find((group) => group.status === "prospective")?.rows).toHaveLength(1);
    expect(groups.find((group) => group.status === "active")?.rows).toHaveLength(1);
    expect(groups.find((group) => group.status === "closed")?.rows).toHaveLength(0);
    expect(groups.find((group) => group.status === "passed")?.rows).toHaveLength(1);
  });
});
