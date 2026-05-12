import { ChevronDown, Download, Flag, Pencil, Search, Star, Upload, UserRound } from "lucide-react";
import clsx from "clsx";
import { FilterSelect, formatNumber } from "@/components/shared";
import { OUTREACH_STAGES } from "@/lib/types";
import type { Company, Person } from "@/lib/types";

type PeoplePageSize = 50 | 100 | 250 | 500 | 1000 | "all";

const PEOPLE_PAGE_SIZE_OPTIONS = [50, 100, 250, 500, 1000, "all"] as const;

export function PeopleView({
  filteredDirectory,
  directory,
  visibleDirectory,
  query,
  company,
  domain,
  stage,
  highlight,
  pageSize,
  page,
  peopleStart,
  peopleEnd,
  effectivePage,
  totalPages,
  personMergeTarget,
  personMergeQuery,
  personMergeCandidates,
  peopleMessage,
  incorrectEmailMessage,
  incorrectEmails,
  namesMessage,
  isSplittingNames,
  splitNamesProgress,
  companyNames,
  emailDomains,
  isDemoData,
  dataWarning,
  localEnrichmentEnabled,
  isSignedIn,
  onQueryChange,
  onCompanyChange,
  onDomainChange,
  onStageChange,
  onHighlightChange,
  onPageSizeChange,
  onPageChange,
  onCloseMerge,
  onMergeQueryChange,
  onMergePerson,
  onIncorrectEmailUpload,
  onExport,
  onSplitNames,
  onStopSplitNames,
  onSetActiveCompany,
  onToggleHighlight,
  onStartEdit,
  onOpenCompany,
  onStartManualMerge,
}: {
  filteredDirectory: { person: Person; company: Company; companies: Company[] }[];
  directory: { person: Person; company: Company; companies: Company[] }[];
  visibleDirectory: { person: Person; company: Company; companies: Company[] }[];
  query: string;
  company: string;
  domain: string;
  stage: string;
  highlight: string;
  pageSize: string | number;
  page: number;
  peopleStart: number;
  peopleEnd: number;
  effectivePage: number;
  totalPages: number;
  personMergeTarget: { person: Person } | null;
  personMergeQuery: string;
  personMergeCandidates: { person: Person; companies: Company[] }[];
  peopleMessage: string | null;
  incorrectEmailMessage: string | null;
  incorrectEmails: Set<string>;
  namesMessage: string | null;
  isSplittingNames: boolean;
  splitNamesProgress: { total: number; completed: number; failed: number } | null;
  companyNames: string[];
  emailDomains: string[];
  isDemoData: boolean;
  dataWarning: string | null;
  localEnrichmentEnabled: boolean;
  isSignedIn: boolean;
  onQueryChange: (value: string) => void;
  onCompanyChange: (value: string) => void;
  onDomainChange: (value: string) => void;
  onStageChange: (value: string) => void;
  onHighlightChange: (value: string) => void;
  onPageSizeChange: (value: string | number) => void;
  onPageChange: (page: number) => void;
  onCloseMerge: () => void;
  onMergeQueryChange: (value: string) => void;
  onMergePerson: (personId: string) => void;
  onIncorrectEmailUpload: (file: File | null) => void;
  onExport: (rows: { person: Person; company: Company; companies: Company[] }[]) => void;
  onSplitNames: () => void;
  onStopSplitNames: () => void;
  onSetActiveCompany: (id: string) => void;
  onToggleHighlight: (companyId: string, person: Person) => void;
  onStartEdit: (person: Person) => void;
  onOpenCompany: (id: string) => void;
  onStartManualMerge: (personId: string, hint: string) => void;
}) {
  return (
    <section className="view-surface">
      <div className="surface-header">
        <div>
          <p className="eyebrow">People</p>
          <h2>{formatNumber(filteredDirectory.length)} of {formatNumber(directory.length)} contacts</h2>
        </div>
        <div className="surface-actions">
          <label className="secondary-button file-button">
            <Upload size={15} /> Tag incorrect emails
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                onIncorrectEmailUpload(event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" className="secondary-button" onClick={() => onExport(filteredDirectory)}>
            <Download size={15} /> Export people
          </button>
          <button
            type="button"
            className={clsx("secondary-button", isSplittingNames && "running")}
            onClick={isSplittingNames ? onStopSplitNames : onSplitNames}
            disabled={isSplittingNames || !localEnrichmentEnabled || !isSignedIn}
          >
            <UserRound size={15} /> {isSplittingNames ? "Stopping..." : "Split names"}
          </button>
        </div>
      </div>
      {isDemoData ? (
        <div className="data-notice">
          <Flag size={16} />
          <span>{dataWarning ?? "Demo contacts are loaded."}</span>
        </div>
      ) : null}
      {incorrectEmailMessage ? <div className="data-notice"><Flag size={16} /><span>{incorrectEmailMessage}</span></div> : null}
      {isSplittingNames && splitNamesProgress ? (
        <div className="batch-progress-panel" aria-live="polite">
          <div>
            <strong>Splitting names</strong>
            <span>
              {formatNumber(splitNamesProgress.completed)} done
              {splitNamesProgress.failed ? `, ${formatNumber(splitNamesProgress.failed)} failed` : ""}
              {" "}of {formatNumber(splitNamesProgress.total)}
            </span>
          </div>
          <progress value={splitNamesProgress.completed + splitNamesProgress.failed} max={splitNamesProgress.total} />
        </div>
      ) : null}
      {namesMessage && !isSplittingNames ? <div className="data-notice"><Flag size={16} /><span>{namesMessage}</span></div> : null}
      <div className="people-filterbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search people, emails, titles, companies"
          />
        </label>
        <FilterSelect value={company} onChange={onCompanyChange} label="Company" options={companyNames} />
        <FilterSelect value={domain} onChange={onDomainChange} label="Email domain" options={emailDomains} />
        <FilterSelect value={stage} onChange={onStageChange} label="Stage" options={[...OUTREACH_STAGES]} />
        <FilterSelect value={highlight} onChange={onHighlightChange} label="Highlight" options={["Highlighted", "Not highlighted"]} />
      </div>
      {personMergeTarget ? (
        <div className="people-merge-panel">
          <div className="people-merge-header">
            <div>
              <strong>Keep {personMergeTarget.person.displayName}</strong>
              <span>Search for the duplicate person whose emails and history should move onto this record.</span>
            </div>
            <button type="button" className="secondary-button" onClick={onCloseMerge}>
              Cancel
            </button>
          </div>
          <label className="search-box">
            <Search size={16} />
            <input value={personMergeQuery} onChange={(event) => onMergeQueryChange(event.target.value)} placeholder="Search duplicate by name, email, company, or LinkedIn" />
          </label>
          <div className="people-merge-list">
            {personMergeCandidates.map(({ person, companies }) => (
              <article key={person.id} className="merge-candidate-row">
                <div>
                  <strong>{person.displayName}</strong>
                  <span>{companies.map((company) => company.name).join(", ")} • {person.jobTitle ?? person.email ?? "No title"}</span>
                </div>
                <div className="email-chip-list">
                  {person.emails.slice(0, 2).map((email) => (
                    <span key={email} className="email-chip" title={email}>
                      {email}
                    </span>
                  ))}
                  {person.emails.length > 2 ? <span className="email-more">+{person.emails.length - 2}</span> : null}
                </div>
                <button type="button" className="text-button" onClick={() => onMergePerson(person.id)}>
                  Merge into keeper
                </button>
              </article>
            ))}
            {personMergeCandidates.length === 0 ? <p className="empty-state">No matching duplicate people found.</p> : null}
          </div>
        </div>
      ) : null}
      {peopleMessage ? <div className="data-notice"><Flag size={16} /><span>{peopleMessage}</span></div> : null}
      <div className="people-countbar">
        <span>
          Showing {formatNumber(peopleStart)}-{formatNumber(peopleEnd)} of {formatNumber(filteredDirectory.length)}
        </span>
        <div className="people-pager">
          <label className="select-filter">
            <span>Show</span>
            <select
              value={String(pageSize)}
              onChange={(event) => {
                const nextValue = event.target.value;
                onPageSizeChange(nextValue === "all" ? "all" : Number(nextValue));
              }}
            >
              {PEOPLE_PAGE_SIZE_OPTIONS.map((option) => (
                <option key={String(option)} value={String(option)}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <button type="button" className="pager-button" disabled={effectivePage <= 1 || pageSize === "all"} onClick={() => onPageChange(Math.max(1, page - 1))}>
            Previous
          </button>
          <span>
            Page {formatNumber(effectivePage)} / {formatNumber(totalPages)}
          </span>
          <button
            type="button"
            className="pager-button"
            disabled={effectivePage >= totalPages || pageSize === "all"}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            Next
          </button>
        </div>
      </div>
      <div className="people-directory">
        {visibleDirectory.map(({ person, company, companies }) => (
          <article key={person.id} className="directory-row">
            <button
              type="button"
              className={clsx("icon-button", person.highlighted && "active")}
              onClick={() => {
                onSetActiveCompany(company.id);
                onToggleHighlight(company.id, person);
              }}
              title={person.highlighted ? "Remove highlight" : "Highlight person"}
            >
              <Star size={16} fill={person.highlighted ? "currentColor" : "none"} />
            </button>
            <div>
              <strong>{person.displayName}</strong>
              <span>{person.jobTitle ?? person.email ?? "No title"}</span>
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
            </div>
            <div className="email-chip-list">
              {person.emails.length ? (
                person.emails.slice(0, 3).map((email) => (
                  <a key={email} className={clsx("email-chip", incorrectEmails.has(email.toLowerCase()) && "incorrect")} href={`mailto:${email}`} title={email}>
                    {email}
                  </a>
                ))
              ) : (
                <span className="muted-cell">No email</span>
              )}
              {person.emails.length > 3 ? <span className="email-more">+{person.emails.length - 3}</span> : null}
            </div>
            <div className="directory-actions">
              <button type="button" className="text-button" onClick={() => onStartEdit(person)}>
                <Pencil size={14} /> Edit
              </button>
              <button type="button" className="text-button" onClick={() => onOpenCompany(company.id)}>
                {companies.length === 1 ? company.name : `${company.name} +${companies.length - 1}`}
              </button>
              <button type="button" className="text-button" onClick={() => onStartManualMerge(person.id, person.displayName)}>
                Link emails
              </button>
            </div>
            <span className="stage-badge">{company.outreachStage}</span>
          </article>
        ))}
        {filteredDirectory.length === 0 ? <p className="empty-state">No people match these filters.</p> : null}
      </div>
    </section>
  );
}
