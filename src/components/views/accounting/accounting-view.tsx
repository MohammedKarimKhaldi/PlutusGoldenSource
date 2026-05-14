import { Check, CreditCard, Flag, Pencil, Search } from "lucide-react";
import clsx from "clsx";
import { FilterSelect, formatMinorMoney, formatDate, formatNumber, amountInputFromMinor, todayIsoDate, ACCOUNTING_DOCUMENT_TYPE_LABELS, ACCOUNTING_DOCUMENT_STATUS_LABELS, ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS, ACCOUNTING_DIRECTION_LABELS } from "@/components/shared";
import {
  ACCOUNTING_DOCUMENT_STATUSES,
  ACCOUNTING_DOCUMENT_TYPES,
  ACCOUNTING_LEDGER_ENTRY_TYPES,
  ACCOUNTING_DIRECTIONS,
} from "@/lib/types";
import type {
  AccountingAccess,
  AccountingData,
  AccountingDocument,
  AccountingDocumentStatus,
  AccountingDocumentType,
  AccountingLedgerEntry,
  AccountingLedgerEntryType,
  AccountingDirection,
  Company,
} from "@/lib/types";
import type {
  AccountingDocumentDraft,
  AccountingLedgerDraft,
} from "@/components/shared";

export function defaultAccountingDocumentDraft(): AccountingDocumentDraft {
  return {
    documentId: null,
    documentType: "retainer",
    status: "open",
    companyId: "",
    title: "",
    amount: "",
    currency: "GBP",
    issuedOn: todayIsoDate(),
    dueOn: "",
    externalReference: "",
    documentUrl: "",
    notes: "",
  };
}

export function defaultAccountingLedgerDraft(): AccountingLedgerDraft {
  return {
    entryId: null,
    documentId: "",
    entryType: "retainer_payment",
    direction: "incoming",
    companyId: "",
    amount: "",
    currency: "GBP",
    occurredOn: todayIsoDate(),
    externalReference: "",
    documentUrl: "",
    notes: "",
  };
}

export function accountingDocumentDraftFromDocument(document: AccountingDocument): AccountingDocumentDraft {
  return {
    documentId: document.id,
    documentType: document.documentType,
    status: document.status === "void" ? "open" : document.status,
    companyId: document.companyId ?? "",
    title: document.title,
    amount: amountInputFromMinor(document.amountMinor),
    currency: document.currency,
    issuedOn: document.issuedOn ?? "",
    dueOn: document.dueOn ?? "",
    externalReference: document.externalReference ?? "",
    documentUrl: document.documentUrl ?? "",
    notes: document.notes ?? "",
  };
}

function accountingLedgerDraftFromEntry(entry: AccountingLedgerEntry): AccountingLedgerDraft {
  return {
    entryId: entry.id,
    documentId: entry.documentId ?? "",
    entryType: entry.entryType,
    direction: entry.direction,
    companyId: entry.companyId ?? "",
    amount: amountInputFromMinor(entry.amountMinor),
    currency: entry.currency,
    occurredOn: entry.occurredOn,
    externalReference: entry.externalReference ?? "",
    documentUrl: entry.documentUrl ?? "",
    notes: entry.notes ?? "",
  };
}

