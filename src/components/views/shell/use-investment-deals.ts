"use client";

import { useMemo, useState } from "react";

import { isUuid } from "@/components/shared";
import type { InvestmentDraft, PipelineStatusDraft } from "@/components/shared";
import {
  addInvestmentDealAction,
  updateInvestmentDealStatusAction,
  updateInvestmentRelationshipAction,
} from "@/app/actions";
import { buildDealPipelineRows, groupDealPipelineRows, type DealPipelineRow } from "@/lib/deal-pipeline";
import {
  formatDealStatusSummary,
  investmentDraftForRelationship,
  relationshipForCompany,
} from "@/lib/crm-utils";
import type { PendingChange } from "@/lib/crm-types";
import type { Company, InvestmentDealStatus, InvestmentRelationship } from "@/lib/types";

type UseInvestmentDealsOptions = {
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  queuePendingChange: (change: PendingChange) => void;
};

export function useInvestmentDeals(options: UseInvestmentDealsOptions) {
  const { companies, setCompanies, queuePendingChange } = options;

  const [pipelineDrafts, setPipelineDrafts] = useState<Record<string, PipelineStatusDraft>>({});
  const [companyInvestmentDraft, setCompanyInvestmentDraft] = useState<InvestmentDraft | null>(null);

  const dealPipelineRows = useMemo(() => buildDealPipelineRows(companies), [companies]);
  const dealPipelineGroups = useMemo(() => groupDealPipelineRows(dealPipelineRows), [dealPipelineRows]);

  function updateRelationshipInList(relationships: InvestmentRelationship[], relationship: InvestmentRelationship) {
    const existingIndex = relationships.findIndex(
      (item) => (item.companyId === relationship.companyId && item.personId === relationship.personId) || item.id === relationship.id,
    );
    if (existingIndex === -1) return [...relationships, relationship];
    const next = [...relationships];
    next[existingIndex] = relationship;
    return next;
  }

  function updateDealStatusInRelationships(relationships: InvestmentRelationship[], dealId: string, status: InvestmentDealStatus) {
    return relationships.map((relationship) => ({
      ...relationship,
      deals: relationship.deals.map((deal) => (deal.id === dealId ? { ...deal, status } : deal)),
    }));
  }

  function updateInvestmentRelationshipLocally(relationship: InvestmentRelationship) {
    setCompanies((current) =>
      current.map((company) => ({
        ...company,
        investmentRelationships: relationship.companyId === company.id
          ? updateRelationshipInList(company.investmentRelationships, relationship)
          : company.investmentRelationships,
        people: company.people.map((person) =>
          relationship.personId === person.id
            ? { ...person, investmentRelationships: updateRelationshipInList(person.investmentRelationships, relationship) }
            : person,
        ),
      })),
    );
  }

  function updateInvestmentDealStatusLocally(companyId: string, dealId: string, status: InvestmentDealStatus, summary: string) {
    const now = new Date().toISOString();
    const activityId = `local-status-${companyId}-${dealId}`;
    setCompanies((current) =>
      current.map((company) => ({
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
      })),
    );
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
        organizationId
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
        organizationId
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
        organizationId && isUuid(row.companyId) && isUuid(row.dealId)
          ? updateInvestmentDealStatusAction(payload)
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });

    setPipelineDrafts((current) => {
      const next = { ...current };
      delete next[row.key];
      return next;
    });
  }

  return {
    pipelineDrafts,
    setPipelineDrafts,
    companyInvestmentDraft,
    setCompanyInvestmentDraft,
    dealPipelineRows,
    dealPipelineGroups,
    updateInvestmentRelationshipLocally,
    saveInvestmentRelationship,
    addInvestmentDealLocally,
    updateInvestmentDealStatusLocally,
    updatePipelineDraft,
    queueDealStatusUpdate,
  };
}
