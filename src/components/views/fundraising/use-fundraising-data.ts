"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";

import { normalizeCompanyWebsites } from "@/lib/company-websites";
import { withFundraisingSummaries } from "@/lib/fundraising";
import { buildRetainerForecastDates } from "@/lib/retainer-forecast";
import { isLocalPendingId, isRemoteId } from "@/lib/pending-changes";
import type { PendingChangeRecord } from "@/lib/crm-types";
import type {
  AccountingAccess,
  AccountingData,
  ClientDashboardData,
  Company,
  FundraisingClient,
  FundraisingClientTarget,
} from "@/lib/types";
import type { PeopleDirectoryRow } from "@/components/shared";
import type { FundraisingTab, FundraisingClientDraft, FundraisingTargetDraft, FundraisingRetainerPeriod } from "./fundraising-types";
import {
  ACTIVE_FUNDRAISING_CLIENT_STAGES,
  CONTACTED_TARGET_STAGES,
  defaultFundraisingClientDraft,
  defaultFundraisingTargetDraft,
  formatMinorMoney,
  fundraisingClientDraftFromClient,
  fundraisingSearchParts,
  fundraisingTargetDraftFromTarget,
  localFundraisingClientFromDraft,
  localFundraisingTargetFromDraft,
  parseMoneyInput,
  RETAINER_CADENCE_LABELS,
  searchTextMatches,
  FUNDRAISING_CLIENT_STAGE_LABELS,
} from "./fundraising-types";

type UseFundraisingDataOptions = {
  initialClientDashboard: ClientDashboardData;
  companies: Company[];
  peopleDirectory: PeopleDirectoryRow[];
  accountingData: AccountingData | null;
  accountingAccess: AccountingAccess;
  dataMode: "demo" | "supabase";
  currentUserName: string;
  onOpenAccounting: (companyId: string) => void;
  onAddCreatedCompany: (companyId: string, name: string, websites: string, country: string, category: string) => void;
  onAddCreatedPerson: (companyId: string | null, personId: string, displayName: string, email: string, jobTitle: string) => void;
  queuePendingRecord: (record: PendingChangeRecord) => void;
  discardPendingChange: (key: string, label?: string) => void;
};

