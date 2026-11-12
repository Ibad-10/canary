import { getBundle } from "@/lib/data";
import type { Status } from "@/lib/types";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const b = await getBundle();
  const initial: Status | "all" = status === "red" || status === "amber" || status === "green" ? status : "all";
  return (
    <>
      <h1 className="serif text-[40px] leading-[44px]">Dashboard</h1>
      <p className="text-[14px] text-sub mt-1 mb-6">Filter the portfolio, compare headroom, and click any loan to open its deep dive.</p>
      <DashboardClient loans={b.loans} forecasts={b.forecasts} initialStatus={initial} />
    </>
  );
}
