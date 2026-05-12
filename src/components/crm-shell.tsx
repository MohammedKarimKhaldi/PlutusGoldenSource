"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowDown, ArrowUp, Building2, Check, CircleDot, CreditCard,
  FileSpreadsheet, Flag, Handshake, ListChecks, Mail, Pencil, Star, Upload, UsersRound,
} from "lucide-react";
import clsx from "clsx";

import {
  Metric, FilterSelect, NavButton,
  formatNumber, formatMinorMoney, amountInputFromMinor, parseMoneyInput, todayIsoDate,
  formatChangeCount, normalizeSearchValue, searchTokens,
  INVESTMENT_STATUS_LABELS, CAPACITY_STATUS_LABELS, INVESTMENT_DEAL_STATUS_LABELS,
  ACCOUNTING_DOCUMENT_TYPE_LABELS, ACCOUNTING_DOCUMENT_STATUS_LABELS,
  ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS, ACCOUNTING_DIRECTION_LABELS,
  isUuid, PEOPLE_PAGE_SIZE_OPTIONS, relationshipChipLabel,
} from "@/components/shared";

import {
  addActivityAction, addCompanyTagAction, addInvestmentDealAction,
  deleteAccountingRecordAction, highlightPersonAction,
  mergeCompaniesAction, mergePeopleAction, moveStageAction,
  refreshDashboardAction, renameCompanyTagAction,
  saveAccountingDocumentAction, saveAccountingLedgerEntryAction,
  updateCompanyAction, updateCompanyEnrichmentAction,
  updateInvestmentDealStatusAction, updateInvestmentRelationshipAction,
  updatePersonAction, voidAccountingRecordAction,
} from "@/app/actions";
import { buildAccountingSummaries } from "@/lib/accounting";
import { normalizeCompanyWebsites } from "@/lib/company-websites";
import { normalizePersonCategories, normalizePersonEmails } from "@/lib/person-update";
import { DEFAULT_COMPANY_TAG_COLOR } from "@/lib/enrichment/company-tags";
import { buildDealPipelineRows, groupDealPipelineRows } from "@/lib/deal-pipeline";
import { contactExportValues, filterContactExportRows, type ContactExportCriterion } from "@/lib/export/contacts";
import { FundraisingView } from "@/components/fundraising-view";
import { Sidebar } from "@/components/views/shell/sidebar";
import { CrmTopbar } from "@/components/views/shell/crm-topbar";
import { PipelineStrip } from "@/components/views/pipeline/pipeline-strip";
import { PipelineView } from "@/components/views/pipeline/pipeline-view";
import { DebugBanner } from "@/components/views/shell/debug-banner";
import { AuthFlash } from "@/components/views/shell/auth-flash";
import { MetricsGrid } from "@/components/views/import/metrics-grid";
import { PeopleView } from "@/components/views/people/people-view";
import { TagsView } from "@/components/views/tags/tags-view";
import { TasksView } from "@/components/views/tasks/tasks-view";
import { ImportView } from "@/components/views/import/import-view";
import { SyncDock } from "@/components/views/shell/sync-dock";
import { AccountingView, defaultAccountingDocumentDraft, defaultAccountingLedgerDraft, accountingDocumentDraftFromDocument } from "@/components/views/accounting/accounting-view";
import { AccountingVoidDialog } from "@/components/views/accounting/accounting-void-dialog";
import { CompaniesView } from "@/components/views/companies/companies-view";
import { ContactEditor, usePersonEditor } from "@/components/views/people/contact-editor";
import { usePendingChanges } from "@/components/views/shell/use-pending-changes";
import { useCrmDebug } from "@/components/views/shell/use-crm-debug";
import type {
  AccountingData, AccountingDocument, AccountingLedgerEntry,
  Company, CompanyEnrichment, DashboardData,
  InvestmentDealStatus, InvestmentRelationship, OutreachStage, Person, Tag,
} from "@/lib/types";
import {
  OUTREACH_STAGES,
} from "@/lib/types";
import type {
  InvestmentDraft, AccountingDocumentDraft, AccountingLedgerDraft,
  PipelineStatusDraft, EnrichmentDraft, EnrichmentBatchProgress,
  TagSummary, PeopleDirectoryRow, PeoplePageSize,
} from "@/components/shared";
import type { DealPipelineRow } from "@/lib/deal-pipeline";
import type {
  ActiveView, CompanyPageSize, PendingChangeRecord, PendingChange, CrmShellProps,
   AccountingTab, AccountingRecordActionTarget, EnrichmentApiResponse,
} from "@/lib/crm-types";
import {
  withAccountingSummaries, emptyAccountingData,
  buildCompanySearchText, companyMatches, personMatches,
  exportCompanies, exportDealPipeline, exportPeople,
  normalizeEnrichmentKeywords, defaultCompanyEnrichment,
  relationshipMatches, defaultInvestmentRelationship, relationshipForCompany,
  enrichmentDraftForCompany, investmentDraftForRelationship,
  uniqueList, personSourceIds,
  mergeInvestmentRelationships, mergeCompanyPeople, mergeCompanyActivities,
  latestActivityDate, bestNextTask, mergeCompanyDetails, mergePersonDetails,
  groupPeopleDirectory, initialCompanyIdFor, uniqueValues,
  buildTagSummaries, uniqueTags, enrichmentResponseTags,
  formatDealStatusSummary, emailDomain, extractEmailsFromText,
  COMPANY_PAGE_SIZE_OPTIONS, INCORRECT_EMAIL_TAG,
  accountingSearchParts,
} from "@/lib/crm-utils";

