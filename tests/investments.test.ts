import { describe, expect, it } from "vitest";

import { investmentDealSchema, investmentRelationshipSchema } from "../src/lib/validation";

const organizationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const personId = "33333333-3333-4333-8333-333333333333";

describe("investment validation", () => {
  it("accepts a company and person investment relationship", () => {
    const result = investmentRelationshipSchema.safeParse({
      organizationId,
      companyId,
      personId,
      investmentStatus: "past_investor",
      capacityStatus: "fully_allocated",
      notes: "Invested in a prior deal but fully allocated right now.",
      lastInvestedDate: "2026-01-15",
    });

    expect(result.success).toBe(true);
  });

  it("requires at least one linked company or contact", () => {
    const result = investmentRelationshipSchema.safeParse({
      organizationId,
      companyId: null,
      personId: null,
      investmentStatus: "prospect",
      capacityStatus: "unknown",
    });

    expect(result.success).toBe(false);
  });

  it("accepts named deal history without an existing relationship id", () => {
    const result = investmentDealSchema.safeParse({
      organizationId,
      companyId,
      investmentStatus: "current_investor",
      capacityStatus: "available",
      dealName: "Growth Deal",
      dealStatus: "active",
      investedAt: "2026-02-20",
      role: "Investor",
    });

    expect(result.success).toBe(true);
  });
});
