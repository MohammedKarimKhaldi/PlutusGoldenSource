import type {
  AccountingAccess,
  AccountingData,
  ClientDashboardData,
  Company,
  FundraisingClient,
  FundraisingClientStage,
  FundraisingClientTarget,
  FundraisingTargetStage,
  Person,
} from "@/lib/types";
import {
  FUNDRAISING_CLIENT_STAGES,
  FUNDRAISING_TARGET_STAGES,
} from "@/lib/types";
import type { PeopleDirectoryRow } from "@/components/shared";

export { FUNDRAISING_CLIENT_STAGES, FUNDRAISING_TARGET_STAGES };
export type { FundraisingClientStage, FundraisingTargetStage };

export type FundraisingTab = "clients" | "targets" | "finance";

export type FundraisingClientDraft = {
  clientId: string | null;
  companyId: string;
  newCompanyName: string;
  newCompanyWebsites: string;
  newCompanyCountry: string;
  mandateName: string;
  stage: FundraisingClientStage;
  primaryContactPersonId: string;
  newPrimaryContactName: string;
  newPrimaryContactEmail: string;
  newPrimaryContactJobTitle: string;
  signedOn: string;
  targetRaiseAmount: string;
  targetRaiseCurrency: string;
  retainerAmount: string;
  retainerCurrency: string;
  materialsUrl: string;
  dataRoomUrl: string;
  notes: string;
};

export type FundraisingTargetDraft = {
  targetId: string | null;
  clientId: string;
  investorCompanyId: string;
  newInvestorCompanyName: string;
  newInvestorCompanyWebsites: string;
  newInvestorCompanyCountry: string;
  investorPersonId: string;
  newInvestorPersonName: string;
  newInvestorPersonEmail: string;
  newInvestorPersonJobTitle: string;
  investorName: string;
  investorEmail: string;
  investorType: string;
  stage: FundraisingTargetStage;
  ticketSizeMin: string;
  ticketSizeMax: string;
  ticketSizeCurrency: string;
  lastContactedAt: string;
  nextStep: string;
  notes: string;
};

export type FundraisingViewProps = {
  initialClientDashboard: ClientDashboardData;
  companies: Company[];
  peopleDirectory: PeopleDirectoryRow[];
  accountingData: AccountingData | null;
  accountingAccess: AccountingAccess;
  dataMode: "demo" | "supabase";
  currentUserName: string;
  onOpenCompany: (companyId: string) => void;
  onOpenAccounting: (companyId: string) => void;
  onAddCreatedCompany: (companyId: string, name: string, websites: string, country: string, category: string) => void;
  onAddCreatedPerson: (companyId: string | null, personId: string, displayName: string, email: string, jobTitle: string) => void;
};

export const FUNDRAISING_CLIENT_STAGE_LABELS: Record<FundraisingClientStage, string> = {
  signed: "Signed",
  onboarding: "Onboarding",
  materials: "Materials",
  investor_outreach: "Investor outreach",
  meetings: "Meetings",
  term_sheet: "Term sheet",
  closing: "Closing",
  completed: "Completed",
  paused: "Paused",
};

export const FUNDRAISING_TARGET_STAGE_LABELS: Record<FundraisingTargetStage, string> = {
  target: "Target",
  contact_started: "Contact started",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting",
  diligence: "Diligence",
  soft_commit: "Soft commit",
  passed: "Passed",
  closed: "Closed",
};

export const CLIENT_STAGE_COLORS: Record<FundraisingClientStage, string> = {
  signed: "#2563eb",
  onboarding: "#7c3aed",
  materials: "#0891b2",
  investor_outreach: "#059669",
  meetings: "#d97706",
  term_sheet: "#dc2626",
  closing: "#9333ea",
  completed: "#16a34a",
  paused: "#6b7280",
};

export const TARGET_STAGE_COLORS: Record<FundraisingTargetStage, string> = {
  target: "#6b7280",
  contact_started: "#7c3aed",
  contacted: "#0891b2",
  replied: "#059669",
  meeting: "#d97706",
  diligence: "#dc2626",
  soft_commit: "#16a34a",
  passed: "#6b7280",
  closed: "#16a34a",
};

export const ACTIVE_FUNDRAISING_CLIENT_STAGES = new Set<FundraisingClientStage>([
  "signed", "onboarding", "materials", "investor_outreach", "meetings", "term_sheet", "closing",
]);

export const CONTACTED_TARGET_STAGES = new Set<FundraisingTargetStage>([
  "contacted", "replied", "meeting", "diligence", "soft_commit", "closed",
]);

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function formatDate(value: string | null) {
  if (!value) return "No activity";
  return DATE_FORMATTER.format(new Date(value));
}

export function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

export function formatMinorMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amountMinor / 100);
}

export function amountInputFromMinor(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

export function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function searchTokens(query: string) {
  return normalizeSearchValue(query).split(" ").filter(Boolean);
}

export function searchTextMatches(text: string, query: string) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => text.includes(token));
}

export function fundraisingSearchParts(values: Array<string | null | undefined>) {
  return normalizeSearchValue(values.filter(Boolean).join(" "));
}

export function defaultFundraisingClientDraft(): FundraisingClientDraft {
  return {
    clientId: null, companyId: "", newCompanyName: "", newCompanyWebsites: "", newCompanyCountry: "",
    mandateName: "", stage: "signed", primaryContactPersonId: "", newPrimaryContactName: "",
    newPrimaryContactEmail: "", newPrimaryContactJobTitle: "", signedOn: todayIsoDate(),
    targetRaiseAmount: "", targetRaiseCurrency: "GBP", retainerAmount: "", retainerCurrency: "GBP",
    materialsUrl: "", dataRoomUrl: "", notes: "",
  };
}

