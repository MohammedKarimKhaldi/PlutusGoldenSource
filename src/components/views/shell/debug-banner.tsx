import { FlaskConical } from "lucide-react";

export function DebugBanner({ debugMode, debugStorageIssue }: { debugMode: boolean; debugStorageIssue: string | null }) {
  if (!debugMode) return null;
  return (
    <div className="debug-banner" aria-live="polite">
      <FlaskConical size={16} />
      <span>
        {debugStorageIssue ?? "Debug mode is on. Edits and queued changes are saved in this browser until you push them to the database."}
      </span>
    </div>
  );
}
