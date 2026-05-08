import { CrmShell } from "@/components/crm-shell";
import type { ActiveView } from "@/components/crm-shell";
import { getDashboardData } from "@/lib/data";

const ACTIVE_VIEWS: ActiveView[] = ["companies", "people", "tags", "pipeline", "tasks", "import"];

function activeViewFromParam(value?: string): ActiveView {
  return ACTIVE_VIEWS.includes(value as ActiveView) ? (value as ActiveView) : "companies";
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ auth?: string; view?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardData();
  return <CrmShell initialData={data} hideDetailPanel={true} authSuccess={params.auth === "success"} activeView={activeViewFromParam(params.view)} />;
}
