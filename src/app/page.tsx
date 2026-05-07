import { CrmShell } from "@/components/crm-shell";
import { getDashboardData } from "@/lib/data";

export default async function Home() {
  const data = await getDashboardData();

  return <CrmShell initialData={data} />;
}
