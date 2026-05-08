import Link from "next/link";
import { Building2, CircleDot, FileSpreadsheet, ListChecks, Tags, UsersRound } from "lucide-react";

import { getDashboardData } from "@/lib/data";

const menuItems = [
  {
    href: "/companies?view=companies",
    label: "Companies",
    icon: Building2,
    metric: "companies" as const,
  },
  {
    href: "/companies?view=people",
    label: "People",
    icon: UsersRound,
    metric: "people" as const,
  },
  {
    href: "/companies?view=tags",
    label: "Tags",
    icon: Tags,
    metric: "tags" as const,
  },
  {
    href: "/companies?view=pipeline",
    label: "Pipeline",
    icon: CircleDot,
    metric: "pipeline" as const,
  },
  {
    href: "/companies?view=tasks",
    label: "Tasks",
    icon: ListChecks,
    metric: "tasks" as const,
  },
  {
    href: "/companies?view=import",
    label: "Import Admin",
    icon: FileSpreadsheet,
    metric: "import" as const,
  },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function Home() {
  const data = await getDashboardData();
  const metrics = {
    companies: data.companies.length || data.importSummary.normalizedCompanies,
    people: data.importSummary.normalizedPeople,
    tags: data.tags.length,
    pipeline: data.companies.filter((company) => company.outreachStage !== "Closed").length,
    tasks: data.tasks.length,
    import: data.importSummary.rawRows || data.importSummary.totalRows,
  };

  return (
    <main className="main-menu-page">
      <section className="main-menu-shell" aria-labelledby="main-menu-title">
        <header className="main-menu-header">
          <div>
            <p className="eyebrow">Golden Source CRM</p>
            <h1 id="main-menu-title">Main menu</h1>
          </div>
          <Link className="primary-button" href="/companies?view=companies">
            <Building2 size={16} />
            Open CRM
          </Link>
        </header>

        <div className="main-menu-grid">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} className="main-menu-item" href={item.href}>
                <span className="main-menu-icon">
                  <Icon size={20} />
                </span>
                <span className="main-menu-copy">
                  <strong>{item.label}</strong>
                  <span>{formatNumber(metrics[item.metric])}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
