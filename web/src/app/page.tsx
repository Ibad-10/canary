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
    exposure: {
      flagged: tiles.filter((f) => f.status !== "green").reduce((s, f) => s + (loanById.get(f.loan_id)?.amount_gbp ?? 0), 0),
      total: b.loans.reduce((s, l) => s + (l.amount_gbp ?? 0), 0),
    },
    cases: tiles.filter((f) => f.status !== "green").slice(0, 3).map((f) => {
      const l = loanById.get(f.loan_id);
      const metric = f.breach_metric === "ltv" ? "ltv" : "icr";
      const m = f.metrics[metric];
      return {
        id: f.loan_id,
        name: l?.name ?? f.loan_id,
        status: f.status,
        amount: l?.amount_gbp ?? 0,
        ratePct: l?.rate_pct ?? 0,
        metric,
        now: m?.now ?? null,
        limit: m?.limit ?? null,
        m6: m?.m6?.mid ?? null,
        breachMonth: f.breach_month,
        drivers: f.drivers.slice(0, 2).map((d) => ({ label: d.label.replace(/\s*\(ILLUSTRATIVE\)\s*/i, ""), effect: d.effect_text })),
      };
    }),
  };

  return <Landing data={data} logo={<Logo size={28} />} />;
}
