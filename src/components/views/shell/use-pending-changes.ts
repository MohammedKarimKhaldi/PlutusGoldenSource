"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  addActivityAction,
  addCompanyTagAction,
  addInvestmentDealAction,
  deleteAccountingRecordAction,
  deleteFundraisingClientAction,
  deleteFundraisingTargetAction,
  highlightPersonAction,
  mergeCompaniesAction,
  mergePeopleAction,
  moveStageAction,
  renameCompanyTagAction,
  saveAccountingDocumentAction,
  saveAccountingLedgerEntryAction,
  saveFundraisingClientAction,
  saveFundraisingTargetAction,
  updateCompanyAction,
  updateCompanyEnrichmentAction,
  updateInvestmentDealStatusAction,
  updateInvestmentRelationshipAction,
  updatePeopleAction,
  updatePersonAction,
  voidAccountingRecordAction,
} from "@/app/actions";
import {
  formatChangeCount,
  formatNumber,
  isUuid,
} from "@/components/shared";
import type { DashboardData } from "@/lib/types";
import {
  PUSH_BATCH_SIZE,
  chunkItems,
  isPendingPersonChange,
  personSourceIds,
} from "@/lib/crm-utils";
import {
  createPendingPushContext,
  resolvePendingPayloadIds,
  upsertOnePendingChange,
} from "@/lib/pending-changes";
import type {
  PendingChange,
  PendingChangeRecord,
} from "@/lib/crm-types";
import type { Person } from "@/lib/types";

