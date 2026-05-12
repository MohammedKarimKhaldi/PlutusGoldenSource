import { Upload } from "lucide-react";
import { formatNumber } from "@/components/shared";
import type { EnrichmentBatchProgress } from "@/components/shared";

export function BatchProgressPanel({
  batchProgress,
  isBatchEnriching,
  pendingEnrichmentCount,
  pushPendingEnrichments,
  isPushingChanges,
}: {
  batchProgress: EnrichmentBatchProgress | null;
  isBatchEnriching: boolean;
  pendingEnrichmentCount: number;
  pushPendingEnrichments: () => void;
  isPushingChanges: boolean;
}) {
  if (!batchProgress) return null;
  const batchProgressProcessed = batchProgress.completed + batchProgress.skipped + batchProgress.failed;
  return (
    <div className="batch-progress-panel" aria-live="polite">
      <div>
        <strong>{batchProgress.stopped ? "Batch stopped" : isBatchEnriching ? "Batch enriching" : "Batch complete"}</strong>
        <span>
          {formatNumber(batchProgress.completed)} queued
          {batchProgress.skipped ? `, ${formatNumber(batchProgress.skipped)} skipped` : ""}
          {batchProgress.failed ? `, ${formatNumber(batchProgress.failed)} failed` : ""}
          {" "}of {formatNumber(batchProgress.total)}
          {batchProgress.currentName ? ` • ${batchProgress.currentName}` : ""}
        </span>
      </div>
      <progress value={batchProgressProcessed} max={batchProgress.total} />
      {!isBatchEnriching && pendingEnrichmentCount > 0 ? (
        <button type="button" className="secondary-button" onClick={pushPendingEnrichments} disabled={isPushingChanges}>
          <Upload size={15} /> {isPushingChanges ? "Pushing..." : `Push ${formatNumber(pendingEnrichmentCount)} enrichment${pendingEnrichmentCount === 1 ? "" : "s"}`}
        </button>
      ) : null}
    </div>
  );
}
