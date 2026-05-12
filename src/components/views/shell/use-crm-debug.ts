"use client";

import { useEffect, useRef, useState } from "react";

import { clearDebugDraft, readDebugDraft, writeDebugDraft } from "@/components/views/shell/debug-storage";
import { isPendingChangeRecord } from "@/lib/crm-utils";
import {
  DEBUG_DRAFT_VERSION,
  DEBUG_MODE_STORAGE_KEY,
} from "@/lib/crm-utils";
import type { EnrichmentDraft, InvestmentDraft, PipelineStatusDraft } from "@/components/shared";
import type { EnrichmentBatchProgress } from "@/components/shared";
import type {
  DebugDraft,
  PendingChange,
  PendingChangeRecord,
} from "@/lib/crm-types";
import type { Company, DashboardData } from "@/lib/types";

type UseCrmDebugOptions = {
  initialData: DashboardData;
  initialCompanyId: string;
  companyId?: string;
  buildPendingChange: (record: PendingChangeRecord) => PendingChange;
  companies: Company[];
  pendingChanges: PendingChange[];
  syncMessage: string | null;
  setCompanies: (updater: React.SetStateAction<Company[]>) => void;
  setPendingChanges: (updater: React.SetStateAction<PendingChange[]>) => void;
  setSelectedIds: (updater: React.SetStateAction<Set<string>>) => void;
  setActiveCompanyId: (updater: React.SetStateAction<string>) => void;
  setCompanyModalId: (updater: React.SetStateAction<string | null>) => void;
  setBatchProgress: (updater: React.SetStateAction<EnrichmentBatchProgress | null>) => void;
  stopBatchRef: React.MutableRefObject<boolean>;
  batchAbortControllerRef: React.MutableRefObject<AbortController | null>;
  setCompanyDraft: (updater: React.SetStateAction<{ companyId: string; name: string; websites: string; description: string; country: string }>) => void;
  setEnrichmentDraft: (updater: React.SetStateAction<EnrichmentDraft | null>) => void;
  setCompanyInvestmentDraft: (updater: React.SetStateAction<InvestmentDraft | null>) => void;
  setPipelineDrafts: (updater: React.SetStateAction<Record<string, PipelineStatusDraft>>) => void;
  setEnrichmentMessage: (updater: React.SetStateAction<string | null>) => void;
  setTagDrafts: (updater: React.SetStateAction<Record<string, string>>) => void;
  setPeopleMessage: (updater: React.SetStateAction<string | null>) => void;
  setIncorrectEmailMessage: (updater: React.SetStateAction<string | null>) => void;
  setSyncMessage: (updater: React.SetStateAction<string | null>) => void;
  clearCompanyFilters: () => void;
};

export function useCrmDebug(options: UseCrmDebugOptions) {
  const {
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
  } = options;

  const [debugMode, setDebugMode] = useState(false);
  const [debugModeReady, setDebugModeReady] = useState(false);
  const debugDraftHydratedRef = useRef(false);
  const [debugStorageIssue, setDebugStorageIssue] = useState<string | null>(null);

  useEffect(() => {
    let storedDebugMode = false;
    let cancelled = false;
    try {
      storedDebugMode = window.localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === "true";
    } catch {
      storedDebugMode = false;
    }
    if (storedDebugMode) {
      debugDraftHydratedRef.current = false;
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setDebugMode(storedDebugMode);
      setDebugModeReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!debugModeReady) return;
    if (!debugMode) {
      debugDraftHydratedRef.current = true;
      return;
    }
    let cancelled = false;

    void (async () => {
      try {
        const parsed = await readDebugDraft();
        if (cancelled || !parsed) return;
        if (parsed.version !== DEBUG_DRAFT_VERSION || !Array.isArray(parsed.companies) || !Array.isArray(parsed.pendingChanges)) {
          await clearDebugDraft();
          return;
        }

        const draftCompanies = parsed.companies as Company[];
        const draftPendingChanges = parsed.pendingChanges;

        queueMicrotask(() => {
          if (cancelled) return;
          setCompanies(draftCompanies);
          setPendingChanges(draftPendingChanges.filter(isPendingChangeRecord).map(buildPendingChange));
          setSyncMessage(parsed.syncMessage ?? "Restored debug draft.");
          setActiveCompanyId((current) => draftCompanies.some((company) => company.id === current) ? current : draftCompanies[0]?.id ?? "");
          setDebugStorageIssue(null);
        });
      } catch {
        if (!cancelled) {
          queueMicrotask(() => setDebugStorageIssue("Could not restore the local debug draft for this browser."));
        }
      } finally {
        debugDraftHydratedRef.current = true;
      }
    })();

    return () => { cancelled = true; };
  }, [buildPendingChange, debugMode, debugModeReady]);

  useEffect(() => {
    if (!debugModeReady) return;
    if (!debugDraftHydratedRef.current) return;

    if (!debugMode) {
      try {
        window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, "false");
      } catch {
        // Ignore.
      }
      void clearDebugDraft();
      return;
    }
    try {
      window.localStorage.setItem(DEBUG_MODE_STORAGE_KEY, "true");
    } catch {
      // Ignore.
    }

    const timeoutId = window.setTimeout(() => {
      void writeDebugDraft({
        version: DEBUG_DRAFT_VERSION,
        companies,
        pendingChanges: pendingChanges.map((change) => change.record),
        syncMessage,
      } satisfies DebugDraft)
        .then(() => {
          setDebugStorageIssue((current) => (current ? null : current));
        })
        .catch((error) => {
          console.error(error);
          setDebugStorageIssue("This draft is too large to persist in browser storage. Your edits still exist in this tab, but they may not survive a reload.");
        });
    }, 250);

    return () => { window.clearTimeout(timeoutId); };
  }, [companies, debugMode, debugModeReady, pendingChanges, syncMessage]);

  function toggleDebugMode() {
    setDebugMode((current) => {
      const next = !current;
      if (next) debugDraftHydratedRef.current = false;
      if (!next) setDebugStorageIssue(null);
      setSyncMessage(next ? "Debug mode enabled. Draft edits now persist locally." : "Debug mode disabled. Local draft persistence is off.");
      return next;
    });
  }

  function resetDebugDraft() {
    setCompanies(initialData.companies);
    setPendingChanges([]);
    setSelectedIds(new Set(companyId && initialCompanyId ? [initialCompanyId] : []));
    setActiveCompanyId(initialCompanyId);
    setCompanyModalId(null);
    clearCompanyFilters();
    setBatchProgress(null);
    stopBatchRef.current = false;
    batchAbortControllerRef.current?.abort();
    batchAbortControllerRef.current = null;
    setCompanyDraft({ companyId: "", name: "", websites: "", description: "", country: "" });
    setEnrichmentDraft(null);
    setCompanyInvestmentDraft(null);
    setPipelineDrafts({});
    setEnrichmentMessage(null);
    setTagDrafts({});
    setPeopleMessage(null);
    setIncorrectEmailMessage(null);
    setDebugStorageIssue(null);
    setSyncMessage("Debug draft reset to the latest loaded data.");
    void clearDebugDraft();
  }

  return {
    debugMode,
    debugModeReady,
    debugStorageIssue,
    debugDraftHydratedRef,
    toggleDebugMode,
    resetDebugDraft,
  };
}
