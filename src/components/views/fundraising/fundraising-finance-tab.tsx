import { CreditCard } from "lucide-react";
import type { AccountingAccess, AccountingData, FundraisingClient } from "@/lib/types";
import { formatNumber } from "./fundraising-types";

type FundraisingFinanceTabProps = {
  filteredFundraisingClients: FundraisingClient[];
  accountingData: AccountingData | null;
  accountingAccess: AccountingAccess;
  companyNameById: Map<string, string>;
  onOpenAccounting: (companyId: string) => void;
};

export function FundraisingFinanceTab({
  filteredFundraisingClients, accountingData, accountingAccess,
  companyNameById, onOpenAccounting,
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
    </div>
  );
}
