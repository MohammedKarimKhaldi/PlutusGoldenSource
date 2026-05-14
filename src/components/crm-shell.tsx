"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

import { contactExportValues, filterContactExportRows } from "@/lib/export/contacts";
import { COMPANY_PAGE_SIZE_OPTIONS, INCORRECT_EMAIL_TAG, emptyAccountingData, exportCompanies, exportDealPipeline, exportPeople, enrichmentDraftForCompany, initialCompanyIdFor, investmentDraftForRelationship, personSourceIds, relationshipForCompany } from "@/lib/crm-utils";
import { buildFundraisingCompanyProfile } from "@/lib/fundraising-company-profile";
import { FundraisingView } from "@/components/views/fundraising/fundraising-view";
import { Sidebar } from "@/components/views/shell/sidebar";
import { CrmTopbar } from "@/components/views/shell/crm-topbar";
import { PipelineStrip } from "@/components/views/pipeline/pipeline-strip";
import { PipelineView } from "@/components/views/pipeline/pipeline-view";
import { DebugBanner } from "@/components/views/shell/debug-banner";
import { AuthFlash } from "@/components/views/shell/auth-flash";
import { MetricsGrid } from "@/components/views/import/metrics-grid";
import { PeopleView } from "@/components/views/people/people-view";
import { TagsView } from "@/components/views/tags/tags-view";
import { TasksView } from "@/components/views/tasks/tasks-view";
import { ImportView } from "@/components/views/import/import-view";
import { SyncDock } from "@/components/views/shell/sync-dock";
import { AccountingView } from "@/components/views/accounting/accounting-view";
import { AccountingVoidDialog } from "@/components/views/accounting/accounting-void-dialog";
import { CompaniesView } from "@/components/views/companies/companies-view";
import { ContactEditor, usePersonEditor } from "@/components/views/people/contact-editor";

import { usePendingChanges } from "@/components/views/shell/use-pending-changes";
import { useCrmDebug } from "@/components/views/shell/use-crm-debug";
import { useCrmAccounting } from "@/components/views/shell/use-crm-accounting";
import { useCrmCompanies } from "@/components/views/shell/use-crm-companies";
import { useCrmPeople } from "@/components/views/shell/use-crm-people";
import { useCrmEnrichment } from "@/components/views/shell/use-crm-enrichment";
import { useInvestmentDeals } from "@/components/views/shell/use-investment-deals";

import type { CrmShellProps, ActiveView } from "@/lib/crm-types";

