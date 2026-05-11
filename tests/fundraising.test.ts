import { describe, expect, it } from "vitest";

import { buildFundraisingSummaries } from "../src/lib/fundraising";
import type { AccountingData, AccountingDocument, AccountingLedgerEntry, FundraisingClient, FundraisingClientTarget } from "../src/lib/types";
import { fundraisingClientSchema, fundraisingTargetSchema } from "../src/lib/validation";

const organizationId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const otherCompanyId = "33333333-3333-4333-8333-333333333333";

function makeClient(overrides: Partial<FundraisingClient> = {}): FundraisingClient {
  return {
    id: "client-1",
    companyId,
    mandateName: "Demo raise",
    stage: "investor_outreach",
    ownerId: null,
    primaryContactPersonId: null,
    signedOn: "2026-04-01",
    targetRaiseAmountMinor: 1000000,
    targetRaiseCurrency: "GBP",
    materialsUrl: null,
    dataRoomUrl: null,
    notes: null,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeTarget(overrides: Partial<FundraisingClientTarget> = {}): FundraisingClientTarget {
  return {
    id: "target-1",
    clientId: "client-1",
    investorCompanyId: null,
    investorPersonId: null,
    investorName: "Example Capital",
    investorEmail: null,
    investorType: "Venture Capital",
    ticketSizeMinMinor: 100000,
    ticketSizeMaxMinor: 250000,
    ticketSizeCurrency: "GBP",
    stage: "contacted",
    ownerId: null,
    lastContactedAt: null,
    nextStep: "Follow up",
    notes: null,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<AccountingDocument> = {}): AccountingDocument {
  return {
    id: "doc-1",
    companyId,
    documentType: "retainer",
    status: "open",
    title: "Retainer",
    amountMinor: 200000,
    currency: "GBP",
    issuedOn: "2026-04-01",
    dueOn: null,
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
    amountMinor: 150000,
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

describe("fundraising validation", () => {
  it("accepts a client with a linked company and normalizes currency", () => {
    const result = fundraisingClientSchema.safeParse({
      organizationId,
      companyId,
      mandateName: "Client raise",
      stage: "signed",
      targetRaiseAmountMinor: 500000,
      targetRaiseCurrency: "gbp",
    });

    expect(result.success).toBe(true);
    expect(result.success ? result.data.targetRaiseCurrency : null).toBe("GBP");
  });

  it("requires an existing or newly created company for clients", () => {
    const result = fundraisingClientSchema.safeParse({
      organizationId,
      mandateName: "Client raise",
      stage: "signed",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid client and target stages", () => {
    expect(
      fundraisingClientSchema.safeParse({
        organizationId,
        companyId,
        mandateName: "Client raise",
        stage: "bad_stage",
      }).success,
    ).toBe(false);

    expect(
      fundraisingTargetSchema.safeParse({
        organizationId,
        clientId: companyId,
        investorName: "Example Capital",
        stage: "bad_stage",
      }).success,
    ).toBe(false);
  });

  it("requires coherent ticket sizes and currency", () => {
    const result = fundraisingTargetSchema.safeParse({
      organizationId,
      clientId: companyId,
      investorName: "Example Capital",
      stage: "target",
      ticketSizeMinMinor: 500000,
      ticketSizeMaxMinor: 100000,
      ticketSizeCurrency: "USD",
    });

    expect(result.success).toBe(false);
  });
});

describe("fundraising summaries", () => {
  it("groups target raise and ticket sizes by currency", () => {
    const summaries = buildFundraisingSummaries([makeClient()], [makeTarget()], null);

    expect(summaries).toEqual([
      expect.objectContaining({
        currency: "GBP",
        targetRaiseMinor: 1000000,
        ticketSizeMinMinor: 100000,
        ticketSizeMaxMinor: 250000,
        retainerIncomeMinor: 0,
      }),
    ]);
  });

  it("only includes accounting totals for linked client companies", () => {
    const accounting: AccountingData = {
      documents: [makeDocument(), makeDocument({ id: "doc-other", companyId: otherCompanyId, amountMinor: 999999 })],
      ledgerEntries: [makeEntry(), makeEntry({ id: "entry-other", documentId: "doc-other", companyId: otherCompanyId, amountMinor: 999999 })],
      summaries: [],
    };

    const summaries = buildFundraisingSummaries([makeClient()], [makeTarget()], accounting);
    expect(summaries.find((summary) => summary.currency === "GBP")).toMatchObject({
      retainerIncomeMinor: 150000,
      outstandingMinor: 50000,
    });
  });
});
