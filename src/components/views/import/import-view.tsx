import { FileSpreadsheet, Flag, Upload } from "lucide-react";
import { Metric, formatNumber } from "@/components/shared";

export function ImportView({
  importSummary,
}: {
  importSummary: { rawRows: number; normalizedCompanies: number; unmatchedRows: number; suspiciousMerges: number };
}) {
  return (
    <section className="view-surface import-view">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Import admin</p>
          <h2>XLSX seed and cleanup queue</h2>
        </div>
        <button type="button" className="primary-button">
          <Upload size={16} /> Upload workbook
        </button>
      </div>
      <div className="import-grid">
        <Metric label="Workbook rows" value={formatNumber(importSummary.rawRows)} />
        <Metric label="Normalized companies" value={formatNumber(importSummary.normalizedCompanies)} />
        <Metric label="Unmatched rows" value={formatNumber(importSummary.unmatchedRows)} tone="warn" />
        <Metric label="Suspicious merges" value={formatNumber(importSummary.suspiciousMerges)} tone="warn" />
      </div>
      <div className="cleanup-panel">
        <div>
          <h2>Cleanup signals</h2>
          <p>Duplicate headers, corporate-domain merges, personal email domains, and low-confidence records remain traceable through raw import and merge audit rows.</p>
        </div>
        <div className="admin-actions">
          <button type="button">
            <FileSpreadsheet size={16} /> Current workbook: 18,623 rows
          </button>
          <button type="button">
            <Flag size={16} /> {formatNumber(importSummary.unmatchedRows)} unmatched
          </button>
        </div>
      </div>
    </section>
  );
}