export function AccountingView({
  access,
  companies,
  tab,
  query,
  message,
  documentDraft,
  ledgerDraft,
  isSaving,
  companyFilter,
  typeFilter,
  statusFilter,
  currencyFilter,
  dateFrom,
  dateTo,
  filteredDocuments,
  filteredEntries,
  accountingCompanies,
  accountingCurrencies,
  companyNameById,
  accountingData,
  setTab,
  setQuery,
  setMessage,
  setDocumentDraft,
  setLedgerDraft,
  setIsSaving,
  setCompanyFilter,
  setTypeFilter,
  setStatusFilter,
  setCurrencyFilter,
  setDateFrom,
  setDateTo,
  onSaveDocument,
  onSaveLedgerEntry,
  onLedgerDocumentChange,
  onOpenDocumentAction,
  onOpenLedgerAction,
}: {
  access: AccountingAccess;
  companies: Company[];
  tab: "documents" | "ledger";
  query: string;
  message: string | null;
  documentDraft: AccountingDocumentDraft;
  ledgerDraft: AccountingLedgerDraft;
  isSaving: boolean;
  companyFilter: string;
  typeFilter: string;
  statusFilter: string;
  currencyFilter: string;
  dateFrom: string;
  dateTo: string;
  filteredDocuments: AccountingDocument[];
  filteredEntries: AccountingLedgerEntry[];
  accountingCompanies: Company[];
  accountingCurrencies: string[];
  companyNameById: Map<string, string>;
  accountingData: AccountingData;
  setTab: (tab: "documents" | "ledger") => void;
  setQuery: (query: string) => void;
  setMessage: (msg: string | null) => void;
  setDocumentDraft: React.Dispatch<React.SetStateAction<AccountingDocumentDraft>>;
  setLedgerDraft: React.Dispatch<React.SetStateAction<AccountingLedgerDraft>>;
  setIsSaving: (saving: boolean) => void;
  setCompanyFilter: (filter: string) => void;
  setTypeFilter: (filter: string) => void;
  setStatusFilter: (filter: string) => void;
  setCurrencyFilter: (filter: string) => void;
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  onSaveDocument: () => void;
  onSaveLedgerEntry: () => void;
  onLedgerDocumentChange: (documentId: string) => void;
  onOpenDocumentAction: (document: AccountingDocument, action: "void" | "delete") => void;
  onOpenLedgerAction: (entry: AccountingLedgerEntry, action: "void" | "delete") => void;
}) {
  return (
    <section className="view-surface accounting-view">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Accounting</p>
          <h2>{access.canView ? "Retainers, commissions, expenses, and cash" : "Restricted finance area"}</h2>
          <span>
            {access.canView
              ? `${formatNumber(accountingData.documents.length)} documents, ${formatNumber(accountingData.ledgerEntries.length)} ledger entries`
              : "Finance allowlist access required"}
          </span>
        </div>
        {access.canView ? (
          <span className={clsx("accounting-role-pill", access.canEdit && "can-edit")}>
            {access.role ?? "viewer"}
          </span>
        ) : null}
      </div>

      {!access.canView ? (
        <div className="locked-panel">
          <CreditCard size={24} />
          <div>
            <strong>Accounting is only available to finance users.</strong>
            <span>Your account can use the CRM, but it is not on the accounting allowlist.</span>
          </div>
        </div>
      ) : (
        <>
          <div className="accounting-summary-grid">
            {accountingData.summaries.map((summary) => (
              <article key={summary.currency} className="accounting-summary-card">
                <div>
                  <span>{summary.currency}</span>
                  <strong>{formatMinorMoney(summary.netCashMinor, summary.currency)}</strong>
                </div>
                <dl>
                  <div>
                    <dt>Retainers</dt>
                    <dd>{formatMinorMoney(summary.retainerIncomeMinor, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Commissions</dt>
                    <dd>{formatMinorMoney(summary.commissionIncomeMinor, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Expenses</dt>
                    <dd>{formatMinorMoney(summary.expensesMinor, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{formatMinorMoney(summary.outstandingMinor, summary.currency)}</dd>
                  </div>
                </dl>
              </article>
            ))}
            {accountingData.summaries.length === 0 ? (
              <article className="accounting-summary-card empty">
                <strong>No accounting totals yet.</strong>
                <span>Create documents and ledger entries to populate currency summaries.</span>
              </article>
            ) : null}
          </div>

          <div className="accounting-toolbar">
            <div className="accounting-tabs" role="tablist" aria-label="Accounting sections">
              <button
                type="button"
                className={clsx(tab === "documents" && "active")}
                onClick={() => {
                  setTab("documents");
                  setTypeFilter("");
                  setStatusFilter("");
                }}
              >
                Documents
              </button>
              <button
                type="button"
                className={clsx(tab === "ledger" && "active")}
                onClick={() => {
                  setTab("ledger");
                  setTypeFilter("");
                  setStatusFilter("");
                }}
              >
                Ledger
              </button>
            </div>
            <label className="search-box accounting-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search accounting" />
            </label>
          </div>

          <div className="accounting-filters">
            <FilterSelect value={companyFilter} onChange={setCompanyFilter} label="Company" options={accountingCompanies.map((company) => company.name)} optionValues={accountingCompanies.map((company) => company.id)} />
            <FilterSelect
              value={typeFilter}
              onChange={setTypeFilter}
              label="Type"
              options={tab === "documents" ? ACCOUNTING_DOCUMENT_TYPES.map((type) => ACCOUNTING_DOCUMENT_TYPE_LABELS[type]) : ACCOUNTING_LEDGER_ENTRY_TYPES.map((type) => ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[type])}
              optionValues={tab === "documents" ? [...ACCOUNTING_DOCUMENT_TYPES] : [...ACCOUNTING_LEDGER_ENTRY_TYPES]}
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              label="Status"
              options={tab === "documents" ? ACCOUNTING_DOCUMENT_STATUSES.map((status) => ACCOUNTING_DOCUMENT_STATUS_LABELS[status]) : ["Active", "Voided"]}
              optionValues={tab === "documents" ? [...ACCOUNTING_DOCUMENT_STATUSES] : ["active", "voided"]}
            />
            <FilterSelect value={currencyFilter} onChange={setCurrencyFilter} label="Currency" options={accountingCurrencies} />
            <label className="select-filter accounting-date-filter">
              <span>From</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label className="select-filter accounting-date-filter">
              <span>To</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
          </div>

          {message ? (
            <div className="data-notice">
              <Flag size={16} />
              <span>{message}</span>
            </div>
          ) : null}

          {tab === "documents" ? (
            <div className="accounting-grid">
              <form
                className="accounting-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveDocument();
                }}
              >
                <div className="accounting-form-header">
                  <h2>{documentDraft.documentId ? "Edit document" : "New document"}</h2>
                  {documentDraft.documentId ? (
                    <button type="button" className="text-button compact" onClick={() => setDocumentDraft(defaultAccountingDocumentDraft())}>
                      Clear
                    </button>
                  ) : null}
                </div>
                <label>
                  <span>Type</span>
                  <select value={documentDraft.documentType} onChange={(event) => setDocumentDraft((current) => ({ ...current, documentType: event.target.value as AccountingDocumentType }))}>
                    {ACCOUNTING_DOCUMENT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {ACCOUNTING_DOCUMENT_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={documentDraft.status} onChange={(event) => setDocumentDraft((current) => ({ ...current, status: event.target.value as AccountingDocumentDraft["status"] }))}>
                    {ACCOUNTING_DOCUMENT_STATUSES.filter((status) => status !== "void").map((status) => (
                      <option key={status} value={status}>
                        {ACCOUNTING_DOCUMENT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Company</span>
                  <select value={documentDraft.companyId} onChange={(event) => setDocumentDraft((current) => ({ ...current, companyId: event.target.value }))}>
                    <option value="">General</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Title</span>
                  <input value={documentDraft.title} onChange={(event) => setDocumentDraft((current) => ({ ...current, title: event.target.value }))} required />
                </label>
                <div className="accounting-form-row">
                  <label>
                    <span>Amount</span>
                    <input inputMode="decimal" value={documentDraft.amount} onChange={(event) => setDocumentDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" required />
                  </label>
                  <label>
                    <span>Currency</span>
                    <input value={documentDraft.currency} onChange={(event) => setDocumentDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} maxLength={3} required />
                  </label>
                </div>
                <div className="accounting-form-row">
                  <label>
                    <span>Issued</span>
                    <input type="date" value={documentDraft.issuedOn} onChange={(event) => setDocumentDraft((current) => ({ ...current, issuedOn: event.target.value }))} />
                  </label>
                  <label>
                    <span>Due</span>
                    <input type="date" value={documentDraft.dueOn} onChange={(event) => setDocumentDraft((current) => ({ ...current, dueOn: event.target.value }))} />
                  </label>
                </div>
                <label>
                  <span>Reference</span>
                  <input value={documentDraft.externalReference} onChange={(event) => setDocumentDraft((current) => ({ ...current, externalReference: event.target.value }))} />
                </label>
                <label>
                  <span>Document URL</span>
                  <input value={documentDraft.documentUrl} onChange={(event) => setDocumentDraft((current) => ({ ...current, documentUrl: event.target.value }))} />
                </label>
                <label>
                  <span>Notes</span>
                  <textarea value={documentDraft.notes} onChange={(event) => setDocumentDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                </label>
                <button type="submit" className="primary-button" disabled={!access.canEdit || isSaving}>
                  <Check size={15} /> {isSaving ? "Saving..." : "Save document"}
                </button>
              </form>

              <div className="accounting-table-wrap">
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Company</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Issued</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocuments.map((document) => (
                      <tr key={document.id} className={clsx(document.status === "void" && "voided")}>
                        <td>
                          <strong>{document.title}</strong>
                          <span>{ACCOUNTING_DOCUMENT_TYPE_LABELS[document.documentType]}{document.externalReference ? ` - ${document.externalReference}` : ""}</span>
                        </td>
                        <td>{document.companyId ? companyNameById.get(document.companyId) ?? "Unknown company" : "General"}</td>
                        <td>
                          <span className={clsx("accounting-status-pill", document.status)}>{ACCOUNTING_DOCUMENT_STATUS_LABELS[document.status]}</span>
                        </td>
                        <td>{formatMinorMoney(document.amountMinor, document.currency)}</td>
                        <td>{document.issuedOn ? formatDate(document.issuedOn) : "No date"}</td>
                        <td>
                          <div className="accounting-row-actions">
                            <button type="button" className="text-button compact" onClick={() => setDocumentDraft(accountingDocumentDraftFromDocument(document))} disabled={document.status === "void"}>
                              <Pencil size={13} /> Edit
                            </button>
                            <button type="button" className="text-button compact danger" onClick={() => onOpenDocumentAction(document, "void")} disabled={!access.canEdit || document.status === "void"}>
                              Void
                            </button>
                            <button type="button" className="text-button compact danger" onClick={() => onOpenDocumentAction(document, "delete")} disabled={!access.canEdit}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredDocuments.length === 0 ? <p className="empty-state">No accounting documents match these filters.</p> : null}
              </div>
            </div>
          ) : (
            <div className="accounting-grid">
              <form
                className="accounting-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSaveLedgerEntry();
                }}
              >
                <div className="accounting-form-header">
                  <h2>{ledgerDraft.entryId ? "Edit ledger entry" : "New ledger entry"}</h2>
                  {ledgerDraft.entryId ? (
                    <button type="button" className="text-button compact" onClick={() => setLedgerDraft(defaultAccountingLedgerDraft())}>
                      Clear
                    </button>
                  ) : null}
                </div>
                <label>
                  <span>Document</span>
                  <select value={ledgerDraft.documentId} onChange={(event) => onLedgerDocumentChange(event.target.value)}>
                    <option value="">No document</option>
                    {accountingData.documents.filter((document) => document.status !== "void").map((document) => (
                      <option key={document.id} value={document.id}>
                        {document.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Type</span>
                  <select
                    value={ledgerDraft.entryType}
                    onChange={(event) => {
                      const nextType = event.target.value as AccountingLedgerEntryType;
                      setLedgerDraft((current) => ({
                        ...current,
                        entryType: nextType,
                        direction: nextType === "expense_payment" ? "outgoing" : nextType === "adjustment" ? current.direction : "incoming",
                      }));
                    }}
                  >
                    {ACCOUNTING_LEDGER_ENTRY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Direction</span>
                  <select value={ledgerDraft.direction} onChange={(event) => setLedgerDraft((current) => ({ ...current, direction: event.target.value as AccountingDirection }))}>
                    {ACCOUNTING_DIRECTIONS.map((direction) => (
                      <option key={direction} value={direction}>
                        {ACCOUNTING_DIRECTION_LABELS[direction]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Company</span>
                  <select value={ledgerDraft.companyId} onChange={(event) => setLedgerDraft((current) => ({ ...current, companyId: event.target.value }))}>
                    <option value="">General</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="accounting-form-row">
                  <label>
                    <span>Amount</span>
                    <input inputMode="decimal" value={ledgerDraft.amount} onChange={(event) => setLedgerDraft((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" required />
                  </label>
                  <label>
                    <span>Currency</span>
                    <input value={ledgerDraft.currency} onChange={(event) => setLedgerDraft((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} maxLength={3} required />
                  </label>
                </div>
                <label>
                  <span>Date</span>
                  <input type="date" value={ledgerDraft.occurredOn} onChange={(event) => setLedgerDraft((current) => ({ ...current, occurredOn: event.target.value }))} required />
                </label>
                <label>
                  <span>Reference</span>
                  <input value={ledgerDraft.externalReference} onChange={(event) => setLedgerDraft((current) => ({ ...current, externalReference: event.target.value }))} />
                </label>
                <label>
                  <span>Document URL</span>
                  <input value={ledgerDraft.documentUrl} onChange={(event) => setLedgerDraft((current) => ({ ...current, documentUrl: event.target.value }))} />
                </label>
                <label>
                  <span>Notes</span>
                  <textarea value={ledgerDraft.notes} onChange={(event) => setLedgerDraft((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                </label>
                <button type="submit" className="primary-button" disabled={!access.canEdit || isSaving}>
                  <Check size={15} /> {isSaving ? "Saving..." : "Save ledger entry"}
                </button>
              </form>

              <div className="accounting-table-wrap">
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th>Company</th>
                      <th>Direction</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const linkedDocument = accountingData.documents.find((document) => document.id === entry.documentId);
                      return (
                        <tr key={entry.id} className={clsx(entry.voidedAt && "voided")}>
                          <td>
                            <strong>{ACCOUNTING_LEDGER_ENTRY_TYPE_LABELS[entry.entryType]}</strong>
                            <span>{linkedDocument?.title ?? entry.externalReference ?? "Ledger entry"}</span>
                          </td>
                          <td>{entry.companyId ? companyNameById.get(entry.companyId) ?? "Unknown company" : "General"}</td>
                          <td>
                            <span className={clsx("accounting-direction-pill", entry.direction)}>{ACCOUNTING_DIRECTION_LABELS[entry.direction]}</span>
                          </td>
                          <td>{formatMinorMoney(entry.amountMinor, entry.currency)}</td>
                          <td>{formatDate(entry.occurredOn)}</td>
                          <td>
                            <div className="accounting-row-actions">
                              <button type="button" className="text-button compact" onClick={() => setLedgerDraft(accountingLedgerDraftFromEntry(entry))} disabled={Boolean(entry.voidedAt)}>
                                <Pencil size={13} /> Edit
                              </button>
                              <button type="button" className="text-button compact danger" onClick={() => onOpenLedgerAction(entry, "void")} disabled={!access.canEdit || Boolean(entry.voidedAt)}>
                                Void
                              </button>
                              <button type="button" className="text-button compact danger" onClick={() => onOpenLedgerAction(entry, "delete")} disabled={!access.canEdit}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredEntries.length === 0 ? <p className="empty-state">No ledger entries match these filters.</p> : null}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