export function CrmShell({
  initialData,
  authSuccess = false,
  companyId,
  fundraisingClientId,
  hideDetailPanel = false,
  hideTable = false,
  activeView: initialActiveView = "companies",
}: CrmShellProps) {
  const router = useRouter();
  const isSignedIn = initialData.authMode === "supabase" && initialData.currentUserName !== "Not signed in";
  const authLabel = initialData.authMode === "demo" ? "Demo data" : isSignedIn ? "Signed in" : "Signed out";
  const authDetail = initialData.authMode === "demo" ? "Local preview" : isSignedIn ? initialData.currentUserName : "Not signed in";
  const isDemoData = initialData.dataMode === "demo";
  const [activeView, setActiveView] = useState<ActiveView>(initialActiveView);

  const {
    pendingChanges, setPendingChanges, isPushingChanges, syncMessage, setSyncMessage,
    buildPendingChange, queuePendingChange, queuePendingRecord, discardPendingChange, pushPendingChanges, pushPendingEnrichments, queuePersonUpdate,
  } = usePendingChanges(initialData);

  const [accountingData, setAccountingData] = useState(() => initialData.accounting ?? emptyAccountingData());

  const {
    companies, setCompanies,
    activeCompanyId, setActiveCompanyId,
    selectedIds, setSelectedIds,
    query, setQuery,
    stageFilters, setStageFilters,
    countryFilters, setCountryFilters,
    tagFilters, setTagFilters,
    qualityFilters, setQualityFilters,
    exportCriterion, setExportCriterion,
    exportValue, setExportValue,
    companyPageSize, setCompanyPageSize,
    companyPage, setCompanyPage,
    companyMergeTargetId, setCompanyMergeTargetId,
    companyModalId, setCompanyModalId,
    companyDraft, setCompanyDraft,
    bulkTag, setBulkTag,
    noteText, setNoteText,
    isRefreshingTable,

    deferredCompanyQuery,
    selectedCompanies,
    companyMergeTarget,
    companyMergeSources,
    companyNameById,
    filteredCompanies,
    activeCompanyFilterCount,
    companyTotalPages,
    effectiveCompanyPage,
    visibleCompanies,
    companyStart, companyEnd,
    activeCompany,
    activeCompanyDraft,
    exportOptions, exportRows,
    countries, tagNames,
    pipelineCounts,
    batchTargetCompanies,
    peopleRelationRows,

    updateCompanies,
    toggleCompany,
    clearCompanyFilters,
    refreshCompanyTable,
    openCompanyModal, closeCompanyModal,
    openCompany,
    startCompanyMerge, closeCompanyMerge,
    updateActiveCompany,
    addCreatedCompanyLocally, addCreatedPersonLocally,
    handleCompanyMerge,
    applyStage, applyBulkTag,
    addManualNote,
  } = useCrmCompanies({ initialData, companyId, queuePendingChange });

  const {
    peopleQuery, setPeopleQuery,
    peopleCompany, setPeopleCompany,
    peopleDomain, setPeopleDomain,
    peopleStage, setPeopleStage,
    peopleHighlight, setPeopleHighlight,
    peoplePageSize, setPeoplePageSize,
    peoplePage, setPeoplePage,
    personMergeTargetId, setPersonMergeTargetId,
    personMergeQuery, setPersonMergeQuery,
    peopleMessage, setPeopleMessage,
    incorrectEmails, setIncorrectEmails,
    incorrectEmailMessage, setIncorrectEmailMessage,
    isSplittingNames, splitNamesProgress,
    namesMessage, setNamesMessage,
    tagDrafts, setTagDrafts,

    deferredPeopleQuery,
    peopleDirectory,
    filteredPeopleDirectory,
    visiblePeopleDirectory,
    personMergeTarget,
    personMergeCandidates,
    peopleCompanyNames,
    peopleEmailDomains,
    tagSummaries,
    peopleStart, peopleEnd,
    effectivePeoplePage,
    peopleTotalPages,

    updatePersonLocally,
    applyCategoryToPeople,
    toggleHighlight,
    importIncorrectEmailsCsv, handleIncorrectEmailCsvUpload,
    splitPeopleNames,
    startManualMerge, closeManualMerge,
    handleManualMerge,
    renameTag,
  } = useCrmPeople({ companies, setCompanies, queuePendingChange, queuePersonUpdate, initialData });

  const {
    enrichmentDraft, setEnrichmentDraft,
    enrichmentMessage, setEnrichmentMessage,
    batchProgress, setBatchProgress,
    isEnriching, setIsEnriching,
    stopBatchRef, batchAbortControllerRef,

    batchProcessed, batchPercent, isBatchEnriching,

    saveActiveCompanyEnrichment,
    enrichActiveCompany,
    enrichCompanyBatch,
    requestStopEnrichmentBatch,
  } = useCrmEnrichment({ updateCompanies, queuePendingChange });

  const {
    pipelineDrafts, setPipelineDrafts,
    companyInvestmentDraft, setCompanyInvestmentDraft,
    dealPipelineRows, dealPipelineGroups,

    saveInvestmentRelationship,
    addInvestmentDealLocally,
    updatePipelineDraft,
    queueDealStatusUpdate,
  } = useInvestmentDeals({ companies, setCompanies, queuePendingChange });

  const {
    debugMode, debugModeReady, debugStorageIssue, debugDraftHydratedRef,
    toggleDebugMode, resetDebugDraft,
  } = useCrmDebug({
    initialData,
    initialCompanyId: initialCompanyIdFor(initialData.companies, companyId),
    companyId,
    buildPendingChange,
    companies,
    pendingChanges,
    syncMessage,
    setCompanies,
    setPendingChanges,
    setSelectedIds,
    setActiveCompanyId,
    setCompanyModalId,
    setBatchProgress,
    stopBatchRef,
    batchAbortControllerRef,
    setCompanyDraft,
    setEnrichmentDraft,
    setCompanyInvestmentDraft,
    setPipelineDrafts,
    setEnrichmentMessage,
    setTagDrafts,
    setPeopleMessage,
    setIncorrectEmailMessage,
    setSyncMessage,
    clearCompanyFilters,
  });

  const {
    accountingTab, setAccountingTab,
    accountingQuery, setAccountingQuery,
    accountingMessage, setAccountingMessage,
    accountingDocumentDraft, setAccountingDocumentDraft,
    accountingLedgerDraft, setAccountingLedgerDraft,
    accountingCompanyFilter, setAccountingCompanyFilter,
    accountingTypeFilter, setAccountingTypeFilter,
    accountingStatusFilter, setAccountingStatusFilter,
    accountingCurrencyFilter, setAccountingCurrencyFilter,
    accountingDateFrom, setAccountingDateFrom,
    accountingDateTo, setAccountingDateTo,
    isSavingAccounting, setIsSavingAccounting,
    accountingRecordActionTarget, setAccountingRecordActionReason,
    accountingRecordActionReason,
    filteredAccountingDocuments, filteredAccountingEntries,
    accountingCompanies, accountingCurrencies,
    saveAccountingDocument, saveAccountingLedgerEntry,
    handleLedgerDocumentChange, openAccountingDocumentAction,
    openAccountingLedgerAction, closeAccountingRecordActionDialog,
    confirmAccountingRecordAction, openAccountingForFundraisingCompany,
  } = useCrmAccounting({
    initialData,
    accountingData,
    setAccountingData,
    companies,
    companyNameById,
    setActiveView,
    queuePendingRecord,
    discardPendingChange,
  });

  const showCompanyTable = !hideTable;
  const showDetailPanel = !hideDetailPanel;

  const activeCompanyEnrichmentDraft = activeCompany && enrichmentDraft?.companyId === activeCompany.id ? enrichmentDraft : activeCompany ? enrichmentDraftForCompany(activeCompany) : null;

  const activeCompanyInvestment = activeCompany ? relationshipForCompany(activeCompany) : null;

  const activeCompanyInvestmentDraft =
    activeCompanyInvestment && companyInvestmentDraft?.targetKey === `${activeCompanyInvestment.companyId ?? "none"}:${activeCompanyInvestment.personId ?? "none"}`
      ? companyInvestmentDraft
      : activeCompanyInvestment
        ? investmentDraftForRelationship(activeCompanyInvestment)
        : null;

  const fundraisingCompanyProfile = useMemo(
    () =>
      activeCompany
        ? buildFundraisingCompanyProfile({
            company: activeCompany,
            clientDashboard: initialData.clientDashboard,
            accountingData: initialData.accountingAccess.canView ? accountingData : null,
            selectedClientId: fundraisingClientId,
          })
        : null,
    [accountingData, activeCompany, fundraisingClientId, initialData.accountingAccess.canView, initialData.clientDashboard],
  );

  function openFundraisingCompanyPage(nextCompanyId: string, clientId: string) {
    router.push(`/companies/${encodeURIComponent(nextCompanyId)}?client=${encodeURIComponent(clientId)}`);
  }

  function selectFundraisingClientForCompany(clientId: string) {
    if (!activeCompany) return;
    openFundraisingCompanyPage(activeCompany.id, clientId);
  }

  const pendingEnrichmentCount = pendingChanges.filter((change) => change.record.kind === "company-enrichment-update").length;

  const taskRows = useMemo(
    () =>
      companies.flatMap((company) =>
        company.nextTask
          ? [{ task: company.nextTask as typeof company.nextTask & Record<string, unknown>, company }]
          : [],
      ),
    [companies],
  );

  const personEditor = usePersonEditor({
    peopleDirectory,
    updatePersonLocally,
    queuePendingChange,
    saveInvestmentRelationship,
    addInvestmentDealLocally,
    initialData,
    setPeopleMessage,
    personSourceIds,
  });

  useEffect(() => {
    if (!authSuccess) return;

    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "success") return;

    url.searchParams.delete("auth");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [authSuccess]);

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={setActiveView} isSignedIn={isSignedIn} authLabel={authLabel} authDetail={authDetail} />

      <main className={clsx("workspace", activeView === "companies" && showCompanyTable && !showDetailPanel && "companies-workspace")}>
        <CrmTopbar activeView={activeView} debugMode={debugMode} toggleDebugMode={toggleDebugMode} resetDebugDraft={resetDebugDraft} isSignedIn={isSignedIn} currentUserName={initialData.currentUserName} />

        <DebugBanner debugMode={debugMode} debugStorageIssue={debugStorageIssue} />
        <AuthFlash show={authSuccess && isSignedIn} />

        <MetricsGrid importSummary={initialData.importSummary} />

        <PipelineStrip pipelineCounts={pipelineCounts} stageFilters={stageFilters} onStageClick={(stage) => { setStageFilters((current) => { const next = new Set(current); if (next.has(stage)) next.delete(stage); else next.add(stage); return next; }); setActiveView("companies"); }} />

        {activeView === "companies" ? (
          <CompaniesView
            showCompanyTable={showCompanyTable}
            activeCompany={activeCompany}
            showDetailPanel={showDetailPanel}
            companyModalId={companyModalId}
            filteredCompanies={filteredCompanies}
            visibleCompanies={visibleCompanies}
            selectedIds={selectedIds}
            query={query}
            stageFilters={stageFilters}
            countryFilters={countryFilters}
            tagFilters={tagFilters}
            qualityFilters={qualityFilters}
            exportCriterion={exportCriterion}
            exportValue={exportValue}
            companyPageSize={companyPageSize}
            effectiveCompanyPage={effectiveCompanyPage}
            companyTotalPages={companyTotalPages}
            companyStart={companyStart}
            companyEnd={companyEnd}
            activeCompanyFilterCount={activeCompanyFilterCount}
            batchTargetCompanies={batchTargetCompanies}
            isBatchEnriching={isBatchEnriching}
            batchProgress={batchProgress}
            batchProgressPercent={batchPercent}
            batchProgressProcessed={batchProcessed}
            pendingEnrichmentCount={pendingEnrichmentCount}
            isRefreshingTable={isRefreshingTable}
            isEnriching={isEnriching}
            isPushingChanges={isPushingChanges}
            isSignedIn={isSignedIn}
            pendingChangesLength={pendingChanges.length}
            selectedCompanies={selectedCompanies}
            companyMergeTarget={companyMergeTarget}
            companyMergeSources={companyMergeSources}
            activeCompanyDraft={activeCompanyDraft}
            activeCompanyEnrichmentDraft={activeCompanyEnrichmentDraft}
            activeCompanyInvestment={activeCompanyInvestment}
            activeCompanyInvestmentDraft={activeCompanyInvestmentDraft}
            fundraisingCompanyProfile={fundraisingCompanyProfile}
            accountingCanView={initialData.accountingAccess.canView}
            enrichmentMessage={enrichmentMessage}
            setEnrichmentDraft={setEnrichmentDraft}
            setCompanyDraft={setCompanyDraft}
            noteText={noteText}
            setNoteText={setNoteText}
            localEnrichmentEnabled={initialData.localEnrichmentEnabled}
            exportOptions={exportOptions}
            exportRowsLength={exportRows.length}
            countries={countries}
            tagNames={tagNames}
            bulkTag={bulkTag}
            companyPageSizeOptions={COMPANY_PAGE_SIZE_OPTIONS}
            onSetQuery={setQuery}
            onSetCompanyPage={setCompanyPage}
            onSetCompanyPageSize={(size) => setCompanyPageSize(size as 50 | 100 | 250 | 500 | "all")}
            onSetExportCriterion={setExportCriterion}
            onSetExportValue={setExportValue}
            onSetBulkTag={setBulkTag}
            onToggleCompany={toggleCompany}
            onToggleStageFilter={(value) => { setStageFilters((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }); setCompanyPage(1); }}
            onToggleCountryFilter={(value) => { setCountryFilters((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }); setCompanyPage(1); }}
            onToggleTagFilter={(value) => { setTagFilters((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }); setCompanyPage(1); }}
            onToggleQualityFilter={(value) => { setQualityFilters((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; }); setCompanyPage(1); }}
            onClearCompanyFilters={clearCompanyFilters}
            onRefreshCompanyTable={refreshCompanyTable}
            onApplyStage={applyStage}
            onApplyBulkTag={applyBulkTag}
            onStartCompanyMerge={startCompanyMerge}
            onCloseCompanyMerge={closeCompanyMerge}
            onSetCompanyMergeTargetId={setCompanyMergeTargetId}
            onHandleCompanyMerge={handleCompanyMerge}
            onEnrichCompanyBatch={enrichCompanyBatch}
            onRequestStopEnrichmentBatch={requestStopEnrichmentBatch}
            onExportCompanies={exportCompanies}
            onOpenCompanyModal={openCompanyModal}
            onSetActiveCompanyId={setActiveCompanyId}
            onExportCriterionChange={(nextCriterion) => { setExportCriterion(nextCriterion); setExportValue(contactExportValues(companies, nextCriterion)[0] ?? ""); }}
            onCloseCompanyModal={closeCompanyModal}
            onUpdateActiveCompany={updateActiveCompany}
            onEnrichActiveCompany={(force) => enrichActiveCompany(activeCompany, force)}
            onSaveActiveCompanyEnrichment={() => saveActiveCompanyEnrichment(activeCompany, activeCompanyEnrichmentDraft)}
            onSaveInvestmentRelationship={saveInvestmentRelationship}
            onAddInvestmentDealLocally={addInvestmentDealLocally}
            onToggleHighlight={toggleHighlight}
            onAddManualNote={addManualNote}
            onSelectFundraisingClient={selectFundraisingClientForCompany}
            onSetCompanyInvestmentDraft={setCompanyInvestmentDraft}
            startPersonEdit={personEditor.startPersonEdit}
            pushPendingEnrichments={pushPendingEnrichments}
          />
        ) : null}

        {activeView === "people" ? (
          <PeopleView
            filteredDirectory={filteredPeopleDirectory}
            directory={peopleDirectory}
            visibleDirectory={visiblePeopleDirectory}
            query={peopleQuery}
            company={peopleCompany}
            domain={peopleDomain}
            stage={peopleStage}
            highlight={peopleHighlight}
            pageSize={peoplePageSize}
            page={peoplePage}
            peopleStart={peopleStart}
            peopleEnd={peopleEnd}
            effectivePage={effectivePeoplePage}
            totalPages={peopleTotalPages}
            personMergeTarget={personMergeTarget}
            personMergeQuery={personMergeQuery}
            personMergeCandidates={personMergeCandidates}
            peopleMessage={peopleMessage}
            incorrectEmailMessage={incorrectEmailMessage}
            incorrectEmails={incorrectEmails}
            namesMessage={namesMessage}
            isSplittingNames={isSplittingNames}
            splitNamesProgress={splitNamesProgress}
            companyNames={peopleCompanyNames}
            emailDomains={peopleEmailDomains}
            isDemoData={isDemoData}
            dataWarning={initialData.dataWarning ?? null}
            localEnrichmentEnabled={initialData.localEnrichmentEnabled}
            isSignedIn={isSignedIn}
            onQueryChange={(value) => { setPeoplePage(1); setPeopleQuery(value); }}
            onCompanyChange={(value) => { setPeoplePage(1); setPeopleCompany(value); }}
            onDomainChange={(value) => { setPeoplePage(1); setPeopleDomain(value); }}
            onStageChange={(value) => { setPeoplePage(1); setPeopleStage(value); }}
            onHighlightChange={(value) => { setPeoplePage(1); setPeopleHighlight(value); }}
            onPageSizeChange={(value) => { setPeoplePage(1); setPeoplePageSize(value as typeof peoplePageSize); }}
            onPageChange={(page) => setPeoplePage(page)}
            onCloseMerge={closeManualMerge}
            onMergeQueryChange={setPersonMergeQuery}
            onMergePerson={handleManualMerge}
            onIncorrectEmailUpload={handleIncorrectEmailCsvUpload}
            onExport={exportPeople}
            onSplitNames={splitPeopleNames}
            onStopSplitNames={() => { stopBatchRef.current = true; }}
            onSetActiveCompany={setActiveCompanyId}
            onToggleHighlight={toggleHighlight}
            onStartEdit={personEditor.startPersonEdit}
            onOpenCompany={openCompany}
            onStartManualMerge={startManualMerge}
          />
        ) : null}

        {activeView === "tags" ? <TagsView tagSummaries={tagSummaries} tagDrafts={tagDrafts} setTagDrafts={setTagDrafts} renameTag={renameTag} pendingChanges={pendingChanges} /> : null}

        {activeView === "pipeline" ? (
          <PipelineView
            groups={dealPipelineGroups}
            rows={dealPipelineRows}
            drafts={pipelineDrafts}
            onOpenCompany={openCompany}
            onUpdateDraft={updatePipelineDraft}
            onQueueStatusUpdate={queueDealStatusUpdate}
            onExport={exportDealPipeline}
          />
        ) : null}

        {activeView === "clients" ? (
          <FundraisingView
            initialClientDashboard={initialData.clientDashboard}
            companies={companies}
            peopleDirectory={peopleDirectory}
            accountingData={accountingData}
            accountingAccess={initialData.accountingAccess}
            dataMode={initialData.dataMode}
            currentUserName={initialData.currentUserName}
            onOpenCompany={openCompany}
            onOpenCompanyPage={openFundraisingCompanyPage}
            onOpenAccounting={openAccountingForFundraisingCompany}
            onAddCreatedCompany={addCreatedCompanyLocally}
            onAddCreatedPerson={addCreatedPersonLocally}
            queuePendingRecord={queuePendingRecord}
            discardPendingChange={discardPendingChange}
          />
        ) : null}

        {activeView === "accounting" ? (
          <AccountingView
            access={initialData.accountingAccess}
            companies={companies}
            tab={accountingTab}
            query={accountingQuery}
            message={accountingMessage}
            documentDraft={accountingDocumentDraft}
            ledgerDraft={accountingLedgerDraft}
            isSaving={isSavingAccounting}
            companyFilter={accountingCompanyFilter}
            typeFilter={accountingTypeFilter}
            statusFilter={accountingStatusFilter}
            currencyFilter={accountingCurrencyFilter}
            dateFrom={accountingDateFrom}
            dateTo={accountingDateTo}
            filteredDocuments={filteredAccountingDocuments}
            filteredEntries={filteredAccountingEntries}
            accountingCompanies={accountingCompanies}
            accountingCurrencies={accountingCurrencies}
            companyNameById={companyNameById}
            accountingData={accountingData}
            setTab={setAccountingTab}
            setQuery={setAccountingQuery}
            setMessage={setAccountingMessage}
            setDocumentDraft={setAccountingDocumentDraft}
            setLedgerDraft={setAccountingLedgerDraft}
            setIsSaving={setIsSavingAccounting}
            setCompanyFilter={setAccountingCompanyFilter}
            setTypeFilter={setAccountingTypeFilter}
            setStatusFilter={setAccountingStatusFilter}
            setCurrencyFilter={setAccountingCurrencyFilter}
            setDateFrom={setAccountingDateFrom}
            setDateTo={setAccountingDateTo}
            onSaveDocument={saveAccountingDocument}
            onSaveLedgerEntry={saveAccountingLedgerEntry}
            onLedgerDocumentChange={handleLedgerDocumentChange}
            onOpenDocumentAction={openAccountingDocumentAction}
            onOpenLedgerAction={openAccountingLedgerAction}
          />
        ) : null}

        {activeView === "tasks" ? <TasksView taskRows={taskRows} openCompany={openCompany} /> : null}

        {activeView === "import" ? <ImportView importSummary={initialData.importSummary} /> : null}

        <SyncDock pendingChanges={pendingChanges} syncMessage={syncMessage} debugMode={debugMode} isPushingChanges={isPushingChanges} pushPendingChanges={pushPendingChanges} />

        <AccountingVoidDialog
          target={accountingRecordActionTarget}
          reason={accountingRecordActionReason}
          setReason={setAccountingRecordActionReason}
          isSaving={isSavingAccounting}
          onConfirm={confirmAccountingRecordAction}
          onClose={closeAccountingRecordActionDialog}
        />

        <ContactEditor editor={personEditor} isPushingChanges={isPushingChanges} />
      </main>
    </div>
  );
}
