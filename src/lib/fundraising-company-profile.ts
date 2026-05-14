import type {
  AccountingData,
  AccountingDocument,
  AccountingLedgerEntry,
  Company,
  ClientDashboardData,
  FundraisingClient,
  FundraisingClientTarget,
  FundraisingRetainerPeriod,
  FundraisingTargetStage,
  Person,
} from "@/lib/types";

export const FUNDRAISING_POSITIVE_REPLY_STAGES = new Set<FundraisingTargetStage>([
  "replied",
  "meeting",
  "diligence",
  "soft_commit",
  "closed",
]);

const FUNDRAISING_CONTACTED_STAGES = new Set<FundraisingTargetStage>([
  "contacted",
  "replied",
  "meeting",
  "diligence",
  "soft_commit",
  "closed",
]);

export type FundraisingCompanyFinanceSummary = {
  currency: string;
  openDocumentMinor: number;
  overdueDocumentMinor: number;
  paidLedgerMinor: number;
};

export type FundraisingCompanyProfile = {
  selectedClient: FundraisingClient;
  siblingClients: FundraisingClient[];
  targets: FundraisingClientTarget[];
  retainerPeriods: FundraisingRetainerPeriod[];
  accountingDocuments: AccountingDocument[];
  ledgerEntries: AccountingLedgerEntry[];
  primaryContact: Person | null;
  highlightedContacts: Person[];
  contacts: Person[];
  financeSummaries: FundraisingCompanyFinanceSummary[];
  metrics: {
    targetCount: number;
    contactedCount: number;
    positiveReplyCount: number;
    meetingCount: number;
    diligenceOrSoftCommitCount: number;
    passedCount: number;
    closedCount: number;
    openDocumentCount: number;
    overdueDocumentCount: number;
  };
};

function addFinanceSummary(summaries: Map<string, FundraisingCompanyFinanceSummary>, currency: string) {
  const existing = summaries.get(currency);
  if (existing) return existing;

  const summary = {
    currency,
    openDocumentMinor: 0,
    overdueDocumentMinor: 0,
    paidLedgerMinor: 0,
  };
  summaries.set(currency, summary);
  return summary;
}

function isOpenDocument(document: AccountingDocument) {
  return document.status !== "paid" && document.status !== "void" && !document.voidedAt;
}

function isOverdueDocument(document: AccountingDocument, today: string) {
  return isOpenDocument(document) && Boolean(document.dueOn && document.dueOn < today);
}

export function buildFundraisingCompanyProfile({
  company,
  clientDashboard,
  accountingData,
  selectedClientId,
  today = new Date().toISOString().slice(0, 10),
}: {
  company: Company;
  clientDashboard: ClientDashboardData;
  accountingData: AccountingData | null;
  selectedClientId?: string | null;
  today?: string;
}): FundraisingCompanyProfile | null {
  const siblingClients = clientDashboard.clients.filter((client) => client.companyId === company.id);
  if (siblingClients.length === 0) return null;

  const selectedClient = siblingClients.find((client) => client.id === selectedClientId) ?? siblingClients[0];
  const targets = clientDashboard.targets.filter((target) => target.clientId === selectedClient.id);
  const retainerPeriods = clientDashboard.retainerPeriods.filter((period) => period.clientId === selectedClient.id);
  const accountingDocuments = accountingData?.documents.filter((document) => document.companyId === company.id) ?? [];
  const ledgerEntries = accountingData?.ledgerEntries.filter((entry) => entry.companyId === company.id) ?? [];
  const primaryContact = selectedClient.primaryContactPersonId
    ? company.people.find((person) => person.id === selectedClient.primaryContactPersonId) ?? null
    : null;
  const highlightedContacts = company.people.filter((person) => person.highlighted);
  const openDocuments = accountingDocuments.filter(isOpenDocument);
  const overdueDocuments = accountingDocuments.filter((document) => isOverdueDocument(document, today));

  const financeSummaries = new Map<string, FundraisingCompanyFinanceSummary>();
  for (const document of openDocuments) {
    const summary = addFinanceSummary(financeSummaries, document.currency);
    summary.openDocumentMinor += document.amountMinor;
    if (isOverdueDocument(document, today)) summary.overdueDocumentMinor += document.amountMinor;
  }
  for (const entry of ledgerEntries) {
    if (entry.voidedAt || entry.direction !== "incoming") continue;
    addFinanceSummary(financeSummaries, entry.currency).paidLedgerMinor += entry.amountMinor;
  }

  return {
    selectedClient,
    siblingClients,
    targets,
    retainerPeriods,
    accountingDocuments,
    ledgerEntries,
    primaryContact,
    highlightedContacts,
    contacts: company.people,
    financeSummaries: [...financeSummaries.values()].sort((left, right) => left.currency.localeCompare(right.currency, "en-US")),
    metrics: {
      targetCount: targets.length,
      contactedCount: targets.filter((target) => FUNDRAISING_CONTACTED_STAGES.has(target.stage)).length,
      positiveReplyCount: targets.filter((target) => FUNDRAISING_POSITIVE_REPLY_STAGES.has(target.stage)).length,
      meetingCount: targets.filter((target) => target.stage === "meeting").length,
      diligenceOrSoftCommitCount: targets.filter((target) => target.stage === "diligence" || target.stage === "soft_commit").length,
      passedCount: targets.filter((target) => target.stage === "passed").length,
      closedCount: targets.filter((target) => target.stage === "closed").length,
      openDocumentCount: openDocuments.length,
      overdueDocumentCount: overdueDocuments.length,
    },
  };
}
