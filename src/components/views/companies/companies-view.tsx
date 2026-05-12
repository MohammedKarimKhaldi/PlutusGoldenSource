import { clsx } from "clsx";
import { ChevronDown, Download, Filter, FlaskConical, GitMerge, Plus, RefreshCw, Search, Tags, X } from "lucide-react";
import type { ContactExportCriterion } from "@/lib/export/contacts";
import { CONTACT_EXPORT_LABELS } from "@/lib/export/contacts";
import type { Company, InvestmentRelationship, OutreachStage, Person } from "@/lib/types";
import type { EnrichmentDraft, InvestmentDraft } from "@/components/shared";
import { OUTREACH_STAGES } from "@/lib/types";
import {
  formatChangeCount,
  formatCompanyWebsites,
  formatDate,
  formatNumber,
  MultiFilterSelect,
  SOURCE_QUALITY_LABELS,
} from "@/components/shared";
import type { EnrichmentBatchProgress } from "@/components/shared";
import { BatchProgressPanel } from "@/components/views/companies/batch-progress-panel";
import { CompanyMergePanel } from "@/components/views/companies/company-merge-panel";
import { CompanyDetailPanel } from "@/components/views/companies/company-detail-panel";

type CompanyPageSize = number | "all";

export type CompaniesViewProps = {
  showCompanyTable: boolean;
  activeCompany: Company;
  showDetailPanel: boolean;
  companyModalId: string | null;
  filteredCompanies: Company[];
  visibleCompanies: Company[];
  selectedIds: Set<string>;
  query: string;
  stageFilters: Set<string>;
  countryFilters: Set<string>;
  tagFilters: Set<string>;
  qualityFilters: Set<string>;
  exportCriterion: ContactExportCriterion;
  exportValue: string;
  companyPageSize: CompanyPageSize;
  effectiveCompanyPage: number;
  companyTotalPages: number;
  companyStart: number;
  companyEnd: number;
  activeCompanyFilterCount: number;
  batchTargetCompanies: Company[];
  isBatchEnriching: boolean;
  batchProgress: EnrichmentBatchProgress | null;
  batchProgressPercent: number;
  batchProgressProcessed: number;
  pendingEnrichmentCount: number;
  isRefreshingTable: boolean;
  isEnriching: boolean;
  isPushingChanges: boolean;
  isSignedIn: boolean;
  pendingChangesLength: number;
  selectedCompanies: Company[];
  companyMergeTarget: Company | null;
  companyMergeSources: Company[];
  activeCompanyDraft: { companyId: string; name: string; websites: string; description: string; country: string };
  activeCompanyEnrichmentDraft: EnrichmentDraft | null;
  activeCompanyInvestment: InvestmentRelationship | null;
  activeCompanyInvestmentDraft: InvestmentDraft | null;
  enrichmentMessage: string | null;
  setEnrichmentDraft: React.Dispatch<React.SetStateAction<EnrichmentDraft | null>>;
  setCompanyDraft: React.Dispatch<React.SetStateAction<{ companyId: string; name: string; websites: string; description: string; country: string }>>;
  noteText: string;
  setNoteText: React.Dispatch<React.SetStateAction<string>>;
  localEnrichmentEnabled: boolean;
  exportOptions: string[];
  exportRowsLength: number;
  countries: string[];
  tagNames: string[];
  bulkTag: string;
  companyPageSizeOptions: readonly (number | "all")[];

  onSetQuery: (value: string) => void;
  onSetCompanyPage: (page: number | ((prev: number) => number)) => void;
  onSetCompanyPageSize: (size: CompanyPageSize) => void;
  onSetExportCriterion: (criterion: ContactExportCriterion) => void;
  onSetExportValue: (value: string) => void;
  onSetBulkTag: (value: string) => void;
  onToggleCompany: (companyId: string) => void;
  onToggleStageFilter: (value: string) => void;
  onToggleCountryFilter: (value: string) => void;
  onToggleTagFilter: (value: string) => void;
  onToggleQualityFilter: (value: string) => void;
  onClearCompanyFilters: () => void;
  onRefreshCompanyTable: () => void;
  onApplyStage: (stage: OutreachStage) => void;
  onApplyBulkTag: () => void;
  onStartCompanyMerge: () => void;
  onCloseCompanyMerge: () => void;
  onSetCompanyMergeTargetId: (id: string | null) => void;
  onHandleCompanyMerge: () => void;
  onEnrichCompanyBatch: (companies: Company[]) => void;
  onRequestStopEnrichmentBatch: () => void;
  onExportCompanies: (companies: Company[]) => void;
  onOpenCompanyModal: (companyId: string) => void;
  onSetActiveCompanyId: (id: string) => void;
  onExportCriterionChange: (nextCriterion: ContactExportCriterion) => void;
  onCloseCompanyModal: () => void;
  onUpdateActiveCompany: (field: "name" | "websites" | "description" | "country", value: string) => void;
  onEnrichActiveCompany: (force?: boolean) => void;
  onSaveActiveCompanyEnrichment: () => void;
  onSaveInvestmentRelationship: (relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) => void;
  onAddInvestmentDealLocally: (relationship: InvestmentRelationship, draft: InvestmentDraft, label: string) => void;
  onToggleHighlight: (companyId: string, person: Person) => void;
  onAddManualNote: () => void;
  onSetCompanyInvestmentDraft: React.Dispatch<React.SetStateAction<InvestmentDraft | null>>;
  startPersonEdit: (person: Person) => void;
  pushPendingEnrichments: () => void;
};

