"use client";
import { useState } from "react";
import type { Forecast, MetricKey, Status } from "@/lib/types";
import { METRICS, METRIC_LABEL, fmt, monthName, monthsBetween, pp } from "@/lib/calc";
import { breachWord } from "@/lib/labels";

const COL: Record<Status, string> = { red: "#D92D20", amber: "#F79009", green: "#17B26A" };
const W = 760, H = 290, PL = 52, PR = 96, PT = 16, PB = 32;

function addMonths(iso: string, n: number) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export default function CovenantChart({ forecast, asOf }: { forecast: Forecast; asOf: string }) {
  const avail = METRICS.filter((k) => forecast.metrics[k]);
  const [k, setK] = useState<MetricKey>((forecast.breach_metric as MetricKey) && avail.includes(forecast.breach_metric as MetricKey) ? (forecast.breach_metric as MetricKey) : avail[0]);
  const m = forecast.metrics[k];
  if (!m) return null;
  const v = (x: number | null | undefined) => pp(k, x);
  const hist = (m.series ?? [])
    .map((p) => ({ x: monthsBetween(asOf, p.month), y: v(p.value)! }))
    .filter((p) => p.x <= 0 && p.y != null);
  const now = v(m.now)!;
  const fpts = [
    { x: 0, lo: now, mid: now, hi: now },
    { x: 3, lo: v(m.m3.lo)!, mid: v(m.m3.mid)!, hi: v(m.m3.hi)! },
    { x: 6, lo: v(m.m6.lo)!, mid: v(m.m6.mid)!, hi: v(m.m6.hi)! },
  ];
  const limit = v(m.limit), trap = v(m.cash_trap);
  const all = [...hist.map((p) => p.y), ...fpts.flatMap((p) => [p.lo, p.hi]), ...(limit != null ? [limit] : []), ...(trap != null ? [trap] : [])];
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo || 1) * 0.15; lo -= pad; hi += pad;
  const x0 = Math.min(-11, ...hist.map((p) => p.x));
  const X = (x: number) => PL + ((x - x0) / (6 - x0)) * (W - PL - PR);
  const Y = (y: number) => PT + (1 - (y - lo) / (hi - lo)) * (H - PT - PB);
  const tick = (y: number) => (k === "icr" ? `${y.toFixed(2)}x` : `${y.toFixed(0)}%`);
  const col = COL[forecast.status];
  const line = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const bandPath = `${fpts.map((p, i) => `${i ? "L" : "M"}${X(p.x)},${Y(p.hi)}`).join(" ")} ${[...fpts].reverse().map((p) => `L${X(p.x)},${Y(p.lo)}`).join(" ")} Z`;
  const yTicks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  const step = 6 - x0 > 20 ? 6 : 3;
  const xTicks: number[] = []; for (let x = 6; x >= x0; x -= step) xTicks.push(x);
  const breachX = forecast.breach_metric === k && forecast.breach_month ? monthsBetween(asOf, forecast.breach_month) : null;

  return (
    <div>
      <div className="flex items-center gap-1 px-4 pt-3" role="tablist" aria-label="Covenant metric">
        {avail.map((a) => (
          <button key={a} role="tab" aria-selected={a === k} className="chip" onClick={() => setK(a)}>{METRIC_LABEL[a]}</button>
        ))}
        <span className="ml-auto flex items-center gap-4 text-[12px] text-sub">
          <span className="flex items-center gap-1"><span className="w-4 h-[2px] bg-ink" />History</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 rounded-sm" style={{ background: col, opacity: 0.2 }} />Forecast range</span>
          <span className="flex items-center gap-1"><span className="w-4 h-[2px]" style={{ background: col }} />Mid case</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`${METRIC_LABEL[k]} over time: now ${fmt(k, m.now)}, six months ahead ${fmt(k, m.m6.mid)} (range ${fmt(k, m.m6.lo)} to ${fmt(k, m.m6.hi)}), limit ${fmt(k, m.limit)}`}>
        {yTicks.map((t, i) => (
          <g key={i}><line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="#EFEBE4" /><text x={PL - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#5F5B53" className="tnum">{tick(t)}</text></g>
        ))}
        {xTicks.map((x) => (
          <text key={x} x={X(x)} y={H - 10} textAnchor="middle" fontSize="11" fill="#5F5B53">{x === 0 ? "Now" : monthName(addMonths(asOf, x), false)}</text>
        ))}
        <line x1={X(0)} x2={X(0)} y1={PT} y2={H - PB} stroke="#CFC8BB" strokeDasharray="2 4" />
        {limit != null && <g><line x1={PL} x2={W - PR} y1={Y(limit)} y2={Y(limit)} stroke="#D92D20" strokeWidth="1.5" strokeDasharray="6 4" /><text x={W - PR + 6} y={Y(limit) + 4} fontSize="11" fill="#B42318">Limit {tick(limit)}</text></g>}
        {trap != null && <g><line x1={PL} x2={W - PR} y1={Y(trap)} y2={Y(trap)} stroke="#F79009" strokeWidth="1.5" strokeDasharray="3 4" /><text x={W - PR + 6} y={Y(trap) + (limit != null && Math.abs(Y(trap) - Y(limit)) < 14 ? 16 : 4)} fontSize="11" fill="#B54708">Cash trap {tick(trap)}</text></g>}
        {breachX != null && <g><line x1={X(breachX)} x2={X(breachX)} y1={PT} y2={H - PB} stroke="#D92D20" strokeOpacity=".4" /><text x={X(breachX)} y={PT + 10} textAnchor="middle" fontSize="11" fill="#B42318">{breachWord(k)} {monthName(forecast.breach_month, false)}</text></g>}
        <path d={bandPath} fill={col} fillOpacity=".18" />
        <path d={line(hist)} fill="none" stroke="#1E1D1A" strokeWidth="2" strokeLinejoin="round" />
        <path d={line(fpts.map((p) => ({ x: p.x, y: p.mid })))} fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={X(0)} cy={Y(now)} r="4" fill="#fff" stroke="#1E1D1A" strokeWidth="2" />
        <circle cx={X(6)} cy={Y(fpts[2].mid)} r="4" fill={col} />
        <text x={X(6) + 8} y={Y(fpts[2].mid) - 8} fontSize="11" fontWeight="600" fill="#1E1D1A" className="tnum">{tick(fpts[2].mid)}</text>
      </svg>
    </div>
  );
}

