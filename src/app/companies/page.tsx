import { CrmShell } from "@/components/crm-shell";
import { getDashboardData } from "@/lib/data";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const params = await searchParams;
  const data = await getDashboardData();
  return <CrmShell initialData={data} hideDetailPanel={true} authSuccess={params.auth === "success"} />;
}