export function useFundraisingData(options: UseFundraisingDataOptions) {
  const {
    initialClientDashboard, companies, accountingData, accountingAccess,
    dataMode, onAddCreatedCompany, onAddCreatedPerson,
    queuePendingRecord, discardPendingChange,
  } = options;

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
  const [retainerPeriods, setRetainerPeriods] = useState(() => initialClientDashboard.retainerPeriods);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setRetainerPeriods(initialClientDashboard.retainerPeriods);
    });
    return () => { cancelled = true; };
  }, [initialClientDashboard.retainerPeriods]);

  const deferredFundraisingQuery = useDeferredValue(fundraisingQuery.trim());

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setClientDashboard(initialClientDashboard);
        setFundraisingTargetDraft((current) => (current.clientId ? current : defaultFundraisingTargetDraft(initialClientDashboard.clients[0]?.id ?? "")));
      }
    });
    return () => { cancelled = true; };
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
    () => companies
      .filter((company) => fundraisingClientCompanyIds.has(company.id))
      .sort((left, right) => left.name.localeCompare(right.name, "en-US")),
    [companies, fundraisingClientCompanyIds],
  );

  const fundraisingCurrencies = useMemo(
    () => [...new Set([
      ...fundraisingData.summaries.map((summary) => summary.currency),
      ...fundraisingClients.map((client) => client.targetRaiseCurrency).filter(Boolean),
      ...fundraisingTargets.map((target) => target.ticketSizeCurrency).filter(Boolean),
    ] as string[])].sort(),
    [fundraisingClients, fundraisingData.summaries, fundraisingTargets],
  );

  const fundraisingInvestorTypes = useMemo(
    () => [...new Set(fundraisingTargets.map((target) => target.investorType).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "en-US")),
    [fundraisingTargets],
  );

  const filteredFundraisingClients = useMemo(
    () => fundraisingClients.filter((client) => {
      if (fundraisingClientStageFilter && client.stage !== fundraisingClientStageFilter) return false;
      if (fundraisingCompanyFilter && client.companyId !== fundraisingCompanyFilter) return false;
      if (fundraisingCurrencyFilter && client.targetRaiseCurrency !== fundraisingCurrencyFilter) return false;
      if (!deferredFundraisingQuery) return true;
      const text = fundraisingSearchParts([
        client.mandateName, companyNameById.get(client.companyId),
        FUNDRAISING_CLIENT_STAGE_LABELS[client.stage], client.notes,
      ]);
      return searchTextMatches(text, deferredFundraisingQuery);
    }),
    [companyNameById, deferredFundraisingQuery, fundraisingClientStageFilter, fundraisingClients, fundraisingCompanyFilter, fundraisingCurrencyFilter],
  );

  const filteredFundraisingTargets = useMemo(
    () => fundraisingTargets.filter((target) => {
      if (fundraisingTargetStageFilter && target.stage !== fundraisingTargetStageFilter) return false;
      if (fundraisingCompanyFilter && target.investorCompanyId !== fundraisingCompanyFilter) return false;
      if (fundraisingCurrencyFilter && target.ticketSizeCurrency !== fundraisingCurrencyFilter) return false;
      if (fundraisingInvestorTypeFilter && target.investorType !== fundraisingInvestorTypeFilter) return false;
      if (!deferredFundraisingQuery) return true;
      const text = fundraisingSearchParts([
        target.investorName, target.investorEmail, target.nextStep, target.notes,
      ]);
      return searchTextMatches(text, deferredFundraisingQuery);
    }),
    [deferredFundraisingQuery, fundraisingCompanyFilter, fundraisingCurrencyFilter, fundraisingInvestorTypeFilter, fundraisingTargetStageFilter, fundraisingTargets],
  );

  const fundraisingStats = useMemo(() => {
    const signedClients = fundraisingClients.filter((client) => client.stage !== "paused").length;
    const activeClients = fundraisingClients.filter((client) => ACTIVE_FUNDRAISING_CLIENT_STAGES.has(client.stage)).length;
    const targets = fundraisingTargets.length;
    const contactedTargets = fundraisingTargets.filter((target) => CONTACTED_TARGET_STAGES.has(target.stage)).length;
    const repliedTargets = fundraisingTargets.filter(
      (target) => target.stage === "replied" || target.stage === "meeting" || target.stage === "diligence" || target.stage === "soft_commit" || target.stage === "closed",
    ).length;
    const meetings = fundraisingTargets.filter(
      (target) => target.stage === "meeting" || target.stage === "diligence" || target.stage === "soft_commit",
    ).length;
    return { signedClients, activeClients, targets, contactedTargets, repliedTargets, meetings };
  }, [fundraisingClients, fundraisingTargets]);

  const filterCount = [fundraisingClientStageFilter, fundraisingTargetStageFilter, fundraisingCompanyFilter, fundraisingCurrencyFilter, fundraisingInvestorTypeFilter].filter(Boolean).length;

  const addFundraisingClientLocally = useCallback((client: FundraisingClient) => {
    setClientDashboard((current) => ({ ...current, clients: [client, ...current.clients] }));
  }, []);

  const updateFundraisingClientLocally = useCallback((client: FundraisingClient) => {
    setClientDashboard((current) => ({
      ...current,
      clients: current.clients.map((item) => (item.id === client.id ? client : item)),
    }));
  }, []);

  const removeFundraisingClientLocally = useCallback((clientId: string) => {
    setClientDashboard((current) => ({
      ...current,
      clients: current.clients.filter((item) => item.id !== clientId),
      targets: current.targets.filter((target) => target.clientId !== clientId),
    }));
  }, []);

  const addFundraisingTargetLocally = useCallback((target: FundraisingClientTarget) => {
    setClientDashboard((current) => ({ ...current, targets: [target, ...current.targets] }));
  }, []);

  const updateFundraisingTargetLocally = useCallback((target: FundraisingClientTarget) => {
    setClientDashboard((current) => ({
      ...current,
      targets: current.targets.map((item) => (item.id === target.id ? target : item)),
    }));
  }, []);

  const removeFundraisingTargetLocally = useCallback((targetId: string) => {
    setClientDashboard((current) => ({
      ...current,
      targets: current.targets.filter((item) => item.id !== targetId),
    }));
  }, []);

  function fundraisingClientKey(clientId: string) {
    return `fundraising-client:${clientId}`;
  }

  function fundraisingTargetKey(targetId: string) {
    return `fundraising-target:${targetId}`;
  }

  function buildRetainerPreviewPeriods(client: FundraisingClient): FundraisingRetainerPeriod[] {
    if (!client.retainerAmountMinor || !client.retainerCurrency || !client.retainerCadence || !client.retainerNextBillingDate) return [];
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    return buildRetainerForecastDates(client.retainerNextBillingDate, client.retainerCadence).map((periodDate) => ({
      id: `local-retainer-period-${client.id}-${periodDate}`,
      clientId: client.id,
      periodDate,
      expectedAmountMinor: client.retainerAmountMinor as number,
      currency: client.retainerCurrency as string,
      status: periodDate < today ? "overdue" : "pending",
      accountingDocumentId: null,
      notes: client.retainerSchedule,
      createdAt: now,
      updatedAt: now,
    }));
  }

  function syncLocalRetainerPreview(client: FundraisingClient) {
    const previewPeriods = buildRetainerPreviewPeriods(client);
    setRetainerPeriods((current) => [
      ...current.filter((period) => period.clientId !== client.id || (period.status !== "pending" && period.accountingDocumentId)),
      ...previewPeriods,
    ]);
    setClientDashboard((current) => ({
      ...current,
      retainerPeriods: [
        ...current.retainerPeriods.filter((period) => period.clientId !== client.id || (period.status !== "pending" && period.accountingDocumentId)),
        ...previewPeriods,
      ],
    }));
  }

  function removeRetainerPeriodsForClient(clientId: string) {
    setRetainerPeriods((current) => current.filter((period) => period.clientId !== clientId));
    setClientDashboard((current) => ({
      ...current,
      retainerPeriods: current.retainerPeriods.filter((period) => period.clientId !== clientId),
    }));
  }

  function fundraisingClientPayloadFromDraft(
    draft: FundraisingClientDraft,
    amountMinor: number | null,
    retainerMinor: number | null,
    currency: string,
    retainerCurrency: string,
    companyId: string,
    primaryContactPersonId: string | null,
    createCompany: Record<string, unknown> | undefined,
    createPrimaryContact: Record<string, unknown> | undefined,
  ) {
    return {
      organizationId: process.env.NEXT_PUBLIC_DEFAULT_ORG_ID,
      clientId: isRemoteId(draft.clientId) ? draft.clientId : undefined,
      companyId: createCompany ? undefined : companyId,
      createCompany,
      mandateName: draft.mandateName.trim(),
      stage: draft.stage,
      primaryContactPersonId: createPrimaryContact ? undefined : primaryContactPersonId,
      createPrimaryContact,
      signedOn: draft.signedOn || null,
      targetRaiseAmountMinor: amountMinor,
      targetRaiseCurrency: amountMinor ? currency : null,
      retainerAmountMinor: retainerMinor,
      retainerCurrency: retainerMinor ? retainerCurrency : null,
      retainerCadence: retainerMinor ? draft.retainerCadence : null,
      retainerSchedule: retainerMinor ? RETAINER_CADENCE_LABELS[draft.retainerCadence] : null,
      retainerNextBillingDate: retainerMinor ? draft.retainerNextBillingDate || null : null,
      materialsUrl: draft.materialsUrl.trim() || null,
      dataRoomUrl: draft.dataRoomUrl.trim() || null,
      notes: draft.notes.trim() || null,
    };
  }

  function fundraisingTargetPayloadFromDraft(
    draft: FundraisingTargetDraft,
    minMinor: number | null,
    maxMinor: number | null,
    currency: string,
    investorCompanyId: string | null,
    investorPersonId: string | null,
    investorName: string,
    createInvestorCompany: Record<string, unknown> | undefined,
    createInvestorPerson: Record<string, unknown> | undefined,
  ) {
    return {
      organizationId: process.env.NEXT_PUBLIC_DEFAULT_ORG_ID,
      targetId: isRemoteId(draft.targetId) ? draft.targetId : undefined,
      clientId: draft.clientId,
      investorCompanyId: createInvestorCompany ? undefined : investorCompanyId,
      createInvestorCompany,
      investorPersonId: createInvestorPerson ? undefined : investorPersonId,
      createInvestorPerson,
      investorName,
      investorEmail: draft.investorEmail.trim() || null,
      investorType: draft.investorType.trim() || null,
      ticketSizeMinMinor: minMinor,
      ticketSizeMaxMinor: maxMinor,
      ticketSizeCurrency: minMinor || maxMinor ? currency : null,
      stage: draft.stage,
      lastContactedAt: draft.lastContactedAt ? `${draft.lastContactedAt}T00:00:00.000Z` : null,
      nextStep: draft.nextStep.trim() || null,
      notes: draft.notes.trim() || null,
    };
  }

  async function saveFundraisingClient() {
    if (isSavingFundraising) return;
    const draft = fundraisingClientDraft;
    const amountMinor = draft.targetRaiseAmount ? parseMoneyInput(draft.targetRaiseAmount) : null;
    const retainerMinor = draft.retainerAmount ? parseMoneyInput(draft.retainerAmount) : null;
    const currency = draft.targetRaiseCurrency.trim().toUpperCase();
    if (amountMinor && !/^[A-Z]{3}$/.test(currency)) {
      setFundraisingMessage("Use a 3-letter ISO currency code.");
      return;
    }
    const retainerCurrency = draft.retainerCurrency.trim().toUpperCase();
    if (retainerMinor && !/^[A-Z]{3}$/.test(retainerCurrency)) {
      setFundraisingMessage("Use a 3-letter ISO currency code.");
      return;
    }
    if (retainerMinor && !draft.retainerNextBillingDate) {
      setFundraisingMessage("Choose the next retainer billing date.");
      return;
    }
    if (!draft.mandateName.trim()) {
      setFundraisingMessage("Enter a mandate name.");
      return;
    }

    setIsSavingFundraising(true);
    setFundraisingMessage(null);

    try {
      let companyId = draft.companyId;
      let primaryContactPersonId: string | null = draft.primaryContactPersonId || null;

      if (dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving fundraising clients.");
          return;
        }
        const createCompany = !companyId && draft.newCompanyName.trim()
          ? { name: draft.newCompanyName.trim(), websiteDomains: normalizeCompanyWebsites(draft.newCompanyWebsites), country: draft.newCompanyCountry.trim() || null, categories: ["Fundraising client"] }
          : undefined;
        const createPrimaryContact = !primaryContactPersonId && draft.newPrimaryContactName.trim()
          ? { displayName: draft.newPrimaryContactName.trim(), email: draft.newPrimaryContactEmail.trim() || null, jobTitle: draft.newPrimaryContactJobTitle.trim() || null }
          : undefined;

        if (!companyId && createCompany) {
          companyId = `local-company-${Date.now()}`;
          onAddCreatedCompany(companyId, createCompany.name, draft.newCompanyWebsites, draft.newCompanyCountry, "Fundraising client");
        }
        if (!primaryContactPersonId && createPrimaryContact) {
          primaryContactPersonId = `local-person-${Date.now()}`;
          onAddCreatedPerson(companyId, primaryContactPersonId, draft.newPrimaryContactName.trim(), draft.newPrimaryContactEmail, draft.newPrimaryContactJobTitle);
        }

        const localClient = localFundraisingClientFromDraft(draft, amountMinor, retainerMinor, companyId, primaryContactPersonId);
        if (draft.clientId) updateFundraisingClientLocally(localClient);
        else addFundraisingClientLocally(localClient);
        syncLocalRetainerPreview(localClient);
        queuePendingRecord({
          kind: "fundraising-client-save",
          key: fundraisingClientKey(localClient.id),
          label: draft.clientId ? `Update fundraising client "${localClient.mandateName}"` : `Create fundraising client "${localClient.mandateName}"`,
          localId: localClient.id,
          localCompanyId: createCompany ? localClient.companyId : null,
          localPrimaryContactPersonId: createPrimaryContact ? localClient.primaryContactPersonId : null,
          payload: fundraisingClientPayloadFromDraft(
            draft,
            amountMinor,
            retainerMinor,
            currency,
            retainerCurrency,
            companyId,
            primaryContactPersonId,
            createCompany,
            createPrimaryContact,
          ),
        });
        setFundraisingClientDraft(defaultFundraisingClientDraft());
        setShowClientDrawer(false);
        setFundraisingMessage(draft.clientId ? "Fundraising client update queued locally." : "Fundraising client queued locally.");
        return;
      }

      if (!companyId) {
        companyId = `local-company-${Date.now()}`;
        onAddCreatedCompany(companyId, draft.newCompanyName.trim(), draft.newCompanyWebsites, draft.newCompanyCountry, "Fundraising client");
      }
      if (!primaryContactPersonId && draft.newPrimaryContactName.trim()) {
        primaryContactPersonId = `local-person-${Date.now()}`;
        onAddCreatedPerson(companyId, primaryContactPersonId, draft.newPrimaryContactName.trim(), draft.newPrimaryContactEmail, draft.newPrimaryContactJobTitle);
      }
      const localClient = localFundraisingClientFromDraft(draft, amountMinor, retainerMinor, companyId, primaryContactPersonId);
      if (draft.clientId) updateFundraisingClientLocally(localClient);
      else addFundraisingClientLocally(localClient);
      syncLocalRetainerPreview(localClient);
      setFundraisingClientDraft(defaultFundraisingClientDraft());
      setShowClientDrawer(false);
      setFundraisingMessage(draft.clientId ? "Demo client updated locally." : "Demo client saved locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function deleteFundraisingClient(client: FundraisingClient) {
    if (isSavingFundraising) return;
    const targetIdsForClient = clientDashboard.targets.filter((target) => target.clientId === client.id).map((target) => target.id);
    setIsSavingFundraising(true);
    setFundraisingMessage(null);
    try {
      if (dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting fundraising clients.");
          return;
        }
        const hasAccounting = accountingData &&
          (accountingData.documents.some((document) => document.companyId === client.companyId) ||
            accountingData.ledgerEntries.some((entry) => entry.companyId === client.companyId));
        if (hasAccounting) {
          setFundraisingMessage("This client has accounting records. Pause or complete the mandate instead of deleting it.");
          return;
        }
        removeFundraisingClientLocally(client.id);
        removeRetainerPeriodsForClient(client.id);
        targetIdsForClient.forEach((targetId) => discardPendingChange(fundraisingTargetKey(targetId)));
        if (isLocalPendingId(client.id)) {
          discardPendingChange(fundraisingClientKey(client.id), "Local fundraising client");
        } else {
          queuePendingRecord({
            kind: "fundraising-delete",
            key: fundraisingClientKey(client.id),
            label: `Delete fundraising client "${client.mandateName}"`,
            entityType: "client",
            id: client.id,
          });
        }
        setFundraisingMessage("Fundraising client delete queued locally.");
        return;
      }
      const hasAccounting = accountingData &&
        (accountingData.documents.some((document) => document.companyId === client.companyId) ||
          accountingData.ledgerEntries.some((entry) => entry.companyId === client.companyId));
      if (hasAccounting) {
        setFundraisingMessage("This client has accounting records. Pause or complete the mandate instead of deleting it.");
        return;
      }
      removeFundraisingClientLocally(client.id);
      removeRetainerPeriodsForClient(client.id);
      targetIdsForClient.forEach((targetId) => discardPendingChange(fundraisingTargetKey(targetId)));
      setFundraisingMessage("Demo fundraising client deleted locally.");
    } finally {
      setIsSavingFundraising(false);
    }
  }

  async function saveFundraisingTarget() {
    if (isSavingFundraising) return;
    const draft = fundraisingTargetDraft;
    if (!draft.clientId) {
      setFundraisingMessage("Select a fundraising client.");
      return;
    }
    const minMinor = draft.ticketSizeMin ? parseMoneyInput(draft.ticketSizeMin) : null;
    const maxMinor = draft.ticketSizeMax ? parseMoneyInput(draft.ticketSizeMax) : null;
    const currency = draft.ticketSizeCurrency.trim().toUpperCase();
    if ((minMinor || maxMinor) && !/^[A-Z]{3}$/.test(currency)) {
      setFundraisingMessage("Use a 3-letter ISO currency code.");
      return;
    }
    if (!draft.investorName.trim() && !draft.newInvestorCompanyName.trim() && !draft.newInvestorPersonName.trim()) {
      setFundraisingMessage("Enter an investor company or contact name.");
      return;
    }

    setIsSavingFundraising(true);
    setFundraisingMessage(null);

    try {
      let investorCompanyId: string | null = draft.investorCompanyId || null;
      let investorPersonId: string | null = draft.investorPersonId || null;

      const investorName = draft.investorName.trim() || draft.newInvestorCompanyName.trim() || draft.newInvestorPersonName.trim();

      if (dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setFundraisingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving investor targets.");
          return;
        }
        const createInvestorCompany = !investorCompanyId && draft.newInvestorCompanyName.trim()
          ? { name: draft.newInvestorCompanyName.trim(), websiteDomains: normalizeCompanyWebsites(draft.newInvestorCompanyWebsites), country: draft.newInvestorCompanyCountry.trim() || null, categories: ["Fundraising investor"] }
          : undefined;
        const createInvestorPerson = !investorPersonId && draft.newInvestorPersonName.trim()
          ? { displayName: draft.newInvestorPersonName.trim(), email: draft.newInvestorPersonEmail.trim() || null, jobTitle: draft.newInvestorPersonJobTitle.trim() || null }
          : undefined;

        if (!investorCompanyId && createInvestorCompany) {
          investorCompanyId = `local-company-${Date.now()}`;
          onAddCreatedCompany(investorCompanyId, createInvestorCompany.name, draft.newInvestorCompanyWebsites, draft.newInvestorCompanyCountry, "Fundraising investor");
        }
        if (!investorPersonId && createInvestorPerson) {
          investorPersonId = `local-person-${Date.now()}`;
          onAddCreatedPerson(investorCompanyId, investorPersonId, draft.newInvestorPersonName.trim(), draft.newInvestorPersonEmail, draft.newInvestorPersonJobTitle);
        }

        const localTarget = localFundraisingTargetFromDraft(draft, minMinor, maxMinor, investorCompanyId, investorPersonId);
        if (draft.targetId) updateFundraisingTargetLocally(localTarget);
        else addFundraisingTargetLocally(localTarget);
        queuePendingRecord({
          kind: "fundraising-target-save",
          key: fundraisingTargetKey(localTarget.id),
          label: draft.targetId ? `Update investor target "${localTarget.investorName}"` : `Create investor target "${localTarget.investorName}"`,
          localId: localTarget.id,
          localInvestorCompanyId: createInvestorCompany ? localTarget.investorCompanyId : null,
          localInvestorPersonId: createInvestorPerson ? localTarget.investorPersonId : null,
          payload: fundraisingTargetPayloadFromDraft(
            draft,
            minMinor,
            maxMinor,
            currency,
            investorCompanyId,
            investorPersonId,
            investorName,
            createInvestorCompany,
            createInvestorPerson,
          ),
        });
        setFundraisingTargetDraft(defaultFundraisingTargetDraft(draft.clientId));
        setFundraisingMessage(draft.targetId ? "Investor target update queued locally." : "Investor target queued locally.");
        return;
      }

      if (!investorCompanyId && draft.newInvestorCompanyName.trim()) {
        investorCompanyId = `local-company-${Date.now()}`;
        onAddCreatedCompany(investorCompanyId, draft.newInvestorCompanyName.trim(), draft.newInvestorCompanyWebsites, draft.newInvestorCompanyCountry, "Fundraising investor");
      }
      if (!investorPersonId && draft.newInvestorPersonName.trim()) {
        investorPersonId = `local-person-${Date.now()}`;
        onAddCreatedPerson(investorCompanyId, investorPersonId, draft.newInvestorPersonName.trim(), draft.newInvestorPersonEmail, draft.newInvestorPersonJobTitle);
      }
      const localTarget = localFundraisingTargetFromDraft(draft, minMinor, maxMinor, investorCompanyId, investorPersonId);
      if (draft.targetId) updateFundraisingTargetLocally(localTarget);
      else addFundraisingTargetLocally(localTarget);
      setFundraisingTargetDraft(defaultFundraisingTargetDraft(draft.clientId));
      setFundraisingMessage(draft.targetId ? "Demo target updated locally." : "Demo target saved locally.");
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
        removeFundraisingTargetLocally(target.id);
        if (isLocalPendingId(target.id)) {
          discardPendingChange(fundraisingTargetKey(target.id), "Local investor target");
        } else {
          queuePendingRecord({
            kind: "fundraising-delete",
            key: fundraisingTargetKey(target.id),
            label: `Delete investor target "${target.investorName}"`,
            entityType: "target",
            id: target.id,
          });
        }
        setFundraisingMessage("Investor target delete queued locally.");
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

  function updatePeriodStatusLocally(periodId: string, status: FundraisingRetainerPeriod["status"]) {
    setRetainerPeriods((current) =>
      current.map((period) => (period.id === periodId ? { ...period, status, updatedAt: new Date().toISOString() } : period)),
    );
  }

  async function generateRetainerInvoice(period: FundraisingRetainerPeriod) {
    if (isSavingFundraising) return;
    if (dataMode === "supabase") {
      setFundraisingMessage("Invoice generation via server is not yet available.");
      return;
    }
    updatePeriodStatusLocally(period.id, "invoiced");
    setFundraisingMessage(`Invoice generated for ${period.currency} ${formatMinorMoney(period.expectedAmountMinor, period.currency)} — ${period.periodDate}`);
  }

  function clearFilters() {
    setFundraisingClientStageFilter("");
    setFundraisingTargetStageFilter("");
    setFundraisingCompanyFilter("");
    setFundraisingCurrencyFilter("");
    setFundraisingInvestorTypeFilter("");
  }

  return {
    clientDashboard, fundraisingTab, setFundraisingTab,
    fundraisingQuery, setFundraisingQuery,
    fundraisingClientStageFilter, setFundraisingClientStageFilter,
    fundraisingTargetStageFilter, setFundraisingTargetStageFilter,
    fundraisingCompanyFilter, setFundraisingCompanyFilter,
    fundraisingCurrencyFilter, setFundraisingCurrencyFilter,
    fundraisingInvestorTypeFilter, setFundraisingInvestorTypeFilter,
    fundraisingClientDraft, setFundraisingClientDraft,
    fundraisingTargetDraft, setFundraisingTargetDraft,
    fundraisingMessage, setFundraisingMessage,
    isSavingFundraising,
    showClientDrawer, setShowClientDrawer,
    companyNameById,
    fundraisingClients, fundraisingTargets,
    fundraisingData,
    fundraisingTargetsByClient, fundraisingClientById,
    fundraisingClientCompanies,
    fundraisingCurrencies, fundraisingInvestorTypes,
    filteredFundraisingClients, filteredFundraisingTargets,
    fundraisingStats,
    filterCount,
    retainerPeriods,
    saveFundraisingClient, deleteFundraisingClient,
    saveFundraisingTarget, deleteFundraisingTarget,
    editFundraisingClient, editFundraisingTarget,
    startFundraisingTarget,
    generateRetainerInvoice,
    clearFilters,
  };
}
