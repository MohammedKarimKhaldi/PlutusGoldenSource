import { CreditCard, FileText } from "lucide-react";
import type { AccountingAccess, AccountingData, FundraisingClient } from "@/lib/types";
import type { FundraisingRetainerPeriod } from "./fundraising-types";
import { formatDate, formatMinorMoney, formatNumber, RETENTION_PERIOD_STATUS_COLORS, RETENTION_PERIOD_STATUS_LABELS } from "./fundraising-types";

type FundraisingFinanceTabProps = {
  filteredFundraisingClients: FundraisingClient[];
  retainerPeriods: FundraisingRetainerPeriod[];
  accountingData: AccountingData | null;
  accountingAccess: AccountingAccess;
  companyNameById: Map<string, string>;
  onOpenAccounting: (companyId: string) => void;
  onGenerateInvoice: (period: FundraisingRetainerPeriod) => void;
};

export function FundraisingFinanceTab({
  filteredFundraisingClients, retainerPeriods, accountingData, accountingAccess,
  companyNameById, onOpenAccounting, onGenerateInvoice,
}: FundraisingFinanceTabProps) {
  if (!accountingAccess.canView) {
    return (
      <div className="locked-panel">
        <CreditCard size={24} />
        <div>
          <strong>Finance details are restricted.</strong>
          <span>Your account can use the client dashboard, but retainers, commissions, expenses, and ledger movements require accounting access.</span>
        </div>
      </div>
    );
  }

  const clientIdSet = new Set(filteredFundraisingClients.map((c) => c.id));
  const visiblePeriods = retainerPeriods.filter((period) => clientIdSet.has(period.clientId));

  if (visiblePeriods.length === 0) {
    return (
      <div className="accounting-table-wrap fundraising-finance-table">
        <table className="accounting-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Documents</th>
              <th>Ledger</th>
              <th>Open items</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredFundraisingClients.map((client) => {
              const documents = accountingData?.documents.filter((doc) => doc.companyId === client.companyId) ?? [];
              const ledgerEntries = accountingData?.ledgerEntries.filter((entry) => entry.companyId === client.companyId) ?? [];
              const openDocuments = documents.filter(
                (doc) => doc.status !== "paid" && doc.status !== "void" && !doc.voidedAt,
              );
              return (
                <tr key={client.id}>
                  <td>
                    <strong>{client.mandateName}</strong>
                    <span>{companyNameById.get(client.companyId) ?? "Unknown company"}</span>
                  </td>
                  <td>{formatNumber(documents.length)}</td>
                  <td>{formatNumber(ledgerEntries.length)}</td>
                  <td>{formatNumber(openDocuments.length)}</td>
                  <td>
                    <button
                      type="button" className="text-button compact"
                      onClick={() => onOpenAccounting(client.companyId)}
                    >
                      Open accounting
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredFundraisingClients.length === 0 ? (
          <p className="empty-state">No client finance rows match these filters.</p>
        ) : null}
        {filteredFundraisingClients.length > 0 ? (
          <p className="empty-state" style={{ marginTop: 8 }}>No retainer periods yet. Set a retainer schedule on a signed client to track payments.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="accounting-table-wrap fundraising-finance-table">
      <table className="accounting-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Period</th>
            <th>Expected</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visiblePeriods.map((period) => {
            const client = filteredFundraisingClients.find((c) => c.id === period.clientId);
            const companyName = client ? companyNameById.get(client.companyId) ?? "" : "";
            return (
              <tr key={period.id}>
                <td>
                  <strong>{client?.mandateName ?? "Unknown"}</strong>
                  <span>{companyName}</span>
                </td>
                <td>{formatDate(period.periodDate)}</td>
                <td>{formatMinorMoney(period.expectedAmountMinor, period.currency)}</td>
                <td>
                  <span
                    className="retainer-period-status"
                    style={{ backgroundColor: RETENTION_PERIOD_STATUS_COLORS[period.status] + "18", color: RETENTION_PERIOD_STATUS_COLORS[period.status] }}
                  >
                    {RETENTION_PERIOD_STATUS_LABELS[period.status]}
                  </span>
                </td>
                <td>
                  {period.status === "pending" || period.status === "overdue" ? (
                    <button type="button" className="text-button compact" onClick={() => onGenerateInvoice(period)}>
                      <FileText size={13} /> Generate invoice
                    </button>
                  ) : null}
                  <button
                    type="button" className="text-button compact"
                    onClick={() => client && onOpenAccounting(client.companyId)}
                    style={{ marginLeft: 8 }}
                  >
                    Accounting
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
