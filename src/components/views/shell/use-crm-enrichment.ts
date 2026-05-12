"use client";

import { useRef, useState } from "react";

import { isUuid } from "@/components/shared";
import { updateCompanyEnrichmentAction } from "@/app/actions";
import type { EnrichmentApiResponse, PendingChange } from "@/lib/crm-types";
import type { EnrichmentDraft, EnrichmentBatchProgress } from "@/components/shared";
import {
  defaultCompanyEnrichment,
  enrichmentDraftForCompany,
  enrichmentResponseTags,
  normalizeEnrichmentKeywords,
  uniqueTags,
} from "@/lib/crm-utils";
import type { Company, CompanyEnrichment, Tag } from "@/lib/types";

type UseCrmEnrichmentOptions = {
  updateCompanies: (updater: (company: Company) => Company) => void;
  queuePendingChange: (change: PendingChange) => void;
};

export function useCrmEnrichment(options: UseCrmEnrichmentOptions) {
  const { updateCompanies, queuePendingChange } = options;

  const [enrichmentDraft, setEnrichmentDraft] = useState<EnrichmentDraft | null>(null);
  const [enrichmentMessage, setEnrichmentMessage] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<EnrichmentBatchProgress | null>(null);
  const [isEnriching, setIsEnriching] = useState(false);
  const stopBatchRef = useRef(false);
  const batchAbortControllerRef = useRef<AbortController | null>(null);

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
        organizationId && isUuid(companyId)
          ? updateCompanyEnrichmentAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
  }

  function saveActiveCompanyEnrichment(activeCompany: Company | null, activeCompanyEnrichmentDraft: EnrichmentDraft | null) {
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

  async function enrichActiveCompany(activeCompany: Company | null, force = false) {
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
          current ? { ...current, completed, skipped, failed, currentName: null } : current,
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

  const batchProcessed = batchProgress ? batchProgress.completed + batchProgress.skipped + batchProgress.failed : 0;
  const batchPercent = batchProgress && batchProgress.total > 0 ? Math.round((batchProcessed / batchProgress.total) * 100) : 0;
  const isBatchEnriching = isEnriching && batchProgress !== null;

  return {
    enrichmentDraft,
    setEnrichmentDraft,
    enrichmentMessage,
    setEnrichmentMessage,
    batchProgress,
    setBatchProgress,
    isEnriching,
    setIsEnriching,
    stopBatchRef,
    batchAbortControllerRef,

    batchProcessed,
    batchPercent,
    isBatchEnriching,

    updateCompanyEnrichmentLocally,
    updateCompanyTagsLocally,
    queueCompanyEnrichmentUpdate,
    saveActiveCompanyEnrichment,
    enrichActiveCompany,
    enrichCompanyBatch,
    requestStopEnrichmentBatch,
  };
}
