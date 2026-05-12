import { Activity, Check, Download, Flag, UsersRound } from "lucide-react";
import clsx from "clsx";
import { formatNumber, formatDate } from "@/components/shared";
import {
  INVESTMENT_DEAL_STATUSES,
  type InvestmentDealStatus,
} from "@/lib/types";

const INVESTMENT_DEAL_STATUS_LABELS: Record<InvestmentDealStatus, string> = {
  prospective: "Prospective",
  active: "Active",
  closed: "Closed",
  passed: "Passed",
};
import type { DealPipelineRow, DealPipelineGroup } from "@/lib/deal-pipeline";

type PipelineStatusDraft = {
  status: InvestmentDealStatus;
  note: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function PipelineView({
  groups,
  rows,
  drafts,
  onOpenCompany,
  onUpdateDraft,
  onQueueStatusUpdate,
  onExport,
}: {
  groups: DealPipelineGroup[];
  rows: DealPipelineRow[];
  drafts: Record<string, PipelineStatusDraft>;
  onOpenCompany: (id: string) => void;
  onUpdateDraft: (row: DealPipelineRow, updates: Partial<PipelineStatusDraft>) => void;
  onQueueStatusUpdate: (row: DealPipelineRow) => void;
  onExport: (rows: DealPipelineRow[]) => void;
}) {
  return (
    <section className="view-surface">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Pipeline</p>
          <h2>Deal outreach pipeline</h2>
          <span>{formatNumber(rows.length)} company-deal work items</span>
        </div>
        <button type="button" className="secondary-button" onClick={() => onExport(rows)}>
          <Download size={15} /> Export pipeline
        </button>
      </div>
      <div className="pipeline-board">
        {groups.map((group) => (
          <section key={group.status} className="pipeline-column">
            <div className="pipeline-column-header">
              <strong>{INVESTMENT_DEAL_STATUS_LABELS[group.status]}</strong>
              <span>{group.total}</span>
            </div>
            {group.rows.map((row) => {
              const draft = drafts[row.key] ?? { status: row.status, note: "" };
              const canQueue = draft.status !== row.status || draft.note.trim().length > 0;
              const canPersist = isUuid(row.companyId) && isUuid(row.dealId);
              const detailNotes = [...row.dealNotes, ...row.relationshipNotes];

              return (
                <article key={row.key} className="pipeline-card">
                  <div className="pipeline-card-header">
                    <div>
                      <strong>{row.dealName}</strong>
                      <button type="button" className="text-button compact" onClick={() => onOpenCompany(row.companyId)}>
                        {row.companyName}
                      </button>
                    </div>
                    <span className={clsx("deal-status-pill", row.status)}>{INVESTMENT_DEAL_STATUS_LABELS[row.status]}</span>
                  </div>
                  <div className="pipeline-card-meta">
                    <span>
                      <UsersRound size={13} /> {row.contacts.length > 0 ? row.contacts.join(", ") : "No linked contact"}
                    </span>
                    <span>
                      <Flag size={13} /> {row.outreachStage}
                    </span>
                    <span>
                      <Activity size={13} /> {row.investedAt ? formatDate(row.investedAt) : "No deal date"}
                    </span>
                  </div>
                  {row.roles.length > 0 ? <p className="pipeline-card-note">Role: {row.roles.join("; ")}</p> : null}
                  {detailNotes.length > 0 ? <p className="pipeline-card-note">{detailNotes.join(" ")}</p> : null}
                  <div className="pipeline-status-controls">
                    <label>
                      <span>Status</span>
                      <select
                        value={draft.status}
                        onChange={(event) => onUpdateDraft(row, { status: event.target.value as InvestmentDealStatus })}
                      >
                        {INVESTMENT_DEAL_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {INVESTMENT_DEAL_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Update note</span>
                      <input
                        value={draft.note}
                        onChange={(event) => onUpdateDraft(row, { note: event.target.value })}
                        placeholder="Optional note"
                      />
                    </label>
                    <button
                      type="button"
                      className="primary-button compact"
                      disabled={!canQueue || !canPersist}
                      title={canPersist ? "Queue status update" : "Push this deal before changing status"}
                      onClick={() => onQueueStatusUpdate(row)}
                    >
                      <Check size={14} /> Queue
                    </button>
                  </div>
                  {!canPersist ? <span className="pipeline-card-warning">Push this new deal before queueing status updates.</span> : null}
                </article>
              );
            })}
            {group.rows.length === 0 ? (
              <div className="pipeline-empty">
                <span>No deal outreach here yet.</span>
              </div>
            ) : null}
          </section>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">No investment deals are linked to companies or company contacts yet.</p>
      ) : null}
    </section>
  );
}
