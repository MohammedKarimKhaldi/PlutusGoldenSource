"use no memo";

import { useRef } from "react";
import { Flag, Plus } from "lucide-react";
import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useFundraisingData } from "./use-fundraising-data";
import { FundraisingKpi } from "./fundraising-kpi";
import { FundraisingClientCard } from "./fundraising-client-card";
import { FundraisingClientDrawer } from "./fundraising-client-drawer";
import { FundraisingTargetsTab } from "./fundraising-targets-tab";
import { FundraisingFinanceTab } from "./fundraising-finance-tab";
import { FundraisingFilters } from "./fundraising-filters";
import type { FundraisingViewProps } from "./fundraising-types";
import { defaultFundraisingClientDraft, defaultFundraisingTargetDraft, formatNumber } from "./fundraising-types";

export function FundraisingView({
  initialClientDashboard, companies, peopleDirectory, accountingData, accountingAccess,
  dataMode, currentUserName, onOpenCompany, onOpenCompanyPage, onOpenAccounting, onAddCreatedCompany, onAddCreatedPerson,
  queuePendingRecord, discardPendingChange,
}: FundraisingViewProps) {
  const data = useFundraisingData({
    initialClientDashboard, companies, peopleDirectory, accountingData, accountingAccess,
    dataMode, currentUserName, onOpenAccounting, onAddCreatedCompany, onAddCreatedPerson,
    queuePendingRecord, discardPendingChange,
  });

  const listContainerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: data.filteredFundraisingClients.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 180,
    overscan: 5,
  });

  return (
    <section className="view-surface fundraising-view">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Fundraising clients</p>
          <h2>Signed mandates and investor outreach</h2>
          <span>
            {formatNumber(data.fundraisingStats.activeClients)} active mandates, {formatNumber(data.fundraisingStats.targets)} investor targets
          </span>
        </div>
        <div className="surface-actions">
          <button type="button" className="secondary-button" onClick={() => { data.setFundraisingClientDraft(defaultFundraisingClientDraft()); data.setShowClientDrawer(true); }}>
            <Plus size={15} /> New client
          </button>
          <button
            type="button" className="secondary-button"
            onClick={() => data.setFundraisingTargetDraft(defaultFundraisingTargetDraft(data.fundraisingClients[0]?.id ?? ""))}
            disabled={data.fundraisingClients.length === 0}
          >
            <Plus size={15} /> New target
          </button>
        </div>
      </div>

      <FundraisingKpi
        fundraisingStats={data.fundraisingStats}
        fundraisingData={data.fundraisingData}
        accountingAccess={accountingAccess}
      />

      <div className="accounting-tabs" role="tablist" aria-label="Fundraising client sections">
        <button type="button" className={clsx(data.fundraisingTab === "clients" && "active")} onClick={() => data.setFundraisingTab("clients")}>Clients</button>
        <button type="button" className={clsx(data.fundraisingTab === "targets" && "active")} onClick={() => data.setFundraisingTab("targets")}>Investor targets</button>
        <button type="button" className={clsx(data.fundraisingTab === "finance" && "active")} onClick={() => data.setFundraisingTab("finance")}>Finance</button>
      </div>

      <FundraisingFilters
        query={data.fundraisingQuery}
        onQueryChange={data.setFundraisingQuery}
        clientStageFilter={data.fundraisingClientStageFilter}
        onClientStageFilterChange={data.setFundraisingClientStageFilter}
        targetStageFilter={data.fundraisingTargetStageFilter}
        onTargetStageFilterChange={data.setFundraisingTargetStageFilter}
        companyFilter={data.fundraisingCompanyFilter}
        onCompanyFilterChange={data.setFundraisingCompanyFilter}
        currencyFilter={data.fundraisingCurrencyFilter}
        onCurrencyFilterChange={data.setFundraisingCurrencyFilter}
        investorTypeFilter={data.fundraisingInvestorTypeFilter}
        onInvestorTypeFilterChange={data.setFundraisingInvestorTypeFilter}
        clientCompanies={data.fundraisingClientCompanies}
        currencies={data.fundraisingCurrencies}
        investorTypes={data.fundraisingInvestorTypes}
        filterCount={data.filterCount}
        onClearFilters={data.clearFilters}
      />

      {data.fundraisingMessage ? (
        <div className="data-notice">
          <Flag size={16} />
          <span>{data.fundraisingMessage}</span>
        </div>
      ) : null}

      <div className="fundraising-tab-content">
        {data.fundraisingTab === "clients" ? (
          <div className="fundraising-grid">
            <div ref={listContainerRef} className="fundraising-virtual-list" style={{ height: "calc(100vh - 280px)" }}>
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
                {virtualizer.getVirtualItems().map((virtualItem) => {
                  const client = data.filteredFundraisingClients[virtualItem.index];
                  const companyName = data.companyNameById.get(client.companyId) ?? "Unknown company";
                  const targets = data.fundraisingTargetsByClient.get(client.id) ?? [];
                  const primaryContact = peopleDirectory.find(({ person }) => person.id === client.primaryContactPersonId)?.person ?? null;
                  return (
                    <div key={client.id} className="fundraising-virtual-row" style={{ transform: `translateY(${virtualItem.start}px)` }}>
                      <FundraisingClientCard
                        client={client}
                        companyName={companyName}
                        targets={targets}
                        primaryContact={primaryContact}
                        onOpenCompany={onOpenCompany}
                        onOpenCompanyPage={onOpenCompanyPage}
                        onEdit={data.editFundraisingClient}
                        onAddTarget={data.startFundraisingTarget}
                        onAccounting={(cid) => onOpenAccounting(cid)}
                        onDelete={data.deleteFundraisingClient}
                        isSaving={data.isSavingFundraising}
                        accountingAccess={accountingAccess}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {data.filteredFundraisingClients.length === 0 ? (
              <p className="empty-state">No fundraising clients match these filters.</p>
            ) : null}
          </div>
        ) : null}

        {data.fundraisingTab === "targets" ? (
          <FundraisingTargetsTab
            draft={data.fundraisingTargetDraft}
            setDraft={data.setFundraisingTargetDraft}
            fundraisingClients={data.fundraisingClients}
            filteredFundraisingTargets={data.filteredFundraisingTargets}
            fundraisingClientById={data.fundraisingClientById}
            companies={companies}
            peopleDirectory={peopleDirectory}
            isSaving={data.isSavingFundraising}
            onSave={data.saveFundraisingTarget}
            onEditTarget={data.editFundraisingTarget}
            onDeleteTarget={data.deleteFundraisingTarget}
            onOpenCompany={onOpenCompany}
            onClearDraft={() => data.setFundraisingTargetDraft(defaultFundraisingTargetDraft(data.fundraisingClients[0]?.id ?? ""))}
          />
        ) : null}

        {data.fundraisingTab === "finance" ? (
          <FundraisingFinanceTab
            filteredFundraisingClients={data.filteredFundraisingClients}
            retainerPeriods={data.retainerPeriods}
            accountingData={accountingData}
            accountingAccess={accountingAccess}
            companyNameById={data.companyNameById}
            onOpenAccounting={onOpenAccounting}
            onGenerateInvoice={data.generateRetainerInvoice}
          />
        ) : null}
      </div>

      {data.showClientDrawer ? (
        <FundraisingClientDrawer
          draft={data.fundraisingClientDraft}
          setDraft={data.setFundraisingClientDraft}
          companies={companies}
          peopleDirectory={peopleDirectory}
          isSaving={data.isSavingFundraising}
          onSave={data.saveFundraisingClient}
          onClose={() => data.setShowClientDrawer(false)}
        />
      ) : null}
    </section>
  );
}
