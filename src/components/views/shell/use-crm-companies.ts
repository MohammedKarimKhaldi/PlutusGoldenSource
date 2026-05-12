"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { isUuid } from "@/components/shared";
import { normalizeCompanyWebsites } from "@/lib/company-websites";
import { contactExportValues, filterContactExportRows, type ContactExportCriterion } from "@/lib/export/contacts";
import {
  addActivityAction,
  addCompanyTagAction,
  mergeCompaniesAction,
  moveStageAction,
  refreshDashboardAction,
  updateCompanyAction,
} from "@/app/actions";
import type { CompanyPageSize, PendingChange } from "@/lib/crm-types";
import {
  COMPANY_PAGE_SIZE_OPTIONS,
  buildCompanySearchText,
  companyMatches,
  initialCompanyIdFor,
  mergeCompanyDetails,
  uniqueValues,
} from "@/lib/crm-utils";
import { normalizePersonCategories } from "@/lib/person-update";
import { OUTREACH_STAGES } from "@/lib/types";
import type { Company, DashboardData, OutreachStage, Person, Tag } from "@/lib/types";

type UseCrmCompaniesOptions = {
  initialData: DashboardData;
  companyId?: string;
  queuePendingChange: (change: PendingChange) => void;
};

export function useCrmCompanies(options: UseCrmCompaniesOptions) {
  const { initialData, companyId, queuePendingChange } = options;

  const router = useRouter();
  const initialCompanyId = initialCompanyIdFor(initialData.companies, companyId);

  const [companies, setCompanies] = useState(initialData.companies);
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
  const [companyModalId, setCompanyModalId] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState({ companyId: "", name: "", websites: "", description: "", country: "" });
  const [bulkTag, setBulkTag] = useState("");
  const [noteText, setNoteText] = useState("");
  const [isRefreshingTable, setIsRefreshingTable] = useState(false);

  const deferredCompanyQuery = useDeferredValue(query.trim().toLowerCase());

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

    return () => { cancelled = true; };
  }, [companyId, initialData.companies]);

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

    return () => { cancelled = true; };
  }, [companies, companyId]);

  const selectedCompanies = useMemo(() => companies.filter((company) => selectedIds.has(company.id)), [companies, selectedIds]);
  const companyMergeTarget = selectedCompanies.length >= 2
    ? selectedCompanies.find((company) => company.id === companyMergeTargetId) ?? selectedCompanies[0]
    : null;
  const companyMergeSources = companyMergeTarget ? selectedCompanies.filter((company) => company.id !== companyMergeTarget.id) : [];

  const companyNameById = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);

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

  const exportOptions = useMemo(() => contactExportValues(companies, exportCriterion), [companies, exportCriterion]);
  const exportRows = useMemo(() => filterContactExportRows(companies, exportCriterion, exportValue), [companies, exportCriterion, exportValue]);
  const countries = uniqueValues(companies, (company) => company.country);
  const tagNames = [...new Set(companies.flatMap((company) => company.tags.map((item) => item.name)))].sort((a, b) => a.localeCompare(b, "en-US"));

  const pipelineCounts = OUTREACH_STAGES.map((item) => ({
    stage: item,
    count: companies.filter((company) => company.outreachStage === item).length,
  }));

  const peopleRelationRows = useMemo(
    () => companies.flatMap((company) => company.people.map((person) => ({ person, company }))),
    [companies],
  );

  const batchTargetCompanies = selectedCompanies.length ? selectedCompanies : filteredCompanies;

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
    try {
      const result = await refreshDashboardAction();
      if (!result.ok) return;
      router.refresh();
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

    const payload = field === "websites"
      ? { companyId: activeCompany.id, websiteDomains: websites }
      : { companyId: activeCompany.id, [field]: nextValue };

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
      current.map((company) =>
        company.id === companyId
          ? { ...company, people: company.people.some((item) => item.id === personId) ? company.people : [person, ...company.people] }
          : company,
      ),
    );
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
    const currentCompanyId = activeCompany.id;
    queuePendingChange({
      key: actionKey,
      label: "Activity note",
      record: {
        kind: "activity-note",
        key: actionKey,
        label: "Activity note",
        organizationId: organizationId ?? null,
        companyId: currentCompanyId,
        summary,
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(currentCompanyId)
          ? addActivityAction({ organizationId, companyId: currentCompanyId, activityType: "note", summary })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  return {
    companies,
    setCompanies,
    activeCompanyId,
    setActiveCompanyId,
    selectedIds,
    setSelectedIds,
    query,
    setQuery,
    stageFilters,
    setStageFilters,
    countryFilters,
    setCountryFilters,
    tagFilters,
    setTagFilters,
    qualityFilters,
    setQualityFilters,
    exportCriterion,
    setExportCriterion,
    exportValue,
    setExportValue,
    companyPageSize,
    setCompanyPageSize,
    companyPage,
    setCompanyPage,
    companyMergeTargetId,
    setCompanyMergeTargetId,
    companyModalId,
    setCompanyModalId,
    companyDraft,
    setCompanyDraft,
    bulkTag,
    setBulkTag,
    noteText,
    setNoteText,
    isRefreshingTable,

    deferredCompanyQuery,
    selectedCompanies,
    companyMergeTarget,
    companyMergeSources,
    companyNameById,
    filteredCompanies,
    activeCompanyFilterCount,
    companyTotalPages,
    effectiveCompanyPage,
    visibleCompanies,
    companyStart,
    companyEnd,
    activeCompany,
    activeCompanyDraft,
    exportOptions,
    exportRows,
    countries,
    tagNames,
    pipelineCounts,
    batchTargetCompanies,
    peopleRelationRows,

    updateCompanies,
    toggleCompany,
    toggleCompanyFilter,
    clearCompanyFilters,
    refreshCompanyTable,
    openCompanyModal,
    closeCompanyModal,
    openCompany,
    startCompanyMerge,
    closeCompanyMerge,
    updateActiveCompany,
    addCreatedCompanyLocally,
    addCreatedPersonLocally,
    mergeCompaniesLocally,
    handleCompanyMerge,
    applyStage,
    applyBulkTag,
    addManualNote,
    applyCategoryToPeople,
  };
}
