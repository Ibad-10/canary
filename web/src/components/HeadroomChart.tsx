"use client";
import { useState } from "react";
import type { MetricKey, Status } from "@/lib/types";
import { STATUS_COLOR } from "@/lib/labels";
import { fmtHeadroom, headroom } from "@/lib/view";

export type HeadroomRow = { id: string; label: string; now: number | null; six: number | null; limit: number | null; status: Status };

const LABEL_W = 128, PAD = 56, ROW_H = 28, TOP = 26, W = 520;

/** Bars of headroom to the covenant limit in 6 months. Zero line = the limit. Left of zero = past the limit. Tightest first. */
export default function HeadroomChart({ metric, rows, onOpen }: { metric: Exclude<MetricKey, "occupancy">; rows: HeadroomRow[]; onOpen: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const data = rows
    .filter((r) => r.six != null && r.limit != null)
    .map((r) => ({ ...r, head: headroom(metric, r.six, r.limit) as number }))
    .filter((r) => r.head != null)
    .sort((a, b) => a.head - b.head);
  if (!data.length) return <p className="p-6 text-[13px] text-sub">No loans match the filters.</p>;

  const lo = Math.min(0, ...data.map((r) => r.head)), hi = Math.max(0, ...data.map((r) => r.head));
  const span = hi - lo || 1;
  const x0 = LABEL_W + PAD, x1 = W - PAD;
  const X = (v: number) => x0 + ((v - lo) / span) * (x1 - x0);
  const zero = X(0);
  const H = TOP + data.length * ROW_H + 6;
  const word = (r: (typeof data)[number]) => {
    const f = (v: number | null) => (v == null ? "–" : metric === "icr" ? `${v.toFixed(2)}x` : `${v.toFixed(1)}%`);
    const gap = Math.abs(r.head);
    const gapText = metric === "icr" ? `${gap.toFixed(2)}x` : `${gap.toFixed(1)} points`;
    return `${r.label}\nNow ${f(r.now)}, in 6 months ${f(r.six)}. Covenant limit ${f(r.limit)}.\n${r.head < 0 ? `${gapText} past the limit` : `${gapText} of headroom`}`;
  };
  const labelX = Math.min(Math.max(zero, LABEL_W + 40), W - 40);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
      aria-label={`${metric === "icr" ? "Interest cover" : "Loan-to-value"} headroom to the covenant limit in 6 months, tightest first`}>
      <text x={labelX} y={12} textAnchor="middle" fontSize="12" fontWeight="600" fill="#B42318">Covenant limit</text>
      <line x1={zero} x2={zero} y1={18} y2={H - 4} stroke="#D92D20" strokeWidth="1.5" strokeDasharray="4 3" />
      {data.map((r, i) => {
        const y = TOP + i * ROW_H;
        const c = STATUS_COLOR[r.status];
        const xv = X(r.head);
        const active = hover === r.id;
        const left = r.head < 0;
        const name = r.label.length > 17 ? r.label.slice(0, 16) + "…" : r.label;
        return (
          <g key={r.id} tabIndex={0} role="link" className="cursor-pointer outline-none" onClick={() => onOpen(r.id)} onKeyDown={(e) => e.key === "Enter" && onOpen(r.id)}
            onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(r.id)} onBlur={() => setHover(null)}
            aria-label={`${r.label}: ${fmtHeadroom(metric, r.head)}. Open deep dive`}>
            <title>{word(r)}</title>
            <rect x={0} y={y} width={W} height={ROW_H - 2} rx="6" fill={active ? "#F4F1EC" : "transparent"} />
            <text x={6} y={y + 17} fontSize="13" fill="#1E1D1A" fontWeight={active ? 600 : 400}>{name}</text>
            <rect x={Math.min(zero, xv)} y={y + 5} width={Math.max(2, Math.abs(xv - zero))} height={ROW_H - 12} rx="3" fill={c.dot} />
            <text x={left ? xv - 5 : xv + 5} y={y + 17} textAnchor={left ? "end" : "start"} fontSize="12" fontWeight="600" fill={left ? "#B42318" : "#3A3833"} className="tnum">{fmtHeadroom(metric, r.head)}</text>
          </g>
        );
      })}
    </svg>
  );
}
