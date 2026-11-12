import { getBundle } from "@/lib/data";
import { loanSite } from "@/lib/labels";
import { byUrgency, countByStatus, scoreSummary } from "@/lib/view";
import type { Bundle } from "@/lib/types";
import Logo from "@/components/Logo";
import Landing from "@/components/landing/Landing";
import type { LandingData } from "@/components/landing/primitives";

export const dynamic = "force-dynamic";

const FALLBACK_STEPS = ["Load loans", "Extract covenants", "Pull Cortile signals", "Value comps", "Market trend", "News", "Recall corrections", "Forecast covenants", "Backtest score", "Draft memo", "Await analyst sign-off"];

function compsCited(b: Bundle): number {
  const n = b.evidence
    .filter((e) => ["rent_comp", "value_comp", "auction"].includes(e.kind))
    .reduce((s, e) => s + (typeof (e.source as { count?: unknown }).count === "number" ? ((e.source as { count: number }).count) : 0), 0);
  return n > 0 ? n : b.evidence.length;
}

export default async function Page() {
  const b = await getBundle();
  const counts = countByStatus(b.forecasts);
  const loanById = new Map(b.loans.map((l) => [l.id, l]));
  const tiles = byUrgency(b.forecasts, b.loans);
  const sc = scoreSummary(b);

  const data: LandingData = {
    board: tiles.slice(0, 5).map((f) => {
      const l = loanById.get(f.loan_id);
      const icr = f.metrics.icr;
      return { id: f.loan_id, site: l ? loanSite(l) : f.loan_id, status: f.status, icr: icr?.now ?? null, limit: icr?.limit ?? null, m6: icr?.m6?.mid ?? null };
    }),
    counts,
    loans: b.loans.length,
    signals: b.signals.length,
    comps: compsCited(b),
    atRisk: counts.red + counts.amber,
    sectors: new Set(b.loans.map((l) => l.sector)).size,
    score: sc,
    steps: b.steps.length ? b.steps.map((s) => ({ step: s.step, status: s.status })) : FALLBACK_STEPS.map((s) => ({ step: s, status: "" })),
    live: b.steps.length > 0,
  };

  return <Landing data={data} logo={<Logo size={28} />} />;
}
