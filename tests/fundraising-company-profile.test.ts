import { describe, expect, it } from "vitest";

import { buildFundraisingCompanyProfile } from "../src/lib/fundraising-company-profile";
import type {
  AccountingData,
  AccountingDocument,
  AccountingLedgerEntry,
  ClientDashboardData,
  Company,
  FundraisingClient,
  FundraisingClientTarget,
  FundraisingRetainerPeriod,
  Person,
} from "../src/lib/types";

const companyId = "11111111-1111-4111-8111-111111111111";
const otherCompanyId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const fallbackClientId = "44444444-4444-4444-8444-444444444444";

function makePerson(overrides: Partial<Person> = {}): Person {
  return {
    id: "person-1",
    sourcePersonIds: ["person-1"],
    displayName: "Ada Lovelace",
    firstName: null,
    lastName: null,
    email: "ada@example.com",
    emails: ["ada@example.com"],
    phone: null,
    linkedinUrl: null,
    jobTitle: "CFO",
    country: "UK",
    categories: ["Finance"],
    connectionStrength: "Manual",
    highlighted: false,
    investmentRelationships: [],
    ...overrides,
  };
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: companyId,
    name: "Acme Bio",
    normalizedName: "acme bio",
    websiteDomain: "acme.bio",
    websiteDomains: ["acme.bio"],
    description: null,
    country: "UK",
    categories: ["Fundraising client"],
    status: "active",
    ownerName: null,
    sourceQuality: "high",
    outreachStage: "Meeting",
    tags: [],
    people: [makePerson(), makePerson({ id: "person-2", displayName: "Grace Hopper", highlighted: true })],
    activities: [],
    nextTask: null,
    lastActivityAt: null,
    mergeConfidence: null,
    enrichment: null,
    investmentRelationships: [],
    ...overrides,
  };
}

