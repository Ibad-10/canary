import { FlaskConical } from "lucide-react";
import { getBundle } from "@/lib/data";
import HelpButton from "@/components/HelpButton";
import { loanSite, shortDate } from "@/lib/labels";
import { byUrgency } from "@/lib/view";
import DeskSidebar from "@/components/DeskSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

const SOURCE: Record<string, string> = { supabase: "Live database", files: "Engine output", fixture: "Sample data", demo: "Real run, anonymised" };

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const b = await getBundle();
  const memo = b.drafts.find((d) => d.kind === "memo" && d.loan_id == null) ?? b.drafts.find((d) => d.kind === "memo");
  const waiting = !!memo && memo.status === "draft";
  const byId = new Map(b.loans.map((l) => [l.id, l]));
  const loans = byUrgency(b.forecasts, b.loans).map((f) => ({ id: f.loan_id, title: byId.get(f.loan_id) ? loanSite(byId.get(f.loan_id)!) : f.loan_id, status: f.status }));
  return (
    <SidebarProvider>
      <DeskSidebar loans={loans} memoWaiting={waiting} />
      <SidebarInset className="bg-page min-w-0">
        <header className="h-14 shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-line bg-page/85 backdrop-blur sticky top-0 z-30">
          <SidebarTrigger aria-label="Toggle navigation" />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-[13px] text-sub">Checked {shortDate(b.run.as_of)}</span>
          <span className={`pill ${b.source === "fixture" ? "p-gold" : "p-neutral"}`} title={b.source === "demo" ? "A real Canary run with names, addresses and source ids replaced, and licensed market data removed. Read-only." : "Where this screen reads its data from"}>
            <FlaskConical className="w-3 h-3" aria-hidden="true" />{SOURCE[b.source] ?? b.source}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <HelpButton />
            <span className="text-[12px] text-sub hidden sm:inline">Signing as Ibad Zuberi</span>
          </div>
        </header>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 btn btn-dark z-50">Skip to content</a>
        <main id="main" className="flex-1 px-4 md:px-8 py-8 w-full max-w-[1240px] mx-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
