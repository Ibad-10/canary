import type { Forecast, Loan, Metric, MetricKey, Status } from "./types";

import { METRIC_NAME, STATUS_NAME, SIGNAL_NAME, EVIDENCE_NAME } from "./labels";

export const METRIC_LABEL: Record<MetricKey, string> = METRIC_NAME;
export const METRICS: MetricKey[] = ["icr", "ltv", "occupancy"];
/** icr/occupancy breach when they fall below the limit; ltv when it rises above. */
export const BAD_DIR: Record<MetricKey, "below" | "above"> = { icr: "below", ltv: "above", occupancy: "below" };

/** LTV and occupancy may arrive as fractions (0.66) or percentage points (66). Normalise to percentage points. */
export function pp(metric: MetricKey, v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  if (metric === "icr") return v;
  return v <= 1.5 ? v * 100 : v;
}
export function fmt(metric: MetricKey, v: number | null | undefined): string {
  const n = pp(metric, v);
  if (n == null) return "–";
  return metric === "icr" ? `${n.toFixed(2)}x` : `${n.toFixed(n % 1 ? 1 : 0)}%`;
}
export const fmtCov = (metric: MetricKey, v?: number | null) => (v == null ? "–" : fmt(metric, v));

export function gbp(n: number | null | undefined, dp = 1): string {
  if (n == null) return "–";
  if (Math.abs(n) >= 1e6) return `£${(n / 1e6).toFixed(dp)}m`;
  if (Math.abs(n) >= 1e3) return `£${Math.round(n / 1e3)}k`;
  return `£${n.toFixed(0)}`;
}

export const STATUS_LABEL: Record<Status, string> = STATUS_NAME;
export const STATUS_RANK: Record<Status, number> = { red: 0, amber: 1, green: 2 };

export function monthName(iso: string | null | undefined, long = true): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: long ? "long" : "short", year: long ? undefined : "numeric", timeZone: "UTC" });
}
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso.slice(0, 10) + "T00:00:00Z");
  const b = new Date(toIso.slice(0, 10) + "T00:00:00Z");
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

export function headline(f: Forecast, asOf?: string): string {
  const m = f.breach_metric as MetricKey | null;
  const when = monthName(f.breach_month);
  if (f.status === "red" && m && when) {
    if (asOf && f.breach_month && monthsBetween(asOf, f.breach_month) <= 0) {
      if (m === "icr") return "Rent already falls short of the interest cover the loan needs.";
      if (m === "ltv") return "Loan-to-value is already above its limit.";
      return "Occupancy is already below its limit.";
    }
    if (m === "icr") return `Rent may stop covering interest by ${when}.`;
    if (m === "ltv") return `Loan may outgrow its property value limit by ${when}.`;
    return `Occupancy may fall below its limit by ${when}.`;
  }
  if (f.status === "amber") {
    const trapped = METRICS.find((k) => nearTrap(f.metrics[k], k));
    if (trapped === "icr") return "Rent cover is heading for its cash-trap level.";
    if (trapped === "ltv") return "Loan-to-value is heading for its cash-trap level.";
    if (trapped === "occupancy") return "Occupancy is heading for its cash-trap level.";
    return "This loan is getting close to a limit.";
  }
  return "No covenant breach forecast in the next six months.";
}

function nearTrap(m: Metric | undefined, k: MetricKey): boolean {
  if (!m || m.cash_trap == null) return false;
  const vals = [m.now, m.m3?.mid, m.m6?.mid].filter((x): x is number => x != null);
  return vals.some((v) => (BAD_DIR[k] === "below" ? v <= m.cash_trap! : v >= m.cash_trap!));
}

export function detailLine(f: Forecast): string {
  const m = (f.breach_metric as MetricKey | null) ?? METRICS.find((k) => nearTrap(f.metrics[k], k)) ?? "icr";
  const met = f.metrics[m];
  if (!met) return "";
  const v6 = fmt(m, met.m6?.mid);
  const lim = fmtCov(m, met.limit);
  if (m === "icr") return `On today's trend, rent covers interest ${v6.replace("x", "")} times by the sixth month. The loan agreement needs at least ${lim.replace("x", "")} times.`;
  if (m === "ltv") return `On today's trend, loan-to-value reaches ${v6} by the sixth month. The loan agreement allows at most ${lim}.`;
  return `On today's trend, occupancy falls to ${v6} by the sixth month. The loan agreement needs at least ${lim}.`;
}

