import DashboardClient from "@/components/dashboard/DashboardClient";
import DashboardClientV0 from "@/components/dashboard/DashboardClientV0";

export const dynamic = "force-dynamic";
export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { tab?: string; version?: string };
}) {
  const initialTab = searchParams?.tab === "sport" ? "sport" : "overview";
  const version = searchParams?.version === "v0" ? "v0" : "v1";

  if (version === "v0") {
    return <DashboardClientV0 initialTab={initialTab} />;
  }

  return <DashboardClient initialTab={initialTab} />;
}
