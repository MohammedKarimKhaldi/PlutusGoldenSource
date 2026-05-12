import { Check, Pencil, Plus } from "lucide-react";
import clsx from "clsx";
import type { Company, FundraisingClient, FundraisingClientTarget } from "@/lib/types";
import type { PeopleDirectoryRow } from "@/components/shared";
import type { FundraisingTargetDraft, FundraisingTargetStage } from "./fundraising-types";
import {
  FUNDRAISING_TARGET_STAGES, FUNDRAISING_TARGET_STAGE_LABELS,
  formatMinorMoney, formatNumber,
} from "./fundraising-types";

type FundraisingTargetsTabProps = {
  draft: FundraisingTargetDraft;
  setDraft: (updater: React.SetStateAction<FundraisingTargetDraft>) => void;
  fundraisingClients: FundraisingClient[];
  filteredFundraisingTargets: FundraisingClientTarget[];
  fundraisingClientById: Map<string, FundraisingClient>;
  companies: Company[];
  peopleDirectory: PeopleDirectoryRow[];
  isSaving: boolean;
  onSave: () => void;
  onEditTarget: (target: FundraisingClientTarget) => void;
  onDeleteTarget: (target: FundraisingClientTarget) => void;
  onOpenCompany: (companyId: string) => void;
  onClearDraft: () => void;
};

export function FundraisingTargetsTab({
  draft, setDraft, fundraisingClients, filteredFundraisingTargets,
  fundraisingClientById, companies, peopleDirectory,
  isSaving, onSave, onEditTarget, onDeleteTarget, onOpenCompany, onClearDraft,
}: FundraisingTargetsTabProps) {
  return (
    <div className="fundraising-grid">
      <form
        className="accounting-form fundraising-form"
        onSubmit={(event) => { event.preventDefault(); onSave(); }}
      >
        <div className="accounting-form-header">
          <h2>{draft.targetId ? "Edit target" : "New investor target"}</h2>
          {draft.targetId ? (
            <button type="button" className="text-button compact" onClick={onClearDraft}>Clear</button>
          ) : null}
        </div>
        <label><span>Fundraising client</span>
          <select value={draft.clientId} onChange={(e) => setDraft((c) => ({ ...c, clientId: e.target.value }))} required>
            <option value="">Choose client</option>
            {fundraisingClients.map((client) => (
              <option key={client.id} value={client.id}>{client.mandateName}</option>
            ))}
          </select>
        </label>
        <label><span>Investor company</span>
          <select value={draft.investorCompanyId} onChange={(e) => {
            const company = companies.find((item) => item.id === e.target.value);
            setDraft((c) => ({ ...c, investorCompanyId: e.target.value, investorName: c.investorName || company?.name || c.investorName }));
          }}>
            <option value="">Create new or snapshot only</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
        {!draft.investorCompanyId ? (
          <>
            <label><span>New investor company</span>
              <input value={draft.newInvestorCompanyName} onChange={(e) => setDraft((c) => ({ ...c, newInvestorCompanyName: e.target.value, investorName: c.investorName || e.target.value }))} />
            </label>
            <div className="accounting-form-row">
              <label><span>Investor domains</span>
                <input value={draft.newInvestorCompanyWebsites} onChange={(e) => setDraft((c) => ({ ...c, newInvestorCompanyWebsites: e.target.value }))} />
              </label>
              <label><span>Investor country</span>
                <input value={draft.newInvestorCompanyCountry} onChange={(e) => setDraft((c) => ({ ...c, newInvestorCompanyCountry: e.target.value }))} />
              </label>
            </div>
          </>
        ) : null}
        <div className="accounting-form-row">
          <label><span>Investor name</span>
            <input value={draft.investorName} onChange={(e) => setDraft((c) => ({ ...c, investorName: e.target.value }))} required />
          </label>
          <label><span>Investor type</span>
            <input value={draft.investorType} onChange={(e) => setDraft((c) => ({ ...c, investorType: e.target.value }))} placeholder="VC, family office, PE..." />
          </label>
        </div>
        <label><span>Stage</span>
          <select value={draft.stage} onChange={(e) => setDraft((c) => ({ ...c, stage: e.target.value as FundraisingTargetStage }))}>
            {FUNDRAISING_TARGET_STAGES.map((stage) => (
              <option key={stage} value={stage}>{FUNDRAISING_TARGET_STAGE_LABELS[stage]}</option>
            ))}
          </select>
        </label>
        <label><span>Investor contact</span>
          <select value={draft.investorPersonId} onChange={(e) => setDraft((c) => ({ ...c, investorPersonId: e.target.value }))}>
            <option value="">None</option>
            {peopleDirectory.map(({ person, companies }) => (
              <option key={person.id} value={person.id}>{person.displayName} - {companies.map((c) => c.name).join(", ")}</option>
            ))}
          </select>
        </label>
        <label><span>New investor contact</span>
          <input value={draft.newInvestorPersonName} onChange={(e) => setDraft((c) => ({ ...c, newInvestorPersonName: e.target.value }))} />
        </label>
        <div className="accounting-form-row">
          <label><span>Contact email</span>
            <input value={draft.newInvestorPersonEmail} onChange={(e) => setDraft((c) => ({ ...c, newInvestorPersonEmail: e.target.value, investorEmail: c.investorEmail || e.target.value }))} />
          </label>
          <label><span>Contact title</span>
            <input value={draft.newInvestorPersonJobTitle} onChange={(e) => setDraft((c) => ({ ...c, newInvestorPersonJobTitle: e.target.value }))} />
          </label>
        </div>
        <div className="accounting-form-row">
          <label><span>Min ticket</span>
            <input inputMode="decimal" value={draft.ticketSizeMin} onChange={(e) => setDraft((c) => ({ ...c, ticketSizeMin: e.target.value }))} placeholder="0.00" />
          </label>
          <label><span>Max ticket</span>
            <input inputMode="decimal" value={draft.ticketSizeMax} onChange={(e) => setDraft((c) => ({ ...c, ticketSizeMax: e.target.value }))} placeholder="0.00" />
          </label>
        </div>
        <div className="accounting-form-row">
          <label><span>Currency</span>
            <input value={draft.ticketSizeCurrency} onChange={(e) => setDraft((c) => ({ ...c, ticketSizeCurrency: e.target.value.toUpperCase() }))} maxLength={3} />
          </label>
          <label><span>Last contacted</span>
            <input type="date" value={draft.lastContactedAt} onChange={(e) => setDraft((c) => ({ ...c, lastContactedAt: e.target.value }))} />
          </label>
        </div>
        <label><span>Next step</span>
          <input value={draft.nextStep} onChange={(e) => setDraft((c) => ({ ...c, nextStep: e.target.value }))} />
        </label>
        <label><span>Notes</span>
          <textarea value={draft.notes} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} rows={3} />
        </label>
        <button type="submit" className="primary-button" disabled={isSaving || fundraisingClients.length === 0}>
          <Check size={15} /> {isSaving ? "Saving..." : "Save target"}
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
                      <button type="button" className="text-button compact" onClick={() => onEditTarget(target)}>
                        <Pencil size={13} /> Edit
                      </button>
                      {target.investorCompanyId ? (
                        <button type="button" className="text-button compact" onClick={() => onOpenCompany(target.investorCompanyId!)}>
                          Open CRM
                        </button>
                      ) : null}
                      <button type="button" className="text-button compact danger" onClick={() => onDeleteTarget(target)} disabled={isSaving}>
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
  );
}
