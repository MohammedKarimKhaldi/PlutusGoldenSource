import { CrmShell } from "@/components/crm-shell";
import { getDashboardData } from "@/lib/data";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getDashboardData();
  return <CrmShell initialData={data} companyId={id} hideTable />;
}