export function CompaniesView(props: CompaniesViewProps) {
  const {
    showCompanyTable,
    activeCompany,
    showDetailPanel,
    companyModalId,
    filteredCompanies,
    visibleCompanies,
    selectedIds,
    query,
    stageFilters,
    countryFilters,
    tagFilters,
    qualityFilters,
    exportCriterion,
    exportValue,
    companyPageSize,
    effectiveCompanyPage,
    companyTotalPages,
    companyStart,
    companyEnd,
    activeCompanyFilterCount,
    batchTargetCompanies,
    isBatchEnriching,
    batchProgress,
    batchProgressPercent,
    batchProgressProcessed,
    pendingEnrichmentCount,
    isRefreshingTable,
    isEnriching,
    isPushingChanges,
    isSignedIn,
    pendingChangesLength,
    selectedCompanies,
    companyMergeTarget,
    companyMergeSources,
    activeCompanyDraft,
    activeCompanyEnrichmentDraft,
    activeCompanyInvestment,
    activeCompanyInvestmentDraft,
    enrichmentMessage,
    setEnrichmentDraft,
    setCompanyDraft,
    noteText,
    setNoteText,
    localEnrichmentEnabled,
    exportOptions,
    exportRowsLength,
    countries,
    tagNames,
    bulkTag,
    companyPageSizeOptions,

    onSetQuery,
    onSetCompanyPage,
    onSetCompanyPageSize,
    onSetExportCriterion,
    onSetExportValue,
    onSetBulkTag,
    onToggleCompany,
    onToggleStageFilter,
    onToggleCountryFilter,
    onToggleTagFilter,
    onToggleQualityFilter,
    onClearCompanyFilters,
    onRefreshCompanyTable,
    onApplyStage,
    onApplyBulkTag,
    onStartCompanyMerge,
    onCloseCompanyMerge,
    onSetCompanyMergeTargetId,
    onHandleCompanyMerge,
    onEnrichCompanyBatch,
    onRequestStopEnrichmentBatch,
    onExportCompanies,
    onOpenCompanyModal,
    onSetActiveCompanyId,
    onExportCriterionChange,
    onCloseCompanyModal,
    onUpdateActiveCompany,
    onEnrichActiveCompany,
    onSaveActiveCompanyEnrichment,
    onSaveInvestmentRelationship,
    onAddInvestmentDealLocally,
    onToggleHighlight,
    onAddManualNote,
    onSetCompanyInvestmentDraft,
    startPersonEdit,
    pushPendingEnrichments,
  } = props;

  return (
    <>
      {showCompanyTable ? (
      <div className="company-surface">
      <div className="toolbar">
        <label className="search-box">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => {
              onSetCompanyPage(1);
              onSetQuery(event.target.value);
            }}
            placeholder="Search companies, people, tags, domains"
          />
        </label>
        <button
          type="button"
          className="secondary-button table-refresh-button"
          onClick={onRefreshCompanyTable}
          disabled={isRefreshingTable}
          aria-label="Refresh company table"
          title="Refresh company table from the database"
        >
          <RefreshCw size={15} className={clsx(isRefreshingTable && "spinning")} />
          {isRefreshingTable ? "Refreshing" : "Refresh"}
        </button>
        <MultiFilterSelect
          icon={<Filter size={15} />}
          label="Stage"
          options={OUTREACH_STAGES}
          selected={stageFilters}
          onToggle={onToggleStageFilter}
        />
        <MultiFilterSelect
          label="Country"
          options={countries}
          selected={countryFilters}
          onToggle={onToggleCountryFilter}
        />
        <MultiFilterSelect
          label="Tag"
          options={tagNames}
          selected={tagFilters}
          onToggle={onToggleTagFilter}
        />
        <MultiFilterSelect
          label="Quality"
          options={Object.keys(SOURCE_QUALITY_LABELS)}
          selected={qualityFilters}
          onToggle={onToggleQualityFilter}
          formatOption={(value) => SOURCE_QUALITY_LABELS[value as keyof typeof SOURCE_QUALITY_LABELS] ?? value}
        />
        {activeCompanyFilterCount > 0 ? (
          <button type="button" className="text-button filter-clear-button" onClick={onClearCompanyFilters}>
            <X size={14} /> Clear filters
          </button>
        ) : null}
      </div>

      <div className="exportbar">
        <div>
          <strong>{formatNumber(exportRowsLength)} contacts match</strong>
          <span>Export every linked contact for one criterion, regardless of current page size.</span>
        </div>
        <label className="select-filter">
          <span>Criterion</span>
          <select
            value={exportCriterion}
            onChange={(event) => {
              onExportCriterionChange(event.target.value as ContactExportCriterion);
            }}
          >
            {Object.entries(CONTACT_EXPORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="search-box export-value-box">
          <Search size={16} />
          <input
            list="contact-export-values"
            value={exportValue}
            onChange={(event) => onSetExportValue(event.target.value)}
            placeholder="Biotech"
          />
          <datalist id="contact-export-values">
            {exportOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
        </label>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            const params = new URLSearchParams({ criterion: exportCriterion, value: exportValue });
            window.location.href = `/api/export/contacts?${params.toString()}`;
          }}
        >
          <Download size={15} /> Export matched contacts
        </button>
      </div>

      <div className="bulkbar">
        <span>{selectedIds.size} selected</span>
        <select onChange={(event) => event.target.value && onApplyStage(event.target.value as OutreachStage)} defaultValue="">
          <option value="">Move stage</option>
          {OUTREACH_STAGES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <label className="bulk-tag">
          <Tags size={15} />
          <input value={bulkTag} onChange={(event) => onSetBulkTag(event.target.value)} placeholder="Add tag" />
        </label>
        <button type="button" onClick={onApplyBulkTag}>
          <Plus size={15} /> Apply
        </button>
        <button type="button" onClick={onStartCompanyMerge} disabled={selectedCompanies.length < 2} title="Merge selected companies">
          <GitMerge size={15} /> Merge
        </button>
        <button
          type="button"
          className={clsx("batch-enrich-button", isBatchEnriching && "running")}
          style={{ "--batch-progress": `${batchProgressPercent}%` } as React.CSSProperties}
          onClick={isBatchEnriching ? onRequestStopEnrichmentBatch : () => onEnrichCompanyBatch(batchTargetCompanies)}
          disabled={!isBatchEnriching && (isEnriching || !localEnrichmentEnabled || !isSignedIn || batchTargetCompanies.length === 0)}
          title="Generate local LLM enrichments for selected companies, or all filtered companies if nothing is selected"
          aria-label={isBatchEnriching ? "Stop enrichment batch" : "Start enrichment batch"}
        >
          <span className="batch-enrich-progress" aria-hidden="true" />
          <FlaskConical size={15} />
          {isBatchEnriching
            ? batchProgress?.stopRequested
              ? "Stopping..."
              : `Stop ${formatNumber(batchProgressProcessed)} / ${formatNumber(batchProgress?.total ?? 0)}`
            : `Enrich ${formatNumber(batchTargetCompanies.length)}`}
        </button>
        <button type="button" onClick={() => onExportCompanies(selectedCompanies.length ? selectedCompanies : filteredCompanies)}>
          <Download size={15} /> Export
        </button>
        {pendingChangesLength > 0 ? <span className="saving">{formatChangeCount(pendingChangesLength)}</span> : null}
      </div>

      <BatchProgressPanel
        batchProgress={batchProgress}
        isBatchEnriching={isBatchEnriching}
        pendingEnrichmentCount={pendingEnrichmentCount}
        pushPendingEnrichments={pushPendingEnrichments}
        isPushingChanges={isPushingChanges}
      />

      <CompanyMergePanel
        companyMergeTarget={companyMergeTarget}
        selectedCompanies={selectedCompanies}
        closeCompanyMerge={onCloseCompanyMerge}
        setCompanyMergeTargetId={onSetCompanyMergeTargetId}
        handleCompanyMerge={onHandleCompanyMerge}
        companyMergeSources={companyMergeSources}
      />

      <div className="company-table-wrap">
        <table className="company-table">
          <colgroup>
            <col className="select-column" />
            <col className="company-column" />
            <col className="stage-column" />
            <col className="tags-column" />
            <col className="people-column" />
            <col className="quality-column" />
            <col className="task-column" />
            <col className="activity-column" />
          </colgroup>
          <thead>
            <tr>
              <th aria-label="Select" />
              <th>Company</th>
              <th>Stage</th>
              <th>Tags</th>
              <th>People</th>
              <th>Quality</th>
              <th>Next task</th>
              <th>Last touch</th>
            </tr>
          </thead>
          <tbody>
            {visibleCompanies.map((company) => (
              <tr
                key={company.id}
                className={clsx(activeCompany?.id === company.id && "active-row")}
                onClick={() => onSetActiveCompanyId(company.id)}
                onDoubleClick={() => onOpenCompanyModal(company.id)}
              >
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(company.id)}
                    onChange={(event) => {
                      event.stopPropagation();
                      onToggleCompany(company.id);
                    }}
                    aria-label={`Select ${company.name}`}
                  />
                </td>
                <td>
                  <div className="company-cell">
                    <strong>{company.name}</strong>
                    <span title={company.websiteDomains.join(", ")}>{formatCompanyWebsites(company)}</span>
                  </div>
                </td>
                <td>
                  <span className="stage-badge">{company.outreachStage}</span>
                </td>
                <td>
                  <div className="tag-list">
                    {company.tags.slice(0, 3).map((item) => (
                      <span key={item.id} className="tag-chip" style={{ "--tag-color": item.color } as React.CSSProperties}>
                        {item.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{company.people.length}</td>
                <td>
                  <span className={clsx("quality-pill", company.sourceQuality)}>{SOURCE_QUALITY_LABELS[company.sourceQuality]}</span>
                </td>
                <td className="muted-cell">{company.nextTask?.title ?? "No open task"}</td>
                <td className="muted-cell">{formatDate(company.lastActivityAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="company-countbar">
        <span>
          Showing {formatNumber(companyStart)}-{formatNumber(companyEnd)} of {formatNumber(filteredCompanies.length)}
        </span>
        <div className="people-pager">
          <label className="select-filter">
            <span>Show</span>
            <select
              value={String(companyPageSize)}
              onChange={(event) => {
                const nextValue = event.target.value;
                onSetCompanyPage(1);
                onSetCompanyPageSize(nextValue === "all" ? "all" : (Number(nextValue) as CompanyPageSize));
              }}
            >
              {companyPageSizeOptions.map((option) => (
                <option key={String(option)} value={String(option)}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
          <button type="button" className="pager-button" disabled={effectiveCompanyPage <= 1 || companyPageSize === "all"} onClick={() => onSetCompanyPage((current) => Math.max(1, current - 1))}>
            Previous
          </button>
          <span>
            Page {formatNumber(effectiveCompanyPage)} / {formatNumber(companyTotalPages)}
          </span>
          <button
            type="button"
            className="pager-button"
            disabled={effectiveCompanyPage >= companyTotalPages || companyPageSize === "all"}
            onClick={() => onSetCompanyPage((current) => Math.min(companyTotalPages, current + 1))}
          >
            Next
          </button>
        </div>
      </div>
      </div>
      ) : null}

      {activeCompany && (showDetailPanel || companyModalId) ? (
      <CompanyDetailPanel
        activeCompany={activeCompany}
        showDetailPanel={showDetailPanel}
        companyModalId={companyModalId}
        activeCompanyDraft={activeCompanyDraft}
        setCompanyDraft={setCompanyDraft}
        updateActiveCompany={onUpdateActiveCompany}
        closeCompanyModal={onCloseCompanyModal}
        activeCompanyEnrichmentDraft={activeCompanyEnrichmentDraft}
        setEnrichmentDraft={setEnrichmentDraft}
        enrichmentMessage={enrichmentMessage}
        isEnriching={isEnriching}
        localEnrichmentEnabled={localEnrichmentEnabled}
        isSignedIn={isSignedIn}
        enrichActiveCompany={onEnrichActiveCompany}
        saveActiveCompanyEnrichment={onSaveActiveCompanyEnrichment}
        activeCompanyInvestment={activeCompanyInvestment}
        activeCompanyInvestmentDraft={activeCompanyInvestmentDraft}
        setCompanyInvestmentDraft={onSetCompanyInvestmentDraft}
        saveInvestmentRelationship={onSaveInvestmentRelationship}
        addInvestmentDealLocally={onAddInvestmentDealLocally}
        toggleHighlight={onToggleHighlight}
        startPersonEdit={startPersonEdit}
        noteText={noteText}
        setNoteText={setNoteText}
        addManualNote={onAddManualNote}
      />
      ) : null}
    </>
  );
}