export function usePendingChanges(initialData: DashboardData) {
  const router = useRouter();
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [isPushingChanges, setIsPushingChanges] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const pendingIdResolutionsRef = useRef(new Map<string, string>());

  const buildPendingChange = useCallback((record: PendingChangeRecord): PendingChange => {
    switch (record.kind) {
      case "person":
        return {
          key: record.key,
          label: record.label,
          type: "person",
          personUpdate: record.personUpdate,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updatePersonAction(record.personUpdate)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "stage":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && record.companyIds.every(isUuid)
              ? moveStageAction({ organizationId: record.organizationId, companyIds: record.companyIds, stage: record.stage })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-tag":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && record.companyIds.every(isUuid)
              ? addCompanyTagAction({
                  organizationId: record.organizationId,
                  companyIds: record.companyIds,
                  tagName: record.tagName,
                  color: record.color,
                })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "highlight":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && isUuid(record.companyId) && isUuid(record.personId)
              ? highlightPersonAction({ companyId: record.companyId, personId: record.personId, highlighted: record.highlighted })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-update":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateCompanyAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-enrichment-update":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateCompanyEnrichmentAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "investment-relationship":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateInvestmentRelationshipAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "investment-deal":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? addInvestmentDealAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "investment-deal-status":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase"
              ? updateInvestmentDealStatusAction(record.payload)
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-tag-rename":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.tagId)
              ? renameCompanyTagAction({ organizationId: record.organizationId, tagId: record.tagId, name: record.name })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "activity-note":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.companyId)
              ? addActivityAction({
                  organizationId: record.organizationId,
                  companyId: record.companyId,
                  activityType: "note",
                  summary: record.summary,
                })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "company-merge":
        return {
          key: record.key,
          label: record.label,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.targetCompanyId) && record.sourceCompanyIds.every(isUuid)
              ? mergeCompaniesAction({
                  organizationId: record.organizationId,
                  targetCompanyId: record.targetCompanyId,
                  sourceCompanyIds: record.sourceCompanyIds,
                })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "people-merge":
        return {
          key: record.key,
          label: record.label,
          runBeforePersonBatch: true,
          record,
          run: () =>
            initialData.authMode === "supabase" && record.organizationId && isUuid(record.targetPersonId) && isUuid(record.sourcePersonId)
              ? mergePeopleAction({
                  organizationId: record.organizationId,
                  targetPersonId: record.targetPersonId,
                  sourcePersonId: record.sourcePersonId,
                })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "accounting-document-save":
        return {
          key: record.key,
          label: record.label,
          record,
          run: async (context) => {
            if (initialData.authMode !== "supabase") {
              return { ok: false, message: "Sign in with Supabase configured before pushing changes." };
            }
            const result = await saveAccountingDocumentAction(
              resolvePendingPayloadIds(record.payload, context, ["documentId", "companyId"]),
            );
            if (result.ok && result.document) context.rememberId(record.localId, result.document.id);
            return result;
          },
        };
      case "accounting-ledger-entry-save":
        return {
          key: record.key,
          label: record.label,
          record,
          run: async (context) => {
            if (initialData.authMode !== "supabase") {
              return { ok: false, message: "Sign in with Supabase configured before pushing changes." };
            }
            const result = await saveAccountingLedgerEntryAction(
              resolvePendingPayloadIds(record.payload, context, ["entryId", "documentId", "companyId"]),
            );
            if (result.ok && result.entry) context.rememberId(record.localId, result.entry.id);
            return result;
          },
        };
      case "accounting-record-action":
        return {
          key: record.key,
          label: record.label,
          record,
          run: (context) =>
            initialData.authMode === "supabase"
              ? record.action === "delete"
                ? deleteAccountingRecordAction({
                    organizationId: process.env.NEXT_PUBLIC_DEFAULT_ORG_ID,
                    entityType: record.entityType,
                    id: context.resolveId(record.id),
                    reason: record.reason,
                  })
                : voidAccountingRecordAction({
                    organizationId: process.env.NEXT_PUBLIC_DEFAULT_ORG_ID,
                    entityType: record.entityType,
                    id: context.resolveId(record.id),
                    reason: record.reason,
                  })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
      case "fundraising-client-save":
        return {
          key: record.key,
          label: record.label,
          record,
          run: async (context) => {
            if (initialData.authMode !== "supabase") {
              return { ok: false, message: "Sign in with Supabase configured before pushing changes." };
            }
            const result = await saveFundraisingClientAction(
              resolvePendingPayloadIds(record.payload, context, ["clientId", "companyId", "primaryContactPersonId"]),
            );
            if (result.ok && result.client) {
              context.rememberId(record.localId, result.client.id);
              context.rememberId(record.localCompanyId, result.client.companyId);
              context.rememberId(record.localPrimaryContactPersonId, result.client.primaryContactPersonId);
            }
            return result;
          },
        };
      case "fundraising-target-save":
        return {
          key: record.key,
          label: record.label,
          record,
          run: async (context) => {
            if (initialData.authMode !== "supabase") {
              return { ok: false, message: "Sign in with Supabase configured before pushing changes." };
            }
            const result = await saveFundraisingTargetAction(
              resolvePendingPayloadIds(record.payload, context, ["targetId", "clientId", "investorCompanyId", "investorPersonId"]),
            );
            if (result.ok && result.target) {
              context.rememberId(record.localId, result.target.id);
              context.rememberId(record.localInvestorCompanyId, result.target.investorCompanyId);
              context.rememberId(record.localInvestorPersonId, result.target.investorPersonId);
            }
            return result;
          },
        };
      case "fundraising-delete":
        return {
          key: record.key,
          label: record.label,
          record,
          run: (context) =>
            initialData.authMode === "supabase"
              ? record.entityType === "client"
                ? deleteFundraisingClientAction({ organizationId: process.env.NEXT_PUBLIC_DEFAULT_ORG_ID, id: context.resolveId(record.id) })
                : deleteFundraisingTargetAction({ organizationId: process.env.NEXT_PUBLIC_DEFAULT_ORG_ID, id: context.resolveId(record.id) })
              : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
        };
    }
  }, [initialData.authMode]);

  function queuePendingChange(change: PendingChange) {
    setPendingChanges((current) => upsertOnePendingChange(current, change));
    setSyncMessage(`${change.label} queued locally.`);
  }

  function queuePendingRecord(record: PendingChangeRecord) {
    queuePendingChange(buildPendingChange(record));
  }

  function discardPendingChange(key: string, label?: string) {
    setPendingChanges((current) => current.filter((change) => change.key !== key));
    if (label) setSyncMessage(`${label} removed from queued changes.`);
  }

  async function pushPendingChanges() {
    if (pendingChanges.length === 0 || isPushingChanges) return;

    const changes = pendingChanges;
    const pushContext = createPendingPushContext(pendingIdResolutionsRef.current);
    const prePersonChanges = changes.filter((change) => change.runBeforePersonBatch);
    const personChanges = changes.filter(isPendingPersonChange);
    const otherChanges = changes.filter((change) => !isPendingPersonChange(change) && !change.runBeforePersonBatch);
    setIsPushingChanges(true);
    setSyncMessage(`Pushing ${formatChangeCount(changes.length)}...`);

    for (let index = 0; index < prePersonChanges.length; index += 1) {
      const change = prePersonChanges[index];
      const result = await change.run(pushContext);
      if (!result.ok) {
        setPendingChanges(changes);
        setSyncMessage(`Push stopped at "${change.label}": ${result.message}`);
        setIsPushingChanges(false);
        return;
      }
    }

    if (personChanges.length > 0) {
      const personBatches = chunkItems(personChanges, PUSH_BATCH_SIZE);
      for (let batchIndex = 0; batchIndex < personBatches.length; batchIndex += 1) {
        const batch = personBatches[batchIndex];
        setSyncMessage(
          `Pushing contact batch ${formatNumber(batchIndex + 1)} of ${formatNumber(personBatches.length)} (${formatNumber(batch.length)} updates)...`,
        );
        const result = initialData.authMode === "supabase"
          ? await updatePeopleAction({ updates: batch.map((change) => change.personUpdate) })
          : { ok: false, message: "Sign in with Supabase configured before pushing changes." };

        if (!result.ok) {
          setPendingChanges([...personChanges.slice(batchIndex * PUSH_BATCH_SIZE), ...otherChanges]);
          setSyncMessage(`Push stopped at contact updates: ${result.message}`);
          setIsPushingChanges(false);
          return;
        }
      }
    }

    for (let index = 0; index < otherChanges.length; index += 1) {
      const change = otherChanges[index];
      const result = await change.run(pushContext);
      if (!result.ok) {
        setPendingChanges(otherChanges.slice(index));
        setSyncMessage(`Push stopped at "${change.label}": ${result.message}`);
        setIsPushingChanges(false);
        return;
      }
    }

    setPendingChanges([]);
    pendingIdResolutionsRef.current.clear();
    setSyncMessage(`Pushed ${formatChangeCount(changes.length)}.`);
    setIsPushingChanges(false);
    router.refresh();
  }

  async function pushPendingEnrichments() {
    const enrichmentCount = pendingChanges.filter((change) => change.record.kind === "company-enrichment-update").length;
    if (enrichmentCount === 0 || isPushingChanges) return;

    const changes = pendingChanges.filter((change) => change.record.kind === "company-enrichment-update");
    const changeKeys = new Set(changes.map((change) => change.key));
    setIsPushingChanges(true);
    setSyncMessage(`Pushing ${formatNumber(changes.length)} queued enrichment${changes.length === 1 ? "" : "s"}...`);

    for (let index = 0; index < changes.length; index += 1) {
      const change = changes[index];
      const result = await change.run(createPendingPushContext(pendingIdResolutionsRef.current));
      if (!result.ok) {
        setSyncMessage(`Push stopped at "${change.label}": ${result.message}`);
        setIsPushingChanges(false);
        return;
      }
    }

    setPendingChanges((current) => current.filter((change) => !changeKeys.has(change.key)));
    setSyncMessage(`Pushed ${formatNumber(changes.length)} enrichment${changes.length === 1 ? "" : "s"}.`);
    setIsPushingChanges(false);
  }

  function queuePersonUpdate(person: Person, label: string, options: { syncEmails?: boolean } = {}) {
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const syncEmails = options.syncEmails ?? true;
    for (const personId of personSourceIds(person)) {
      const personUpdate = organizationId && isUuid(personId)
        ? {
            organizationId,
            personId,
            displayName: person.displayName,
            categories: person.categories,
            jobTitle: person.jobTitle,
            linkedinUrl: person.linkedinUrl,
            phone: person.phone,
            country: person.country,
            syncEmails,
            ...(syncEmails ? { emails: person.emails } : {}),
          }
        : undefined;

      queuePendingChange({
        key: `person:${personId}`,
        label,
        type: "person",
        personUpdate,
        record: {
          kind: "person",
          key: `person:${personId}`,
          label,
          personUpdate: personUpdate ?? {
            organizationId: "",
            personId,
            displayName: person.displayName,
            categories: person.categories,
            jobTitle: person.jobTitle,
            linkedinUrl: person.linkedinUrl,
            phone: person.phone,
            country: person.country,
            syncEmails,
            ...(syncEmails ? { emails: person.emails } : {}),
          },
        },
        run: () =>
          initialData.authMode === "supabase" && personUpdate
            ? updatePersonAction(personUpdate)
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    }
  }

  return {
    pendingChanges,
    setPendingChanges,
    isPushingChanges,
    syncMessage,
    setSyncMessage,
    buildPendingChange,
    queuePendingChange,
    queuePendingRecord,
    discardPendingChange,
    pushPendingChanges,
    pushPendingEnrichments,
    queuePersonUpdate,
  };
}
