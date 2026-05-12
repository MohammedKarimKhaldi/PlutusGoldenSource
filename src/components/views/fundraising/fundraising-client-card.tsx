import { Activity, CreditCard, Flag, Pencil, Plus, UserRound, UsersRound } from "lucide-react";
import clsx from "clsx";
import type { FundraisingClient, FundraisingClientTarget, Company } from "@/lib/types";
import type { PeopleDirectoryRow } from "@/components/shared";
import {
  formatDate,
  formatMinorMoney,
  formatNumber,
  FUNDRAISING_CLIENT_STAGE_LABELS,
  CLIENT_STAGE_COLORS,
} from "./fundraising-types";

type FundraisingClientCardProps = {
  client: FundraisingClient;
  companyName: string;
  targets: FundraisingClientTarget[];
  primaryContact: PeopleDirectoryRow["person"] | null;
  onOpenCompany: (companyId: string) => void;
  onEdit: (client: FundraisingClient) => void;
  onAddTarget: (clientId: string) => void;
  onAccounting: (companyId: string) => void;
  onDelete: (client: FundraisingClient) => void;
  isSaving: boolean;
  accountingAccess: { canView: boolean };
};

export function FundraisingClientCard({
  client, companyName, targets, primaryContact,
  onOpenCompany, onEdit, onAddTarget, onAccounting, onDelete,
  isSaving, accountingAccess,
}: FundraisingClientCardProps) {
  return (
    <article className="fundraising-client-card" style={{ borderLeftColor: CLIENT_STAGE_COLORS[client.stage] }}>
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
        <span><UsersRound size={13} /> {formatNumber(targets.length)} targets</span>
        <span><Activity size={13} /> {client.signedOn ? formatDate(client.signedOn) : "No signed date"}</span>
        <span><UserRound size={13} /> {primaryContact?.displayName ?? "No primary contact"}</span>
        <span>
          <Flag size={13} />{" "}
          {client.targetRaiseAmountMinor && client.targetRaiseCurrency
            ? formatMinorMoney(client.targetRaiseAmountMinor, client.targetRaiseCurrency)
            : "No target raise"}
        </span>
        {client.retainerAmountMinor && client.retainerCurrency ? (
          <span>Retainer: {formatMinorMoney(client.retainerAmountMinor, client.retainerCurrency)}</span>
        ) : null}
      </div>
      {client.notes ? <p className="pipeline-card-note">{client.notes}</p> : null}
      <div className="fundraising-row-actions">
        <button type="button" className="text-button compact" onClick={() => onEdit(client)}>
          <Pencil size={13} /> Edit
        </button>
        <button type="button" className="text-button compact" onClick={() => onAddTarget(client.id)}>
          <Plus size={13} /> Add target
        </button>
        <button
          type="button" className="text-button compact"
          onClick={() => onAccounting(client.companyId)}
          disabled={!accountingAccess.canView}
        >
          <CreditCard size={13} /> Accounting
        </button>
        <button
          type="button" className="text-button compact danger"
          onClick={() => onDelete(client)}
          disabled={isSaving}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
