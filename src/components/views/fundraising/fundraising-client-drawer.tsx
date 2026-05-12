import { X } from "lucide-react";
import type { Company, Person } from "@/lib/types";
import type { PeopleDirectoryRow } from "@/components/shared";
import type { FundraisingClientDraft, FundraisingClientStage } from "./fundraising-types";
import { FUNDRAISING_CLIENT_STAGES, FUNDRAISING_CLIENT_STAGE_LABELS } from "./fundraising-types";

type FundraisingClientDrawerProps = {
  draft: FundraisingClientDraft;
  setDraft: (updater: React.SetStateAction<FundraisingClientDraft>) => void;
  companies: Company[];
  peopleDirectory: PeopleDirectoryRow[];
  isSaving: boolean;
  onSave: () => void;
  onClose: () => void;
};

export function FundraisingClientDrawer({
  draft, setDraft, companies, peopleDirectory, isSaving, onSave, onClose,
}: FundraisingClientDrawerProps) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <section className="drawer-panel open" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <h2>{draft.clientId ? "Edit client" : "New client"}</h2>
          <button type="button" className="icon-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">
          <form
            className="drawer-form"
            id="client-form"
            onSubmit={(e) => { e.preventDefault(); onSave(); }}
          >
            <label>
              <span>Client company</span>
              <select
                value={draft.companyId}
                onChange={(event) => {
                  const company = companies.find((item) => item.id === event.target.value);
                  setDraft((current) => ({
                    ...current,
                    companyId: event.target.value,
                    mandateName: current.mandateName || (company ? `${company.name} fundraising mandate` : current.mandateName),
                  }));
                }}
              >
                <option value="">Create new company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            {!draft.companyId ? (
              <>
                <label><span>New client company</span>
                  <input value={draft.newCompanyName} onChange={(e) => setDraft((c) => ({ ...c, newCompanyName: e.target.value }))} />
                </label>
                <div className="accounting-form-row">
                  <label><span>Domains</span>
                    <input value={draft.newCompanyWebsites} onChange={(e) => setDraft((c) => ({ ...c, newCompanyWebsites: e.target.value }))} placeholder="example.com" />
                  </label>
                  <label><span>Country</span>
                    <input value={draft.newCompanyCountry} onChange={(e) => setDraft((c) => ({ ...c, newCompanyCountry: e.target.value }))} />
                  </label>
                </div>
              </>
            ) : null}
            <label><span>Mandate name</span>
              <input value={draft.mandateName} onChange={(e) => setDraft((c) => ({ ...c, mandateName: e.target.value }))} required />
            </label>
            <label><span>Stage</span>
              <select value={draft.stage} onChange={(e) => setDraft((c) => ({ ...c, stage: e.target.value as FundraisingClientStage }))}>
                {FUNDRAISING_CLIENT_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{FUNDRAISING_CLIENT_STAGE_LABELS[stage]}</option>
                ))}
              </select>
            </label>
            <div className="accounting-form-row">
              <label><span>Target raise</span>
                <input inputMode="decimal" value={draft.targetRaiseAmount} onChange={(e) => setDraft((c) => ({ ...c, targetRaiseAmount: e.target.value }))} placeholder="0.00" />
              </label>
              <label><span>Currency</span>
                <input value={draft.targetRaiseCurrency} onChange={(e) => setDraft((c) => ({ ...c, targetRaiseCurrency: e.target.value.toUpperCase() }))} maxLength={3} />
              </label>
            </div>
            <div className="accounting-form-row">
              <label><span>Retainer amount</span>
                <input inputMode="decimal" value={draft.retainerAmount} onChange={(e) => setDraft((c) => ({ ...c, retainerAmount: e.target.value }))} placeholder="0.00" />
              </label>
              <label><span>Currency</span>
                <input value={draft.retainerCurrency} onChange={(e) => setDraft((c) => ({ ...c, retainerCurrency: e.target.value.toUpperCase() }))} maxLength={3} />
              </label>
            </div>
            <div className="accounting-form-row">
              <label><span>Signed on</span>
                <input type="date" value={draft.signedOn} onChange={(e) => setDraft((c) => ({ ...c, signedOn: e.target.value }))} />
              </label>
              <label><span>Primary contact</span>
                <select value={draft.primaryContactPersonId} onChange={(e) => setDraft((c) => ({ ...c, primaryContactPersonId: e.target.value }))}>
                  <option value="">None</option>
                  {peopleDirectory.map(({ person, companies }) => (
                    <option key={person.id} value={person.id}>{person.displayName} - {companies.map((c) => c.name).join(", ")}</option>
                  ))}
                </select>
              </label>
            </div>
            <label><span>New primary contact</span>
              <input value={draft.newPrimaryContactName} onChange={(e) => setDraft((c) => ({ ...c, newPrimaryContactName: e.target.value }))} placeholder="Optional contact name" />
            </label>
            <div className="accounting-form-row">
              <label><span>Contact email</span>
                <input value={draft.newPrimaryContactEmail} onChange={(e) => setDraft((c) => ({ ...c, newPrimaryContactEmail: e.target.value }))} />
              </label>
              <label><span>Contact title</span>
                <input value={draft.newPrimaryContactJobTitle} onChange={(e) => setDraft((c) => ({ ...c, newPrimaryContactJobTitle: e.target.value }))} />
              </label>
            </div>
            <div className="accounting-form-row">
              <label><span>Materials URL</span>
                <input value={draft.materialsUrl} onChange={(e) => setDraft((c) => ({ ...c, materialsUrl: e.target.value }))} />
              </label>
              <label><span>Data room URL</span>
                <input value={draft.dataRoomUrl} onChange={(e) => setDraft((c) => ({ ...c, dataRoomUrl: e.target.value }))} />
              </label>
            </div>
            <label><span>Notes</span>
              <textarea value={draft.notes} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} rows={3} />
            </label>
          </form>
        </div>
        <div className="drawer-footer">
          <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary-button" disabled={isSaving} form="client-form">
            {isSaving ? "Saving..." : draft.clientId ? "Save changes" : "Create client"}
          </button>
        </div>
      </section>
    </>
  );
}
