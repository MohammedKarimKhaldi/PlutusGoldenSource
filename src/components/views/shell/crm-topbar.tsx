import { FlaskConical, Trash2, Upload, UserRound } from "lucide-react";
import clsx from "clsx";
import { signOut } from "@/app/actions";
import type { ActiveView } from "@/components/crm-shell";

const VIEW_TITLES: Record<ActiveView, string> = {
  companies: "Company golden source",
  people: "People directory",
  tags: "Tag manager",
  pipeline: "Outreach pipeline",
  clients: "Fundraising clients",
  tasks: "Tasks and next steps",
  import: "Import admin",
  accounting: "Accounting and payments",
};

export function CrmTopbar({
  activeView,
  debugMode,
  toggleDebugMode,
  resetDebugDraft,
  isSignedIn,
  currentUserName,
}: {
  activeView: ActiveView;
  debugMode: boolean;
  toggleDebugMode: () => void;
  resetDebugDraft: () => void;
  isSignedIn: boolean;
  currentUserName: string | null;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Private team workspace</p>
        <h1>{VIEW_TITLES[activeView]}</h1>
      </div>
      <div className="topbar-actions">
        <button type="button" className={clsx("secondary-button", debugMode && "debug-toggle-active")} onClick={toggleDebugMode}>
          <FlaskConical size={16} /> {debugMode ? "Debug on" : "Debug off"}
        </button>
        {debugMode ? (
          <button type="button" className="secondary-button" onClick={resetDebugDraft}>
            <Trash2 size={16} /> Reset draft
          </button>
        ) : null}
        {isSignedIn ? (
          <div className="auth-status" aria-label={`Signed in as ${currentUserName}`}>
            <span>
              <UserRound size={16} /> {currentUserName}
            </span>
            <form action={signOut}>
              <button className="secondary-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <a className="secondary-button" href="/login">
            <UserRound size={16} /> Sign in
          </a>
        )}
        <button className="primary-button" type="button">
          <Upload size={16} /> Import XLSX
        </button>
      </div>
    </header>
  );
}
