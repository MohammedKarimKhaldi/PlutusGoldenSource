import { Upload } from "lucide-react";
import { formatChangeCount } from "@/components/shared";

export function SyncDock({
  pendingChanges,
  syncMessage,
  debugMode,
  isPushingChanges,
  pushPendingChanges,
}: {
  pendingChanges: { length: number };
  syncMessage: string | null;
  debugMode: boolean;
  isPushingChanges: boolean;
  pushPendingChanges: () => void;
}) {
  if (pendingChanges.length > 0) {
    return (
      <div className="sync-dock" aria-live="polite">
        <div>
          <strong>{formatChangeCount(pendingChanges.length)}</strong>
          <span>{syncMessage ?? (debugMode ? "Debug draft changes are stored locally until you push them to the database." : "Changes are stored locally until you push them.")}</span>
        </div>
        <button type="button" className="primary-button" onClick={pushPendingChanges} disabled={isPushingChanges}>
          <Upload size={16} /> {isPushingChanges ? "Pushing..." : debugMode ? "Push to database" : "Push changes"}
        </button>
      </div>
    );
  }

  if (syncMessage) {
    return (
      <div className="sync-dock complete" aria-live="polite">
        <div>
          <strong>All changes pushed</strong>
          <span>{syncMessage}</span>
        </div>
      </div>
    );
  }

  return null;
}
