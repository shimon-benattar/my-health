import DashboardClient from "@/components/dashboard/DashboardClient";

export const dynamic = "force-dynamic";
export default function DashboardPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const initialTab = searchParams?.tab === "sport" ? "sport" : "overview";
  return (
    <DashboardClient initialTab={initialTab} />
  );
}