function makeClient(overrides: Partial<FundraisingClient> = {}): FundraisingClient {
  return {
    id: clientId,
    companyId,
    mandateName: "Series A",
    stage: "investor_outreach",
    ownerId: null,
    primaryContactPersonId: "person-1",
    signedOn: "2026-01-10",
    targetRaiseAmountMinor: 1_000_000,
    targetRaiseCurrency: "GBP",
    retainerAmountMinor: 50_000,
    retainerCurrency: "GBP",
    retainerCadence: "monthly",
    retainerSchedule: "Monthly",
    retainerNextBillingDate: "2026-05-01",
    materialsUrl: null,
    dataRoomUrl: null,
    notes: null,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeTarget(overrides: Partial<FundraisingClientTarget> = {}): FundraisingClientTarget {
  return {
    id: "target-1",
    clientId,
    investorCompanyId: null,
    investorPersonId: null,
    investorName: "Northstar Capital",
    investorEmail: null,
    investorType: "VC",
    ticketSizeMinMinor: 100_000,
    ticketSizeMaxMinor: 250_000,
    ticketSizeCurrency: "GBP",
    stage: "replied",
    ownerId: null,
    lastContactedAt: "2026-02-01T00:00:00Z",
    nextStep: "Send deck",
    notes: null,
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePeriod(overrides: Partial<FundraisingRetainerPeriod> = {}): FundraisingRetainerPeriod {
  return {
    id: "period-1",
    clientId,
    periodDate: "2026-05-01",
    expectedAmountMinor: 50_000,
    currency: "GBP",
    status: "pending",
    accountingDocumentId: "doc-1",
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDocument(overrides: Partial<AccountingDocument> = {}): AccountingDocument {
  return {
    id: "doc-1",
    companyId,
    fundraisingClientId: clientId,
    retainerPeriodDate: "2026-05-01",
    documentType: "retainer",
    status: "open",
    title: "May retainer",
    amountMinor: 50_000,
    currency: "GBP",
    issuedOn: "2026-05-01",
    dueOn: "2026-05-10",
    externalReference: null,
    documentUrl: null,
    notes: null,
    createdBy: null,
    updatedBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
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
    amountMinor: 25_000,
    currency: "GBP",
    occurredOn: "2026-05-05",
    externalReference: null,
    documentUrl: null,
    notes: null,
    createdBy: null,
    updatedBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDashboard(overrides: Partial<ClientDashboardData> = {}): ClientDashboardData {
  return {
    clients: [makeClient(), makeClient({ id: fallbackClientId, mandateName: "Bridge" })],
    targets: [
      makeTarget({ id: "target-replied", stage: "replied" }),
      makeTarget({ id: "target-meeting", stage: "meeting" }),
      makeTarget({ id: "target-diligence", stage: "diligence" }),
      makeTarget({ id: "target-soft", stage: "soft_commit" }),
      makeTarget({ id: "target-closed", stage: "closed" }),
      makeTarget({ id: "target-passed", stage: "passed" }),
      makeTarget({ id: "target-other-client", clientId: fallbackClientId, stage: "replied" }),
    ],
    retainerPeriods: [makePeriod(), makePeriod({ id: "period-other-client", clientId: fallbackClientId })],
    summaries: [],
    ...overrides,
  };
}

function makeAccounting(overrides: Partial<AccountingData> = {}): AccountingData {
  return {
    documents: [
      makeDocument(),
      makeDocument({ id: "doc-paid", status: "paid", amountMinor: 10_000 }),
      makeDocument({ id: "doc-other-company", companyId: otherCompanyId, amountMinor: 999_000 }),
    ],
    ledgerEntries: [
      makeEntry(),
      makeEntry({ id: "entry-void", amountMinor: 999_000, voidedAt: "2026-05-06T00:00:00Z" }),
      makeEntry({ id: "entry-other-company", companyId: otherCompanyId, amountMinor: 999_000 }),
    ],
    summaries: [],
    ...overrides,
  };
}

describe("buildFundraisingCompanyProfile", () => {
  it("selects the requested client and filters related rows", () => {
    const profile = buildFundraisingCompanyProfile({
      company: makeCompany(),
      clientDashboard: makeDashboard(),
      accountingData: makeAccounting(),
      selectedClientId: clientId,
      today: "2026-05-13",
    });

    expect(profile?.selectedClient.id).toBe(clientId);
    expect(profile?.siblingClients).toHaveLength(2);
    expect(profile?.targets.map((target) => target.id)).not.toContain("target-other-client");
    expect(profile?.retainerPeriods).toHaveLength(1);
    expect(profile?.accountingDocuments.map((document) => document.id)).not.toContain("doc-other-company");
    expect(profile?.ledgerEntries.map((entry) => entry.id)).not.toContain("entry-other-company");
    expect(profile?.primaryContact?.displayName).toBe("Ada Lovelace");
    expect(profile?.highlightedContacts).toHaveLength(1);
  });

  it("falls back to the first company client when the selected id is invalid", () => {
    const profile = buildFundraisingCompanyProfile({
      company: makeCompany(),
      clientDashboard: makeDashboard(),
      accountingData: null,
      selectedClientId: "missing",
    });

    expect(profile?.selectedClient.id).toBe(clientId);
  });

  it("counts positive replies as replied and later successful stages", () => {
    const profile = buildFundraisingCompanyProfile({
      company: makeCompany(),
      clientDashboard: makeDashboard(),
      accountingData: makeAccounting(),
      selectedClientId: clientId,
      today: "2026-05-13",
    });

    expect(profile?.metrics).toMatchObject({
      targetCount: 6,
      contactedCount: 5,
      positiveReplyCount: 5,
      meetingCount: 1,
      diligenceOrSoftCommitCount: 2,
      passedCount: 1,
      closedCount: 1,
      openDocumentCount: 1,
      overdueDocumentCount: 1,
    });
    expect(profile?.financeSummaries).toEqual([
      {
        currency: "GBP",
        openDocumentMinor: 50_000,
        overdueDocumentMinor: 50_000,
        paidLedgerMinor: 25_000,
      },
    ]);
  });

  it("returns null when a company has no fundraising clients", () => {
    const profile = buildFundraisingCompanyProfile({
      company: makeCompany(),
      clientDashboard: makeDashboard({ clients: [] }),
      accountingData: null,
    });

    expect(profile).toBeNull();
  });
});
