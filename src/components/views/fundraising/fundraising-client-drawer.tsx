import { useState } from "react";
import { X, Check } from "lucide-react";
import type { Company } from "@/lib/types";
import type { PeopleDirectoryRow } from "@/components/shared";
import type { FundraisingClientDraft, FundraisingClientStage, FundraisingRetainerCadence } from "./fundraising-types";
import { FUNDRAISING_CLIENT_STAGES, FUNDRAISING_CLIENT_STAGE_LABELS, FUNDRAISING_RETAINER_CADENCES, RETAINER_CADENCE_LABELS } from "./fundraising-types";

type FundraisingClientDrawerProps = {
  draft: FundraisingClientDraft;
  setDraft: (updater: React.SetStateAction<FundraisingClientDraft>) => void;
  companies: Company[];
  peopleDirectory: PeopleDirectoryRow[];
  isSaving: boolean;
  onSave: () => void;
  onClose: () => void;
};

type DrawerTab = "mandate" | "financials" | "contacts" | "docs";

const DRAWER_TABS: { key: DrawerTab; label: string }[] = [
  { key: "mandate", label: "Mandate" },
  { key: "financials", label: "Financials" },
  { key: "contacts", label: "Contacts" },
  { key: "docs", label: "Docs" },
];

export function FundraisingClientDrawer({
  draft, setDraft, companies, peopleDirectory, isSaving, onSave, onClose,
}: FundraisingClientDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("mandate");
  const [confirmingSave, setConfirmingSave] = useState(false);

  const selectedCompany = draft.companyId ? companies.find((c) => c.id === draft.companyId) : null;

  function handleConfirm() {
    setConfirmingSave(false);
    onSave();
  }

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
          {confirmingSave ? (
            <div className="drawer-confirm">
              <p className="drawer-confirm-heading">Review before saving</p>

              <div className="drawer-confirm-section">
                <p className="drawer-section-card-title">Mandate</p>
                <dl className="drawer-confirm-dl">
                  <div><dt>Company</dt><dd>{selectedCompany?.name ?? (draft.newCompanyName || "—")}</dd></div>
                  <div><dt>Mandate</dt><dd>{draft.mandateName || "—"}</dd></div>
                  <div><dt>Stage</dt><dd>{FUNDRAISING_CLIENT_STAGE_LABELS[draft.stage]}</dd></div>
                  <div><dt>Signed</dt><dd>{draft.signedOn || "—"}</dd></div>
                </dl>
              </div>

              {draft.retainerAmount ? (
                <div className="drawer-confirm-section">
                  <p className="drawer-section-card-title">Retainer</p>
                  <dl className="drawer-confirm-dl">
                    <div><dt>Amount</dt><dd>{draft.retainerAmount} {draft.retainerCurrency}</dd></div>
                    <div><dt>Cadence</dt><dd>{RETAINER_CADENCE_LABELS[draft.retainerCadence]}</dd></div>
                    {draft.retainerNextBillingDate ? <div><dt>Next billing</dt><dd>{draft.retainerNextBillingDate}</dd></div> : null}
                  </dl>
                </div>
              ) : null}

              <div className="drawer-confirm-section">
                <p className="drawer-section-card-title">Contact</p>
                <dl className="drawer-confirm-dl">
                  <div>
                    <dt>Primary</dt>
                    <dd>
                      {draft.primaryContactPersonId
                        ? peopleDirectory.find(({ person }) => person.id === draft.primaryContactPersonId)?.person.displayName
                        : draft.newPrimaryContactName || "None"}
                    </dd>
                  </div>
                </dl>
              </div>

              <form id="client-form" onSubmit={(e) => { e.preventDefault(); handleConfirm(); }} />
            </div>
          ) : (
          <>
          <div className="drawer-tabs" role="tablist">
            {DRAWER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={activeTab === tab.key ? "active" : ""}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <form
            className="drawer-form"
            id="client-form"
            onSubmit={(e) => { e.preventDefault(); onSave(); }}
          >
            {activeTab === "mandate" ? (
              <div key="mandate" className="drawer-tab-content">
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
                  <div className="drawer-section-card">
                    <p className="drawer-section-card-title">New company</p>
                    <label><span>Name</span>
                      <input value={draft.newCompanyName} onChange={(e) => setDraft((c) => ({ ...c, newCompanyName: e.target.value }))} />
                    </label>
                    <div className="form-row-2col">
                      <label><span>Domains</span>
                        <input value={draft.newCompanyWebsites} onChange={(e) => setDraft((c) => ({ ...c, newCompanyWebsites: e.target.value }))} placeholder="example.com" />
                      </label>
                      <label><span>Country</span>
                        <input value={draft.newCompanyCountry} onChange={(e) => setDraft((c) => ({ ...c, newCompanyCountry: e.target.value }))} />
                      </label>
                    </div>
                  </div>
                ) : null}

                <div className="form-row-2col">
                  <label><span>Mandate name</span>
                    <input value={draft.mandateName} onChange={(e) => setDraft((c) => ({ ...c, mandateName: e.target.value }))} required />
                  </label>
                  <label><span>Signed on</span>
                    <input type="date" value={draft.signedOn} onChange={(e) => setDraft((c) => ({ ...c, signedOn: e.target.value }))} />
                  </label>
                </div>

                <label><span>Stage</span>
                  <select value={draft.stage} onChange={(e) => setDraft((c) => ({ ...c, stage: e.target.value as FundraisingClientStage }))}>
                    {FUNDRAISING_CLIENT_STAGES.map((stage) => (
                      <option key={stage} value={stage}>{FUNDRAISING_CLIENT_STAGE_LABELS[stage]}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            {activeTab === "financials" ? (
              <div key="financials" className="drawer-tab-content">
                <div className="form-row-2col">
                  <label><span>Target raise</span>
                    <input inputMode="decimal" value={draft.targetRaiseAmount} onChange={(e) => setDraft((c) => ({ ...c, targetRaiseAmount: e.target.value }))} placeholder="0.00" />
                  </label>
                  <label><span>Currency</span>
                    <input value={draft.targetRaiseCurrency} onChange={(e) => setDraft((c) => ({ ...c, targetRaiseCurrency: e.target.value.toUpperCase() }))} maxLength={3} placeholder="GBP" />
                  </label>
                </div>
                <div className="drawer-section-card">
                  <p className="drawer-section-card-title">Retainer schedule</p>
                  <div className="form-row-2col">
                    <label><span>Retainer amount</span>
                      <input inputMode="decimal" value={draft.retainerAmount} onChange={(e) => setDraft((c) => ({ ...c, retainerAmount: e.target.value }))} placeholder="0.00" />
                    </label>
                    <label><span>Currency</span>
                      <input value={draft.retainerCurrency} onChange={(e) => setDraft((c) => ({ ...c, retainerCurrency: e.target.value.toUpperCase() }))} maxLength={3} placeholder="GBP" />
                    </label>
                  </div>
                  <label><span>Cadence</span>
                    <select value={draft.retainerCadence} onChange={(e) => setDraft((c) => ({ ...c, retainerCadence: e.target.value as FundraisingRetainerCadence }))}>
                      {FUNDRAISING_RETAINER_CADENCES.map((cadence) => (
                        <option key={cadence} value={cadence}>{RETAINER_CADENCE_LABELS[cadence]}</option>
                      ))}
                    </select>
                  </label>
                  <label><span>Next billing date</span>
                    <input type="date" value={draft.retainerNextBillingDate} onChange={(e) => setDraft((c) => ({ ...c, retainerNextBillingDate: e.target.value }))} />
                  </label>
                </div>
              </div>
            ) : null}

            {activeTab === "contacts" ? (
              <div key="contacts" className="drawer-tab-content">
                <label><span>Primary contact</span>
                  <select value={draft.primaryContactPersonId} onChange={(e) => setDraft((c) => ({ ...c, primaryContactPersonId: e.target.value }))}>
                    <option value="">None — create new contact</option>
                    {peopleDirectory.map(({ person, companies }) => (
                      <option key={person.id} value={person.id}>{person.displayName} - {companies.map((c) => c.name).join(", ")}</option>
                    ))}
                  </select>
                </label>

                {!draft.primaryContactPersonId ? (
                  <div className="drawer-section-card">
                    <p className="drawer-section-card-title">New contact details</p>
                    <label><span>Name</span>
                      <input value={draft.newPrimaryContactName} onChange={(e) => setDraft((c) => ({ ...c, newPrimaryContactName: e.target.value }))} placeholder="Full name" />
                    </label>
                    <div className="form-row-2col">
                      <label><span>Email</span>
                        <input value={draft.newPrimaryContactEmail} onChange={(e) => setDraft((c) => ({ ...c, newPrimaryContactEmail: e.target.value }))} />
                      </label>
                      <label><span>Job title</span>
                        <input value={draft.newPrimaryContactJobTitle} onChange={(e) => setDraft((c) => ({ ...c, newPrimaryContactJobTitle: e.target.value }))} />
                      </label>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "docs" ? (
              <div key="docs" className="drawer-tab-content">
                <label><span>Materials URL</span>
                  <input value={draft.materialsUrl} onChange={(e) => setDraft((c) => ({ ...c, materialsUrl: e.target.value }))} placeholder="https://" />
                </label>
                <label><span>Data room URL</span>
                  <input value={draft.dataRoomUrl} onChange={(e) => setDraft((c) => ({ ...c, dataRoomUrl: e.target.value }))} placeholder="https://" />
                </label>
                <label><span>Notes</span>
                  <textarea value={draft.notes} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} rows={4} />
                </label>
              </div>
            ) : null}
          </form>
          </>
          )}
        </div>
        <div className="drawer-footer">
          {confirmingSave ? (
            <>
              <button type="button" className="secondary-button" onClick={() => setConfirmingSave(false)}>Back to edit</button>
              <button type="submit" className="primary-button" disabled={isSaving} form="client-form">
                {isSaving ? "Saving..." : "Confirm & create"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
              <button type="button" className="primary-button" disabled={isSaving} onClick={() => setConfirmingSave(true)}>
                <Check size={15} /> {draft.clientId ? "Save changes" : "Create client"}
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
}
