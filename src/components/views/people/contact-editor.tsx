import { useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Flag, Plus, Tags, Trash2, X } from "lucide-react";
import {
  INVESTMENT_STATUSES,
  CAPACITY_STATUSES,
  INVESTMENT_DEAL_STATUSES,
  type InvestmentStatus,
  type CapacityStatus,
  type InvestmentDealStatus,
  type Person,
  type InvestmentRelationship,
} from "@/lib/types";
import {
  INVESTMENT_STATUS_LABELS,
  CAPACITY_STATUS_LABELS,
  INVESTMENT_DEAL_STATUS_LABELS,
  relationshipChipLabel,
  isUuid,
} from "@/components/shared";
import type { InvestmentDraft, PeopleDirectoryRow } from "@/components/shared";
import { isValidPersonEmail, normalizePersonCategories, normalizePersonEmails } from "@/lib/person-update";
import { mergePeopleAction, updatePersonAction } from "@/app/actions";

export interface UsePersonEditorParams {
  peopleDirectory: PeopleDirectoryRow[];
  updatePersonLocally: (targetPersonIds: string[], updates: Partial<Pick<Person, "displayName" | "firstName" | "lastName" | "emails" | "jobTitle" | "linkedinUrl" | "phone" | "country" | "categories" | "investmentRelationships">>) => void;
  queuePendingChange: (change: any) => void;
  saveInvestmentRelationship: (relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) => void;
  addInvestmentDealLocally: (relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) => void;
  initialData: { authMode: string };
  setPeopleMessage: (message: string | null) => void;
  personSourceIds: (person: Person) => string[];
}

function relationshipForPerson(person: Person) {
  return person.investmentRelationships.find((relationship) => relationship.companyId === null && relationship.personId === person.id) ??
    { id: `local-investment-none-${person.id}`, companyId: null, personId: person.id, investmentStatus: "prospect" as const, capacityStatus: "unknown" as const, notes: null, lastInvestedDate: null, deals: [] };
}

function investmentDraftForRelationship(relationship: InvestmentRelationship): InvestmentDraft {
  return {
    targetKey: `${relationship.companyId ?? "none"}:${relationship.personId ?? "none"}`,
    investmentStatus: relationship.investmentStatus,
    capacityStatus: relationship.capacityStatus,
    notes: relationship.notes ?? "",
    lastInvestedDate: relationship.lastInvestedDate ?? "",
    dealName: "",
    dealStatus: "closed",
    dealDate: relationship.lastInvestedDate ?? "",
    dealRole: "Investor",
    dealNotes: "",
  };
}

export interface PersonEditorState {
  editingPerson: Person | null;
  editingPersonInvestment: InvestmentRelationship | null;
  activePersonInvestmentDraft: InvestmentDraft | null;
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
  personEditMessage: string | null;
  startPersonEdit: (person: Person) => void;
  onSave: () => void;
  onClose: () => void;
  onUpdateEmail: (index: number, value: string) => void;
  onAddEmail: () => void;
  onRemoveEmail: (index: number) => void;
  onMoveEmail: (index: number, direction: -1 | 1) => void;
  onAddCategory: () => void;
  onRemoveCategory: (category: string) => void;
  onSetPersonInvestmentDraft: (draft: InvestmentDraft) => void;
}

