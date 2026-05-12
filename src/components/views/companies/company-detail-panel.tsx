import { Activity, Check, ChevronDown, Flag, FlaskConical, Mail, Pencil, Plus, Star, X } from "lucide-react";
import clsx from "clsx";
import {
  SOURCE_QUALITY_LABELS,
  INVESTMENT_STATUS_LABELS,
  CAPACITY_STATUS_LABELS,
  INVESTMENT_DEAL_STATUS_LABELS,
  relationshipChipLabel,
  formatDate,
} from "@/components/shared";
import type { InvestmentDraft, EnrichmentDraft } from "@/components/shared";
import {
  INVESTMENT_STATUSES,
  CAPACITY_STATUSES,
  INVESTMENT_DEAL_STATUSES,
  type InvestmentStatus,
  type CapacityStatus,
  type InvestmentDealStatus,
} from "@/lib/types";
import type { Company, InvestmentRelationship, Person } from "@/lib/types";

interface CompanyDetailPanelProps {
  activeCompany: Company;
  showDetailPanel: boolean;
  companyModalId: string | null;
  activeCompanyDraft: { companyId: string; name: string; websites: string; description: string; country: string };
  setCompanyDraft: React.Dispatch<React.SetStateAction<{ companyId: string; name: string; websites: string; description: string; country: string }>>;
  updateActiveCompany: (field: "name" | "websites" | "description" | "country", value: string) => void;
  closeCompanyModal: () => void;
  activeCompanyEnrichmentDraft: EnrichmentDraft | null;
  setEnrichmentDraft: React.Dispatch<React.SetStateAction<EnrichmentDraft | null>>;
  enrichmentMessage: string | null;
  isEnriching: boolean;
  localEnrichmentEnabled: boolean;
  isSignedIn: boolean;
  enrichActiveCompany: (force?: boolean) => void;
  saveActiveCompanyEnrichment: () => void;
  activeCompanyInvestment: InvestmentRelationship | null;
  activeCompanyInvestmentDraft: InvestmentDraft | null;
  setCompanyInvestmentDraft: React.Dispatch<React.SetStateAction<InvestmentDraft | null>>;
  saveInvestmentRelationship: (relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) => void;
  addInvestmentDealLocally: (relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) => void;
  toggleHighlight: (companyId: string, person: Person) => void;
  startPersonEdit: (person: Person) => void;
  noteText: string;
  setNoteText: React.Dispatch<React.SetStateAction<string>>;
  addManualNote: () => void;
}