export function CrmShell({
  initialData,
  authSuccess = false,
  companyId,
  hideDetailPanel = false,
  hideTable = false,
  activeView: initialActiveView = "companies",
}: CrmShellProps) {
  const router = useRouter();
  const isSignedIn = initialData.authMode === "supabase" && initialData.currentUserName !== "Not signed in";
  const authLabel = initialData.authMode === "demo" ? "Demo data" : isSignedIn ? "Signed in" : "Signed out";
  const authDetail = initialData.authMode === "demo" ? "Local preview" : isSignedIn ? initialData.currentUserName : "Not signed in";
  const isDemoData = initialData.dataMode === "demo";
  const initialCompanyId = initialCompanyIdFor(initialData.companies, companyId);
  const [companies, setCompanies] = useState(initialData.companies);
  const [activeView, setActiveView] = useState<ActiveView>(initialActiveView);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(companyId && initialCompanyId ? [initialCompanyId] : []));
  const [activeCompanyId, setActiveCompanyId] = useState(initialCompanyId);
  const [query, setQuery] = useState("");
  const [stageFilters, setStageFilters] = useState<Set<string>>(new Set());
  const [countryFilters, setCountryFilters] = useState<Set<string>>(new Set());
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set());
  const [qualityFilters, setQualityFilters] = useState<Set<string>>(new Set());
  const [exportCriterion, setExportCriterion] = useState<ContactExportCriterion>("sector_category");
  const [exportValue, setExportValue] = useState("Biotech");
  const [companyPageSize, setCompanyPageSize] = useState<CompanyPageSize>(100);
  const [companyPage, setCompanyPage] = useState(1);
  const [companyMergeTargetId, setCompanyMergeTargetId] = useState<string | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleCompany, setPeopleCompany] = useState("");
  const [peopleDomain, setPeopleDomain] = useState("");
  const [peopleStage, setPeopleStage] = useState("");
  const [peopleHighlight, setPeopleHighlight] = useState("");
  const [peoplePageSize, setPeoplePageSize] = useState<PeoplePageSize>(250);
  const [peoplePage, setPeoplePage] = useState(1);
  const [personMergeTargetId, setPersonMergeTargetId] = useState<string | null>(null);
  const [personMergeQuery, setPersonMergeQuery] = useState("");
  const [peopleMessage, setPeopleMessage] = useState<string | null>(null);

  const [bulkTag, setBulkTag] = useState("");
  const [noteText, setNoteText] = useState("");
  const [pipelineDrafts, setPipelineDrafts] = useState<Record<string, PipelineStatusDraft>>({});
  const {
    pendingChanges, setPendingChanges, isPushingChanges, syncMessage, setSyncMessage,
    buildPendingChange, queuePendingChange, pushPendingChanges, pushPendingEnrichments, queuePersonUpdate,
  } = usePendingChanges(initialData);
  const [incorrectEmails, setIncorrectEmails] = useState<Set<string>>(new Set());
  const [incorrectEmailMessage, setIncorrectEmailMessage] = useState<string | null>(null);
  const [companyModalId, setCompanyModalId] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState({ companyId: "", name: "", websites: "", description: "", country: "" });
  const [enrichmentDraft, setEnrichmentDraft] = useState<EnrichmentDraft | null>(null);
  const [companyInvestmentDraft, setCompanyInvestmentDraft] = useState<InvestmentDraft | null>(null);
  const [enrichmentMessage, setEnrichmentMessage] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<EnrichmentBatchProgress | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isRefreshingTable, setIsRefreshingTable] = useState(false);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [isSplittingNames, setIsSplittingNames] = useState(false);
  const [splitNamesProgress, setSplitNamesProgress] = useState<{ total: number; completed: number; failed: number } | null>(null);
  const [namesMessage, setNamesMessage] = useState<string | null>(null);
  const [accountingData, setAccountingData] = useState<AccountingData>(() => initialData.accounting ?? emptyAccountingData());
  const [accountingTab, setAccountingTab] = useState<AccountingTab>("documents");
  const [accountingQuery, setAccountingQuery] = useState("");
  const [accountingCompanyFilter, setAccountingCompanyFilter] = useState("");
  const [accountingTypeFilter, setAccountingTypeFilter] = useState("");
  const [accountingStatusFilter, setAccountingStatusFilter] = useState("");
  const [accountingCurrencyFilter, setAccountingCurrencyFilter] = useState("");
  const [accountingDateFrom, setAccountingDateFrom] = useState("");
  const [accountingDateTo, setAccountingDateTo] = useState("");
  const [accountingDocumentDraft, setAccountingDocumentDraft] = useState<AccountingDocumentDraft>(() => defaultAccountingDocumentDraft());
  const [accountingLedgerDraft, setAccountingLedgerDraft] = useState<AccountingLedgerDraft>(() => defaultAccountingLedgerDraft());
  const [accountingRecordActionTarget, setAccountingRecordActionTarget] = useState<AccountingRecordActionTarget | null>(null);
  const [accountingRecordActionReason, setAccountingRecordActionReason] = useState("");
  const [accountingMessage, setAccountingMessage] = useState<string | null>(null);
  const [isSavingAccounting, setIsSavingAccounting] = useState(false);
  const stopBatchRef = useRef(false);
  const batchAbortControllerRef = useRef<AbortController | null>(null);
  const {
    debugMode, debugModeReady, debugStorageIssue, debugDraftHydratedRef,
    toggleDebugMode, resetDebugDraft,
  } = useCrmDebug({
    initialData,
    initialCompanyId,
    companyId,
    buildPendingChange,
    companies,
    pendingChanges,
    syncMessage,
    setCompanies,
    setPendingChanges,
    setSelectedIds,
    setActiveCompanyId,
    setCompanyModalId,
    setBatchProgress,
    stopBatchRef,
    batchAbortControllerRef,
    setCompanyDraft,
    setEnrichmentDraft,
    setCompanyInvestmentDraft,
    setPipelineDrafts,
    setEnrichmentMessage,
    setTagDrafts,
    setPeopleMessage,
    setIncorrectEmailMessage,
    setSyncMessage,
    clearCompanyFilters,
  });
  const deferredCompanyQuery = useDeferredValue(query.trim().toLowerCase());
  const deferredPeopleQuery = useDeferredValue(peopleQuery.trim().toLowerCase());
  const deferredAccountingQuery = useDeferredValue(accountingQuery.trim().toLowerCase());
  const showCompanyTable = !hideTable;
  const showDetailPanel = !hideDetailPanel;

  const selectedCompanies = useMemo(() => companies.filter((company) => selectedIds.has(company.id)), [companies, selectedIds]);
  const companyMergeTarget = selectedCompanies.length >= 2
    ? selectedCompanies.find((company) => company.id === companyMergeTargetId) ?? selectedCompanies[0]
    : null;
  const companyMergeSources = companyMergeTarget ? selectedCompanies.filter((company) => company.id !== companyMergeTarget.id) : [];
  const companySearchTextById = useMemo(() => new Map(companies.map((company) => [company.id, buildCompanySearchText(company)])), [companies]);
  const filteredCompanies = useMemo(
    () => companies.filter((company) => companyMatches(company, companySearchTextById.get(company.id) ?? "", deferredCompanyQuery, stageFilters, countryFilters, tagFilters, qualityFilters)),
    [companies, companySearchTextById, countryFilters, deferredCompanyQuery, qualityFilters, stageFilters, tagFilters],
  );
  const activeCompanyFilterCount = stageFilters.size + countryFilters.size + tagFilters.size + qualityFilters.size;
  const companyTotalPages = companyPageSize === "all" ? 1 : Math.max(1, Math.ceil(filteredCompanies.length / companyPageSize));
  const effectiveCompanyPage = Math.min(companyPage, companyTotalPages);
  const visibleCompanies = useMemo(() => {
    if (companyPageSize === "all") return filteredCompanies;
    const start = (effectiveCompanyPage - 1) * companyPageSize;
    return filteredCompanies.slice(start, start + companyPageSize);
  }, [companyPageSize, effectiveCompanyPage, filteredCompanies]);
  const companyStart = filteredCompanies.length === 0 ? 0 : companyPageSize === "all" ? 1 : (effectiveCompanyPage - 1) * companyPageSize + 1;
  const companyEnd = companyPageSize === "all" ? filteredCompanies.length : Math.min(companyStart + companyPageSize - 1, filteredCompanies.length);
  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? filteredCompanies[0] ?? companies[0];
  const activeCompanyDraft =
    companyDraft.companyId === activeCompany?.id
      ? companyDraft
      : {
          companyId: activeCompany?.id ?? "",
          name: activeCompany?.name ?? "",
          websites: activeCompany?.websiteDomains.join("\n") ?? "",
          description: activeCompany?.description ?? "",
          country: activeCompany?.country ?? "",
        };
  const activeCompanyEnrichmentDraft = activeCompany && enrichmentDraft?.companyId === activeCompany.id ? enrichmentDraft : activeCompany ? enrichmentDraftForCompany(activeCompany) : null;
  const activeCompanyInvestment = activeCompany ? relationshipForCompany(activeCompany) : null;
  const activeCompanyInvestmentDraft =
    activeCompanyInvestment && companyInvestmentDraft?.targetKey === `${activeCompanyInvestment.companyId ?? "none"}:${activeCompanyInvestment.personId ?? "none"}`
      ? companyInvestmentDraft
      : activeCompanyInvestment
        ? investmentDraftForRelationship(activeCompanyInvestment)
        : null;
  const companyNameById = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const accountingCompanies = useMemo(
    () =>
      companies
        .filter((company) => accountingData.documents.some((document) => document.companyId === company.id) || accountingData.ledgerEntries.some((entry) => entry.companyId === company.id))
        .sort((left, right) => left.name.localeCompare(right.name, "en-US")),
    [accountingData.documents, accountingData.ledgerEntries, companies],
  );
  const accountingCurrencies = useMemo(
    () => [...new Set([...accountingData.documents.map((document) => document.currency), ...accountingData.ledgerEntries.map((entry) => entry.currency)])].sort(),
    [accountingData.documents, accountingData.ledgerEntries],
  );
  const filteredAccountingDocuments = useMemo(
    () =>
      accountingData.documents.filter((document) => {
        const dateValue = document.issuedOn ?? document.createdAt.slice(0, 10);
        if (accountingCompanyFilter && document.companyId !== accountingCompanyFilter) return false;
        if (accountingTypeFilter && document.documentType !== accountingTypeFilter) return false;
        if (accountingStatusFilter && document.status !== accountingStatusFilter) return false;
        if (accountingCurrencyFilter && document.currency !== accountingCurrencyFilter) return false;
        if (accountingDateFrom && dateValue < accountingDateFrom) return false;
        if (accountingDateTo && dateValue > accountingDateTo) return false;
        if (!deferredAccountingQuery) return true;
        const searchText = accountingSearchParts([
          document.title,
          document.externalReference,
          document.notes,
          document.currency,
          document.companyId ? companyNameById.get(document.companyId) : "General",
          ACCOUNTING_DOCUMENT_TYPE_LABELS[document.documentType],
          ACCOUNTING_DOCUMENT_STATUS_LABELS[document.status],
        ]);
        return searchText.includes(deferredAccountingQuery);
      }),
    [accountingCompanyFilter, accountingCurrencyFilter, accountingData.documents, accountingDateFrom, accountingDateTo, accountingStatusFilter, accountingTypeFilter, companyNameById, deferredAccountingQuery],
  );
  const filteredAccountingEntries = useMemo(
    () =>
      accountingData.ledgerEntries.filter((entry) => {
        if (accountingCompanyFilter && entry.companyId !== accountingCompanyFilter) return false;
        if (accountingTypeFilter && entry.entryType !== accountingTypeFilter) return false;
        if (accountingStatusFilter === "voided" && !entry.voidedAt) return false;
        if (accountingStatusFilter === "active" && entry.voidedAt) return false;
        if (accountingCurrencyFilter && entry.currency !== accountingCurrencyFilter) return false;
        if (accountingDateFrom && entry.occurredOn < accountingDateFrom) return false;
        if (accountingDateTo && entry.occurredOn > accountingDateTo) return false;
        if (!deferredAccountingQuery) return true;
        const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
        const searchText = accountingSearchParts([
          entry.externalReference,
          entry.notes,
          entry.currency,
          linkedDocument?.title,
          entry.companyId ? companyNameById.get(entry.companyId) : "General",
          ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType],
          ACCOUNTING_DIRECTION_LABELS[entry.direction],
        ]);
        return searchText.includes(deferredAccountingQuery);
      }),
    [accountingCompanyFilter, accountingCurrencyFilter, accountingData.documents, accountingData.ledgerEntries, accountingDateFrom, accountingDateTo, accountingStatusFilter, accountingTypeFilter, companyNameById, deferredAccountingQuery],
  );
  
  const exportOptions = useMemo(() => contactExportValues(companies, exportCriterion), [companies, exportCriterion]);
  const exportRows = useMemo(() => filterContactExportRows(companies, exportCriterion, exportValue), [companies, exportCriterion, exportValue]);
  const countries = uniqueValues(companies, (company) => company.country);
  const tagNames = [...new Set(companies.flatMap((company) => company.tags.map((item) => item.name)))].sort((a, b) => a.localeCompare(b, "en-US"));
  const pipelineCounts = OUTREACH_STAGES.map((item) => ({
    stage: item,
    count: companies.filter((company) => company.outreachStage === item).length,
  }));
  const peopleRelationRows = useMemo(
    () =>
      companies.flatMap((company) =>
        company.people.map((person) => ({
          person,
          company,
        })),
      ),
    [companies],
  );
  const batchTargetCompanies = selectedCompanies.length ? selectedCompanies : filteredCompanies;
  const isBatchEnriching = isEnriching && batchProgress !== null;
  const pendingEnrichmentCount = pendingChanges.filter((change) => change.record.kind === "company-enrichment-update").length;
  const batchProgressProcessed = batchProgress ? batchProgress.completed + batchProgress.skipped + batchProgress.failed : 0;
  const batchProgressPercent = batchProgress && batchProgress.total > 0 ? Math.round((batchProgressProcessed / batchProgress.total) * 100) : 0;
  const peopleDirectory = useMemo(() => groupPeopleDirectory(peopleRelationRows), [peopleRelationRows]);
  const tagSummaries = useMemo(() => {
    const companyTags = new Map<string, Extract<TagSummary, { type: "company" }>>();
    const contactTags = new Map<string, Extract<TagSummary, { type: "contact" }>>();

    companies.forEach((company) => {
      company.tags.forEach((tag) => {
        const key = `company:${tag.id}`;
        const current = companyTags.get(key);
        if (current) current.count += 1;
        else companyTags.set(key, { key, type: "company", id: tag.id, name: tag.name, color: tag.color, count: 1 });
      });
    });

    peopleDirectory.forEach(({ person }) => {
      person.categories.forEach((category) => {
        const key = `contact:${category.toLowerCase()}`;
        const current = contactTags.get(key);
        if (current) current.count += 1;
        else contactTags.set(key, { key, type: "contact", name: category, count: 1 });
      });
    });

    return [...companyTags.values(), ...contactTags.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name, "en-US");
    });
  }, [companies, peopleDirectory]);
  const peopleCompanyNames = useMemo(() => uniqueValues(companies, (company) => company.name), [companies]);
  const peopleEmailDomains = useMemo(
    () => [...new Set(peopleDirectory.flatMap(({ person }) => person.emails.map(emailDomain)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "en-US")),
    [peopleDirectory],
  );
  const personEditor = usePersonEditor({
    peopleDirectory,
    updatePersonLocally,
    queuePendingChange,
    saveInvestmentRelationship,
    addInvestmentDealLocally,
    initialData,
    setPeopleMessage,
    personSourceIds,
  });
  const personMergeTarget = peopleDirectory.find(({ person }) => person.id === personMergeTargetId) ?? null;
  const personMergeCandidates = useMemo(() => {
    if (!personMergeTarget) return [];
    const query = personMergeQuery.trim().toLowerCase();

    return peopleDirectory
      .filter(({ person }) => person.id !== personMergeTarget.person.id)
      .filter(({ person, companies }) => {
        if (!query) return true;
        const text = [person.displayName, person.jobTitle, companies.map((company) => company.name).join(" "), person.emails.join(" "), person.linkedinUrl ?? ""].join(" ").toLowerCase();
        return text.includes(query);
      })
      .slice(0, 10);
  }, [peopleDirectory, personMergeQuery, personMergeTarget]);
  const filteredPeopleDirectory = useMemo(
    () =>
      peopleDirectory.filter(({ person, companies }) =>
        personMatches({
          person,
          companies,
          query: deferredPeopleQuery,
          companyFilter: peopleCompany,
          domainFilter: peopleDomain,
          stageFilter: peopleStage,
          highlightFilter: peopleHighlight,
        }),
      ),
    [deferredPeopleQuery, peopleCompany, peopleDirectory, peopleDomain, peopleHighlight, peopleStage],
  );
  const peopleTotalPages = peoplePageSize === "all" ? 1 : Math.max(1, Math.ceil(filteredPeopleDirectory.length / peoplePageSize));
  const effectivePeoplePage = Math.min(peoplePage, peopleTotalPages);
  const visiblePeopleDirectory = useMemo(() => {
    if (peoplePageSize === "all") return filteredPeopleDirectory;
    const start = (effectivePeoplePage - 1) * peoplePageSize;
    return filteredPeopleDirectory.slice(start, start + peoplePageSize);
  }, [effectivePeoplePage, filteredPeopleDirectory, peoplePageSize]);
  const peopleStart = filteredPeopleDirectory.length === 0 ? 0 : peoplePageSize === "all" ? 1 : (effectivePeoplePage - 1) * peoplePageSize + 1;
  const peopleEnd = peoplePageSize === "all" ? filteredPeopleDirectory.length : Math.min(peopleStart + peoplePageSize - 1, filteredPeopleDirectory.length);
  const taskRows = useMemo(
    () =>
      companies.flatMap((company) =>
        company.nextTask
          ? [
              {
                task: company.nextTask,
                company,
              },
            ]
          : [],
      ),
    [companies],
  );
  const dealPipelineRows = useMemo(() => buildDealPipelineRows(companies), [companies]);
  const dealPipelineGroups = useMemo(() => groupDealPipelineRows(dealPipelineRows), [dealPipelineRows]);

  useEffect(() => {
    if (!authSuccess) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "success") return;

    url.searchParams.delete("auth");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [authSuccess]);

  useEffect(() => {
    const companyIds = new Set(initialData.companies.map((company) => company.id));
    const nextActiveCompanyId = initialCompanyIdFor(initialData.companies, companyId);
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setCompanies(initialData.companies);
      setSelectedIds((current) => {
        const next = new Set([...current].filter((id) => companyIds.has(id)));
        if (companyId && nextActiveCompanyId) next.add(nextActiveCompanyId);
        return next;
      });
      setActiveCompanyId((current) => (companyIds.has(current) ? current : nextActiveCompanyId));
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, initialData.companies]);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) setAccountingData(initialData.accounting ?? emptyAccountingData());
    });

    return () => {
      cancelled = true;
    };
  }, [initialData.accounting]);

  useEffect(() => {
    if (!companyId) return;

    const routeCompanyId = initialCompanyIdFor(companies, companyId);
    if (!routeCompanyId) return;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setActiveCompanyId((current) => (current === routeCompanyId ? current : routeCompanyId));
      setSelectedIds((current) => (current.has(routeCompanyId) ? current : new Set([routeCompanyId])));
    });

    return () => {
      cancelled = true;
    };
  }, [companies, companyId]);

  function updateCompanies(updater: (company: Company) => Company) {
    setCompanies((current) => current.map(updater));
  }

  function toggleCompany(companyId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function toggleCompanyFilter(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setCompanyPage(1);
  }

  function clearCompanyFilters() {
    setStageFilters(new Set());
    setCountryFilters(new Set());
    setTagFilters(new Set());
    setQualityFilters(new Set());
    setCompanyPage(1);
  }

  async function refreshCompanyTable() {
    if (isRefreshingTable) return;

    setIsRefreshingTable(true);
    setSyncMessage("Refreshing company table from the database...");
    try {
      const result = await refreshDashboardAction();
      if (!result.ok) {
        setSyncMessage(`Refresh failed: ${result.message}`);
        return;
      }
      router.refresh();
      setSyncMessage("Company table refresh requested.");
    } catch (error) {
      setSyncMessage(error instanceof Error ? `Refresh failed: ${error.message}` : "Refresh failed.");
    } finally {
      setIsRefreshingTable(false);
    }
  }

  function openCompanyModal(companyId: string) {
    setActiveCompanyId(companyId);
    setCompanyModalId(companyId);
  }

  function closeCompanyModal() {
    setCompanyModalId(null);
  }

  function openCompany(companyId: string) {
    openCompanyModal(companyId);
  }

  function startCompanyMerge() {
    if (selectedCompanies.length < 2) return;
    setCompanyMergeTargetId(selectedIds.has(activeCompanyId) ? activeCompanyId : selectedCompanies[0]?.id ?? null);
  }

  function closeCompanyMerge() {
    setCompanyMergeTargetId(null);
  }

  async function importIncorrectEmailsCsv(file: File) {
    const text = await file.text();
    const uploadedEmails = extractEmailsFromText(text);
    const uploadedEmailSet = new Set(uploadedEmails);

    if (uploadedEmails.length === 0) {
      setIncorrectEmailMessage("No email addresses were found in that CSV.");
      return;
    }

    const matchedEmails = new Set<string>();
    const matchedPeople = new Map<string, Person>();

    for (const { person } of peopleDirectory) {
      const matchingPersonEmails = person.emails.filter((email) => uploadedEmailSet.has(email.toLowerCase()));
      if (matchingPersonEmails.length === 0) continue;

      matchingPersonEmails.forEach((email) => matchedEmails.add(email.toLowerCase()));
      matchedPeople.set(person.id, {
        ...person,
        categories: normalizePersonCategories([...person.categories, INCORRECT_EMAIL_TAG]),
      });
    }

    if (matchedPeople.size === 0) {
      setIncorrectEmailMessage(`Found ${formatNumber(uploadedEmails.length)} email${uploadedEmails.length === 1 ? "" : "s"} in the CSV, but none matched current contacts.`);
      return;
    }

    setIncorrectEmails((current) => new Set([...current, ...matchedEmails]));
    setPeoplePage(1);
    setPeopleQuery(INCORRECT_EMAIL_TAG);
    matchedPeople.forEach((person) => {
      updatePersonLocally(personSourceIds(person), {
        displayName: person.displayName,
        emails: person.emails,
        categories: person.categories,
      });
      queuePersonUpdate(person, "Incorrect email tag", { syncEmails: false });
    });

    setIncorrectEmailMessage(
      `Tagged ${formatNumber(matchedPeople.size)} contact${matchedPeople.size === 1 ? "" : "s"} from ${formatNumber(matchedEmails.size)} matching email${matchedEmails.size === 1 ? "" : "s"}.`,
    );
  }

  function handleIncorrectEmailCsvUpload(file: File | null) {
    if (!file) return;
    void importIncorrectEmailsCsv(file);
  }

  function applyStage(nextStage: OutreachStage) {
    const ids = selectedIds.size > 0 ? [...selectedIds] : activeCompany ? [activeCompany.id] : [];
    updateCompanies((company) => (ids.includes(company.id) ? { ...company, outreachStage: nextStage } : company));

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    ids.forEach((companyId) => {
      queuePendingChange({
        key: `stage:${companyId}`,
        label: "Stage update",
        record: {
          kind: "stage",
          key: `stage:${companyId}`,
          label: "Stage update",
          organizationId: organizationId ?? null,
          companyIds: [companyId],
          stage: nextStage,
        },
        run: () =>
          initialData.authMode === "supabase" && organizationId && isUuid(companyId)
            ? moveStageAction({ organizationId, companyIds: [companyId], stage: nextStage })
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    });
  }

  function applyBulkTag() {
    const cleanTag = bulkTag.trim();
    if (!cleanTag) return;
    const ids = [...selectedIds];
    const newTag: Tag = { id: `local-${cleanTag.toLowerCase().replace(/\s+/g, "-")}`, name: cleanTag, color: "#2563eb" };
    updateCompanies((company) =>
      ids.includes(company.id)
        ? {
            ...company,
            tags: company.tags.some((item) => item.name === cleanTag) ? company.tags : [...company.tags, newTag],
            people: applyCategoryToPeople(company.people, cleanTag),
          }
        : company,
    );
    setBulkTag("");

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    queuePendingChange({
      key: `company-tag:${cleanTag.toLowerCase()}:${ids.join(",")}`,
      label: "Company tag update",
      record: {
        kind: "company-tag",
        key: `company-tag:${cleanTag.toLowerCase()}:${ids.join(",")}`,
        label: "Company tag update",
        organizationId: organizationId ?? null,
        companyIds: ids,
        tagName: cleanTag,
        color: newTag.color,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && ids.length > 0 && ids.every(isUuid)
          ? addCompanyTagAction({ organizationId, companyIds: ids, tagName: cleanTag, color: newTag.color })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function toggleHighlight(companyId: string, person: Person) {
    const targetPersonIds = personSourceIds(person);
    updateCompanies((company) =>
      company.id === companyId
        ? {
            ...company,
            people: company.people.map((item) =>
              item.sourcePersonIds.some((personId) => targetPersonIds.includes(personId)) ? { ...item, highlighted: !item.highlighted } : item,
            ),
          }
        : company,
    );

    for (const personId of targetPersonIds) {
      queuePendingChange({
        key: `highlight:${companyId}:${personId}`,
        label: "Highlight update",
        record: {
          kind: "highlight",
          key: `highlight:${companyId}:${personId}`,
          label: "Highlight update",
          companyId,
          personId,
          highlighted: !person.highlighted,
        },
        run: () =>
          initialData.authMode === "supabase" && isUuid(companyId) && isUuid(personId)
            ? highlightPersonAction({ companyId, personId, highlighted: !person.highlighted })
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    }
  }

  function updateActiveCompany(field: "name" | "websites" | "description" | "country", value: string) {
    if (!activeCompany) return;
    const websites = field === "websites" ? normalizeCompanyWebsites(value) : [];
    const nextValue = field === "name" ? value.trim() : field === "websites" ? websites.join("\n") : value.trim() || null;
    const currentValue = field === "name" ? activeCompany.name : field === "websites" ? activeCompany.websiteDomains.join("\n") : activeCompany[field] ?? null;
    if (field === "name" && !nextValue) {
      setCompanyDraft((current) => ({ ...current, companyId: activeCompany.id, name: activeCompany.name }));
      return;
    }
    if (nextValue === currentValue) return;

    updateCompanies((company) =>
      company.id === activeCompany.id
        ? field === "websites"
          ? { ...company, websiteDomain: websites[0] ?? null, websiteDomains: websites }
          : { ...company, [field]: nextValue }
        : company,
    );

    const payload = field === "websites" ? { companyId: activeCompany.id, websiteDomains: websites } : { companyId: activeCompany.id, [field]: nextValue };
    queuePendingChange({
      key: `company:${activeCompany.id}:${field}`,
      label: "Company detail update",
      record: {
        kind: "company-update",
        key: `company:${activeCompany.id}:${field}`,
        label: "Company detail update",
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && isUuid(activeCompany.id)
          ? updateCompanyAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function updateCompanyEnrichmentLocally(companyId: string, enrichment: CompanyEnrichment, tags: Tag[] = []) {
    updateCompanies((company) => (company.id === companyId ? { ...company, enrichment, tags: uniqueTags([...company.tags, ...tags]) } : company));
  }

  function updateCompanyTagsLocally(companyId: string, tags: Tag[]) {
    if (tags.length === 0) return;
    updateCompanies((company) => (company.id === companyId ? { ...company, tags: uniqueTags([...company.tags, ...tags]) } : company));
  }

  function companyEnrichmentPayload(companyId: string, enrichment: CompanyEnrichment, reviewed: boolean) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    return {
      organizationId: organizationId ?? "",
      companyId,
      status: enrichment.status,
      summary: enrichment.summary,
      industry: enrichment.industry,
      subsector: enrichment.subsector,
      companyType: enrichment.companyType,
      location: enrichment.location,
      keywords: enrichment.keywords,
      sourceUrl: enrichment.sourceUrl,
      model: enrichment.model,
      confidence: enrichment.confidence,
      errorMessage: enrichment.errorMessage,
      generatedAt: enrichment.generatedAt,
      reviewed,
    };
  }

  function queueCompanyEnrichmentUpdate(companyId: string, enrichment: CompanyEnrichment, label: string, reviewed: boolean) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const payload = companyEnrichmentPayload(companyId, enrichment, reviewed);
    queuePendingChange({
      key: `company-enrichment:${companyId}`,
      label,
      record: {
        kind: "company-enrichment-update",
        key: `company-enrichment:${companyId}`,
        label,
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(companyId)
          ? updateCompanyEnrichmentAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function saveActiveCompanyEnrichment() {
    if (!activeCompany || !activeCompanyEnrichmentDraft) return;
    const enrichment: CompanyEnrichment = {
      ...(activeCompany.enrichment ?? defaultCompanyEnrichment(activeCompany)),
      status: "needs_review",
      summary: activeCompanyEnrichmentDraft.summary.trim() || null,
      industry: activeCompanyEnrichmentDraft.industry.trim() || null,
      subsector: activeCompanyEnrichmentDraft.subsector.trim() || null,
      companyType: activeCompanyEnrichmentDraft.companyType.trim() || null,
      location: activeCompanyEnrichmentDraft.location.trim() || null,
      keywords: normalizeEnrichmentKeywords(activeCompanyEnrichmentDraft.keywords),
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    updateCompanyEnrichmentLocally(activeCompany.id, enrichment);
    queueCompanyEnrichmentUpdate(activeCompany.id, enrichment, "Company enrichment update", true);
  }

  async function enrichActiveCompany(force = false) {
    if (!activeCompany || isEnriching) return;
    setIsEnriching(true);
    setBatchProgress(null);
    setEnrichmentMessage(`Enriching ${activeCompany.name} with local Ollama...`);
    try {
      const response = await fetch("/api/enrichment/company", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: activeCompany.id, force }),
      });
      const payload = (await response.json()) as EnrichmentApiResponse;
      if (!response.ok) {
        setEnrichmentMessage(payload.error ?? "Company enrichment failed.");
        return;
      }
      const responseTags = enrichmentResponseTags(payload.tags, payload.tagNames);
      if (payload.skipped) {
        updateCompanyTagsLocally(activeCompany.id, payload.tags ?? []);
        setEnrichmentMessage("Company already has completed enrichment. Use retry to force a refresh.");
        return;
      }
      if (payload.enrichment) {
        updateCompanyEnrichmentLocally(activeCompany.id, payload.enrichment, responseTags);
        setEnrichmentDraft(enrichmentDraftForCompany({ ...activeCompany, enrichment: payload.enrichment }));
        setEnrichmentMessage(payload.enrichment.status === "completed" ? "Company enrichment saved." : `Enrichment needs review: ${payload.enrichment.errorMessage ?? "No website text found."}`);
      }
    } catch (error) {
      setEnrichmentMessage(error instanceof Error ? error.message : "Company enrichment failed.");
    } finally {
      setIsEnriching(false);
    }
  }

  function requestStopEnrichmentBatch() {
    stopBatchRef.current = true;
    batchAbortControllerRef.current?.abort();
    setBatchProgress((current) => (current ? { ...current, stopRequested: true, currentName: "Stopping..." } : current));
    setEnrichmentMessage("Stopping enrichment batch...");
  }

  async function enrichCompanyBatch(targetCompanies: Company[]) {
    if (targetCompanies.length === 0 || isEnriching) return;
    setIsEnriching(true);
    stopBatchRef.current = false;
    let completed = 0;
    let skipped = 0;
    let failed = 0;
    let stopped = false;
    setBatchProgress({
      total: targetCompanies.length,
      completed,
      skipped,
      failed,
      currentName: null,
      stopRequested: false,
      stopped: false,
    });

    for (const company of targetCompanies) {
      if (stopBatchRef.current) {
        stopped = true;
        break;
      }

      setEnrichmentMessage(`Enriching ${completed + skipped + failed + 1} of ${targetCompanies.length}: ${company.name}`);
      setBatchProgress({
        total: targetCompanies.length,
        completed,
        skipped,
        failed,
        currentName: company.name,
        stopRequested: false,
        stopped: false,
      });
      const abortController = new AbortController();
      batchAbortControllerRef.current = abortController;

      try {
        const response = await fetch("/api/enrichment/company", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ companyId: company.id, force: false, persist: false }),
          signal: abortController.signal,
        });
        const payload = (await response.json()) as EnrichmentApiResponse;
        const responseTags = enrichmentResponseTags(payload.tags, payload.tagNames);
        if (!response.ok) {
          failed += 1;
        } else if (payload.skipped) {
          updateCompanyTagsLocally(company.id, payload.tags ?? []);
          skipped += 1;
        } else if (payload.enrichment) {
          updateCompanyEnrichmentLocally(company.id, payload.enrichment, responseTags);
          queueCompanyEnrichmentUpdate(company.id, payload.enrichment, "Company enrichment generated", false);
          completed += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        if (stopBatchRef.current || (error instanceof DOMException && error.name === "AbortError")) {
          stopped = true;
          break;
        }
        failed += 1;
      } finally {
        batchAbortControllerRef.current = null;
        setBatchProgress((current) =>
          current
            ? {
                ...current,
                completed,
                skipped,
                failed,
                currentName: null,
              }
            : current,
        );
      }
    }

    const processed = completed + skipped + failed;
    const statusText = stopped ? `Enrichment stopped after ${processed} of ${targetCompanies.length}` : "Enrichment finished";
    setBatchProgress({
      total: targetCompanies.length,
      completed,
      skipped,
      failed,
      currentName: null,
      stopRequested: false,
      stopped,
    });
    setEnrichmentMessage(`${statusText}: ${completed} queued${skipped ? `, ${skipped} skipped` : ""}${failed ? `, ${failed} failed` : ""}.`);
    stopBatchRef.current = false;
    batchAbortControllerRef.current = null;
    setIsEnriching(false);
  }

  function updateAccountingDocumentLocally(document: AccountingDocument) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        documents: current.documents.some((item) => item.id === document.id)
          ? current.documents.map((item) => (item.id === document.id ? document : item))
          : [document, ...current.documents],
      }),
    );
  }

  function updateAccountingLedgerEntryLocally(entry: AccountingLedgerEntry) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        ledgerEntries: current.ledgerEntries.some((item) => item.id === entry.id)
          ? current.ledgerEntries.map((item) => (item.id === entry.id ? entry : item))
          : [entry, ...current.ledgerEntries],
      }),
    );
  }

  function deleteAccountingDocumentLocally(documentId: string) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        documents: current.documents.filter((document) => document.id !== documentId),
        ledgerEntries: current.ledgerEntries.map((entry) => (entry.documentId === documentId ? { ...entry, documentId: null } : entry)),
      }),
    );
  }

  function deleteAccountingLedgerEntryLocally(entryId: string) {
    setAccountingData((current) =>
      withAccountingSummaries({
        ...current,
        ledgerEntries: current.ledgerEntries.filter((entry) => entry.id !== entryId),
      }),
    );
  }

  function localAccountingDocumentFromDraft(draft: AccountingDocumentDraft, amountMinor: number): AccountingDocument {
    const now = new Date().toISOString();
    return {
      id: draft.documentId ?? `local-accounting-document-${Date.now()}`,
      companyId: draft.companyId || null,
      documentType: draft.documentType,
      status: draft.status,
      title: draft.title.trim(),
      amountMinor,
      currency: draft.currency.trim().toUpperCase(),
      issuedOn: draft.issuedOn || null,
      dueOn: draft.dueOn || null,
      externalReference: draft.externalReference.trim() || null,
      documentUrl: draft.documentUrl.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  function localAccountingLedgerEntryFromDraft(draft: AccountingLedgerDraft, amountMinor: number): AccountingLedgerEntry {
    const now = new Date().toISOString();
    return {
      id: draft.entryId ?? `local-accounting-entry-${Date.now()}`,
      documentId: draft.documentId || null,
      companyId: draft.companyId || null,
      entryType: draft.entryType,
      direction: draft.direction,
      amountMinor,
      currency: draft.currency.trim().toUpperCase(),
      occurredOn: draft.occurredOn,
      externalReference: draft.externalReference.trim() || null,
      documentUrl: draft.documentUrl.trim() || null,
      notes: draft.notes.trim() || null,
      createdBy: null,
      updatedBy: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function saveAccountingDocument() {
    if (!initialData.accountingAccess.canEdit || isSavingAccounting) return;
    const amountMinor = parseMoneyInput(accountingDocumentDraft.amount);
    if (!amountMinor) {
      setAccountingMessage("Enter a positive amount with up to two decimals.");
      return;
    }
    if ((accountingDocumentDraft.documentType === "retainer" || accountingDocumentDraft.documentType === "commission") && !accountingDocumentDraft.companyId) {
      setAccountingMessage("Retainers and commissions must be linked to a company.");
      return;
    }

    const currency = accountingDocumentDraft.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setAccountingMessage("Use a 3-letter ISO currency code.");
      return;
    }

    setIsSavingAccounting(true);
    setAccountingMessage(null);
    try {
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving accounting data.");
          return;
        }

        const result = await saveAccountingDocumentAction({
          organizationId,
          documentId: accountingDocumentDraft.documentId ?? undefined,
          companyId: accountingDocumentDraft.companyId || null,
          documentType: accountingDocumentDraft.documentType,
          status: accountingDocumentDraft.status,
          title: accountingDocumentDraft.title,
          amountMinor,
          currency,
          issuedOn: accountingDocumentDraft.issuedOn || null,
          dueOn: accountingDocumentDraft.dueOn || null,
          externalReference: accountingDocumentDraft.externalReference || null,
          documentUrl: accountingDocumentDraft.documentUrl || null,
          notes: accountingDocumentDraft.notes || null,
        });
        setAccountingMessage(result.message);
        if (result.ok && result.document) {
          updateAccountingDocumentLocally(result.document);
          setAccountingDocumentDraft(defaultAccountingDocumentDraft());
        }
        return;
      }

      updateAccountingDocumentLocally(localAccountingDocumentFromDraft(accountingDocumentDraft, amountMinor));
      setAccountingDocumentDraft(defaultAccountingDocumentDraft());
      setAccountingMessage("Demo accounting document saved locally.");
    } finally {
      setIsSavingAccounting(false);
    }
  }

  async function saveAccountingLedgerEntry() {
    if (!initialData.accountingAccess.canEdit || isSavingAccounting) return;
    const amountMinor = parseMoneyInput(accountingLedgerDraft.amount);
    if (!amountMinor) {
      setAccountingMessage("Enter a positive amount with up to two decimals.");
      return;
    }

    const linkedDocument = accountingData.documents.find((document) => document.id === accountingLedgerDraft.documentId);
    const companyId = accountingLedgerDraft.companyId || linkedDocument?.companyId || "";
    const currency = accountingLedgerDraft.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setAccountingMessage("Use a 3-letter ISO currency code.");
      return;
    }
    if ((accountingLedgerDraft.entryType === "retainer_payment" || accountingLedgerDraft.entryType === "commission_payment") && !companyId) {
      setAccountingMessage("Retainer and commission payments must be linked to a company.");
      return;
    }

    setIsSavingAccounting(true);
    setAccountingMessage(null);
    try {
      const draft = { ...accountingLedgerDraft, companyId, currency };
      if (initialData.dataMode === "supabase") {
        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (!organizationId) {
          setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before saving accounting data.");
          return;
        }

        const result = await saveAccountingLedgerEntryAction({
          organizationId,
          entryId: draft.entryId ?? undefined,
          documentId: draft.documentId || null,
          companyId: draft.companyId || null,
          entryType: draft.entryType,
          direction: draft.direction,
          amountMinor,
          currency,
          occurredOn: draft.occurredOn,
          externalReference: draft.externalReference || null,
          documentUrl: draft.documentUrl || null,
          notes: draft.notes || null,
        });
        setAccountingMessage(result.message);
        if (result.ok && result.entry) {
          updateAccountingLedgerEntryLocally(result.entry);
          setAccountingLedgerDraft(defaultAccountingLedgerDraft());
        }
        return;
      }

      updateAccountingLedgerEntryLocally(localAccountingLedgerEntryFromDraft(draft, amountMinor));
      setAccountingLedgerDraft(defaultAccountingLedgerDraft());
      setAccountingMessage("Demo ledger entry saved locally.");
    } finally {
      setIsSavingAccounting(false);
    }
  }

  function openAccountingDocumentAction(document: AccountingDocument, action: AccountingRecordActionTarget["action"]) {
    if (!initialData.accountingAccess.canEdit || (action === "void" && (document.status === "void" || document.voidedAt))) return;
    setAccountingRecordActionTarget({ action, entityType: "document", id: document.id, title: document.title });
    setAccountingRecordActionReason("");
    setAccountingMessage(null);
  }

  function openAccountingLedgerAction(entry: AccountingLedgerEntry, action: AccountingRecordActionTarget["action"]) {
    if (!initialData.accountingAccess.canEdit || (action === "void" && entry.voidedAt)) return;
    const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
    setAccountingRecordActionTarget({
      action,
      entityType: "ledger_entry",
      id: entry.id,
      title: linkedDocument?.title ?? entry.externalReference ?? ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType],
    });
    setAccountingRecordActionReason("");
    setAccountingMessage(null);
  }

  function closeAccountingRecordActionDialog() {
    setAccountingRecordActionTarget(null);
    setAccountingRecordActionReason("");
  }

  async function confirmAccountingRecordAction() {
    const reason = accountingRecordActionReason.trim();
    if (!accountingRecordActionTarget || !reason) return;

    const target = accountingRecordActionTarget;
    setIsSavingAccounting(true);
    try {
      let ok = false;
      if (target.entityType === "document") {
        const document = accountingData.documents.find((item) => item.id === target.id);
        ok = target.action === "delete" ? await deleteAccountingDocument(document, reason) : await voidAccountingDocument(document, reason);
      } else {
        const entry = accountingData.ledgerEntries.find((item) => item.id === target.id);
        ok = target.action === "delete" ? await deleteAccountingLedgerEntry(entry, reason) : await voidAccountingLedgerEntry(entry, reason);
      }

      if (ok) closeAccountingRecordActionDialog();
    } catch (error) {
      setAccountingMessage(error instanceof Error ? error.message : `Could not ${target.action} accounting record.`);
    } finally {
      setIsSavingAccounting(false);
    }
  }

  async function voidAccountingDocument(document: AccountingDocument | undefined, reason: string) {
    if (!document || !initialData.accountingAccess.canEdit || document.status === "void" || document.voidedAt) return false;
    const voidReason = reason.trim();
    if (!voidReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before voiding accounting data.");
        return false;
      }

      const result = await voidAccountingRecordAction({ organizationId, entityType: "document", id: document.id, reason: voidReason });
      setAccountingMessage(result.message);
      if (result.ok && result.document) updateAccountingDocumentLocally(result.document);
      return result.ok;
    }

    updateAccountingDocumentLocally({
      ...document,
      status: "void",
      voidedAt: new Date().toISOString(),
      voidReason,
      updatedAt: new Date().toISOString(),
    });
    setAccountingMessage("Demo accounting document voided locally.");
    return true;
  }

  async function voidAccountingLedgerEntry(entry: AccountingLedgerEntry | undefined, reason: string) {
    if (!entry || !initialData.accountingAccess.canEdit || entry.voidedAt) return false;
    const voidReason = reason.trim();
    if (!voidReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before voiding accounting data.");
        return false;
      }

      const result = await voidAccountingRecordAction({ organizationId, entityType: "ledger_entry", id: entry.id, reason: voidReason });
      setAccountingMessage(result.message);
      if (result.ok && result.entry) updateAccountingLedgerEntryLocally(result.entry);
      return result.ok;
    }

    updateAccountingLedgerEntryLocally({
      ...entry,
      voidedAt: new Date().toISOString(),
      voidReason,
      updatedAt: new Date().toISOString(),
    });
    setAccountingMessage("Demo ledger entry voided locally.");
    return true;
  }

  async function deleteAccountingDocument(document: AccountingDocument | undefined, reason: string) {
    if (!document || !initialData.accountingAccess.canEdit) return false;
    const deleteReason = reason.trim();
    if (!deleteReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting accounting data.");
        return false;
      }

      const result = await deleteAccountingRecordAction({ organizationId, entityType: "document", id: document.id, reason: deleteReason });
      setAccountingMessage(result.message);
      if (result.ok) {
        deleteAccountingDocumentLocally(document.id);
        if (accountingDocumentDraft.documentId === document.id) setAccountingDocumentDraft(defaultAccountingDocumentDraft());
        if (accountingLedgerDraft.documentId === document.id) setAccountingLedgerDraft((current) => ({ ...current, documentId: "" }));
      }
      return result.ok;
    }

    deleteAccountingDocumentLocally(document.id);
    if (accountingDocumentDraft.documentId === document.id) setAccountingDocumentDraft(defaultAccountingDocumentDraft());
    if (accountingLedgerDraft.documentId === document.id) setAccountingLedgerDraft((current) => ({ ...current, documentId: "" }));
    setAccountingMessage("Demo accounting document deleted locally.");
    return true;
  }

  async function deleteAccountingLedgerEntry(entry: AccountingLedgerEntry | undefined, reason: string) {
    if (!entry || !initialData.accountingAccess.canEdit) return false;
    const deleteReason = reason.trim();
    if (!deleteReason) return false;

    if (initialData.dataMode === "supabase") {
      const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
      if (!organizationId) {
        setAccountingMessage("Add NEXT_PUBLIC_DEFAULT_ORG_ID before deleting accounting data.");
        return false;
      }

      const result = await deleteAccountingRecordAction({ organizationId, entityType: "ledger_entry", id: entry.id, reason: deleteReason });
      setAccountingMessage(result.message);
      if (result.ok) {
        deleteAccountingLedgerEntryLocally(entry.id);
        if (accountingLedgerDraft.entryId === entry.id) setAccountingLedgerDraft(defaultAccountingLedgerDraft());
      }
      return result.ok;
    }

    deleteAccountingLedgerEntryLocally(entry.id);
    if (accountingLedgerDraft.entryId === entry.id) setAccountingLedgerDraft(defaultAccountingLedgerDraft());
    setAccountingMessage("Demo ledger entry deleted locally.");
    return true;
  }

  function handleLedgerDocumentChange(documentId: string) {
    const document = accountingData.documents.find((item) => item.id === documentId);
    setAccountingLedgerDraft((current) => ({
      ...current,
      documentId,
      companyId: document?.companyId ?? current.companyId,
      amount: document ? amountInputFromMinor(document.amountMinor) : current.amount,
      currency: document?.currency ?? current.currency,
      entryType:
        document?.documentType === "retainer"
          ? "retainer_payment"
          : document?.documentType === "commission"
            ? "commission_payment"
            : document?.documentType === "expense"
              ? "expense_payment"
              : current.entryType,
      direction: document?.documentType === "expense" ? "outgoing" : document ? "incoming" : current.direction,
    }));
  }

  function addCreatedCompanyLocally(companyId: string, name: string, websites: string, country: string, category: string) {
    if (companies.some((company) => company.id === companyId)) return;
    const websiteDomains = normalizeCompanyWebsites(websites);
    const newCompany: Company = {
      id: companyId,
      name,
      normalizedName: name.toLowerCase(),
      websiteDomain: websiteDomains[0] ?? null,
      websiteDomains,
      description: null,
      country: country.trim() || null,
      categories: [category],
      status: "active",
      ownerName: initialData.currentUserName,
      sourceQuality: "review",
      outreachStage: "Research",
      tags: [],
      people: [],
      activities: [],
      nextTask: null,
      lastActivityAt: null,
      mergeConfidence: null,
      enrichment: null,
      investmentRelationships: [],
    };
    setCompanies((current) => [newCompany, ...current]);
  }

  function addCreatedPersonLocally(companyId: string | null, personId: string, displayName: string, email: string, jobTitle: string) {
    if (!companyId || !displayName.trim()) return;
    const person: Person = {
      id: personId,
      sourcePersonIds: [personId],
      displayName: displayName.trim(),
      firstName: null,
      lastName: null,
      email: email.trim() || null,
      emails: email.trim() ? [email.trim().toLowerCase()] : [],
      phone: null,
      linkedinUrl: null,
      jobTitle: jobTitle.trim() || null,
      country: null,
      categories: [],
      connectionStrength: "Manual",
      highlighted: false,
      investmentRelationships: [],
    };
    setCompanies((current) =>
      current.map((company) => (company.id === companyId ? { ...company, people: company.people.some((item) => item.id === personId) ? company.people : [person, ...company.people] } : company)),
    );
  }

  function openAccountingForFundraisingCompany(companyId: string) {
    if (!initialData.accountingAccess.canView) return;
    setAccountingCompanyFilter(companyId);
    setAccountingTab("documents");
    setActiveView("accounting");
  }

  async function splitPeopleNames() {
    const targetPeople = peopleDirectory.map((row) => row.person).filter((person) => !person.firstName);
    if (targetPeople.length === 0) {
      setNamesMessage("No contacts to split.");
      return;
    }

    setIsSplittingNames(true);
    setNamesMessage(null);
    stopBatchRef.current = false;
    let completed = 0;
    let failed = 0;
    setSplitNamesProgress({ total: targetPeople.length, completed, failed });

    for (const person of targetPeople) {
      if (stopBatchRef.current) break;

      setNamesMessage(`Splitting ${completed + failed + 1} of ${targetPeople.length}: ${person.displayName}`);
      setSplitNamesProgress({ total: targetPeople.length, completed, failed });

      try {
        const response = await fetch("/api/enrichment/split-name", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: person.displayName }),
        });

        if (!response.ok) {
          failed += 1;
          continue;
        }

        const { firstName, lastName } = (await response.json()) as { firstName: string; lastName: string };
        const sourceIds = personSourceIds(person);
        updatePersonLocally(sourceIds, { firstName, lastName });

        const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
        if (organizationId && isUuid(person.id)) {
          queuePendingChange({
            key: `person:${person.id}`,
            label: "Contact name split",
            type: "person",
            personUpdate: {
              organizationId,
              personId: person.id,
              displayName: person.displayName,
              firstName,
              lastName,
              categories: person.categories,
            },
            record: {
              kind: "person",
              key: `person:${person.id}`,
              label: "Contact name split",
              personUpdate: {
                organizationId,
                personId: person.id,
                displayName: person.displayName,
                firstName,
                lastName,
                categories: person.categories,
              },
            },
            run: () =>
              initialData.authMode === "supabase" && organizationId && isUuid(person.id)
                ? updatePersonAction({
                  organizationId,
                  personId: person.id,
                  displayName: person.displayName,
                  firstName,
                  lastName,
                  categories: person.categories,
                  emails: [],
                })
                : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
          });
        }

        completed += 1;
      } catch {
        if (stopBatchRef.current) break;
        failed += 1;
      }

      setSplitNamesProgress({ total: targetPeople.length, completed, failed });
    }

    setNamesMessage(`Name splitting done: ${completed} split${failed ? `, ${failed} failed` : ""}. Queue changes before pushing.`);
    setSplitNamesProgress(null);
    setIsSplittingNames(false);
  }

  function updateRelationshipInList(relationships: InvestmentRelationship[], relationship: InvestmentRelationship) {
    const existingIndex = relationships.findIndex((item) => relationshipMatches(item, relationship.companyId, relationship.personId) || item.id === relationship.id);
    if (existingIndex === -1) return [...relationships, relationship];
    const next = [...relationships];
    next[existingIndex] = relationship;
    return next;
  }

  function updateInvestmentRelationshipLocally(relationship: InvestmentRelationship) {
    updateCompanies((company) => ({
      ...company,
      investmentRelationships: relationship.companyId === company.id ? updateRelationshipInList(company.investmentRelationships, relationship) : company.investmentRelationships,
      people: company.people.map((person) =>
        relationship.personId === person.id
          ? {
              ...person,
              investmentRelationships: updateRelationshipInList(person.investmentRelationships, relationship),
            }
          : person,
      ),
    }));
  }

  function updateDealStatusInRelationships(relationships: InvestmentRelationship[], dealId: string, status: InvestmentDealStatus) {
    return relationships.map((relationship) => ({
      ...relationship,
      deals: relationship.deals.map((deal) => (deal.id === dealId ? { ...deal, status } : deal)),
    }));
  }

  function updateInvestmentDealStatusLocally(companyId: string, dealId: string, status: InvestmentDealStatus, summary: string) {
    const now = new Date().toISOString();
    const activityId = `local-status-${companyId}-${dealId}`;
    updateCompanies((company) => ({
      ...company,
      investmentRelationships: updateDealStatusInRelationships(company.investmentRelationships, dealId, status),
      people: company.people.map((person) => ({
        ...person,
        investmentRelationships: updateDealStatusInRelationships(person.investmentRelationships, dealId, status),
      })),
      activities:
        company.id === companyId
          ? [
              { id: activityId, type: "status_change", summary, occurredAt: now },
              ...company.activities.filter((activity) => activity.id !== activityId),
            ]
          : company.activities,
      lastActivityAt: company.id === companyId ? now : company.lastActivityAt,
    }));
  }

  function saveInvestmentRelationship(relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const nextRelationship: InvestmentRelationship = {
      ...relationship,
      investmentStatus: draft.investmentStatus,
      capacityStatus: draft.capacityStatus,
      notes: draft.notes.trim() || null,
      lastInvestedDate: draft.lastInvestedDate || null,
    };
    updateInvestmentRelationshipLocally(nextRelationship);

    const payload = {
      organizationId: organizationId ?? "",
      relationshipId: isUuid(relationship.id) ? relationship.id : undefined,
      companyId: relationship.companyId,
      personId: relationship.personId,
      investmentStatus: nextRelationship.investmentStatus,
      capacityStatus: nextRelationship.capacityStatus,
      notes: nextRelationship.notes,
      lastInvestedDate: nextRelationship.lastInvestedDate,
    };

    queuePendingChange({
      key: `investment:${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}`,
      label,
      record: {
        kind: "investment-relationship",
        key: `investment:${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}`,
        label,
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId
          ? updateInvestmentRelationshipAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function addInvestmentDealLocally(relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) {
    const dealName = draft.dealName.trim();
    if (!dealName) return;
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const localDealId = `local-deal-${relationship.id}-${dealName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${relationship.deals.length}`;
    const nextRelationship: InvestmentRelationship = {
      ...relationship,
      investmentStatus: draft.investmentStatus,
      capacityStatus: draft.capacityStatus,
      notes: draft.notes.trim() || relationship.notes,
      lastInvestedDate: draft.dealDate || draft.lastInvestedDate || relationship.lastInvestedDate,
      deals: [
        {
          id: localDealId,
          name: dealName,
          status: draft.dealStatus,
          investedAt: draft.dealDate || null,
          role: draft.dealRole.trim() || null,
          notes: draft.dealNotes.trim() || null,
        },
        ...relationship.deals,
      ],
    };
    updateInvestmentRelationshipLocally(nextRelationship);

    const payload = {
      organizationId: organizationId ?? "",
      relationshipId: isUuid(relationship.id) ? relationship.id : undefined,
      companyId: relationship.companyId,
      personId: relationship.personId,
      investmentStatus: draft.investmentStatus,
      capacityStatus: draft.capacityStatus,
      relationshipNotes: draft.notes.trim() || null,
      dealName,
      dealStatus: draft.dealStatus,
      investedAt: draft.dealDate || null,
      role: draft.dealRole.trim() || null,
      notes: draft.dealNotes.trim() || null,
    };
    const key = `investment-deal:${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}:${localDealId}`;

    queuePendingChange({
      key,
      label,
      record: {
        kind: "investment-deal",
        key,
        label,
        payload,
        localDeal: {
          companyId: relationship.companyId,
          personId: relationship.personId,
          relationshipId: relationship.id,
          dealId: localDealId,
          dealName,
          dealStatus: draft.dealStatus,
          investedAt: draft.dealDate || null,
          role: draft.dealRole.trim() || null,
          notes: draft.dealNotes.trim() || null,
        },
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId
          ? addInvestmentDealAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function updatePipelineDraft(row: DealPipelineRow, updates: Partial<PipelineStatusDraft>) {
    setPipelineDrafts((current) => ({
      ...current,
      [row.key]: {
        status: current[row.key]?.status ?? row.status,
        note: current[row.key]?.note ?? "",
        ...updates,
      },
    }));
  }

  function queueDealStatusUpdate(row: DealPipelineRow) {
    const draft = pipelineDrafts[row.key] ?? { status: row.status, note: "" };
    const note = draft.note.trim();
    const statusChanged = draft.status !== row.status;
    if (!statusChanged && !note) return;

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const summary = formatDealStatusSummary(row.dealName, row.status, draft.status);
    const payload = {
      organizationId: organizationId ?? "",
      companyId: row.companyId,
      dealId: row.dealId,
      status: draft.status,
      note: note || null,
    };

    updateInvestmentDealStatusLocally(row.companyId, row.dealId, draft.status, summary);
    queuePendingChange({
      key: `investment-deal-status:${row.companyId}:${row.dealId}`,
      label: "Deal status update",
      record: {
        kind: "investment-deal-status",
        key: `investment-deal-status:${row.companyId}:${row.dealId}`,
        label: "Deal status update",
        payload,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(row.companyId) && isUuid(row.dealId)
          ? updateInvestmentDealStatusAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    setPipelineDrafts((current) => {
      const next = { ...current };
      delete next[row.key];
      return next;
    });
  }

  function updatePersonLocally(targetPersonIds: string[], updates: Partial<Pick<Person, "displayName" | "firstName" | "lastName" | "emails" | "jobTitle" | "linkedinUrl" | "phone" | "country" | "categories" | "investmentRelationships">>) {
    const personIdSet = new Set(targetPersonIds);
    updateCompanies((company) => ({
      ...company,
      people: company.people.map((person) =>
        person.sourcePersonIds.some((personId) => personIdSet.has(personId))
          ? {
              ...person,
              ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
              ...(updates.firstName !== undefined ? { firstName: updates.firstName } : {}),
              ...(updates.lastName !== undefined ? { lastName: updates.lastName } : {}),
              ...(updates.emails !== undefined ? { email: updates.emails[0] ?? null, emails: updates.emails } : {}),
              ...(updates.jobTitle !== undefined ? { jobTitle: updates.jobTitle } : {}),
              ...(updates.linkedinUrl !== undefined ? { linkedinUrl: updates.linkedinUrl } : {}),
              ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
              ...(updates.country !== undefined ? { country: updates.country } : {}),
              ...(updates.categories !== undefined ? { categories: updates.categories } : {}),
              ...(updates.investmentRelationships !== undefined ? { investmentRelationships: updates.investmentRelationships } : {}),
            }
          : person,
      ),
    }));
  }

  function applyCategoryToPeople(people: Person[], category: string, previousCategory?: string) {
    return people.map((person) => {
      const renamedCategories = previousCategory
        ? person.categories.map((item) => (item === previousCategory ? category : item))
        : person.categories;
      return {
        ...person,
        categories: normalizePersonCategories([...renamedCategories, category]),
      };
    });
  }

  function renameCompanyTag(summary: Extract<TagSummary, { type: "company" }>, nextName: string) {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === summary.name) return;
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;

    updateCompanies((company) => ({
      ...company,
      tags: company.tags.map((tag) => (tag.id === summary.id ? { ...tag, name: cleanName } : tag)),
      people: company.tags.some((tag) => tag.id === summary.id) ? applyCategoryToPeople(company.people, cleanName, summary.name) : company.people,
    }));

    queuePendingChange({
      key: `company-tag-rename:${summary.id}`,
      label: "Company tag rename",
      record: {
        kind: "company-tag-rename",
        key: `company-tag-rename:${summary.id}`,
        label: "Company tag rename",
        organizationId: organizationId ?? null,
        tagId: summary.id,
        name: cleanName,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(summary.id)
          ? renameCompanyTagAction({ organizationId, tagId: summary.id, name: cleanName })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    setTagDrafts((current) => ({ ...current, [summary.key]: cleanName }));
  }

  function renameContactTag(summary: Extract<TagSummary, { type: "contact" }>, nextName: string) {
    const cleanName = nextName.trim();
    if (!cleanName || cleanName === summary.name) return;
    const oldName = summary.name;
    const affectedPeople = peopleDirectory
      .map(({ person }) =>
        person.categories.some((category) => category === oldName)
          ? {
              ...person,
              categories: normalizePersonCategories(person.categories.map((category) => (category === oldName ? cleanName : category))),
            }
          : null,
      )
      .filter((person): person is Person => Boolean(person));

    if (affectedPeople.length === 0) return;

    affectedPeople.forEach((person) => {
      updatePersonLocally(personSourceIds(person), {
        displayName: person.displayName,
        emails: person.emails,
        categories: person.categories,
      });
      queuePersonUpdate(person, "Contact tag rename", { syncEmails: false });
    });
    setTagDrafts((current) => ({ ...current, [summary.key]: cleanName }));
  }

  function renameTag(summary: TagSummary) {
    const nextName = tagDrafts[summary.key] ?? summary.name;
    if (summary.type === "company") renameCompanyTag(summary, nextName);
    else renameContactTag(summary, nextName);
  }

  function addManualNote() {
    if (!activeCompany || !noteText.trim()) return;
    const summary = noteText.trim();
    const actionKey = `activity:${activeCompany.id}:${Date.now()}`;
    updateCompanies((company) =>
      company.id === activeCompany.id
        ? {
            ...company,
            activities: [{ id: `local-${Date.now()}`, type: "note", summary, occurredAt: new Date().toISOString() }, ...company.activities],
            lastActivityAt: new Date().toISOString(),
          }
        : company,
    );
    setNoteText("");

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const companyId = activeCompany.id;
    queuePendingChange({
      key: actionKey,
      label: "Activity note",
      record: {
        kind: "activity-note",
        key: actionKey,
        label: "Activity note",
        organizationId: organizationId ?? null,
        companyId,
        summary,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(companyId)
          ? addActivityAction({
          organizationId,
          companyId,
          activityType: "note",
          summary,
        })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function mergeCompaniesLocally(targetCompanyId: string, sourceCompanyIds: string[]) {
    setCompanies((current) => {
      const target = current.find((company) => company.id === targetCompanyId);
      const sources = sourceCompanyIds
        .map((companyId) => current.find((company) => company.id === companyId))
        .filter((company): company is Company => Boolean(company));

      if (!target || sources.length === 0) return current;

      const mergedCompany = mergeCompanyDetails(target, sources);
      const sourceIdSet = new Set(sourceCompanyIds);

      return current
        .filter((company) => !sourceIdSet.has(company.id))
        .map((company) => (company.id === targetCompanyId ? mergedCompany : company));
    });
    setSelectedIds(new Set([targetCompanyId]));
    setActiveCompanyId(targetCompanyId);
    setCompanyDraft({ companyId: "", name: "", websites: "", description: "", country: "" });
  }

  function handleCompanyMerge() {
    if (!companyMergeTarget || companyMergeSources.length === 0) return;

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const targetCompanyId = companyMergeTarget.id;
    const sourceCompanyIds = companyMergeSources.map((company) => company.id);

    mergeCompaniesLocally(targetCompanyId, sourceCompanyIds);
    queuePendingChange({
      key: `company-merge:${targetCompanyId}:${sourceCompanyIds.join(",")}`,
      label: "Company merge",
      record: {
        kind: "company-merge",
        key: `company-merge:${targetCompanyId}:${sourceCompanyIds.join(",")}`,
        label: "Company merge",
        organizationId: organizationId ?? null,
        targetCompanyId,
        sourceCompanyIds,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(targetCompanyId) && sourceCompanyIds.every(isUuid)
          ? mergeCompaniesAction({ organizationId, targetCompanyId, sourceCompanyIds })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    closeCompanyMerge();
  }

  function mergePeopleLocally(targetPersonId: string, sourcePersonId: string) {
    const targetEntry = peopleDirectory.find(({ person }) => person.id === targetPersonId);
    const sourceEntry = peopleDirectory.find(({ person }) => person.id === sourcePersonId);
    if (!targetEntry || !sourceEntry) return;

    const mergedGlobalPerson = mergePersonDetails(targetEntry.person, sourceEntry.person, targetPersonId);
    setCompanies((current) =>
      current.map((company) => {
        const targetPerson = company.people.find((person) => person.id === targetPersonId) ?? null;
        const sourcePerson = company.people.find((person) => person.id === sourcePersonId) ?? null;
        if (!targetPerson && !sourcePerson) return company;

        const mergedCompanyPerson = targetPerson && sourcePerson
          ? mergePersonDetails(targetPerson, sourcePerson, targetPersonId)
          : targetPerson
            ? mergePersonDetails(targetPerson, mergedGlobalPerson, targetPersonId)
            : mergePersonDetails(mergedGlobalPerson, sourcePerson!, targetPersonId);

        const nextPeople: Person[] = [];
        let inserted = false;
        for (const person of company.people) {
          if (person.id === targetPersonId || person.id === sourcePersonId) {
            if (!inserted) {
              nextPeople.push(mergedCompanyPerson);
              inserted = true;
            }
            continue;
          }
          nextPeople.push(person);
        }

        if (!inserted) nextPeople.push(mergedCompanyPerson);
        return { ...company, people: nextPeople };
      }),
    );
  }

  function startManualMerge(targetPersonId: string, searchHint = "") {
    setPeopleMessage(null);
    setPersonMergeTargetId(targetPersonId);
    setPersonMergeQuery(searchHint);
  }

  function closeManualMerge() {
    setPersonMergeTargetId(null);
    setPersonMergeQuery("");
  }

  function handleManualMerge(sourcePersonId: string) {
    if (!personMergeTarget || sourcePersonId === personMergeTarget.person.id) return;

    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const targetPersonId = personMergeTarget.person.id;

    mergePeopleLocally(targetPersonId, sourcePersonId);
    queuePendingChange({
      key: `merge:${targetPersonId}:${sourcePersonId}`,
      label: "People merge",
      runBeforePersonBatch: true,
      record: {
        kind: "people-merge",
        key: `merge:${targetPersonId}:${sourcePersonId}`,
        label: "People merge",
        organizationId: organizationId ?? null,
        targetPersonId,
        sourcePersonId,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(targetPersonId) && isUuid(sourcePersonId)
          ? mergePeopleAction({ organizationId, targetPersonId, sourcePersonId })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    setPeopleMessage("People merge queued locally.");
    closeManualMerge();
  }

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} isSignedIn={isSignedIn} authLabel={authLabel} authDetail={authDetail} />

      <main className={clsx("workspace", activeView === "companies" && showCompanyTable && !showDetailPanel && "companies-workspace")}>
        <CrmTopbar activeView={activeView} debugMode={debugMode} toggleDebugMode={toggleDebugMode} resetDebugDraft={resetDebugDraft} isSignedIn={isSignedIn} currentUserName={initialData.currentUserName} />

        <DebugBanner debugMode={debugMode} debugStorageIssue={debugStorageIssue} />
        <AuthFlash show={authSuccess && isSignedIn} />

        <MetricsGrid importSummary={initialData.importSummary} />

        <PipelineStrip pipelineCounts={pipelineCounts} stageFilters={stageFilters} onStageClick={(stage) => { toggleCompanyFilter(setStageFilters, stage); setActiveView("companies"); }} />

        {activeView === "companies" ? (
          <CompaniesView
            showCompanyTable={showCompanyTable}
            activeCompany={activeCompany}
            showDetailPanel={showDetailPanel}
            companyModalId={companyModalId}
            filteredCompanies={filteredCompanies}
            visibleCompanies={visibleCompanies}
            selectedIds={selectedIds}
            query={query}
            stageFilters={stageFilters}
            countryFilters={countryFilters}
            tagFilters={tagFilters}
            qualityFilters={qualityFilters}
            exportCriterion={exportCriterion}
            exportValue={exportValue}
            companyPageSize={companyPageSize}
            effectiveCompanyPage={effectiveCompanyPage}
            companyTotalPages={companyTotalPages}
            companyStart={companyStart}
            companyEnd={companyEnd}
            activeCompanyFilterCount={activeCompanyFilterCount}
            batchTargetCompanies={batchTargetCompanies}
            isBatchEnriching={isBatchEnriching}
            batchProgress={batchProgress}
            batchProgressPercent={batchProgressPercent}
            batchProgressProcessed={batchProgressProcessed}
            pendingEnrichmentCount={pendingEnrichmentCount}
            isRefreshingTable={isRefreshingTable}
            isEnriching={isEnriching}
            isPushingChanges={isPushingChanges}
            isSignedIn={isSignedIn}
            pendingChangesLength={pendingChanges.length}
            selectedCompanies={selectedCompanies}
            companyMergeTarget={companyMergeTarget}
            companyMergeSources={companyMergeSources}
            activeCompanyDraft={activeCompanyDraft}
            activeCompanyEnrichmentDraft={activeCompanyEnrichmentDraft}
            activeCompanyInvestment={activeCompanyInvestment}
            activeCompanyInvestmentDraft={activeCompanyInvestmentDraft}
            enrichmentMessage={enrichmentMessage}
            setEnrichmentDraft={setEnrichmentDraft}
            setCompanyDraft={setCompanyDraft}
            noteText={noteText}
            setNoteText={setNoteText}
            localEnrichmentEnabled={initialData.localEnrichmentEnabled}
            exportOptions={exportOptions}
            exportRowsLength={exportRows.length}
            countries={countries}
            tagNames={tagNames}
            bulkTag={bulkTag}
            companyPageSizeOptions={COMPANY_PAGE_SIZE_OPTIONS}
            onSetQuery={setQuery}
            onSetCompanyPage={setCompanyPage}
            onSetCompanyPageSize={(size) => setCompanyPageSize(size as 50 | 100 | 250 | 500 | "all")}
            onSetExportCriterion={setExportCriterion}
            onSetExportValue={setExportValue}
            onSetBulkTag={setBulkTag}
            onToggleCompany={toggleCompany}
            onToggleStageFilter={(value) => toggleCompanyFilter(setStageFilters, value)}
            onToggleCountryFilter={(value) => toggleCompanyFilter(setCountryFilters, value)}
            onToggleTagFilter={(value) => toggleCompanyFilter(setTagFilters, value)}
            onToggleQualityFilter={(value) => toggleCompanyFilter(setQualityFilters, value)}
            onClearCompanyFilters={clearCompanyFilters}
            onRefreshCompanyTable={refreshCompanyTable}
            onApplyStage={applyStage}
            onApplyBulkTag={applyBulkTag}
            onStartCompanyMerge={startCompanyMerge}
            onCloseCompanyMerge={closeCompanyMerge}
            onSetCompanyMergeTargetId={setCompanyMergeTargetId}
            onHandleCompanyMerge={handleCompanyMerge}
            onEnrichCompanyBatch={enrichCompanyBatch}
            onRequestStopEnrichmentBatch={requestStopEnrichmentBatch}
            onExportCompanies={exportCompanies}
            onOpenCompanyModal={openCompanyModal}
            onSetActiveCompanyId={setActiveCompanyId}
            onExportCriterionChange={(nextCriterion) => {
              setExportCriterion(nextCriterion);
              setExportValue(contactExportValues(companies, nextCriterion)[0] ?? "");
            }}
            onCloseCompanyModal={closeCompanyModal}
            onUpdateActiveCompany={updateActiveCompany}
            onEnrichActiveCompany={enrichActiveCompany}
            onSaveActiveCompanyEnrichment={saveActiveCompanyEnrichment}
            onSaveInvestmentRelationship={saveInvestmentRelationship}
            onAddInvestmentDealLocally={addInvestmentDealLocally}
            onToggleHighlight={toggleHighlight}
            onAddManualNote={addManualNote}
            onSetCompanyInvestmentDraft={setCompanyInvestmentDraft}
            startPersonEdit={personEditor.startPersonEdit}
            pushPendingEnrichments={pushPendingEnrichments}
          />
        ) : null}

        {activeView === "people" ? (
          <PeopleView
            filteredDirectory={filteredPeopleDirectory}
            directory={peopleDirectory}
            visibleDirectory={visiblePeopleDirectory}
            query={peopleQuery}
            company={peopleCompany}
            domain={peopleDomain}
            stage={peopleStage}
            highlight={peopleHighlight}
            pageSize={peoplePageSize}
            page={peoplePage}
            peopleStart={peopleStart}
            peopleEnd={peopleEnd}
            effectivePage={effectivePeoplePage}
            totalPages={peopleTotalPages}
            personMergeTarget={personMergeTarget}
            personMergeQuery={personMergeQuery}
            personMergeCandidates={personMergeCandidates}
            peopleMessage={peopleMessage}
            incorrectEmailMessage={incorrectEmailMessage}
            incorrectEmails={incorrectEmails}
            namesMessage={namesMessage}
            isSplittingNames={isSplittingNames}
            splitNamesProgress={splitNamesProgress}
            companyNames={peopleCompanyNames}
            emailDomains={peopleEmailDomains}
            isDemoData={isDemoData}
            dataWarning={initialData.dataWarning ?? null}
            localEnrichmentEnabled={initialData.localEnrichmentEnabled}
            isSignedIn={isSignedIn}
            onQueryChange={(value) => { setPeoplePage(1); setPeopleQuery(value); }}
            onCompanyChange={(value) => { setPeoplePage(1); setPeopleCompany(value); }}
            onDomainChange={(value) => { setPeoplePage(1); setPeopleDomain(value); }}
            onStageChange={(value) => { setPeoplePage(1); setPeopleStage(value); }}
            onHighlightChange={(value) => { setPeoplePage(1); setPeopleHighlight(value); }}
            onPageSizeChange={(value) => { setPeoplePage(1); setPeoplePageSize(value as typeof peoplePageSize); }}
            onPageChange={(page) => setPeoplePage(page)}
            onCloseMerge={closeManualMerge}
            onMergeQueryChange={setPersonMergeQuery}
            onMergePerson={handleManualMerge}
            onIncorrectEmailUpload={handleIncorrectEmailCsvUpload}
            onExport={exportPeople}
            onSplitNames={splitPeopleNames}
            onStopSplitNames={() => { stopBatchRef.current = true; }}
            onSetActiveCompany={setActiveCompanyId}
            onToggleHighlight={toggleHighlight}
            onStartEdit={personEditor.startPersonEdit}
            onOpenCompany={openCompany}
            onStartManualMerge={startManualMerge}
          />
        ) : null}

        {activeView === "tags" ? <TagsView tagSummaries={tagSummaries} tagDrafts={tagDrafts} setTagDrafts={setTagDrafts} renameTag={renameTag} pendingChanges={pendingChanges} /> : null}

        {activeView === "pipeline" ? (
          <PipelineView
            groups={dealPipelineGroups}
            rows={dealPipelineRows}
            drafts={pipelineDrafts}
            onOpenCompany={openCompany}
            onUpdateDraft={updatePipelineDraft}
            onQueueStatusUpdate={queueDealStatusUpdate}
            onExport={exportDealPipeline}
          />
        ) : null}

        {activeView === "clients" ? (
          <FundraisingView
            initialClientDashboard={initialData.clientDashboard}
            companies={companies}
            peopleDirectory={peopleDirectory}
            accountingData={accountingData}
            accountingAccess={initialData.accountingAccess}
            dataMode={initialData.dataMode}
            currentUserName={initialData.currentUserName}
            onOpenCompany={openCompany}
            onOpenAccounting={openAccountingForFundraisingCompany}
            onAddCreatedCompany={addCreatedCompanyLocally}
            onAddCreatedPerson={addCreatedPersonLocally}
          />
        ) : null}

        {activeView === "accounting" ? (
          <AccountingView
            access={initialData.accountingAccess}
            companies={companies}
            tab={accountingTab}
            query={accountingQuery}
            message={accountingMessage}
            documentDraft={accountingDocumentDraft}
            ledgerDraft={accountingLedgerDraft}
            isSaving={isSavingAccounting}
            companyFilter={accountingCompanyFilter}
            typeFilter={accountingTypeFilter}
            statusFilter={accountingStatusFilter}
            currencyFilter={accountingCurrencyFilter}
            dateFrom={accountingDateFrom}
            dateTo={accountingDateTo}
            filteredDocuments={filteredAccountingDocuments}
            filteredEntries={filteredAccountingEntries}
            accountingCompanies={accountingCompanies}
            accountingCurrencies={accountingCurrencies}
            companyNameById={companyNameById}
            accountingData={accountingData}
            setTab={setAccountingTab}
            setQuery={setAccountingQuery}
            setMessage={setAccountingMessage}
            setDocumentDraft={setAccountingDocumentDraft}
            setLedgerDraft={setAccountingLedgerDraft}
            setIsSaving={setIsSavingAccounting}
            setCompanyFilter={setAccountingCompanyFilter}
            setTypeFilter={setAccountingTypeFilter}
            setStatusFilter={setAccountingStatusFilter}
            setCurrencyFilter={setAccountingCurrencyFilter}
            setDateFrom={setAccountingDateFrom}
            setDateTo={setAccountingDateTo}
            onSaveDocument={saveAccountingDocument}
            onSaveLedgerEntry={saveAccountingLedgerEntry}
            onLedgerDocumentChange={handleLedgerDocumentChange}
            onOpenDocumentAction={openAccountingDocumentAction}
            onOpenLedgerAction={openAccountingLedgerAction}
          />
        ) : null}

        {activeView === "tasks" ? <TasksView taskRows={taskRows} openCompany={openCompany} /> : null}

        {activeView === "import" ? <ImportView importSummary={initialData.importSummary} /> : null}

        <SyncDock pendingChanges={pendingChanges} syncMessage={syncMessage} debugMode={debugMode} isPushingChanges={isPushingChanges} pushPendingChanges={pushPendingChanges} />

        <AccountingVoidDialog
          target={accountingRecordActionTarget}
          reason={accountingRecordActionReason}
          setReason={setAccountingRecordActionReason}
          isSaving={isSavingAccounting}
          onConfirm={confirmAccountingRecordAction}
          onClose={closeAccountingRecordActionDialog}
        />

        <ContactEditor editor={personEditor} isPushingChanges={isPushingChanges} />
      </main>
    </div>
  );
}


