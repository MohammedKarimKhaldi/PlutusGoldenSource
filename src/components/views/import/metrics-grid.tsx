import { Metric, formatNumber } from "@/components/shared";

interface ImportSummary {
  rawRows: number;
  normalizedCompanies: number;
  normalizedPeople: number;
  suspiciousMerges: number;
}

export function MetricsGrid({ importSummary }: { importSummary: ImportSummary }) {
  return (
    <section className="metrics-grid" aria-label="Import and CRM summary">
      <Metric label="Raw contacts" value={formatNumber(importSummary.rawRows)} />
      <Metric label="Companies" value={formatNumber(importSummary.normalizedCompanies)} />
      <Metric label="People" value={formatNumber(importSummary.normalizedPeople)} />
      <Metric label="Review queue" value={formatNumber(importSummary.suspiciousMerges)} tone="warn" />
    </section>
  );
}
