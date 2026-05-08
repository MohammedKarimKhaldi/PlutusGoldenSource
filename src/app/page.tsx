import Link from "next/link";
import { Building2, CircleDot, FileSpreadsheet, ListChecks, Tags, UsersRound } from "lucide-react";

const menuItems = [
  {
    href: "/companies?view=companies",
    label: "Companies",
    icon: Building2,
    tone: "blue",
  },
  {
    href: "/companies?view=people",
    label: "People",
    icon: UsersRound,
    tone: "teal",
  },
  {
    href: "/companies?view=tags",
    label: "Tags",
    icon: Tags,
    tone: "violet",
  },
  {
    href: "/companies?view=pipeline",
    label: "Pipeline",
    icon: CircleDot,
    tone: "green",
  },
  {
    href: "/companies?view=tasks",
    label: "Tasks",
    icon: ListChecks,
    tone: "amber",
  },
  {
    href: "/companies?view=import",
    label: "Import Admin",
    icon: FileSpreadsheet,
    tone: "slate",
  },
];

export default function Home() {
  return (
    <main className="main-menu-page">
      <section className="main-menu-shell" aria-labelledby="main-menu-title">
        <header className="main-menu-header">
          <Link className="main-menu-brand" href="/companies?view=companies" aria-label="Open Golden Source CRM companies">
            <span>GS</span>
            <strong>Golden Source CRM</strong>
          </Link>
          <div className="main-menu-title">
            <h1 id="main-menu-title">Main menu</h1>
          </div>
        </header>

        <div className="main-menu-grid">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} className={`main-menu-item ${item.tone}`} href={item.href}>
                <span className="main-menu-icon">
                  <Icon size={20} />
                </span>
                <strong>{item.label}</strong>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