/* ---------- stress ---------- */
export type StressedRow = { loan_id: string; status: Status; icr6: number | null; ltv6: number | null; icrNow: number | null; ltvNow: number | null };

export function worse(a: Status, b: Status): Status {
  return STATUS_RANK[a] <= STATUS_RANK[b] ? a : b;
}

/** Approximate client-side stress: ICR scales by rate/(rate+bps), LTV by 1/(1-value_pct). */
export function stressLocal(loan: Loan, f: Forecast, rateBps: number, valuePct: number): StressedRow {
  const rate = loan.rate_pct || 6;
  const kIcr = rate / (rate + rateBps / 100);
  const kLtv = 1 / (1 - Math.min(0.9, Math.abs(valuePct) / 100));
  const icr = f.metrics.icr, ltv = f.metrics.ltv, occ = f.metrics.occupancy;
  const icrNow = icr ? icr.now * kIcr : null;
  const icr6 = icr ? icr.m6.mid * kIcr : null;
  const icr3 = icr ? icr.m3.mid * kIcr : null;
  const ltvNowPP = ltv ? pp("ltv", ltv.now)! * kLtv : null;
  const ltv6PP = ltv ? pp("ltv", ltv.m6.mid)! * kLtv : null;
  const ltv3PP = ltv ? pp("ltv", ltv.m3.mid)! * kLtv : null;
  let st: Status = "green";
  const chk = (k: MetricKey, vals: (number | null)[], m?: Metric) => {
    if (!m) return;
    const lim = pp(k, m.limit), trap = pp(k, m.cash_trap);
    for (const v of vals) {
      if (v == null) continue;
      const bad = BAD_DIR[k] === "below";
      if (lim != null && (bad ? v < lim : v > lim)) st = "red";
      else if (trap != null && st !== "red" && (bad ? v <= trap : v >= trap)) st = "amber";
    }
  };
  chk("icr", [icrNow, icr3, icr6], icr);
  chk("ltv", [ltvNowPP, ltv3PP, ltv6PP], ltv);
  chk("occupancy", [pp("occupancy", occ?.now), pp("occupancy", occ?.m3?.mid), pp("occupancy", occ?.m6?.mid)], occ);
  const status = rateBps || valuePct ? worse(f.status, st) : f.status;
  return { loan_id: loan.id, status, icr6, ltv6: ltv6PP, icrNow, ltvNow: ltvNowPP };
}

/* ---------- labels shared by graph + evidence ---------- */
export const KIND_LABEL: Record<string, string> = SIGNAL_NAME;
export const EV_LABEL: Record<string, string> = EVIDENCE_NAME;

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function valueUnit(value: number | null | undefined, unit: string | null | undefined): string {
  if (value == null) return "–";
  const u = unit ?? "";
  if (/^gbp$/i.test(u)) return gbp(value, 1);
  const n = Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 2 : 1);
  return `${n}${u === "x" || u === "%" ? u : " " + u}`.trim();
}

export function sourceLabel(source: Record<string, unknown> | null | undefined, label?: string): { text: string; kind: "db" | "list" | "url" | "doc" | "msci" } {
  const s = (source ?? {}) as Record<string, unknown>;
  const n = (k: string) => (Array.isArray(s[k]) ? (s[k] as unknown[]).length : 0);
  if (label === "MSCI RCA" || s.label === "MSCI RCA") return { text: "MSCI RCA", kind: "msci" };
  if (s.dataset === "cortile") return { text: `Cortile · ${s.table ?? "data"} · ${n("row_ids")} row${n("row_ids") === 1 ? "" : "s"}`, kind: "db" };
  if (s.dataset === "listings") {
    if (n("listing_ids")) return { text: `Listings · ${n("listing_ids")} listing${n("listing_ids") === 1 ? "" : "s"}`, kind: "list" };
    return { text: `Auction results · ${n("result_ids")}`, kind: "list" };
  }
  if (s.dataset === "contract") return { text: `Loan agreement · p.${s.page ?? "?"} cl.${s.clause ?? "?"}`, kind: "doc" };
  if (typeof s.url === "string") { try { return { text: new URL(s.url).hostname.replace(/^www\./, ""), kind: "url" }; } catch { return { text: s.url, kind: "url" }; } }
  return { text: label || "Source", kind: "doc" };
}
