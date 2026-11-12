import type { Bundle, Forecast, Loan, MetricKey, Score, Status } from "./types";
import { STATUS_RANK, pp } from "./calc";

export function scoreSummary(b: Bundle): { caught: number; missed: number; falseAlarms: number; total: number } | null {
  const s: Score | null = b.scoreRun?.score ?? b.run.score;
  if (!s) return null;
  const caught = typeof s.caught === "number" ? s.caught : 0;
  const missed = typeof s.missed === "number" ? s.missed : 0;
  const fa = typeof s.false_alarms === "number" ? s.false_alarms : 0;
  return { caught, missed, falseAlarms: fa, total: caught + missed };
}

export function countByStatus(forecasts: Forecast[]): Record<Status, number> {
  const c: Record<Status, number> = { red: 0, amber: 0, green: 0 };
  forecasts.forEach((f) => c[f.status]++);
  return c;
}

/** Headroom to the covenant limit, in the metric's own unit. Positive = safe, negative = breached. */
export function headroom(k: MetricKey, value: number | null | undefined, limit: number | null | undefined): number | null {
  const v = pp(k, value), l = pp(k, limit);
  if (v == null || l == null) return null;
  return k === "ltv" ? l - v : v - l;
}

export function fmtHeadroom(k: MetricKey, h: number | null): string {
  if (h == null) return "–";
  const sign = h < 0 ? "−" : "+";
  const a = Math.abs(h);
  return k === "icr" ? `${sign}${a.toFixed(2)}x` : `${sign}${a.toFixed(1)} pts`;
}

export function byUrgency(forecasts: Forecast[], loans: Loan[]): Forecast[] {
  const name = new Map(loans.map((l) => [l.id, l.name]));
  return [...forecasts].sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      (a.breach_month ?? "9").localeCompare(b.breach_month ?? "9") ||
      (name.get(a.loan_id) ?? "").localeCompare(name.get(b.loan_id) ?? ""),
  );
}

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
