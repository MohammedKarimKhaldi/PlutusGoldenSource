import { Flag } from "lucide-react";
import { Metric } from "@/components/shared";
import { formatMinorMoney, formatNumber } from "./fundraising-types";
import type { ClientDashboardData, AccountingAccess } from "@/lib/types";

type FundraisingKpiProps = {
  fundraisingStats: {
    signedClients: number;
    activeClients: number;
    targets: number;
    contactedTargets: number;
    repliedTargets: number;
    meetings: number;
  };
  fundraisingData: ClientDashboardData;
  accountingAccess: AccountingAccess;
};

export function FundraisingKpi({ fundraisingStats, fundraisingData, accountingAccess }: FundraisingKpiProps) {
  return (
    <>
      <div className="fundraising-kpi-grid">
        <Metric label="Signed clients" value={formatNumber(fundraisingStats.signedClients)} />
        <Metric label="Active mandates" value={formatNumber(fundraisingStats.activeClients)} />
        <Metric label="Investor targets" value={formatNumber(fundraisingStats.targets)} />
        <Metric label="Contacted" value={formatNumber(fundraisingStats.contactedTargets)} />
        <Metric label="Replies" value={formatNumber(fundraisingStats.repliedTargets)} />
        <Metric label="Meetings" value={formatNumber(fundraisingStats.meetings)} />
      </div>

      <div className="accounting-summary-grid fundraising-summary-grid">
        {fundraisingData.summaries.map((summary) => (
          <article key={summary.currency} className="accounting-summary-card">
            <div>
              <span>{summary.currency}</span>
              <strong>
                {formatMinorMoney(
                  summary.targetRaiseMinor || summary.ticketSizeMaxMinor || summary.netCashMinor,
                  summary.currency,
                )}
              </strong>
            </div>
            <dl>
              <div>
                <dt>Target raise</dt>
                <dd>{formatMinorMoney(summary.targetRaiseMinor, summary.currency)}</dd>
              </div>
              <div>
                <dt>Target tickets</dt>
                <dd>
                  {formatMinorMoney(summary.ticketSizeMinMinor, summary.currency)} -{" "}
                  {formatMinorMoney(summary.ticketSizeMaxMinor, summary.currency)}
                </dd>
              </div>
              {accountingAccess.canView ? (
                <>
                  <div>
                    <dt>Retainers</dt>
                    <dd>{formatMinorMoney(summary.retainerIncomeMinor, summary.currency)}</dd>
                  </div>
                  <div>
                    <dt>Overdue</dt>
                    <dd className="retainer-overdue">{summary.overdueRetainerMinor ? formatMinorMoney(summary.overdueRetainerMinor, summary.currency) : "—"}</dd>
                  </div>
                  <div>
                    <dt>Outstanding</dt>
                    <dd>{formatMinorMoney(summary.outstandingMinor, summary.currency)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </article>
        ))}
        {fundraisingData.summaries.length === 0 ? (
          <article className="accounting-summary-card empty">
            <strong>No mandate totals yet.</strong>
            <span>Add client target raises or investor ticket sizes to populate currency summaries.</span>
          </article>
        ) : null}
        {!accountingAccess.canView ? (
          <article className="accounting-summary-card empty locked-inline-card">
            <strong>Finance figures restricted.</strong>
            <span>Client workflow is visible; retainers, commissions, expenses, and ledger totals require accounting access.</span>
          </article>
        ) : null}
      </div>
    </>
  );
}