export function defaultFundraisingTargetDraft(clientId = ""): FundraisingTargetDraft {
  return {
    targetId: null, clientId, investorCompanyId: "", newInvestorCompanyName: "",
    newInvestorCompanyWebsites: "", newInvestorCompanyCountry: "", investorPersonId: "",
    newInvestorPersonName: "", newInvestorPersonEmail: "", newInvestorPersonJobTitle: "",
    investorName: "", investorEmail: "", investorType: "", stage: "target",
    ticketSizeMin: "", ticketSizeMax: "", ticketSizeCurrency: "GBP",
    lastContactedAt: "", nextStep: "", notes: "",
  };
}

export function fundraisingClientDraftFromClient(client: FundraisingClient): FundraisingClientDraft {
  return {
    clientId: client.id, companyId: client.companyId,
    newCompanyName: "", newCompanyWebsites: "", newCompanyCountry: "",
    mandateName: client.mandateName, stage: client.stage,
    primaryContactPersonId: client.primaryContactPersonId ?? "",
    newPrimaryContactName: "", newPrimaryContactEmail: "", newPrimaryContactJobTitle: "",
    signedOn: client.signedOn ?? "",
    targetRaiseAmount: client.targetRaiseAmountMinor == null ? "" : amountInputFromMinor(client.targetRaiseAmountMinor),
    targetRaiseCurrency: client.targetRaiseCurrency ?? "GBP",
    retainerAmount: client.retainerAmountMinor == null ? "" : amountInputFromMinor(client.retainerAmountMinor),
    retainerCurrency: client.retainerCurrency ?? "GBP",
    materialsUrl: client.materialsUrl ?? "", dataRoomUrl: client.dataRoomUrl ?? "", notes: client.notes ?? "",
  };
}

export function fundraisingTargetDraftFromTarget(target: FundraisingClientTarget): FundraisingTargetDraft {
  return {
    targetId: target.id, clientId: target.clientId,
    investorCompanyId: target.investorCompanyId ?? "",
    newInvestorCompanyName: "", newInvestorCompanyWebsites: "", newInvestorCompanyCountry: "",
    investorPersonId: target.investorPersonId ?? "",
    newInvestorPersonName: "", newInvestorPersonEmail: "", newInvestorPersonJobTitle: "",
    investorName: target.investorName, investorEmail: target.investorEmail ?? "",
    investorType: target.investorType ?? "", stage: target.stage,
    ticketSizeMin: target.ticketSizeMinMinor == null ? "" : amountInputFromMinor(target.ticketSizeMinMinor),
    ticketSizeMax: target.ticketSizeMaxMinor == null ? "" : amountInputFromMinor(target.ticketSizeMaxMinor),
    ticketSizeCurrency: target.ticketSizeCurrency ?? "GBP",
    lastContactedAt: target.lastContactedAt ? target.lastContactedAt.slice(0, 10) : "",
    nextStep: target.nextStep ?? "", notes: target.notes ?? "",
  };
}

export function localFundraisingClientFromDraft(
  draft: FundraisingClientDraft, amountMinor: number | null, retainerMinor: number | null,
  companyId: string, primaryContactPersonId: string | null,
): FundraisingClient {
  const now = new Date().toISOString();
  return {
    id: draft.clientId ?? `local-client-${Date.now()}`,
    companyId, mandateName: draft.mandateName.trim(), stage: draft.stage,
    ownerId: null, primaryContactPersonId,
    signedOn: draft.signedOn || null,
    targetRaiseAmountMinor: amountMinor,
    targetRaiseCurrency: amountMinor == null ? null : draft.targetRaiseCurrency.trim().toUpperCase(),
    retainerAmountMinor: retainerMinor,
    retainerCurrency: retainerMinor == null ? null : draft.retainerCurrency.trim().toUpperCase(),
    materialsUrl: draft.materialsUrl.trim() || null,
    dataRoomUrl: draft.dataRoomUrl.trim() || null,
    notes: draft.notes.trim() || null,
    createdBy: null, updatedBy: null, createdAt: now, updatedAt: now,
  };
}

export function localFundraisingTargetFromDraft(
  draft: FundraisingTargetDraft, minMinor: number | null, maxMinor: number | null,
  investorCompanyId: string | null, investorPersonId: string | null,
): FundraisingClientTarget {
  const now = new Date().toISOString();
  return {
    id: draft.targetId ?? `local-target-${Date.now()}`,
    clientId: draft.clientId, investorCompanyId, investorPersonId,
    investorName: draft.investorName.trim(),
    investorEmail: draft.investorEmail.trim() || draft.newInvestorPersonEmail.trim() || null,
    investorType: draft.investorType.trim() || null,
    ticketSizeMinMinor: minMinor, ticketSizeMaxMinor: maxMinor,
    ticketSizeCurrency: minMinor == null && maxMinor == null ? null : draft.ticketSizeCurrency.trim().toUpperCase(),
    stage: draft.stage, ownerId: null,
    lastContactedAt: draft.lastContactedAt ? `${draft.lastContactedAt}T00:00:00.000Z` : null,
    nextStep: draft.nextStep.trim() || null, notes: draft.notes.trim() || null,
    createdBy: null, updatedBy: null, createdAt: now, updatedAt: now,
  };
}
