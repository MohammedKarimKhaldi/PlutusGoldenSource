import { ArrowDown, ArrowUp, Check, ChevronDown, Flag, Plus, Tags, Trash2, X } from "lucide-react";
import {
  INVESTMENT_STATUSES,
  CAPACITY_STATUSES,
  INVESTMENT_DEAL_STATUSES,
  type InvestmentStatus,
  type CapacityStatus,
  type InvestmentDealStatus,
} from "@/lib/types";
import type { InvestmentRelationship, Person } from "@/lib/types";
import {
  INVESTMENT_STATUS_LABELS,
  CAPACITY_STATUS_LABELS,
  INVESTMENT_DEAL_STATUS_LABELS,
  relationshipChipLabel,
} from "@/components/shared";
import type { InvestmentDraft } from "@/components/shared";

export function ContactEditor({
  editingPerson,
  editDisplayName,
  setEditDisplayName,
  editFirstName,
  setEditFirstName,
  editLastName,
  setEditLastName,
  editJobTitle,
  setEditJobTitle,
  editLinkedinUrl,
  setEditLinkedinUrl,
  editPhone,
  setEditPhone,
  editCountry,
  setEditCountry,
  editEmails,
  editCategoryInput,
  setEditCategoryInput,
  editCategories,
  editingPersonInvestment,
  activePersonInvestmentDraft,
  personEditMessage,
  isPushingChanges,
  onSave,
  onClose,
  onUpdateEmail,
  onAddEmail,
  onRemoveEmail,
  onMoveEmail,
  onAddCategory,
  onRemoveCategory,
  onSetPersonInvestmentDraft,
}: {
  editingPerson: Person | null;
  editDisplayName: string;
  setEditDisplayName: (value: string) => void;
  editFirstName: string;
  setEditFirstName: (value: string) => void;
  editLastName: string;
  setEditLastName: (value: string) => void;
  editJobTitle: string;
  setEditJobTitle: (value: string) => void;
  editLinkedinUrl: string;
  setEditLinkedinUrl: (value: string) => void;
  editPhone: string;
  setEditPhone: (value: string) => void;
  editCountry: string;
  setEditCountry: (value: string) => void;
  editEmails: string[];
  editCategoryInput: string;
  setEditCategoryInput: (value: string) => void;
  editCategories: string[];
  editingPersonInvestment: InvestmentRelationship | null;
  activePersonInvestmentDraft: InvestmentDraft | null;
  personEditMessage: string | null;
  isPushingChanges: boolean;
  onSave: () => void;
  onClose: () => void;
  onUpdateEmail: (index: number, value: string) => void;
  onAddEmail: () => void;
  onRemoveEmail: (index: number) => void;
  onMoveEmail: (index: number, direction: -1 | 1) => void;
  onAddCategory: () => void;
  onRemoveCategory: (category: string) => void;
  onSetPersonInvestmentDraft: (draft: InvestmentDraft) => void;
}) {
  if (!editingPerson) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="contact-editor" role="dialog" aria-modal="true" aria-labelledby="contact-editor-title">
        <form
          className="contact-editor-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="contact-editor-header">
            <div>
              <p className="eyebrow">Edit contact</p>
              <h2 id="contact-editor-title">{editingPerson.displayName}</h2>
            </div>
            <button type="button" className="icon-button" onClick={onClose} title="Close editor">
              <X size={16} />
            </button>
          </div>

          <label className="editor-field">
            Name
            <input value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} placeholder="Contact name" />
          </label>

          <div className="editor-grid">
            <label className="editor-field">
              First name
              <input value={editFirstName} onChange={(event) => setEditFirstName(event.target.value)} placeholder="First name" />
            </label>
            <label className="editor-field">
              Last name
              <input value={editLastName} onChange={(event) => setEditLastName(event.target.value)} placeholder="Last name" />
            </label>
            <label className="editor-field">
              Job title
              <input value={editJobTitle} onChange={(event) => setEditJobTitle(event.target.value)} placeholder="Partner" />
            </label>
            <label className="editor-field">
              LinkedIn
              <input value={editLinkedinUrl} onChange={(event) => setEditLinkedinUrl(event.target.value)} placeholder="https://www.linkedin.com/in/..." />
            </label>
            <label className="editor-field">
              Phone
              <input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="+44..." />
            </label>
            <label className="editor-field">
              Country
              <input value={editCountry} onChange={(event) => setEditCountry(event.target.value)} placeholder="United Kingdom" />
            </label>
          </div>

          <div className="editor-section">
            <div className="section-heading">
              <h2>Email addresses</h2>
              <button type="button" className="text-button" onClick={onAddEmail}>
                <Plus size={14} /> Add email
              </button>
            </div>
            <div className="email-editor-list">
              {editEmails.map((email, index) => (
                <div key={index} className="email-editor-row">
                  <span className="email-position">{index === 0 ? "Primary" : `#${index + 1}`}</span>
                  <input value={email} onChange={(event) => onUpdateEmail(index, event.target.value)} placeholder="name@example.com" />
                  <button type="button" className="icon-button" onClick={() => onMoveEmail(index, -1)} disabled={index === 0} title="Move email up">
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => onMoveEmail(index, 1)}
                    disabled={index === editEmails.length - 1}
                    title="Move email down"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button type="button" className="icon-button danger" onClick={() => onRemoveEmail(index)} title="Remove email">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {editEmails.length === 0 ? <p className="empty-state compact">No email addresses on this contact.</p> : null}
            </div>
          </div>

          <div className="editor-section">
            <div className="section-heading">
              <h2>Contact tags</h2>
              <span>{editCategories.length}</span>
            </div>
            <div className="tag-editor">
              <div className="contact-chip-list editor">
                {editCategories.map((category) => (
                  <button key={category} type="button" className="contact-chip removable" onClick={() => onRemoveCategory(category)} title={`Remove ${category}`}>
                    {category}
                    <X size={12} />
                  </button>
                ))}
                {editCategories.length === 0 ? <span className="muted-cell">No contact tags</span> : null}
              </div>
              <label className="tag-add-row">
                <Tags size={15} />
                <input
                  value={editCategoryInput}
                  onChange={(event) => setEditCategoryInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onAddCategory();
                    }
                  }}
                  placeholder="Add tag"
                />
                <button type="button" className="text-button" onClick={onAddCategory}>
                  <Plus size={14} /> Add
                </button>
              </label>
            </div>
          </div>

          {editingPersonInvestment && activePersonInvestmentDraft ? (
            <div className="editor-section">
              <div className="section-heading">
                <h2>Investment profile</h2>
                <span>{relationshipChipLabel(editingPersonInvestment)}</span>
              </div>
              <div className="investment-grid editor-investment-grid">
                <label className="select-filter">
                  <span>Status</span>
                  <select
                    value={activePersonInvestmentDraft.investmentStatus}
                    onChange={(event) => onSetPersonInvestmentDraft({ ...activePersonInvestmentDraft, investmentStatus: event.target.value as InvestmentStatus })}
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
                    value={activePersonInvestmentDraft.capacityStatus}
                    onChange={(event) => onSetPersonInvestmentDraft({ ...activePersonInvestmentDraft, capacityStatus: event.target.value as CapacityStatus })}
                  >
                    {CAPACITY_STATUSES.map((statusValue) => (
                      <option key={statusValue} value={statusValue}>
                        {CAPACITY_STATUS_LABELS[statusValue]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <label className="editor-field">
                  Last invested
                  <input type="date" value={activePersonInvestmentDraft.lastInvestedDate} onChange={(event) => onSetPersonInvestmentDraft({ ...activePersonInvestmentDraft, lastInvestedDate: event.target.value })} />
                </label>
                <label className="editor-field wide-field">
                  Notes
                  <textarea value={activePersonInvestmentDraft.notes} onChange={(event) => onSetPersonInvestmentDraft({ ...activePersonInvestmentDraft, notes: event.target.value })} rows={2} />
                </label>
                <label className="editor-field">
                  Deal name
                  <input value={activePersonInvestmentDraft.dealName} onChange={(event) => onSetPersonInvestmentDraft({ ...activePersonInvestmentDraft, dealName: event.target.value })} placeholder="Deal name" />
                </label>
                <label className="select-filter">
                  <span>Deal status</span>
                  <select value={activePersonInvestmentDraft.dealStatus} onChange={(event) => onSetPersonInvestmentDraft({ ...activePersonInvestmentDraft, dealStatus: event.target.value as InvestmentDealStatus })}>
                    {INVESTMENT_DEAL_STATUSES.map((statusValue) => (
                      <option key={statusValue} value={statusValue}>
                        {INVESTMENT_DEAL_STATUS_LABELS[statusValue]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                <label className="editor-field">
                  Deal date
                  <input type="date" value={activePersonInvestmentDraft.dealDate} onChange={(event) => onSetPersonInvestmentDraft({ ...activePersonInvestmentDraft, dealDate: event.target.value })} />
                </label>
              </div>
            </div>
          ) : null}

          {personEditMessage ? (
            <div className="data-notice error">
              <Flag size={16} />
              <span>{personEditMessage}</span>
            </div>
          ) : null}

          <div className="contact-editor-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={isPushingChanges}>
              <Check size={15} /> Queue contact update
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
