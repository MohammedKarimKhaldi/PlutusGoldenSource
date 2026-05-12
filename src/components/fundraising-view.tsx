"use no memo";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Check,
  ChevronDown,
  CreditCard,
  Flag,
  Pencil,
  Plus,
  Search,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Metric, FilterSelect } from "@/components/shared";

import {
  deleteFundraisingClientAction,
  deleteFundraisingTargetAction,
  saveFundraisingClientAction,
  saveFundraisingTargetAction,
} from "@/app/actions";
import { normalizeCompanyWebsites } from "@/lib/company-websites";
import { withFundraisingSummaries } from "@/lib/fundraising";
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

// ── Local types ──

type PeopleDirectoryRow = {
  person: Person;
  company: Company;
  companies: Company[];
};

type FundraisingTab = "clients" | "targets" | "finance";

type FundraisingClientDraft = {
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

type FundraisingTargetDraft = {
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

// ── Props ──

type FundraisingViewProps = {
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

// ── Constants ──

const FUNDRAISING_CLIENT_STAGE_LABELS: Record<FundraisingClientStage, string> = {
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

const FUNDRAISING_TARGET_STAGE_LABELS: Record<FundraisingTargetStage, string> = {
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

const ACTIVE_FUNDRAISING_CLIENT_STAGES = new Set<FundraisingClientStage>([
  "signed",
  "onboarding",
  "materials",
  "investor_outreach",
  "meetings",
  "term_sheet",
  "closing",
]);

const CONTACTED_TARGET_STAGES = new Set<FundraisingTargetStage>([
  "contacted",
  "replied",
  "meeting",
  "diligence",
  "soft_commit",
  "closed",
]);

// ── Helpers ──

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");
const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null) {
  if (!value) return "No activity";
  return DATE_FORMATTER.format(new Date(value));
}

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatMinorMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  }).format(amountMinor / 100);
}

function amountInputFromMinor(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

function parseMoneyInput(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

function todayIsoDate() {
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

function searchTextMatches(text: string, query: string) {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => text.includes(token));
}

function fundraisingSearchParts(values: Array<string | null | undefined>) {
  return normalizeSearchValue(values.filter(Boolean).join(" "));
}

// ── Draft helpers ──

function defaultFundraisingClientDraft(): FundraisingClientDraft {
  return {
    clientId: null,
    companyId: "",
    newCompanyName: "",
    newCompanyWebsites: "",
    newCompanyCountry: "",
    mandateName: "",
    stage: "signed",
    primaryContactPersonId: "",
    newPrimaryContactName: "",
    newPrimaryContactEmail: "",
    newPrimaryContactJobTitle: "",
    signedOn: todayIsoDate(),
    targetRaiseAmount: "",
    targetRaiseCurrency: "GBP",
    retainerAmount: "",
    retainerCurrency: "GBP",
    materialsUrl: "",
    dataRoomUrl: "",
    notes: "",
  };
}

function defaultFundraisingTargetDraft(clientId = ""): FundraisingTargetDraft {
  return {
    targetId: null,
    clientId,
    investorCompanyId: "",
    newInvestorCompanyName: "",
    newInvestorCompanyWebsites: "",
    newInvestorCompanyCountry: "",
    investorPersonId: "",
    newInvestorPersonName: "",
    newInvestorPersonEmail: "",
    newInvestorPersonJobTitle: "",
    investorName: "",
    investorEmail: "",
    investorType: "",
    stage: "target",
    ticketSizeMin: "",
    ticketSizeMax: "",
    ticketSizeCurrency: "GBP",
    lastContactedAt: "",
    nextStep: "",
    notes: "",
  };
}

function fundraisingClientDraftFromClient(client: FundraisingClient): FundraisingClientDraft {
  return {
    clientId: client.id,
    companyId: client.companyId,
    newCompanyName: "",
    newCompanyWebsites: "",
    newCompanyCountry: "",
    mandateName: client.mandateName,
    stage: client.stage,
    primaryContactPersonId: client.primaryContactPersonId ?? "",
    newPrimaryContactName: "",
    newPrimaryContactEmail: "",
    newPrimaryContactJobTitle: "",
    signedOn: client.signedOn ?? "",
    targetRaiseAmount: client.targetRaiseAmountMinor == null ? "" : amountInputFromMinor(client.targetRaiseAmountMinor),
    targetRaiseCurrency: client.targetRaiseCurrency ?? "GBP",
    retainerAmount: client.retainerAmountMinor == null ? "" : amountInputFromMinor(client.retainerAmountMinor),
    retainerCurrency: client.retainerCurrency ?? "GBP",
    materialsUrl: client.materialsUrl ?? "",
    dataRoomUrl: client.dataRoomUrl ?? "",
    notes: client.notes ?? "",
  };
}

function fundraisingTargetDraftFromTarget(target: FundraisingClientTarget): FundraisingTargetDraft {
  return {
    targetId: target.id,
    clientId: target.clientId,
    investorCompanyId: target.investorCompanyId ?? "",
    newInvestorCompanyName: "",
    newInvestorCompanyWebsites: "",
    newInvestorCompanyCountry: "",
    investorPersonId: target.investorPersonId ?? "",
    newInvestorPersonName: "",
    newInvestorPersonEmail: "",
    newInvestorPersonJobTitle: "",
    investorName: target.investorName,
    investorEmail: target.investorEmail ?? "",
    investorType: target.investorType ?? "",
    stage: target.stage,
    ticketSizeMin: target.ticketSizeMinMinor == null ? "" : amountInputFromMinor(target.ticketSizeMinMinor),
    ticketSizeMax: target.ticketSizeMaxMinor == null ? "" : amountInputFromMinor(target.ticketSizeMaxMinor),
    ticketSizeCurrency: target.ticketSizeCurrency ?? "GBP",
    lastContactedAt: target.lastContactedAt ? target.lastContactedAt.slice(0, 10) : "",
    nextStep: target.nextStep ?? "",
    notes: target.notes ?? "",
  };
}

function localFundraisingClientFromDraft(
  draft: FundraisingClientDraft,
  amountMinor: number | null,
  retainerMinor: number | null,
  companyId: string,
  primaryContactPersonId: string | null,
): FundraisingClient {
  const now = new Date().toISOString();
  return {
    id: draft.clientId ?? `local-client-${Date.now()}`,
    companyId,
    mandateName: draft.mandateName.trim(),
    stage: draft.stage,
    ownerId: null,
    primaryContactPersonId,
    signedOn: draft.signedOn || null,
    targetRaiseAmountMinor: amountMinor,
    targetRaiseCurrency: amountMinor == null ? null : draft.targetRaiseCurrency.trim().toUpperCase(),
    retainerAmountMinor: retainerMinor,
    retainerCurrency: retainerMinor == null ? null : draft.retainerCurrency.trim().toUpperCase(),
    materialsUrl: draft.materialsUrl.trim() || null,
    dataRoomUrl: draft.dataRoomUrl.trim() || null,
    notes: draft.notes.trim() || null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

function localFundraisingTargetFromDraft(
  draft: FundraisingTargetDraft,
  minMinor: number | null,
  maxMinor: number | null,
  investorCompanyId: string | null,
  investorPersonId: string | null,
): FundraisingClientTarget {
  const now = new Date().toISOString();
  return {
    id: draft.targetId ?? `local-target-${Date.now()}`,
    clientId: draft.clientId,
    investorCompanyId,
    investorPersonId,
    investorName: draft.investorName.trim(),
    investorEmail: draft.investorEmail.trim() || draft.newInvestorPersonEmail.trim() || null,
    investorType: draft.investorType.trim() || null,
    ticketSizeMinMinor: minMinor,
    ticketSizeMaxMinor: maxMinor,
    ticketSizeCurrency: minMinor == null && maxMinor == null ? null : draft.ticketSizeCurrency.trim().toUpperCase(),
    stage: draft.stage,
    ownerId: null,
    lastContactedAt: draft.lastContactedAt ? `${draft.lastContactedAt}T00:00:00.000Z` : null,
    nextStep: draft.nextStep.trim() || null,
    notes: draft.notes.trim() || null,
    createdBy: null,
    updatedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Sub-components ──

// ── Main component ──

export function FundraisingView({
  initialClientDashboard,
  companies,
  peopleDirectory,
  accountingData,
  accountingAccess,
  dataMode,
  currentUserName,
  onOpenCompany,
  onOpenAccounting,
  onAddCreatedCompany,
  onAddCreatedPerson,
}: FundraisingViewProps) {
  const router = useRouter();

  const [clientDashboard, setClientDashboard] = useState(() => initialClientDashboard);
  const [fundraisingTab, setFundraisingTab] = useState<FundraisingTab>("clients");
  const [fundraisingQuery, setFundraisingQuery] = useState("");
  const [fundraisingClientStageFilter, setFundraisingClientStageFilter] = useState("");
  const [fundraisingTargetStageFilter, setFundraisingTargetStageFilter] = useState("");
  const [fundraisingCompanyFilter, setFundraisingCompanyFilter] = useState("");
  const [fundraisingCurrencyFilter, setFundraisingCurrencyFilter] = useState("");
  const [fundraisingInvestorTypeFilter, setFundraisingInvestorTypeFilter] = useState("");
  const [fundraisingClientDraft, setFundraisingClientDraft] = useState<FundraisingClientDraft>(() => defaultFundraisingClientDraft());
  const [fundraisingTargetDraft, setFundraisingTargetDraft] = useState<FundraisingTargetDraft>(() => defaultFundraisingTargetDraft(initialClientDashboard.clients[0]?.id ?? ""));
  const [fundraisingMessage, setFundraisingMessage] = useState<string | null>(null);
  const [isSavingFundraising, setIsSavingFundraising] = useState(false);
  const [showClientDrawer, setShowClientDrawer] = useState(false);

  const deferredFundraisingQuery = useDeferredValue(fundraisingQuery.trim());

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setClientDashboard(initialClientDashboard);
        setFundraisingTargetDraft((current) => (current.clientId ? current : defaultFundraisingTargetDraft(initialClientDashboard.clients[0]?.id ?? "")));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialClientDashboard]);

  const companyNameById = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);

  const fundraisingData = useMemo(
    () => withFundraisingSummaries(clientDashboard, accountingAccess.canView ? accountingData : null),
    [accountingData, clientDashboard, accountingAccess.canView],
  );

  const fundraisingClients = fundraisingData.clients;
  const fundraisingTargets = fundraisingData.targets;

  const fundraisingTargetsByClient = useMemo(() => {
    const groups = new Map<string, FundraisingClientTarget[]>();
    for (const target of fundraisingTargets) {
      const current = groups.get(target.clientId);
      if (current) current.push(target);
      else groups.set(target.clientId, [target]);
    }
    return groups;
  }, [fundraisingTargets]);

  const fundraisingClientById = useMemo(() => new Map(fundraisingClients.map((client) => [client.id, client])), [fundraisingClients]);

  const fundraisingClientCompanyIds = useMemo(() => new Set(fundraisingClients.map((client) => client.companyId)), [fundraisingClients]);

  const fundraisingClientCompanies = useMemo(
    () =>
      companies
        .filter((company) => fundraisingClientCompanyIds.has(company.id))
        .sort((left, right) => left.name.localeCompare(right.name, "en-US")),
    [companies, fundraisingClientCompanyIds],
  );

  const fundraisingCurrencies = useMemo(
    () =>
      [
        ...new Set([
          ...fundraisingData.summaries.map((summary) => summary.currency),
          ...fundraisingClients.map((client) => client.targetRaiseCurrency).filter(Boolean),
          ...fundraisingTargets.map((target) => target.ticketSizeCurrency).filter(Boolean),
        ] as string[]),
      ].sort(),
    [fundraisingClients, fundraisingData.summaries, fundraisingTargets],
  );

  const fundraisingInvestorTypes = useMemo(
    () =>
      [...new Set(fundraisingTargets.map((target) => target.investorType).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b, "en-US"),
      ),
    [fundraisingTargets],
  );

  const filteredFundraisingClients = useMemo(
    () =>
      fundraisingClients.filter((client) => {
        if (fundraisingClientStageFilter && client.stage !== fundraisingClientStageFilter) return false;
        if (fundraisingCompanyFilter && client.companyId !== fundraisingCompanyFilter) return false;
        if (fundraisingCurrencyFilter && client.targetRaiseCurrency !== fundraisingCurrencyFilter) return false;
        if (!deferredFundraisingQuery) return true;
        const text = fundraisingSearchParts([
          client.mandateName,
          companyNameById.get(client.companyId),
          FUNDRAISING_CLIENT_STAGE_LABELS[client.stage],
          client.notes,
        ]);
        return searchTextMatches(text, deferredFundraisingQuery);
      }),
    [companyNameById, deferredFundraisingQuery, fundraisingClientStageFilter, fundraisingClients, fundraisingCompanyFilter, fundraisingCurrencyFilter],
  );

  const filteredFundraisingTargets = useMemo(
    () =>
      fundraisingTargets.filter((target) => {
        const client = fundraisingClientById.get(target.clientId);
        if (fundraisingTargetStageFilter && target.stage !== fundraisingTargetStageFilter) return false;
        if (fundraisingCompanyFilter && client?.companyId !== fundraisingCompanyFilter) return false;
        if (fundraisingCurrencyFilter && target.ticketSizeCurrency !== fundraisingCurrencyFilter) return false;
        if (fundraisingInvestorTypeFilter && target.investorType !== fundraisingInvestorTypeFilter) return false;
        if (!deferredFundraisingQuery) return true;
        const text = fundraisingSearchParts([
          target.investorName,
          target.investorEmail,
          target.investorType,
          target.nextStep,
          target.notes,
          client?.mandateName,
          client ? companyNameById.get(client.companyId) : null,
          FUNDRAISING_TARGET_STAGE_LABELS[target.stage],
        ]);
        return searchTextMatches(text, deferredFundraisingQuery);
      }),
    [companyNameById, deferredFundraisingQuery, fundraisingClientById, fundraisingCompanyFilter, fundraisingCurrencyFilter, fundraisingInvestorTypeFilter, fundraisingTargetStageFilter, fundraisingTargets],
  );

  const fundraisingStats = useMemo(() => {
    const contactedTargets = fundraisingTargets.filter((target) => CONTACTED_TARGET_STAGES.has(target.stage)).length;
    return {
      signedClients: fundraisingClients.length,
      activeClients: fundraisingClients.filter((client) => ACTIVE_FUNDRAISING_CLIENT_STAGES.has(client.stage)).length,
      targets: fundraisingTargets.length,
      contactedTargets,
      repliedTargets: fundraisingTargets.filter((target) => target.stage === "replied").length,
      meetings: fundraisingTargets.filter((target) => target.stage === "meeting" || target.stage === "diligence").length,
    };
  }, [fundraisingClients, fundraisingTargets]);

  function updateFundraisingClientLocally(client: FundraisingClient) {
    setClientDashboard((current) => ({
      ...current,
      clients: current.clients.some((item) => item.id === client.id)
        ? current.clients.map((item) => (item.id === client.id ? client : item))
        : [client, ...current.clients],
    }));
  }

  function updateFundraisingTargetLocally(target: FundraisingClientTarget) {
    setClientDashboard((current) => ({
      ...current,
      targets: current.targets.some((item) => item.id === target.id)
        ? current.targets.map((item) => (item.id === target.id ? target : item))
        : [target, ...current.targets],
    }));
  }

  function removeFundraisingClientLocally(clientId: string) {
    setClientDashboard((current) => ({
      ...current,
      clients: current.clients.filter((client) => client.id !== clientId),
      targets: current.targets.filter((target) => target.clientId !== clientId),
    }));
  }

  function removeFundraisingTargetLocally(targetId: string) {
    setClientDashboard((current) => ({
      ...current,
      targets: current.targets.filter((target) => target.id !== targetId),
    }));
  }

  async function saveFundraisingClient() {
    if (isSavingFundraising) return;
    const amountMinor = fundraisingClientDraft.targetRaiseAmount.trim() ? parseMoneyInput(fundraisingClientDraft.targetRaiseAmount) : null;
    const retainerMinor = fundraisingClientDraft.retainerAmount.trim() ? parseMoneyInput(fundraisingClientDraft.retainerAmount) : null;
    const newCompanyName = fundraisingClientDraft.newCompanyName.trim();
    const newPrimaryContactName = fundraisingClientDraft.newPrimaryContactName.trim();
    if (!fundraisingClientDraft.mandateName.trim()) {
      setFundraisingMessage("Mandate name is required.");
      return;
    }
    if (!fundraisingClientDraft.companyId && !newCompanyName) {
      setFundraisingMessage("Choose a client company or enter a new company name.");
      return;
    }
    if (fundraisingClientDraft.targetRaiseAmount.trim() && !amountMinor) {
      setFundraisingMessage("Enter a positive target raise amount with up to two decimals.");
      return;
    }

    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving fundraising clients.");
          return;
        }
        const result = await saveFundraisingClientAction({
          organizationId,
          clientId: fundraisingClientDraft.clientId ?? undefined,
          companyId: fundraisingClientDraft.companyId || null,
          createCompany: fundraisingClientDraft.companyId
            ? undefined
            : {
                name: newCompanyName,
                websiteDomains: normalizeCompanyWebsites(fundraisingClientDraft.newCompanyWebsites),
                country: fundraisingClientDraft.newCompanyCountry || null,
                categories: ["Fundraising Client"],
              },
          mandateName: fundraisingClientDraft.mandateName,
          stage: fundraisingClientDraft.stage,
          primaryContactPersonId: fundraisingClientDraft.primaryContactPersonId || null,
          createPrimaryContact: newPrimaryContactName
            ? {
                displayName: newPrimaryContactName,
                email: fundraisingClientDraft.newPrimaryContactEmail || null,
                jobTitle: fundraisingClientDraft.newPrimaryContactJobTitle || null,
              }
            : undefined,
          signedOn: fundraisingClientDraft.signedOn || null,
          targetRaiseAmountMinor: amountMinor,
          targetRaiseCurrency: amountMinor == null ? null : fundraisingClientDraft.targetRaiseCurrency,
          retainerAmountMinor: retainerMinor,
          retainerCurrency: retainerMinor == null ? null : fundraisingClientDraft.retainerCurrency,
          materialsUrl: fundraisingClientDraft.materialsUrl || null,
          dataRoomUrl: fundraisingClientDraft.dataRoomUrl || null,
          notes: fundraisingClientDraft.notes || null,
        });
        setFundraisingMessage(result.message);
        if (result.ok && result.client) {
          updateFundraisingClientLocally(result.client);
          if (!fundraisingClientDraft.companyId)
            onAddCreatedCompany(
              result.client.companyId,
              newCompanyName,
              fundraisingClientDraft.newCompanyWebsites,
              fundraisingClientDraft.newCompanyCountry,
              "Fundraising Client",
            );
          if (newPrimaryContactName && result.client.primaryContactPersonId) {
            onAddCreatedPerson(
              result.client.companyId,
              result.client.primaryContactPersonId,
              newPrimaryContactName,
              fundraisingClientDraft.newPrimaryContactEmail,
              fundraisingClientDraft.newPrimaryContactJobTitle,
            );
          }
          setFundraisingClientDraft(defaultFundraisingClientDraft());
          setShowClientDrawer(false);
          router.refresh();
        }
        return;
      }

      const companyId = fundraisingClientDraft.companyId || `local-fundraising-company-${Date.now()}`;
      const primaryContactPersonId =
        fundraisingClientDraft.primaryContactPersonId || (newPrimaryContactName ? `local-fundraising-person-${Date.now()}` : null);
      if (!fundraisingClientDraft.companyId)
        onAddCreatedCompany(companyId, newCompanyName, fundraisingClientDraft.newCompanyWebsites, fundraisingClientDraft.newCompanyCountry, "Fundraising Client");
      if (newPrimaryContactName && primaryContactPersonId) {
        onAddCreatedPerson(companyId, primaryContactPersonId, newPrimaryContactName, fundraisingClientDraft.newPrimaryContactEmail, fundraisingClientDraft.newPrimaryContactJobTitle);
      }
      updateFundraisingClientLocally(localFundraisingClientFromDraft(fundraisingClientDraft, amountMinor, retainerMinor, companyId, primaryContactPersonId));
      setFundraisingClientDraft(defaultFundraisingClientDraft());
      setShowClientDrawer(false);
      setFundraisingMessage("Demo fundraising client saved locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function saveFundraisingTarget() {
    if (isSavingFundraising) return;
    const minMinor = fundraisingTargetDraft.ticketSizeMin.trim() ? parseMoneyInput(fundraisingTargetDraft.ticketSizeMin) : null;
    const maxMinor = fundraisingTargetDraft.ticketSizeMax.trim() ? parseMoneyInput(fundraisingTargetDraft.ticketSizeMax) : null;
    const newInvestorCompanyName = fundraisingTargetDraft.newInvestorCompanyName.trim();
    const newInvestorPersonName = fundraisingTargetDraft.newInvestorPersonName.trim();
    if (!fundraisingTargetDraft.clientId) {
      setFundraisingMessage("Choose a fundraising client before adding an investor target.");
      return;
    }
    if (!fundraisingTargetDraft.investorName.trim()) {
      setFundraisingMessage("Investor name is required.");
      return;
    }
    if ((fundraisingTargetDraft.ticketSizeMin.trim() && !minMinor) || (fundraisingTargetDraft.ticketSizeMax.trim() && !maxMinor)) {
      setFundraisingMessage("Enter positive ticket amounts with up to two decimals.");
      return;
    }
    if (minMinor != null && maxMinor != null && maxMinor < minMinor) {
      setFundraisingMessage("Maximum ticket size must be greater than or equal to the minimum.");
      return;
    }

    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving investor targets.");
          return;
        }
        const result = await saveFundraisingTargetAction({
          organizationId,
          targetId: fundraisingTargetDraft.targetId ?? undefined,
          clientId: fundraisingTargetDraft.clientId,
          investorCompanyId: fundraisingTargetDraft.investorCompanyId || null,
          createInvestorCompany:
            fundraisingTargetDraft.investorCompanyId || !newInvestorCompanyName
              ? undefined
              : {
                  name: newInvestorCompanyName,
                  websiteDomains: normalizeCompanyWebsites(fundraisingTargetDraft.newInvestorCompanyWebsites),
                  country: fundraisingTargetDraft.newInvestorCompanyCountry || null,
                  categories: ["Investor Target"],
                },
          investorPersonId: fundraisingTargetDraft.investorPersonId || null,
          createInvestorPerson:
            fundraisingTargetDraft.investorPersonId || !newInvestorPersonName
              ? undefined
              : {
                  displayName: newInvestorPersonName,
                  email: fundraisingTargetDraft.newInvestorPersonEmail || null,
                  jobTitle: fundraisingTargetDraft.newInvestorPersonJobTitle || null,
                },
          investorName: fundraisingTargetDraft.investorName,
          investorEmail: fundraisingTargetDraft.investorEmail || null,
          investorType: fundraisingTargetDraft.investorType || null,
          ticketSizeMinMinor: minMinor,
          ticketSizeMaxMinor: maxMinor,
          ticketSizeCurrency: minMinor == null && maxMinor == null ? null : fundraisingTargetDraft.ticketSizeCurrency,
          stage: fundraisingTargetDraft.stage,
          lastContactedAt: fundraisingTargetDraft.lastContactedAt ? `${fundraisingTargetDraft.lastContactedAt}T00:00:00.000Z` : null,
          nextStep: fundraisingTargetDraft.nextStep || null,
          notes: fundraisingTargetDraft.notes || null,
        });
        setFundraisingMessage(result.message);
        if (result.ok && result.target) {
          updateFundraisingTargetLocally(result.target);
          if (!fundraisingTargetDraft.investorCompanyId && newInvestorCompanyName && result.target.investorCompanyId) {
            onAddCreatedCompany(
              result.target.investorCompanyId,
              newInvestorCompanyName,
              fundraisingTargetDraft.newInvestorCompanyWebsites,
              fundraisingTargetDraft.newInvestorCompanyCountry,
              "Investor Target",
            );
          }
          if (newInvestorPersonName && result.target.investorPersonId) {
            onAddCreatedPerson(
              result.target.investorCompanyId,
              result.target.investorPersonId,
              newInvestorPersonName,
              fundraisingTargetDraft.newInvestorPersonEmail,
              fundraisingTargetDraft.newInvestorPersonJobTitle,
            );
          }
          setFundraisingTargetDraft(defaultFundraisingTargetDraft(result.target.clientId));
          router.refresh();
        }
        return;
      }

      const investorCompanyId = fundraisingTargetDraft.investorCompanyId || (newInvestorCompanyName ? `local-investor-company-${Date.now()}` : null);
      const investorPersonId = fundraisingTargetDraft.investorPersonId || (newInvestorPersonName ? `local-investor-person-${Date.now()}` : null);
      if (!fundraisingTargetDraft.investorCompanyId && newInvestorCompanyName && investorCompanyId) {
        onAddCreatedCompany(investorCompanyId, newInvestorCompanyName, fundraisingTargetDraft.newInvestorCompanyWebsites, fundraisingTargetDraft.newInvestorCompanyCountry, "Investor Target");
      }
      if (newInvestorPersonName && investorPersonId) {
        onAddCreatedPerson(investorCompanyId, investorPersonId, newInvestorPersonName, fundraisingTargetDraft.newInvestorPersonEmail, fundraisingTargetDraft.newInvestorPersonJobTitle);
      }
      updateFundraisingTargetLocally(
        localFundraisingTargetFromDraft(fundraisingTargetDraft, minMinor, maxMinor, investorCompanyId, investorPersonId),
      );
      setFundraisingTargetDraft(defaultFundraisingTargetDraft(fundraisingTargetDraft.clientId));
      setFundraisingMessage("Demo investor target saved locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function deleteFundraisingClient(client: FundraisingClient) {
    if (isSavingFundraising) return;
    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting fundraising clients.");
          return;
        }
        const result = await deleteFundraisingClientAction({ organizationId, id: client.id });
        setFundraisingMessage(result.message);
        if (result.ok) {
          removeFundraisingClientLocally(client.id);
          router.refresh();
        }
        return;
      }
      const hasAccounting =
        accountingData &&
        (accountingData.documents.some((document) => document.companyId === client.companyId) ||
          accountingData.ledgerEntries.some((entry) => entry.companyId === client.companyId));
      if (hasAccounting) {
        setFundraisingMessage("This client has accounting records. Pause or complete the mandate instead of deleting it.");
        return;
      }
      removeFundraisingClientLocally(client.id);
      setFundraisingMessage("Demo fundraising client deleted locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function deleteFundraisingTarget(target: FundraisingClientTarget) {
    if (isSavingFundraising) return;
    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting investor targets.");
          return;
        }
        const result = await deleteFundraisingTargetAction({ organizationId, id: target.id });
        setFundraisingMessage(result.message);
        if (result.ok) {
          removeFundraisingTargetLocally(target.id);
          router.refresh();
        }
        return;
      }
      removeFundraisingTargetLocally(target.id);
      setFundraisingMessage("Demo investor target deleted locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  function editFundraisingClient(client: FundraisingClient) {
    setFundraisingClientDraft(fundraisingClientDraftFromClient(client));
    setShowClientDrawer(true);
    setFundraisingTab("clients");
    setFundraisingMessage(null);
  }

  function startFundraisingTarget(clientId: string) {
    setFundraisingTargetDraft(defaultFundraisingTargetDraft(clientId));
    setFundraisingTab("targets");
    setFundraisingMessage(null);
  }

  function editFundraisingTarget(target: FundraisingClientTarget) {
    setFundraisingTargetDraft(fundraisingTargetDraftFromTarget(target));
    setFundraisingTab("targets");
    setFundraisingMessage(null);
  }

  function openAccountingForFundraisingCompany(companyId: string) {
    if (!accountingAccess.canView) return;
    onOpenAccounting(companyId);
  }

  const listContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredFundraisingClients.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  return (
    <section className="view-surface fundraising-view">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Fundraising clients</p>
          <h2>Signed mandates and investor outreach</h2>
          <span>
            {formatNumber(fundraisingStats.activeClients)} active mandates, {formatNumber(fundraisingStats.targets)} investor targets
          </span>
        </div>
        <div className="surface-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setFundraisingClientDraft(defaultFundraisingClientDraft());
              setShowClientDrawer(true);
            }}
          >
            <Plus size={15} /> New client
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setFundraisingTargetDraft(defaultFundraisingTargetDraft(fundraisingClients[0]?.id ?? ""))}
            disabled={fundraisingClients.length === 0}
          >
            <Plus size={15} /> New target
          </button>
        </div>
      </div>

      <div className="fundraising-kpi-grid">
        <Metric label="Signed clients" value={formatNumber(fundraisingStats.signedClients)} />
        <Metric label="Active mandates" value={formatNumber(fundraisingStats.activeClients)} />
        <Metric label="Investor targets" value={formatNumber(fundraisingStats.targets)} />
        <Metric label="Contacted" value={formatNumber(fundraisingStats.contactedTargets)} />
        <Metric label="Replies" value={formatNumber(fundraisingStats.repliedTargets)} />
        <Metric label="Meetings" value={formatNumber(fundraisingStats.meetings)} />
      </div>

      <div className="accounting-summary-grid fundraising-summary-grid">
        {fundraisingData.summaries.map((summary) => (
          <article key={summary.currency} className="accounting-summary-card">
            <div>
              <span>{summary.currency}</span>
              <strong>
                {formatMinorMoney(
                  summary.targetRaiseMinor || summary.ticketSizeMaxMinor || summary.netCashMinor,
                  summary.currency,
                )}
              </strong>
            </div>
            <dl>
              <div>
                <dt>Target raise</dt>
                <dd>{formatMinorMoney(summary.targetRaiseMinor, summary.currency)}</dd>
              </div>
              <div>
                <dt>Target tickets</dt>
                <dd>
                  {formatMinorMoney(summary.ticketSizeMinMinor, summary.currency)} -{" "}
                  {formatMinorMoney(summary.ticketSizeMaxMinor, summary.currency)}
                </dd>
              </div>
              {accountingAccess.canView ? (
                <>
                  <div>
                    <dt>Retainers</dt>
                    <dd>{formatMinorMoney(summary.retainerIncomeMinor, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{formatMinorMoney(summary.outstandingMinor, summary.currency)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </article>
        ))}
        {fundraisingData.summaries.length === 0 ? (
          <article className="accounting-summary-card empty">
            <strong>No mandate totals yet.</strong>
            <span>Add client target raises or investor ticket sizes to populate currency summaries.</span>
          </article>
        ) : null}
        {!accountingAccess.canView ? (
          <article className="accounting-summary-card empty locked-inline-card">
            <strong>Finance figures restricted.</strong>
            <span>Client workflow is visible; retainers, commissions, expenses, and ledger totals require accounting access.</span>
          </article>
        ) : null}
      </div>

      <div className="accounting-toolbar fundraising-toolbar">
        <div className="accounting-tabs" role="tablist" aria-label="Fundraising client sections">
          <button type="button" className={clsx(fundraisingTab === "clients" && "active")} onClick={() => setFundraisingTab("clients")}>
            Clients
          </button>
          <button type="button" className={clsx(fundraisingTab === "targets" && "active")} onClick={() => setFundraisingTab("targets")}>
            Investor targets
          </button>
          <button type="button" className={clsx(fundraisingTab === "finance" && "active")} onClick={() => setFundraisingTab("finance")}>
            Finance
          </button>
        </div>
        <label className="search-box accounting-search">
          <Search size={16} />
          <input
            value={fundraisingQuery}
            onChange={(event) => setFundraisingQuery(event.target.value)}
            placeholder="Search clients, investors, next steps"
          />
        </label>
      </div>

      <div className="accounting-filters">
        <FilterSelect
          value={fundraisingClientStageFilter}
          onChange={setFundraisingClientStageFilter}
          label="Client stage"
          options={FUNDRAISING_CLIENT_STAGES.map((stage) => FUNDRAISING_CLIENT_STAGE_LABELS[stage])}
          optionValues={[...FUNDRAISING_CLIENT_STAGES]}
        />
        <FilterSelect
          value={fundraisingTargetStageFilter}
          onChange={setFundraisingTargetStageFilter}
          label="Target stage"
          options={FUNDRAISING_TARGET_STAGES.map((stage) => FUNDRAISING_TARGET_STAGE_LABELS[stage])}
          optionValues={[...FUNDRAISING_TARGET_STAGES]}
        />
        <FilterSelect
          value={fundraisingCompanyFilter}
          onChange={setFundraisingCompanyFilter}
          label="Client company"
          options={fundraisingClientCompanies.map((company) => company.name)}
          optionValues={fundraisingClientCompanies.map((company) => company.id)}
        />
        <FilterSelect value={fundraisingCurrencyFilter} onChange={setFundraisingCurrencyFilter} label="Currency" options={fundraisingCurrencies} />
        <FilterSelect value={fundraisingInvestorTypeFilter} onChange={setFundraisingInvestorTypeFilter} label="Investor type" options={fundraisingInvestorTypes} />
      </div>

      {fundraisingMessage ? (
        <div className="data-notice">
          <Flag size={16} />
          <span>{fundraisingMessage}</span>
        </div>
      ) : null}

      <div className="fundraising-tab-content">
        {fundraisingTab === "clients" ? (
          <div className="fundraising-grid">
            <div
              ref={listContainerRef}
              className="fundraising-virtual-list"
              style={{ height: "calc(100vh - 280px)" }}
            >
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const client = filteredFundraisingClients[virtualItem.index];
                  const companyName = companyNameById.get(client.companyId) ?? "Unknown company";
                  const targets = fundraisingTargetsByClient.get(client.id) ?? [];
                  const primaryContact =
                    peopleDirectory.find(({ person }) => person.id === client.primaryContactPersonId)?.person ?? null;
                  return (
                    <div
                      key={client.id}
                      className="fundraising-virtual-row"
                      style={{ transform: `translateY(${virtualItem.start}px)` }}
                    >
                      <article className="fundraising-client-card">
                        <div className="fundraising-card-header">
                          <div>
                            <strong>{client.mandateName}</strong>
                            <button type="button" className="text-button compact" onClick={() => onOpenCompany(client.companyId)}>
                              {companyName}
                            </button>
                          </div>
                          <span className={clsx("fundraising-stage-pill", client.stage)}>
                            {FUNDRAISING_CLIENT_STAGE_LABELS[client.stage]}
                          </span>
                        </div>
                        <div className="fundraising-card-meta">
                          <span>
                            <UsersRound size={13} /> {formatNumber(targets.length)} targets
                          </span>
                          <span>
                            <Activity size={13} /> {client.signedOn ? formatDate(client.signedOn) : "No signed date"}
                          </span>
                          <span>
                            <UserRound size={13} /> {primaryContact?.displayName ?? "No primary contact"}
                          </span>
                          <span>
                            <Flag size={13} />{" "}
                            {client.targetRaiseAmountMinor && client.targetRaiseCurrency
                              ? formatMinorMoney(client.targetRaiseAmountMinor, client.targetRaiseCurrency)
                              : "No target raise"}
                          </span>
                          {client.retainerAmountMinor && client.retainerCurrency ? (
                            <span>
                              <span>💰</span> Retainer:{" "}
                              {formatMinorMoney(client.retainerAmountMinor, client.retainerCurrency)}
                            </span>
                          ) : null}
                        </div>
                        {client.notes ? <p className="pipeline-card-note">{client.notes}</p> : null}
                        <div className="fundraising-row-actions">
                          <button
                            type="button"
                            className="text-button compact"
                            onClick={() => editFundraisingClient(client)}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className="text-button compact"
                            onClick={() => startFundraisingTarget(client.id)}
                          >
                            <Plus size={13} /> Add target
                          </button>
                          <button
                            type="button"
                            className="text-button compact"
                            onClick={() => openAccountingForFundraisingCompany(client.companyId)}
                            disabled={!accountingAccess.canView}
                          >
                            <CreditCard size={13} /> Accounting
                          </button>
                          <button
                            type="button"
                            className="text-button compact danger"
                            onClick={() => deleteFundraisingClient(client)}
                            disabled={isSavingFundraising}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
            {filteredFundraisingClients.length === 0 ? (
              <p className="empty-state">No fundraising clients match these filters.</p>
            ) : null}
          </div>
        ) : null}

        {fundraisingTab === "targets" ? (
          <div className="fundraising-grid">
            <form
              className="accounting-form fundraising-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveFundraisingTarget();
              }}
            >
              <div className="accounting-form-header">
                <h2>{fundraisingTargetDraft.targetId ? "Edit target" : "New investor target"}</h2>
                {fundraisingTargetDraft.targetId ? (
                  <button
                    type="button"
                    className="text-button compact"
                    onClick={() => setFundraisingTargetDraft(defaultFundraisingTargetDraft(fundraisingClients[0]?.id ?? ""))}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <label>
                <span>Fundraising client</span>
                <select
                  value={fundraisingTargetDraft.clientId}
                  onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, clientId: event.target.value }))}
                  required
                >
                  <option value="">Choose client</option>
                  {fundraisingClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.mandateName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Investor company</span>
                <select
                  value={fundraisingTargetDraft.investorCompanyId}
                  onChange={(event) => {
                    const company = companies.find((item) => item.id === event.target.value);
                    setFundraisingTargetDraft((current) => ({
                      ...current,
                      investorCompanyId: event.target.value,
                      investorName: current.investorName || company?.name || current.investorName,
                    }));
                  }}
                >
                  <option value="">Create new or snapshot only</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              {!fundraisingTargetDraft.investorCompanyId ? (
                <>
                  <label>
                    <span>New investor company</span>
                    <input
                      value={fundraisingTargetDraft.newInvestorCompanyName}
                      onChange={(event) =>
                        setFundraisingTargetDraft((current) => ({
                          ...current,
                          newInvestorCompanyName: event.target.value,
                          investorName: current.investorName || event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="accounting-form-row">
                    <label>
                      <span>Investor domains</span>
                      <input
                        value={fundraisingTargetDraft.newInvestorCompanyWebsites}
                        onChange={(event) =>
                          setFundraisingTargetDraft((current) => ({ ...current, newInvestorCompanyWebsites: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>Investor country</span>
                      <input
                        value={fundraisingTargetDraft.newInvestorCompanyCountry}
                        onChange={(event) =>
                          setFundraisingTargetDraft((current) => ({ ...current, newInvestorCompanyCountry: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                </>
              ) : null}
              <label>
                <span>Investor name</span>
                <input
                  value={fundraisingTargetDraft.investorName}
                  onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, investorName: event.target.value }))}
                  required
                />
              </label>
              <div className="accounting-form-row">
                <label>
                  <span>Investor type</span>
                  <input
                    value={fundraisingTargetDraft.investorType}
                    onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, investorType: event.target.value }))}
                    placeholder="VC, family office, PE..."
                  />
                </label>
                <label>
                  <span>Stage</span>
                  <select
                    value={fundraisingTargetDraft.stage}
                    onChange={(event) =>
                      setFundraisingTargetDraft((current) => ({ ...current, stage: event.target.value as FundraisingTargetStage }))
                    }
                  >
                    {FUNDRAISING_TARGET_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {FUNDRAISING_TARGET_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <span>Investor contact</span>
                <select
                  value={fundraisingTargetDraft.investorPersonId}
                  onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, investorPersonId: event.target.value }))}
                >
                  <option value="">None</option>
                  {peopleDirectory.map(({ person, companies }) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName} - {companies.map((company) => company.name).join(", ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>New investor contact</span>
                <input
                  value={fundraisingTargetDraft.newInvestorPersonName}
                  onChange={(event) =>
                    setFundraisingTargetDraft((current) => ({ ...current, newInvestorPersonName: event.target.value }))
                  }
                />
              </label>
              <div className="accounting-form-row">
                <label>
                  <span>Contact email</span>
                  <input
                    value={fundraisingTargetDraft.newInvestorPersonEmail}
                    onChange={(event) =>
                      setFundraisingTargetDraft((current) => ({
                        ...current,
                        newInvestorPersonEmail: event.target.value,
                        investorEmail: current.investorEmail || event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>Contact title</span>
                  <input
                    value={fundraisingTargetDraft.newInvestorPersonJobTitle}
                    onChange={(event) =>
                      setFundraisingTargetDraft((current) => ({ ...current, newInvestorPersonJobTitle: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="accounting-form-row">
                <label>
                  <span>Min ticket</span>
                  <input
                    inputMode="decimal"
                    value={fundraisingTargetDraft.ticketSizeMin}
                    onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, ticketSizeMin: event.target.value }))}
                    placeholder="0.00"
                  />
                </label>
                <label>
                  <span>Max ticket</span>
                  <input
                    inputMode="decimal"
                    value={fundraisingTargetDraft.ticketSizeMax}
                    onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, ticketSizeMax: event.target.value }))}
                    placeholder="0.00"
                  />
                </label>
              </div>
              <div className="accounting-form-row">
                <label>
                  <span>Currency</span>
                  <input
                    value={fundraisingTargetDraft.ticketSizeCurrency}
                    onChange={(event) =>
                      setFundraisingTargetDraft((current) => ({ ...current, ticketSizeCurrency: event.target.value.toUpperCase() }))
                    }
                    maxLength={3}
                  />
                </label>
                <label>
                  <span>Last contacted</span>
                  <input
                    type="date"
                    value={fundraisingTargetDraft.lastContactedAt}
                    onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, lastContactedAt: event.target.value }))}
                  />
                </label>
              </div>
              <label>
                <span>Next step</span>
                <input
                  value={fundraisingTargetDraft.nextStep}
                  onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, nextStep: event.target.value }))}
                />
              </label>
              <label>
                <span>Notes</span>
                <textarea
                  value={fundraisingTargetDraft.notes}
                  onChange={(event) => setFundraisingTargetDraft((current) => ({ ...current, notes: event.target.value }))}
                  rows={3}
                />
              </label>
              <button type="submit" className="primary-button" disabled={isSavingFundraising || fundraisingClients.length === 0}>
                <Check size={15} /> {isSavingFundraising ? "Saving..." : "Save target"}
              </button>
            </form>

            <div className="accounting-table-wrap fundraising-targets-table">
              <table className="accounting-table">
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th>Client</th>
                    <th>Stage</th>
                    <th>Ticket</th>
                    <th>Next step</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredFundraisingTargets.map((target) => {
                    const client = fundraisingClientById.get(target.clientId);
                    return (
                      <tr key={target.id}>
                        <td>
                          <strong>{target.investorName}</strong>
                          <span>{target.investorType ?? target.investorEmail ?? "Investor target"}</span>
                        </td>
                        <td>{client?.mandateName ?? "Unknown client"}</td>
                        <td>
                          <span className={clsx("fundraising-stage-pill", target.stage)}>
                            {FUNDRAISING_TARGET_STAGE_LABELS[target.stage]}
                          </span>
                        </td>
                        <td>
                          {target.ticketSizeCurrency && (target.ticketSizeMinMinor || target.ticketSizeMaxMinor)
                            ? `${target.ticketSizeMinMinor ? formatMinorMoney(target.ticketSizeMinMinor, target.ticketSizeCurrency) : "?"} - ${target.ticketSizeMaxMinor ? formatMinorMoney(target.ticketSizeMaxMinor, target.ticketSizeCurrency) : "?"}`
                            : "No ticket"}
                        </td>
                        <td>{target.nextStep ?? "No next step"}</td>
                        <td>
                          <div className="accounting-row-actions">
                            <button
                              type="button"
                              className="text-button compact"
                              onClick={() => editFundraisingTarget(target)}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            {target.investorCompanyId ? (
                              <button
                                type="button"
                                className="text-button compact"
                                onClick={() => onOpenCompany(target.investorCompanyId!)}
                              >
                                Open CRM
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="text-button compact danger"
                              onClick={() => deleteFundraisingTarget(target)}
                              disabled={isSavingFundraising}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredFundraisingTargets.length === 0 ? (
                <p className="empty-state">No investor targets match these filters.</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {fundraisingTab === "finance" ? (
          !accountingAccess.canView ? (
            <div className="locked-panel">
              <CreditCard size={24} />
              <div>
                <strong>Finance details are restricted.</strong>
                <span>
                  Your account can use the client dashboard, but retainers, commissions, expenses, and ledger movements require
                  accounting access.
                </span>
              </div>
            </div>
          ) : (
            <div className="accounting-table-wrap fundraising-finance-table">
              <table className="accounting-table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Documents</th>
                    <th>Ledger</th>
                    <th>Open items</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredFundraisingClients.map((client) => {
                    const documents = accountingData?.documents.filter((document) => document.companyId === client.companyId) ?? [];
                    const ledgerEntries = accountingData?.ledgerEntries.filter((entry) => entry.companyId === client.companyId) ?? [];
                    const openDocuments = documents.filter(
                      (document) => document.status !== "paid" && document.status !== "void" && !document.voidedAt,
                    );
                    return (
                      <tr key={client.id}>
                        <td>
                          <strong>{client.mandateName}</strong>
                          <span>{companyNameById.get(client.companyId) ?? "Unknown company"}</span>
                        </td>
                        <td>{formatNumber(documents.length)}</td>
                        <td>{formatNumber(ledgerEntries.length)}</td>
                        <td>{formatNumber(openDocuments.length)}</td>
                        <td>
                          <button
                            type="button"
                            className="text-button compact"
                            onClick={() => openAccountingForFundraisingCompany(client.companyId)}
                          >
                            Open accounting
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredFundraisingClients.length === 0 ? (
                <p className="empty-state">No client finance rows match these filters.</p>
              ) : null}
            </div>
          )
        ) : null}
      </div>

      {showClientDrawer && (
        <>
          <div className="drawer-backdrop" onClick={() => setShowClientDrawer(false)} />
          <section className="drawer-panel open" role="dialog" aria-modal="true">
            <div className="drawer-header">
              <h2>{fundraisingClientDraft.clientId ? "Edit client" : "New client"}</h2>
              <button type="button" className="icon-button" onClick={() => setShowClientDrawer(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="drawer-body">
              <form
                className="drawer-form"
                id="client-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveFundraisingClient();
                }}
              >
                <label>
                  <span>Client company</span>
                  <select
                    value={fundraisingClientDraft.companyId}
                    onChange={(event) => {
                      const company = companies.find((item) => item.id === event.target.value);
                      setFundraisingClientDraft((current) => ({
                        ...current,
                        companyId: event.target.value,
                        mandateName: current.mandateName || (company ? `${company.name} fundraising mandate` : current.mandateName),
                      }));
                    }}
                  >
                    <option value="">Create new company</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!fundraisingClientDraft.companyId ? (
                  <>
                    <label>
                      <span>New client company</span>
                      <input
                        value={fundraisingClientDraft.newCompanyName}
                        onChange={(event) =>
                          setFundraisingClientDraft((current) => ({ ...current, newCompanyName: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      <span>Company domains</span>
                      <input
                        value={fundraisingClientDraft.newCompanyWebsites}
                        onChange={(event) =>
                          setFundraisingClientDraft((current) => ({ ...current, newCompanyWebsites: event.target.value }))
                        }
                        placeholder="example.com"
                      />
                    </label>
                    <label>
                      <span>Company country</span>
                      <input
                        value={fundraisingClientDraft.newCompanyCountry}
                        onChange={(event) =>
                          setFundraisingClientDraft((current) => ({ ...current, newCompanyCountry: event.target.value }))
                        }
                      />
                    </label>
                  </>
                ) : null}
                <label>
                  <span>Mandate name</span>
                  <input
                    value={fundraisingClientDraft.mandateName}
                    onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, mandateName: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  <span>Stage</span>
                  <select
                    value={fundraisingClientDraft.stage}
                    onChange={(event) =>
                      setFundraisingClientDraft((current) => ({ ...current, stage: event.target.value as FundraisingClientStage }))
                    }
                  >
                    {FUNDRAISING_CLIENT_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {FUNDRAISING_CLIENT_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="accounting-form-row">
                  <label>
                    <span>Target raise</span>
                    <input
                      inputMode="decimal"
                      value={fundraisingClientDraft.targetRaiseAmount}
                      onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, targetRaiseAmount: event.target.value }))}
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    <span>Currency</span>
                    <input
                      value={fundraisingClientDraft.targetRaiseCurrency}
                      onChange={(event) =>
                        setFundraisingClientDraft((current) => ({ ...current, targetRaiseCurrency: event.target.value.toUpperCase() }))
                      }
                      maxLength={3}
                    />
                  </label>
                </div>
                <div className="accounting-form-row">
                  <label>
                    <span>Retainer amount</span>
                    <input
                      inputMode="decimal"
                      value={fundraisingClientDraft.retainerAmount}
                      onChange={(e) => setFundraisingClientDraft((c) => ({ ...c, retainerAmount: e.target.value }))}
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    <span>Currency</span>
                    <input
                      value={fundraisingClientDraft.retainerCurrency}
                      onChange={(e) => setFundraisingClientDraft((c) => ({ ...c, retainerCurrency: e.target.value.toUpperCase() }))}
                      maxLength={3}
                    />
                  </label>
                </div>
                <div className="accounting-form-row">
                  <label>
                    <span>Signed on</span>
                    <input
                      type="date"
                      value={fundraisingClientDraft.signedOn}
                      onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, signedOn: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Primary contact</span>
                    <select
                      value={fundraisingClientDraft.primaryContactPersonId}
                      onChange={(event) =>
                        setFundraisingClientDraft((current) => ({ ...current, primaryContactPersonId: event.target.value }))
                      }
                    >
                      <option value="">None</option>
                      {peopleDirectory.map(({ person, companies }) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName} - {companies.map((company) => company.name).join(", ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  <span>New primary contact</span>
                  <input
                    value={fundraisingClientDraft.newPrimaryContactName}
                    onChange={(event) =>
                      setFundraisingClientDraft((current) => ({ ...current, newPrimaryContactName: event.target.value }))
                    }
                    placeholder="Optional contact name"
                  />
                </label>
                <div className="accounting-form-row">
                  <label>
                    <span>Contact email</span>
                    <input
                      value={fundraisingClientDraft.newPrimaryContactEmail}
                      onChange={(event) =>
                        setFundraisingClientDraft((current) => ({ ...current, newPrimaryContactEmail: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>Contact title</span>
                    <input
                      value={fundraisingClientDraft.newPrimaryContactJobTitle}
                      onChange={(event) =>
                        setFundraisingClientDraft((current) => ({ ...current, newPrimaryContactJobTitle: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="accounting-form-row">
                  <label>
                    <span>Materials URL</span>
                    <input
                      value={fundraisingClientDraft.materialsUrl}
                      onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, materialsUrl: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Data room URL</span>
                    <input
                      value={fundraisingClientDraft.dataRoomUrl}
                      onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, dataRoomUrl: event.target.value }))}
                    />
                  </label>
                </div>
                <label>
                  <span>Notes</span>
                  <textarea
                    value={fundraisingClientDraft.notes}
                    onChange={(event) => setFundraisingClientDraft((current) => ({ ...current, notes: event.target.value }))}
                    rows={3}
                  />
                </label>
              </form>
            </div>
            <div className="drawer-footer">
              <button type="button" className="secondary-button" onClick={() => setShowClientDrawer(false)}>
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={isSavingFundraising} form="client-form">
                {isSavingFundraising ? "Saving..." : "Save client"}
              </button>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
