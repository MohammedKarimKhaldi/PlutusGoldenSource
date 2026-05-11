import { describe, expect, it } from "vitest";

import { buildAccountingSummaries } from "../src/lib/accounting";
import type { AccountingDocument, AccountingLedgerEntry } from "../src/lib/types";
import { accountingDeleteSchema, accountingDocumentSchema, accountingLedgerEntrySchema, accountingVoidSchema } from "../src/lib/validation";

const organizationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";

function makeDocument(overrides: Partial<AccountingDocument> = {}): AccountingDocument {
  return {
    id: "doc-1",
    companyId,
    documentType: "retainer",
    status: "open",
    title: "Retainer",
    amountMinor: 100000,
    currency: "GBP",
    issuedOn: "2026-04-01",
    dueOn: "2026-04-15",
    externalReference: null,
    documentUrl: null,
    notes: null,
    createdBy: null,
    updatedBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AccountingLedgerEntry> = {}): AccountingLedgerEntry {
  return {
    id: "entry-1",
    documentId: "doc-1",
    companyId,
    entryType: "retainer_payment",
    direction: "incoming",
    amountMinor: 40000,
    currency: "GBP",
    occurredOn: "2026-04-10",
    externalReference: null,
    documentUrl: null,
    notes: null,
    createdBy: null,
    updatedBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: "2026-04-10T00:00:00Z",
    updatedAt: "2026-04-10T00:00:00Z",
    ...overrides,
  };
}

describe("accounting validation", () => {
  it("accepts valid documents and normalizes currency", () => {
    const result = accountingDocumentSchema.safeParse({
      organizationId,
      companyId,
      documentType: "retainer",
      status: "open",
      title: "Monthly retainer",
      amountMinor: 250000,
      currency: "gbp",
      issuedOn: "2026-04-01",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.currency : null).toBe("GBP");
  });

  it("requires companies for retainers and commissions", () => {
    const result = accountingDocumentSchema.safeParse({
      organizationId,
      companyId: null,
      documentType: "commission",
      status: "open",
      title: "Success commission",
      amountMinor: 250000,
      currency: "GBP",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid currencies and non-positive amounts", () => {
    const result = accountingDocumentSchema.safeParse({
      organizationId,
      companyId,
      documentType: "retainer",
      title: "Bad retainer",
      amountMinor: 0,
      currency: "pounds",
    });

    expect(result.success).toBe(false);
  });

  it("enforces ledger direction rules", () => {
    const result = accountingLedgerEntrySchema.safeParse({
      organizationId,
      companyId,
      entryType: "expense_payment",
      direction: "incoming",
      amountMinor: 1000,
      currency: "GBP",
      occurredOn: "2026-04-20",
    });

    expect(result.success).toBe(false);
  });

  it("requires a void reason", () => {
    const result = accountingVoidSchema.safeParse({
      organizationId,
      entityType: "document",
      id: "33333333-3333-4333-8333-333333333333",
      reason: "",
    });

    expect(result.success).toBe(false);
  });

  it("requires a delete reason", () => {
    const result = accountingDeleteSchema.safeParse({
      organizationId,
      entityType: "ledger_entry",
      id: "33333333-3333-4333-8333-333333333333",
      reason: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("accounting summaries", () => {
  it("groups cash totals by currency and excludes voided entries", () => {
    const summaries = buildAccountingSummaries(
      [makeDocument(), makeDocument({ id: "doc-2", status: "paid", amountMinor: 200000, currency: "USD" })],
      [
        makeEntry(),
        makeEntry({ id: "entry-2", documentId: "doc-2", entryType: "commission_payment", amountMinor: 200000, currency: "USD" }),
        makeEntry({ id: "entry-3", documentId: null, entryType: "expense_payment", direction: "outgoing", amountMinor: 25000 }),
        makeEntry({ id: "entry-4", documentId: null, entryType: "adjustment", direction: "outgoing", amountMinor: 5000 }),
        makeEntry({ id: "entry-void", documentId: null, entryType: "retainer_payment", amountMinor: 99999, voidedAt: "2026-04-12T00:00:00Z" }),
      ],
    );

    expect(summaries.find((summary) => summary.currency === "GBP")).toMatchObject({
      retainerIncomeMinor: 40000,
      expensesMinor: 25000,
      adjustmentsMinor: -5000,
      netCashMinor: 10000,
      outstandingMinor: 60000,
    });
    expect(summaries.find((summary) => summary.currency === "USD")).toMatchObject({
      commissionIncomeMinor: 200000,
      outstandingMinor: 0,
    });
  });

  it("does not treat draft or void documents as outstanding", () => {
    const summaries = buildAccountingSummaries(
      [
        makeDocument({ id: "doc-draft", status: "draft" }),
        makeDocument({ id: "doc-void", status: "void", voidedAt: "2026-04-12T00:00:00Z" }),
      ],
      [],
    );

    expect(summaries).toEqual([]);
  });
});
