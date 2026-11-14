"use client";
import { useMemo, useState } from "react";
import type { Forecast, ForecastEvent, MetricKey, Status } from "@/lib/types";
import { BAD_DIR, METRICS, METRIC_LABEL, fmt, monthName, monthsBetween, pp } from "@/lib/calc";
import { breachWord } from "@/lib/labels";

const COL: Record<Status, string> = { red: "#D92D20", amber: "#F79009", green: "#17B26A" };
const W = 760, H = 290, PL = 52, PR = 96, PT = 16, PB = 32;

type FPt = { x: number; month: string; lo: number; mid: number; hi: number; events: ForecastEvent[] };

function addMonths(iso: string, n: number) {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function stepAfterLine(pts: { x: number; y: number }[], X: (x: number) => number, Y: (y: number) => number) {
  if (!pts.length) return "";
  let d = `M${X(pts[0].x).toFixed(1)},${Y(pts[0].y).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += `H${X(pts[i].x).toFixed(1)}V${Y(pts[i].y).toFixed(1)}`;
  }
  return d;
}

function stepAfterBand(pts: FPt[], X: (x: number) => number, Y: (y: number) => number) {
  if (!pts.length) return "";
  let d = `M${X(pts[0].x).toFixed(1)},${Y(pts[0].hi).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    d += `H${X(pts[i].x).toFixed(1)}V${Y(pts[i].hi).toFixed(1)}`;
  }
  d += `V${Y(pts[pts.length - 1].lo).toFixed(1)}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    d += `H${X(pts[i].x).toFixed(1)}V${Y(pts[i].lo).toFixed(1)}`;
  }
  return `${d}Z`;
}

function straightLine(pts: { x: number; y: number }[], X: (x: number) => number, Y: (y: number) => number) {
  return pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
}

function straightBand(pts: FPt[], X: (x: number) => number, Y: (y: number) => number) {
  return `${pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.hi).toFixed(1)}`).join(" ")} ${[...pts].reverse().map((p) => `L${X(p.x).toFixed(1)},${Y(p.lo).toFixed(1)}`).join(" ")} Z`;
}

function isBreached(mid: number, limit: number, dir: "below" | "above") {
  return dir === "below" ? mid <= limit : mid >= limit;
}

function citeIds(ev: ForecastEvent) {
  const ids = [
    ...(ev.evidence_ids ?? []).map((id) => `evidence ${id}`),
    ...(ev.signal_ids ?? []).map((id) => `signal ${id}`),
  ];
  return ids.length ? ids.join(", ") : null;
}

