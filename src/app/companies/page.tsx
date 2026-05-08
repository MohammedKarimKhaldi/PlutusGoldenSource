import { CrmShell } from "@/components/crm-shell";
import { getDashboardData } from "@/lib/data";

export default async function CompaniesPage() {
  const data = await getDashboardData();
  return <CrmShell initialData={data} hideDetailPanel={true} />;
}
