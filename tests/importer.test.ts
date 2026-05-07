import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { normalizeCompanyName, parseEmailList, isPersonalEmailDomain } from "../src/lib/import/normalization";
import { normalizeImportRows } from "../src/lib/import/normalize-records";
import { parseWorkbook } from "../src/lib/import/parser";
import type { RawContactRow } from "../src/lib/import/parser";

function row(overrides: Partial<RawContactRow>): RawContactRow {
  return {
    rowNumber: 2,
    sourceRecordId: "record-1",
    record: "Jane Example",
    emailAddresses: "jane@example.com",
    phoneNumbers: null,
    linkedinUrl: null,
    jobTitle: "Partner",
    companyName: "Example Capital Ltd",
    companyDescription: null,
    country: "United Kingdom",
    duplicateCompanyName: "Example Capital Ltd",
    personCategories: "Financial Services",
    connectionStrength: "Weak",
    companyCategories: "Investment Management",
    duplicateRecordId: "record-1",
    createdAt: null,
    raw: {},
    ...overrides,
  };
}

describe("workbook import", () => {
  const workbookPath = join(process.cwd(), "Contacts for database.xlsx");

  it.skipIf(!existsSync(workbookPath))("maps the current workbook columns intentionally", async () => {
    const workbook = readFileSync(workbookPath);
    const result = await parseWorkbook(workbook);

    expect(result.sheetName).toBe("Feuil1");
    expect(result.rows).toHaveLength(18623);
    expect(result.header).toEqual([
      "Record ID",
      "record",
      "Email addresses",
      "Phone numbers",
      "LinkedIn",
      "Job title",
      "Company",
      "Company > Description",
      "Primary location > Country",
      "Company",
      "Categories",
      "Connection strength",
      "Company > Categories",
      "Record ID",
      "Created at",
    ]);
    expect(result.duplicateHeaderMap).toEqual({ Company: [6, 9], "Record ID": [0, 13] });
    expect(result.rows[0]?.sourceRecordId).toBeTruthy();
  });

  it("normalizes company names without legal suffix noise", () => {
    expect(normalizeCompanyName("The Example Capital, Ltd.")).toBe("example capital");
  });

  it("parses multiple emails and marks personal domains as weak signals", () => {
    expect(parseEmailList("a@gmail.com, b@example.com")).toEqual(["a@gmail.com", "b@example.com"]);
    expect(isPersonalEmailDomain("gmail.com")).toBe(true);
    expect(isPersonalEmailDomain("example.com")).toBe(false);
  });

  it("uses corporate email domains as high-confidence company merge evidence", () => {
    const result = normalizeImportRows([
      row({ sourceRecordId: "a", emailAddresses: "one@example.com", companyName: "Example Capital" }),
      row({ sourceRecordId: "b", emailAddresses: "two@example.com", companyName: "Example Capital Ltd" }),
    ]);

    expect(result.companies).toHaveLength(1);
    expect(result.companies[0]?.sourceKey).toBe("name-domain:example capital:example.com");
    expect(result.companies[0]?.sourceQuality).toBe("high");
    expect(result.mergeAudit.every((audit) => audit.action === "auto_merge")).toBe(true);
  });

  it("does not trust personal domains for company merges", () => {
    const result = normalizeImportRows([
      row({ sourceRecordId: "a", emailAddresses: "one@gmail.com", companyName: null, duplicateCompanyName: null }),
      row({ sourceRecordId: "b", emailAddresses: "two@gmail.com", companyName: null, duplicateCompanyName: null }),
    ]);

    expect(result.companies).toHaveLength(2);
    expect(result.summary.unmatchedRows).toBe(2);
    expect(result.mergeAudit.filter((audit) => audit.entityType === "company").every((audit) => audit.action === "review")).toBe(true);
  });

  it("groups multiple emails to the same person when name and company match", () => {
    const result = normalizeImportRows([
      row({
        sourceRecordId: "a",
        record: "Jane Example",
        emailAddresses: "jane@example.com",
        companyName: "Example Capital Ltd",
      }),
      row({
        sourceRecordId: "b",
        record: "Jane Example",
        emailAddresses: "jane.personal@gmail.com",
        companyName: "Example Capital",
      }),
    ]);

    expect(result.people).toHaveLength(1);
    expect(result.personEmails.map((item) => item.email).sort()).toEqual(["jane.personal@gmail.com", "jane@example.com"]);
    expect(result.companyPeople).toHaveLength(1);
    expect(result.summary.normalizedPeople).toBe(1);
  });

  it("prefers linkedin when grouping the same person across rows", () => {
    const result = normalizeImportRows([
      row({
        sourceRecordId: "a",
        record: "Jane Example",
        emailAddresses: "jane@example.com",
        companyName: "Example Capital Ltd",
        linkedinUrl: "https://www.linkedin.com/in/jane-example/",
      }),
      row({
        sourceRecordId: "b",
        record: "Jane Example",
        emailAddresses: "jane.alt@example.com",
        companyName: "DifferentCo",
        linkedinUrl: "https://www.linkedin.com/in/jane-example",
      }),
    ]);

    expect(result.people).toHaveLength(1);
    expect(result.personEmails.map((item) => item.sourceRecordId)).toEqual([
      "linkedin:www.linkedin.com/in/jane-example",
      "linkedin:www.linkedin.com/in/jane-example",
    ]);
  });
});
