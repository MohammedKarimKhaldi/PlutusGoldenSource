import { CrmShell } from "@/components/crm-shell";
import { getDashboardData } from "@/lib/data";

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ client?: string }>;
}) {
  const { id } = await params;
  const { client } = await searchParams;
  const data = await getDashboardData();
  return <CrmShell initialData={data} companyId={id} fundraisingClientId={client} hideTable />;
}