export function usePersonEditor({
  peopleDirectory,
  updatePersonLocally,
  queuePendingChange,
  saveInvestmentRelationship,
  addInvestmentDealLocally,
  initialData,
  setPeopleMessage,
  personSourceIds,
}: UsePersonEditorParams): PersonEditorState {
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmails, setEditEmails] = useState<string[]>([]);
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editLinkedinUrl, setEditLinkedinUrl] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editCategories, setEditCategories] = useState<string[]>([]);
  const [editCategoryInput, setEditCategoryInput] = useState("");
  const [personInvestmentDraft, setPersonInvestmentDraft] = useState<InvestmentDraft | null>(null);
  const [personEditMessage, setPersonEditMessage] = useState<string | null>(null);

  const editingPerson = peopleDirectory.find(({ person }) => person.id === editingPersonId)?.person ?? null;
  const editingPersonInvestment = editingPerson ? relationshipForPerson(editingPerson) : null;
  const activePersonInvestmentDraft =
    editingPersonInvestment && personInvestmentDraft?.targetKey === `${editingPersonInvestment.companyId ?? "none"}:${editingPersonInvestment.personId ?? "none"}`
      ? personInvestmentDraft
      : editingPersonInvestment
        ? investmentDraftForRelationship(editingPersonInvestment)
        : null;

  function startPersonEdit(person: Person) {
    setPeopleMessage(null);
    setPersonEditMessage(null);
    setEditingPersonId(person.id);
    setEditDisplayName(person.displayName);
    setEditFirstName(person.firstName ?? "");
    setEditLastName(person.lastName ?? "");
    setEditEmails(person.emails.length > 0 ? [...person.emails] : []);
    setEditJobTitle(person.jobTitle ?? "");
    setEditLinkedinUrl(person.linkedinUrl ?? "");
    setEditPhone(person.phone ?? "");
    setEditCountry(person.country ?? "");
    setEditCategories([...person.categories]);
    setEditCategoryInput("");
    setPersonInvestmentDraft(investmentDraftForRelationship(relationshipForPerson(person)));
  }

  function closePersonEdit() {
    setEditingPersonId(null);
    setEditDisplayName("");
    setEditFirstName("");
    setEditLastName("");
    setEditEmails([]);
    setEditJobTitle("");
    setEditLinkedinUrl("");
    setEditPhone("");
    setEditCountry("");
    setEditCategories([]);
    setEditCategoryInput("");
    setPersonInvestmentDraft(null);
    setPersonEditMessage(null);
  }

  function updateEditEmail(index: number, value: string) {
    setEditEmails((current) => current.map((email, emailIndex) => (emailIndex === index ? value : email)));
  }

  function addEditEmail() {
    setEditEmails((current) => [...current, ""]);
  }

  function removeEditEmail(index: number) {
    setEditEmails((current) => current.filter((_, emailIndex) => emailIndex !== index));
  }

  function moveEditEmail(index: number, direction: -1 | 1) {
    setEditEmails((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function addEditCategory() {
    const nextCategories = normalizePersonCategories([...editCategories, editCategoryInput]);
    setEditCategories(nextCategories);
    setEditCategoryInput("");
  }

  function removeEditCategory(category: string) {
    setEditCategories((current) => current.filter((item) => item !== category));
  }

  function saveEditedPerson() {
    if (!editingPerson) return;

    const displayName = editDisplayName.trim();
    const firstName = editFirstName.trim() || null;
    const lastName = editLastName.trim() || null;
    const emails = normalizePersonEmails(editEmails);
    const categories = normalizePersonCategories([...editCategories, editCategoryInput]);
    const jobTitle = editJobTitle.trim() || null;
    const linkedinUrl = editLinkedinUrl.trim() || null;
    const phone = editPhone.trim() || null;
    const countryValue = editCountry.trim() || null;
    const sourceIds = personSourceIds(editingPerson);
    const mergeSourceIds = sourceIds.filter((personId) => personId !== editingPerson.id);

    if (!displayName) {
      setPersonEditMessage("Contact name is required.");
      return;
    }

    if (emails.some((email) => !isValidPersonEmail(email))) {
      setPersonEditMessage("Enter valid email addresses.");
      return;
    }

    const updates = { displayName, firstName, lastName, emails, jobTitle, linkedinUrl, phone, country: countryValue, categories };
    const organizationId = process.env.NEXT_PUBLIC_DEFAULT_ORG_ID;
    const personUpdate = organizationId && isUuid(editingPerson.id)
      ? {
          organizationId,
          personId: editingPerson.id,
          displayName,
          firstName,
          lastName,
          emails,
          jobTitle,
          linkedinUrl,
          phone,
          country: countryValue,
          categories,
          syncEmails: true,
        }
      : undefined;

    updatePersonLocally(sourceIds, updates);

    for (const sourcePersonId of mergeSourceIds) {
      queuePendingChange({
        key: `merge:${editingPerson.id}:${sourcePersonId}`,
        label: "People merge",
        runBeforePersonBatch: true,
        record: {
          kind: "people-merge",
          key: `merge:${editingPerson.id}:${sourcePersonId}`,
          label: "People merge",
          organizationId: organizationId ?? null,
          targetPersonId: editingPerson.id,
          sourcePersonId,
        },
        run: () =>
          initialData.authMode === "supabase" && organizationId && isUuid(editingPerson.id) && isUuid(sourcePersonId)
            ? mergePeopleAction({ organizationId, targetPersonId: editingPerson.id, sourcePersonId })
            : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
      });
    }

    queuePendingChange({
      key: `person:${editingPerson.id}`,
      label: "Contact update",
      type: "person",
      personUpdate,
      record: {
        kind: "person",
        key: `person:${editingPerson.id}`,
        label: "Contact update",
        personUpdate: personUpdate ?? {
          organizationId: "",
          personId: editingPerson.id,
          displayName,
          firstName,
          lastName,
          emails,
          jobTitle,
          linkedinUrl,
          phone,
          country: countryValue,
          categories,
          syncEmails: true,
        },
      },
      run: () =>
        initialData.authMode === "supabase" && organizationId && isUuid(editingPerson.id)
          ? updatePersonAction({
            organizationId,
            personId: editingPerson.id,
            displayName,
            firstName,
            lastName,
            emails,
            jobTitle,
            linkedinUrl,
            phone,
            country: countryValue,
            categories,
          })
          : Promise.resolve({ ok: false, message: "Sign in with Supabase configured before pushing changes." }),
    });
    if (editingPersonInvestment && personInvestmentDraft) {
      saveInvestmentRelationship(editingPersonInvestment, personInvestmentDraft, "Contact investment update");
      if (personInvestmentDraft.dealName.trim()) {
        addInvestmentDealLocally(editingPersonInvestment, personInvestmentDraft, "Contact investment deal");
      }
    }
    setPeopleMessage(
      mergeSourceIds.length > 0 ? "Contact merge, update, and investment profile queued locally." : "Contact update queued locally.",
    );
    closePersonEdit();
  }

  return {
    editingPerson,
    editingPersonInvestment,
    activePersonInvestmentDraft,
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
    personEditMessage,
    startPersonEdit,
    onSave: saveEditedPerson,
    onClose: closePersonEdit,
    onUpdateEmail: updateEditEmail,
    onAddEmail: addEditEmail,
    onRemoveEmail: removeEditEmail,
    onMoveEmail: moveEditEmail,
    onAddCategory: addEditCategory,
    onRemoveCategory: removeEditCategory,
    onSetPersonInvestmentDraft: setPersonInvestmentDraft,
  };
}

export function ContactEditor({
  editor,
  isPushingChanges,
}: {
  editor: PersonEditorState;
  isPushingChanges: boolean;
}) {
  const {
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
    onSave,
    onClose,
    onUpdateEmail,
    onAddEmail,
    onRemoveEmail,
    onMoveEmail,
    onAddCategory,
    onRemoveCategory,
    onSetPersonInvestmentDraft,
  } = editor;

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