export default function CovenantChart({ forecast, asOf }: { forecast: Forecast; asOf: string }) {
  const avail = METRICS.filter((k) => forecast.metrics[k]);
  const [k, setK] = useState<MetricKey>(
    (forecast.breach_metric as MetricKey) && avail.includes(forecast.breach_metric as MetricKey)
      ? (forecast.breach_metric as MetricKey)
      : avail[0],
  );
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  const m = forecast.metrics[k];
  const chart = useMemo(() => {
    if (!m) return null;
    const v = (x: number | null | undefined) => pp(k, x);
    const hist = (m.series ?? [])
      .map((p) => ({ x: monthsBetween(asOf, p.month), y: v(p.value)! }))
      .filter((p) => p.x <= 0 && p.y != null);
    const now = v(m.now)!;
    const monthly = m.forecast?.length
      ? m.forecast.map((p) => ({
          x: monthsBetween(asOf, p.month),
          month: p.month,
          lo: v(p.lo)!,
          mid: v(p.mid)!,
          hi: v(p.hi)!,
          events: p.events ?? [],
        }))
      : null;
    const stepped = !!monthly;
    const fpts: FPt[] = monthly
      ? [
          { x: 0, month: asOf.slice(0, 10), lo: now, mid: now, hi: now, events: [] },
          ...monthly,
        ]
      : [
          { x: 0, month: asOf.slice(0, 10), lo: now, mid: now, hi: now, events: [] },
          { x: 3, month: addMonths(asOf, 3), lo: v(m.m3.lo)!, mid: v(m.m3.mid)!, hi: v(m.m3.hi)!, events: [] },
          { x: 6, month: addMonths(asOf, 6), lo: v(m.m6.lo)!, mid: v(m.m6.mid)!, hi: v(m.m6.hi)!, events: [] },
        ];
    const xMax = Math.max(6, ...fpts.map((p) => p.x));
    const limit = v(m.limit), trap = v(m.cash_trap);
    const all = [...hist.map((p) => p.y), ...fpts.flatMap((p) => [p.lo, p.hi]), ...(limit != null ? [limit] : []), ...(trap != null ? [trap] : [])];
    let yLo = Math.min(...all), yHi = Math.max(...all);
    const pad = (yHi - yLo || 1) * 0.15;
    yLo -= pad;
    yHi += pad;
    const x0 = Math.min(-11, ...hist.map((p) => p.x));
    const X = (x: number) => PL + ((x - x0) / (xMax - x0)) * (W - PL - PR);
    const Y = (y: number) => PT + (1 - (y - yLo) / (yHi - yLo)) * (H - PT - PB);
    const tick = (y: number) => (k === "icr" ? `${y.toFixed(2)}x` : `${y.toFixed(0)}%`);
    const dir = BAD_DIR[k];
    let breachX: number | null = null;
    let breachMonth: string | null = null;
    if (limit != null) {
      if (isBreached(now, limit, dir)) {
        breachX = 0;
        breachMonth = asOf.slice(0, 10);
      } else {
        for (const p of fpts) {
          if (p.x > 0 && isBreached(p.mid, limit, dir)) {
            breachX = p.x;
            breachMonth = p.month;
            break;
          }
        }
      }
    }
    if (breachX == null && forecast.breach_metric === k && forecast.breach_month) {
      breachX = monthsBetween(asOf, forecast.breach_month);
      breachMonth = forecast.breach_month;
    }
    const eventPts = fpts.filter((p) => p.events.length > 0);
    const movers = fpts.flatMap((p) =>
      p.events.map((ev) => ({
        month: p.month,
        x: p.x,
        label: ev.label,
        effect: ev.effect_text,
        date: ev.date,
        evidence_ids: ev.evidence_ids ?? [],
        signal_ids: ev.signal_ids ?? [],
      })),
    );
    const yTicks = Array.from({ length: 5 }, (_, i) => yLo + ((yHi - yLo) * i) / 4);
    const step = xMax - x0 > 20 ? 6 : 3;
    const xTicks: number[] = [];
    for (let x = xMax; x >= x0; x -= step) xTicks.push(x);
    const last = fpts[fpts.length - 1];
    const midPath = stepped
      ? stepAfterLine(fpts.map((p) => ({ x: p.x, y: p.mid })), X, Y)
      : straightLine(fpts.map((p) => ({ x: p.x, y: p.mid })), X, Y);
    const bandPath = stepped ? stepAfterBand(fpts, X, Y) : straightBand(fpts, X, Y);
    const histPath = straightLine(hist, X, Y);
    return { hist, now, fpts, stepped, limit, trap, X, Y, tick, breachX, breachMonth, eventPts, movers, yTicks, xTicks, last, midPath, bandPath, histPath, xMax };
  }, [m, k, asOf, forecast.breach_metric, forecast.breach_month]);

  if (!m || !chart) return null;
  const {
    now, fpts, limit, trap, X, Y, tick, breachX, breachMonth, eventPts, movers, yTicks, xTicks, last, midPath, bandPath, histPath,
  } = chart;
  const col = COL[forecast.status];
  const active = pinned ?? hover;
  const tip = active != null ? fpts[active] : null;
  const tipLeft = tip ? Math.min(Math.max((X(tip.x) / W) * 100, 18), 82) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 px-4 pt-3" role="tablist" aria-label="Covenant metric">
        {avail.map((a) => (
          <button key={a} role="tab" aria-selected={a === k} className="chip" onClick={() => { setK(a); setHover(null); setPinned(null); }}>
            {METRIC_LABEL[a]}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[12px] text-sub">
          <span className="flex items-center gap-1"><span className="w-4 h-[2px] bg-ink" aria-hidden="true" />History</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 rounded-sm" style={{ background: col, opacity: 0.2 }} aria-hidden="true" />Forecast range</span>
          <span className="flex items-center gap-1"><span className="w-4 h-[2px]" style={{ background: col }} aria-hidden="true" />Mid case</span>
          {eventPts.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full border-2 border-ink bg-white" aria-hidden="true" />Event
            </span>
          )}
        </span>
      </div>

      <div className="relative px-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`${METRIC_LABEL[k]} over time: now ${fmt(k, m.now)}, six months ahead ${tick(last.mid)} (range ${tick(last.lo)} to ${tick(last.hi)}), limit ${fmt(k, m.limit)}`}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="#EFEBE4" />
              <text x={PL - 8} y={Y(t) + 4} textAnchor="end" fontSize="11" fill="#5F5B53" className="tnum">{tick(t)}</text>
            </g>
          ))}
          {xTicks.map((x) => (
            <text key={x} x={X(x)} y={H - 10} textAnchor="middle" fontSize="11" fill="#5F5B53">
              {x === 0 ? "Now" : monthName(addMonths(asOf, x), false)}
            </text>
          ))}
          <line x1={X(0)} x2={X(0)} y1={PT} y2={H - PB} stroke="#CFC8BB" strokeDasharray="2 4" />
          {limit != null && (
            <g>
              <line x1={PL} x2={W - PR} y1={Y(limit)} y2={Y(limit)} stroke="#D92D20" strokeWidth="1.5" strokeDasharray="6 4" />
              <text x={W - PR + 6} y={Y(limit) + 4} fontSize="11" fill="#B42318">Limit {tick(limit)}</text>
            </g>
          )}
          {trap != null && (
            <g>
              <line x1={PL} x2={W - PR} y1={Y(trap)} y2={Y(trap)} stroke="#F79009" strokeWidth="1.5" strokeDasharray="3 4" />
              <text x={W - PR + 6} y={Y(trap) + (limit != null && Math.abs(Y(trap) - Y(limit)) < 14 ? 16 : 4)} fontSize="11" fill="#B54708">
                Cash trap {tick(trap)}
              </text>
            </g>
          )}
          {breachX != null && (
            <g>
              <line x1={X(breachX)} x2={X(breachX)} y1={PT} y2={H - PB} stroke="#D92D20" strokeOpacity=".4" />
              <text x={Math.min(Math.max(X(breachX), PL + 40), W - PR - 40)} y={PT + 10} textAnchor="middle" fontSize="11" fill="#B42318">
                {breachWord(k)} {breachX === 0 ? "now" : monthName(breachMonth, false)}
              </text>
            </g>
          )}
          <path d={bandPath} fill={col} fillOpacity=".18" className="motion-safe:transition-[d] motion-safe:duration-300 motion-reduce:transition-none" />
          <path d={histPath} fill="none" stroke="#1E1D1A" strokeWidth="2" strokeLinejoin="round" />
          <path d={midPath} fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="motion-safe:transition-[d] motion-safe:duration-300 motion-reduce:transition-none" />
          <circle cx={X(0)} cy={Y(now)} r="4" fill="#fff" stroke="#1E1D1A" strokeWidth="2" />
          <circle cx={X(last.x)} cy={Y(last.mid)} r="4" fill={col} />
          <text x={X(last.x) + 8} y={Y(last.mid) - 8} fontSize="11" fontWeight="600" fill="#1E1D1A" className="tnum">{tick(last.mid)}</text>

          {eventPts.map((p) => {
            const idx = fpts.indexOf(p);
            return (
              <g key={`ev-${p.month}`}>
                <line x1={X(p.x)} x2={X(p.x)} y1={Y(p.mid) - 14} y2={Y(p.mid) - 4} stroke="#1E1D1A" strokeWidth="1.5" />
                <circle cx={X(p.x)} cy={Y(p.mid) - 16} r="3.5" fill="#FFD60A" stroke="#1E1D1A" strokeWidth="1.5" />
                <circle
                  cx={X(p.x)}
                  cy={Y(p.mid)}
                  r="5"
                  fill="#fff"
                  stroke={col}
                  strokeWidth="2"
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(idx)}
                  onClick={() => setPinned((cur) => (cur === idx ? null : idx))}
                />
              </g>
            );
          })}

          {/* Hit targets for tooltip (forecast months including now) */}
          {fpts.map((p, i) => (
            <rect
              key={`hit-${p.month}-${i}`}
              x={X(p.x) - 14}
              y={PT}
              width={28}
              height={H - PT - PB}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHover(i)}
              onClick={() => setPinned((cur) => (cur === i ? null : i))}
            />
          ))}
        </svg>

        {tip && tip.x >= 0 && (
          <div
            className="pointer-events-none absolute z-10 w-[min(280px,70vw)] -translate-x-1/2 rounded-xl border border-line bg-white px-3 py-2 text-[12px] shadow-sm motion-safe:transition-opacity motion-reduce:transition-none"
            style={{ left: `${tipLeft}%`, top: 8 }}
            role="tooltip"
          >
            <div className="font-semibold text-ink">
              {tip.x === 0 ? "Now" : monthName(tip.month)}
            </div>
            <div className="tnum text-sub mt-0.5">
              Mid {tick(tip.mid)} <span className="text-[#8A8478]">({tick(tip.lo)} – {tick(tip.hi)})</span>
            </div>
            {tip.events.length > 0 ? (
              <ul className="mt-2 space-y-1.5 border-t border-line pt-2">
                {tip.events.map((ev, i) => {
                  const cite = citeIds(ev);
                  return (
                    <li key={i}>
                      <div className="font-medium text-ink leading-snug">{ev.label}</div>
                      <div className="text-sub mt-0.5">{ev.effect_text} · {Math.round((ev.probability ?? 1) * 100)}%</div>
                      {cite && <div className="text-[11px] text-[#8A8478] mt-0.5">See Evidence · {cite}</div>}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      {movers.length > 0 && (
        <div className="px-4 pb-4 pt-1 border-t border-line mt-1">
          <h3 className="text-[12px] font-semibold text-sub">What moves it</h3>
          <ul className="mt-2 space-y-1.5">
            {movers.map((mv, i) => {
              const href =
                mv.evidence_ids.length > 0
                  ? `?tab=evidence#e${mv.evidence_ids[0]}`
                  : mv.signal_ids.length > 0
                    ? `?tab=evidence#s${mv.signal_ids[0]}`
                    : null;
              const body = (
                <>
                  <span className="text-sub shrink-0 w-[4.5rem]">{monthName(mv.month, false)}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{mv.label}</span>
                  <span className="text-sub shrink-0 max-w-[40%] truncate text-right">{mv.effect}</span>
                </>
              );
              return (
                <li key={`${mv.month}-${i}`} className="text-[12px]">
                  {href ? (
                    <a href={href} className="flex items-baseline gap-2 hover:underline">
                      {body}
                    </a>
                  ) : (
                    <div className="flex items-baseline gap-2">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
