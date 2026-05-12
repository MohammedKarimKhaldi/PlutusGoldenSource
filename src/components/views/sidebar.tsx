import { Building2, CircleDot, CreditCard, FileSpreadsheet, Handshake, ListChecks, Tags, UsersRound } from "lucide-react";
import clsx from "clsx";
import { NavButton } from "@/components/shared";
import type { ActiveView } from "@/components/crm-shell";

export function Sidebar({
  activeView,
  setActiveView,
  isSignedIn,
  authLabel,
  authDetail,
}: {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  isSignedIn: boolean;
  authLabel: string;
  authDetail: string;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark">GS</span>
        <div>
          <strong>Golden Source</strong>
          <span>Outreach CRM</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Primary">
        <NavButton active={activeView === "companies"} icon={<Building2 size={18} />} label="Companies" onClick={() => setActiveView("companies")} />
        <NavButton active={activeView === "people"} icon={<UsersRound size={18} />} label="People" onClick={() => setActiveView("people")} />
        <NavButton active={activeView === "tags"} icon={<Tags size={18} />} label="Tags" onClick={() => setActiveView("tags")} />
        <NavButton active={activeView === "pipeline"} icon={<CircleDot size={18} />} label="Pipeline" onClick={() => setActiveView("pipeline")} />
        <NavButton active={activeView === "clients"} icon={<Handshake size={18} />} label="Fundraising clients" onClick={() => setActiveView("clients")} />
        <NavButton active={activeView === "tasks"} icon={<ListChecks size={18} />} label="Tasks" onClick={() => setActiveView("tasks")} />
        <NavButton active={activeView === "import"} icon={<FileSpreadsheet size={18} />} label="Import Admin" onClick={() => setActiveView("import")} />
        <NavButton active={activeView === "accounting"} icon={<CreditCard size={18} />} label="Accounting" onClick={() => setActiveView("accounting")} />
      </nav>
      <div className="sidebar-footer">
        <span className={clsx("mode-dot", isSignedIn ? "signed-in" : "signed-out")} />
        <div>
          <strong>{authLabel}</strong>
          <span>{authDetail}</span>
        </div>
      </div>
    </aside>
  );
}