export function CompanyDetailPanel({
  activeCompany,
  showDetailPanel,
  companyModalId,
  activeCompanyDraft,
  setCompanyDraft,
  updateActiveCompany,
  closeCompanyModal,
  activeCompanyEnrichmentDraft,
  setEnrichmentDraft,
  enrichmentMessage,
  isEnriching,
  localEnrichmentEnabled,
  isSignedIn,
  enrichActiveCompany,
  saveActiveCompanyEnrichment,
  activeCompanyInvestment,
  activeCompanyInvestmentDraft,
  setCompanyInvestmentDraft,
  saveInvestmentRelationship,
  addInvestmentDealLocally,
  toggleHighlight,
  startPersonEdit,
  noteText,
  setNoteText,
  addManualNote,
}: CompanyDetailPanelProps) {
  return (
    <div
      className={clsx("company-detail-host", !showDetailPanel && "modal-backdrop company-detail-backdrop")}
      role={!showDetailPanel ? "presentation" : undefined}
      onClick={!showDetailPanel ? closeCompanyModal : undefined}
    >
    <aside
      className={clsx("detail-panel", !showDetailPanel && "company-detail-modal")}
      aria-label="Company details"
      role={!showDetailPanel ? "dialog" : undefined}
      aria-modal={!showDetailPanel ? true : undefined}
      onClick={!showDetailPanel ? (event) => event.stopPropagation() : undefined}
    >
      <div className="detail-header">
        <div>
          <p className="eyebrow">Company detail</p>
          <input
            className="title-input"
            aria-label="Company name"
            value={activeCompanyDraft.name}
            onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, name: event.target.value })}
            onBlur={() => updateActiveCompany("name", activeCompanyDraft.name)}
          />
        </div>
        <div className="detail-header-actions">
          <span className={clsx("quality-pill", activeCompany.sourceQuality)}>{SOURCE_QUALITY_LABELS[activeCompany.sourceQuality]}</span>
          {!showDetailPanel ? (
            <button type="button" className="icon-button" onClick={closeCompanyModal} title="Close company details">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="detail-fields">
        <label>
          Description
          <textarea
            value={activeCompanyDraft.description}
            onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, description: event.target.value })}
            onBlur={() => updateActiveCompany("description", activeCompanyDraft.description)}
            rows={4}
          />
        </label>
        <label>
          Country
          <input
            value={activeCompanyDraft.country}
            onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, country: event.target.value })}
            onBlur={() => updateActiveCompany("country", activeCompanyDraft.country)}
          />
        </label>
        <label>
          Websites
          <textarea
            value={activeCompanyDraft.websites}
            onChange={(event) => setCompanyDraft({ ...activeCompanyDraft, websites: event.target.value })}
            onBlur={() => updateActiveCompany("websites", activeCompanyDraft.websites)}
            rows={3}
          />
        </label>
        <label>
          Source
          <input readOnly value={`${Math.round((activeCompany.mergeConfidence ?? 0) * 100)}% merge confidence`} />
        </label>
      </div>

      {activeCompanyEnrichmentDraft ? (
        <section className="detail-section enrichment-section">
          <div className="section-heading">
            <h2>LLM enrichment</h2>
            <span>{activeCompany.enrichment?.status ?? "Pending"}</span>
          </div>
          {enrichmentMessage ? <div className="data-notice compact-notice"><Flag size={16} /><span>{enrichmentMessage}</span></div> : null}
          <div className="enrichment-actions">
            <button type="button" className="secondary-button" onClick={() => enrichActiveCompany(false)} disabled={isEnriching || !localEnrichmentEnabled || !isSignedIn}>
              <FlaskConical size={15} /> {isEnriching ? "Enriching..." : "Enrich"}
            </button>
            <button type="button" className="secondary-button" onClick={() => enrichActiveCompany(true)} disabled={isEnriching || !localEnrichmentEnabled || !isSignedIn}>
              Retry
            </button>
            <button type="button" className="text-button" onClick={saveActiveCompanyEnrichment}>
              <Check size={14} /> Queue review
            </button>
          </div>
          {!localEnrichmentEnabled || !isSignedIn ? (
            <p className="muted helper-copy">Local Ollama enrichment is available only for signed-in local/admin sessions.</p>
          ) : null}
          <div className="detail-fields compact-fields">
            <label>
              Industry
              <input value={activeCompanyEnrichmentDraft.industry} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, industry: event.target.value })} />
            </label>
            <label>
              Subsector
              <input value={activeCompanyEnrichmentDraft.subsector} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, subsector: event.target.value })} />
            </label>
            <label>
              Company type
              <input value={activeCompanyEnrichmentDraft.companyType} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, companyType: event.target.value })} />
            </label>
            <label>
              Location
              <input value={activeCompanyEnrichmentDraft.location} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, location: event.target.value })} />
            </label>
            <label className="wide-field">
              Summary
              <textarea value={activeCompanyEnrichmentDraft.summary} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, summary: event.target.value })} rows={3} />
            </label>
            <label className="wide-field">
              Keywords
              <input value={activeCompanyEnrichmentDraft.keywords} onChange={(event) => setEnrichmentDraft({ ...activeCompanyEnrichmentDraft, keywords: event.target.value })} placeholder="Biotech; diagnostics; therapeutics" />
            </label>
          </div>
        </section>
      ) : null}

      {activeCompanyInvestment && activeCompanyInvestmentDraft ? (
        <section className="detail-section investment-section">
          <div className="section-heading">
            <h2>Investment history</h2>
            <span>{relationshipChipLabel(activeCompanyInvestment)}</span>
          </div>
          <div className="investment-grid">
            <label className="select-filter">
              <span>Status</span>
              <select
                value={activeCompanyInvestmentDraft.investmentStatus}
                onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, investmentStatus: event.target.value as InvestmentStatus })}
              >
                {INVESTMENT_STATUSES.map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {INVESTMENT_STATUS_LABELS[statusValue]}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-filter">
              <span>Capacity</span>
              <select
                value={activeCompanyInvestmentDraft.capacityStatus}
                onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, capacityStatus: event.target.value as CapacityStatus })}
              >
                {CAPACITY_STATUSES.map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {CAPACITY_STATUS_LABELS[statusValue]}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label>
              Last invested
              <input type="date" value={activeCompanyInvestmentDraft.lastInvestedDate} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, lastInvestedDate: event.target.value })} />
            </label>
            <label className="wide-field">
              Notes
              <textarea value={activeCompanyInvestmentDraft.notes} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, notes: event.target.value })} rows={2} />
            </label>
          </div>
          <div className="investment-deals">
            {activeCompanyInvestment.deals.map((deal) => (
              <div key={deal.id} className="deal-row">
                <strong>{deal.name}</strong>
                <span>{INVESTMENT_DEAL_STATUS_LABELS[deal.status]}{deal.investedAt ? ` • ${deal.investedAt}` : ""}</span>
              </div>
            ))}
            {activeCompanyInvestment.deals.length === 0 ? <p className="empty-state compact">No deals linked yet.</p> : null}
          </div>
          <div className="investment-grid deal-editor-grid">
            <label>
              Deal name
              <input value={activeCompanyInvestmentDraft.dealName} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealName: event.target.value })} placeholder="Deal name" />
            </label>
            <label className="select-filter">
              <span>Deal status</span>
              <select value={activeCompanyInvestmentDraft.dealStatus} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealStatus: event.target.value as InvestmentDealStatus })}>
                {INVESTMENT_DEAL_STATUSES.map((statusValue) => (
                  <option key={statusValue} value={statusValue}>
                    {INVESTMENT_DEAL_STATUS_LABELS[statusValue]}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label>
              Deal date
              <input type="date" value={activeCompanyInvestmentDraft.dealDate} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealDate: event.target.value })} />
            </label>
            <label>
              Role
              <input value={activeCompanyInvestmentDraft.dealRole} onChange={(event) => setCompanyInvestmentDraft({ ...activeCompanyInvestmentDraft, dealRole: event.target.value })} />
            </label>
          </div>
          <div className="investment-actions">
            <button type="button" className="text-button" onClick={() => saveInvestmentRelationship(activeCompanyInvestment, activeCompanyInvestmentDraft, "Company investment update")}>
              <Check size={14} /> Queue status
            </button>
            <button type="button" className="text-button" onClick={() => addInvestmentDealLocally(activeCompanyInvestment, activeCompanyInvestmentDraft, "Company investment deal")} disabled={!activeCompanyInvestmentDraft.dealName.trim()}>
              <Plus size={14} /> Queue deal
            </button>
          </div>
        </section>
      ) : null}

      <section className="detail-section" id="people">
        <div className="section-heading">
          <h2>People</h2>
          <span>{activeCompany.people.filter((person) => person.highlighted).length} highlighted</span>
        </div>
      <div className="people-list">
          {activeCompany.people.map((person) => (
            <article key={person.id} className="person-row">
              <button
                type="button"
                className={clsx("icon-button", person.highlighted && "active")}
                onClick={() => toggleHighlight(activeCompany.id, person)}
                title={person.highlighted ? "Remove highlight" : "Highlight person"}
              >
                <Star size={16} fill={person.highlighted ? "currentColor" : "none"} />
              </button>
              <div>
                <strong>{person.displayName}</strong>
                <span>{person.jobTitle ?? person.email ?? "No title"}</span>
                {person.emails.length > 1 ? <span>{person.emails.length} emails</span> : null}
                {person.categories.length > 0 ? (
                  <div className="contact-chip-list">
                    {person.categories.slice(0, 3).map((category) => (
                      <span key={category} className="contact-chip">
                        {category}
                      </span>
                    ))}
                    {person.categories.length > 3 ? <span className="email-more">+{person.categories.length - 3}</span> : null}
                  </div>
                ) : null}
                {person.investmentRelationships.length > 0 ? (
                  <div className="investment-chip-list">
                    {person.investmentRelationships.slice(0, 2).map((relationship) => (
                      <span key={relationship.id} className={clsx("investment-chip", relationship.capacityStatus === "fully_allocated" && "allocated")}>
                        {relationshipChipLabel(relationship)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="person-actions">
                <button type="button" className="icon-button" onClick={() => startPersonEdit(person)} title="Edit contact">
                  <Pencil size={16} />
                </button>
                <a className="icon-link" href={person.email ? `mailto:${person.email}` : "#"} title="Email contact">
                  <Mail size={16} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading">
          <h2>Tags</h2>
          <span>{activeCompany.tags.length}</span>
        </div>
        <div className="tag-list large">
          {activeCompany.tags.map((item) => (
            <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
              {item.name}
            </span>
          ))}
        </div>
      </section>

      <section className="detail-section">
        <div className="section-heading">
          <h2>Activity</h2>
          <span>Manual tracking</span>
        </div>
        <div className="note-composer">
          <input value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Add note, call, email, or meeting summary" />
          <button type="button" onClick={addManualNote}>
            <Check size={15} /> Add
          </button>
        </div>
        <div className="activity-list">
          {activeCompany.activities.map((item) => (
            <div key={item.id} className="activity-item">
              <Activity size={15} />
              <div>
                <strong>{item.summary}</strong>
                <span>{formatDate(item.occurredAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </aside>
    </div>
  );
}
