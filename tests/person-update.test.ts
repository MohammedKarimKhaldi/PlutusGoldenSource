import { describe, expect, it } from "vitest";

import { buildPersonEmailUpdateRows } from "../src/lib/person-update";
import { personUpdateSchema } from "../src/lib/validation";

const organizationId = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";

describe("person update validation", () => {
  it("trims, lowercases, and dedupes contact emails and tags", () => {
    const result = personUpdateSchema.safeParse({
      organizationId,
      personId,
      displayName: "  Jane Example  ",
      emails: [" JANE@Example.com ", "", "jane@example.com", "alt@gmail.com"],
      categories: [" Financial Services ", "financial services", "Healthcare; Operators"],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.displayName).toBe("Jane Example");
    expect(result.data.emails).toEqual(["jane@example.com", "alt@gmail.com"]);
    expect(result.data.categories).toEqual(["Financial Services", "Healthcare", "Operators"]);
  });

  it("rejects invalid contact email addresses", () => {
    const result = personUpdateSchema.safeParse({
      organizationId,
      personId,
      displayName: "Jane Example",
      emails: ["not-an-email"],
      categories: [],
    });

    expect(result.success).toBe(false);
  });

  it("allows contacts with no email addresses", () => {
    const result = personUpdateSchema.safeParse({
      organizationId,
      personId,
      displayName: "Jane Example",
      emails: ["", "  "],
      categories: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.emails).toEqual([]);
  });

  it("allows category-only contact updates without submitting emails", () => {
    const result = personUpdateSchema.safeParse({
      organizationId,
      personId,
      displayName: "Jane Example",
      categories: [" Incorrect email ", "incorrect email"],
      syncEmails: false,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.emails).toEqual([]);
    expect(result.data.categories).toEqual(["Incorrect email"]);
    expect(result.data.syncEmails).toBe(false);
  });
});

describe("person email update rows", () => {
  it("preserves email order and marks the first address as primary", () => {
    const rows = buildPersonEmailUpdateRows({
      organizationId,
      personId,
      emails: ["primary@example.com", "second@gmail.com"],
      now: new Date("2026-04-27T10:00:00.000Z"),
    });

    expect(rows).toMatchObject([
      {
        email: "primary@example.com",
        domain: "example.com",
        is_primary: true,
        is_personal_domain: false,
      },
      {
        email: "second@gmail.com",
        domain: "gmail.com",
        is_primary: false,
        is_personal_domain: true,
      },
    ]);
    expect(rows[0]?.created_at).toBe("2026-04-27T10:00:00.000Z");
    expect(rows[1]?.created_at).toBe("2026-04-27T10:00:00.001Z");
  });
});
