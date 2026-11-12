import type { Forecast, MetricKey } from "@/lib/types";
import { STATUS_COLOR } from "@/lib/labels";
import { pp } from "@/lib/calc";

/** Tiny history + forecast line for one loan. Solid = history, dashed = forecast. */
export default function Spark({ forecast, metric, w = 120, h = 36 }: { forecast: Forecast; metric?: MetricKey; w?: number; h?: number }) {
  const k: MetricKey = metric ?? ((forecast.breach_metric as MetricKey | null) && forecast.metrics[forecast.breach_metric as MetricKey] ? (forecast.breach_metric as MetricKey) : "icr");
  const m = forecast.metrics[k];
  if (!m) return <svg width={w} height={h} aria-hidden="true" />;
  const hist = (m.series ?? []).slice(-9).map((p) => pp(k, p.value)).filter((v): v is number => v != null);
  const fut = [pp(k, m.m3?.mid), pp(k, m.m6?.mid)].filter((v): v is number => v != null);
  const lim = pp(k, m.limit);
  const all = [...hist, ...fut, ...(lim != null ? [lim] : [])];
  if (!all.length) return <svg width={w} height={h} aria-hidden="true" />;
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const n = hist.length + fut.length;
  const X = (i: number) => 2 + (i / Math.max(1, n - 1)) * (w - 4);
  const Y = (v: number) => 3 + (1 - (v - lo) / span) * (h - 6);
  const col = STATUS_COLOR[forecast.status].dot;
  const hp = hist.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const last = hist.length ? hist.length - 1 : 0;
  const fp = [hist[last], ...fut].filter((v) => v != null).map((v, i) => `${i ? "L" : "M"}${X(last + i).toFixed(1)},${Y(v as number).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {lim != null && <line x1="0" x2={w} y1={Y(lim)} y2={Y(lim)} stroke="#D92D20" strokeOpacity=".35" strokeDasharray="3 3" />}
      <path d={hp} fill="none" stroke="#1E1D1A" strokeOpacity=".55" strokeWidth="1.5" strokeLinejoin="round" />
      <path d={fp} fill="none" stroke={col} strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      <circle cx={X(n - 1)} cy={Y(fut[fut.length - 1] ?? hist[last])} r="3" fill={col} />
    </svg>
  );
}
