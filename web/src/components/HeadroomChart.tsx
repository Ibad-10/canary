"use client";
import { useState } from "react";
import type { MetricKey, Status } from "@/lib/types";
import { STATUS_COLOR } from "@/lib/labels";
import { fmtHeadroom, headroom } from "@/lib/view";

export type HeadroomRow = { id: string; label: string; now: number | null; six: number | null; limit: number | null; status: Status };

const LABEL_W = 118, RIGHT_W = 62, ROW_H = 28, PAD_T = 24;

/** Dumbbell chart: where each loan is now, where it will be in 6 months, and its covenant limit. Tightest headroom first. */
export default function HeadroomChart({ metric, rows, onOpen, selected }: { metric: Exclude<MetricKey, "occupancy">; rows: HeadroomRow[]; onOpen: (id: string) => void; selected?: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const data = rows
    .filter((r) => r.six != null && r.limit != null)
    .map((r) => ({ ...r, head: headroom(metric, r.six, r.limit) }))
    .sort((a, b) => (a.head ?? 9e9) - (b.head ?? 9e9));
  if (!data.length) return <p className="p-6 text-[13px] text-sub">No loans match the filters.</p>;

  const vals = data.flatMap((r) => [r.now, r.six, r.limit].filter((v): v is number => v != null));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.12; lo -= pad; hi += pad;
  const W = 500, H = PAD_T + data.length * ROW_H + 8;
  const X = (v: number) => LABEL_W + ((v - lo) / (hi - lo)) * (W - LABEL_W - RIGHT_W);
  const unit = (v: number) => (metric === "icr" ? `${v.toFixed(2)}x` : `${v.toFixed(0)}%`);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label={`${metric === "icr" ? "Interest cover" : "Loan-to-value"} now and in 6 months against the covenant limit, tightest headroom first`}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={X(t)} x2={X(t)} y1={PAD_T - 6} y2={H - 6} stroke="#EFEBE4" />
          <text x={X(t)} y={12} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} fontSize="11" fill="#5F5B53" className="tnum">{unit(t)}</text>
        </g>
      ))}
      <text x={W - 4} y={12} textAnchor="end" fontSize="11" fill="#5F5B53">Headroom</text>
      {data.map((r, i) => {
        const y = PAD_T + i * ROW_H + ROW_H / 2;
        const c = STATUS_COLOR[r.status];
        const active = hover === r.id || selected === r.id;
        const bad = r.head != null && r.head < 0;
        return (
          <g key={r.id} tabIndex={0} role="link" className="cursor-pointer outline-none" onClick={() => onOpen(r.id)}
            onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(r.id)} onBlur={() => setHover(null)} aria-label={`${r.label}: ${fmtHeadroom(metric, r.head)} headroom. Open deep dive`}>
            <title>{`${r.label}\nNow ${r.now != null ? unit(r.now) : "–"}, in 6 months ${unit(r.six!)}, limit ${unit(r.limit!)}`}</title>
            <rect x={0} y={y - ROW_H / 2 + 1} width={W} height={ROW_H - 2} rx="6" fill={active ? "#F4F1EC" : "transparent"} />
            <text x={6} y={y + 4} fontSize="13" fill="#1E1D1A" fontWeight={active ? 600 : 400}>{r.label.length > 18 ? r.label.slice(0, 17) + "…" : r.label}</text>
            <line x1={LABEL_W} x2={W - RIGHT_W} y1={y} y2={y} stroke="#E6E1D8" />
            <line x1={X(r.limit!)} x2={X(r.limit!)} y1={y - 9} y2={y + 9} stroke="#D92D20" strokeWidth="2.5" strokeLinecap="round" />
            {r.now != null && <line x1={X(r.now)} x2={X(r.six!)} y1={y} y2={y} stroke={c.dot} strokeWidth="3" strokeLinecap="round" strokeOpacity=".55" />}
            {r.now != null && <circle cx={X(r.now)} cy={y} r="4" fill="#fff" stroke={c.dot} strokeWidth="2" />}
            <circle cx={X(r.six!)} cy={y} r="5" fill={c.dot} />
            <text x={W - 4} y={y + 4} textAnchor="end" fontSize="13" fontWeight="600" fill={bad ? "#B42318" : "#3A3833"} className="tnum">{fmtHeadroom(metric, r.head)}</text>
          </g>
        );
      })}
    </svg>
  );
}
