"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { Evidence, Forecast, Loan, Signal } from "@/lib/types";
import { EV_LABEL, KIND_LABEL, METRIC_LABEL, fmt, gbp } from "@/lib/calc";
import type { MetricKey } from "@/lib/types";

type GNode = { id: string; kind: "loan" | "building" | "signal" | "evidence" | "metric"; label: string; sub: string; hot: boolean; col: number; fx?: number; fy?: number; x?: number; y?: number };
type GLink = { source: string; target: string; hot: boolean };

function sigValue(s: Signal) {
  const u = s.unit ?? "";
  if (/gbp/i.test(u)) return gbp(s.value, 0);
  return `${Number.isInteger(s.value) ? s.value : s.value.toFixed(1)} ${u}`.trim();
}
const KIND_TAG: Record<GNode["kind"], string> = { loan: "Loan", building: "Building", signal: "Warning sign", evidence: "Evidence", metric: "Rule at risk" };
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

export default function LoanGraphInner({ loan, forecast, signals, evidence }: { loan: Loan; forecast: Forecast; signals: Signal[]; evidence: Evidence[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(undefined);
  const [w, setW] = useState(900);
  const H = 440;
  const [hover, setHover] = useState<GNode | null>(null);
  const color = forecast.status === "red" ? "#D92D20" : forecast.status === "amber" ? "#F79009" : "#CFC8BB";
  const glow = forecast.status !== "green";

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 900));
    setW(el.clientWidth || 900); ro.observe(el); return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const drivers = forecast.drivers ?? [];
    const hotSig = new Map<number, Set<string>>(); // signal id -> metrics it feeds
    const hotEv = new Map<number, Set<string>>();
    for (const d of drivers) {
      for (const id of d.signal_ids ?? []) (hotSig.get(id) ?? hotSig.set(id, new Set()).get(id)!).add(d.delta?.metric);
      for (const id of d.evidence_ids ?? []) (hotEv.get(id) ?? hotEv.set(id, new Set()).get(id)!).add(d.delta?.metric);
    }
    const isHot = glow;
    const nodes: GNode[] = [];
    const links: GLink[] = [];
    const sorted = [...signals].sort((a, b) => Number(hotSig.has(b.id)) - Number(hotSig.has(a.id)));
    const sigs = [...sorted.filter((s) => hotSig.has(s.id)).slice(0, 6), ...sorted.filter((s) => !hotSig.has(s.id)).slice(0, 2)];
    const evs = evidence.filter((e) => hotEv.has(e.id)).slice(0, 5);
    const notNull = (b: string | null): b is string => b != null;
    const bids = [...new Set(sigs.map((s) => s.building_id).filter(notNull))];
    const allB = new Set<string>([...(loan.building_ids ?? []), ...signals.map((s) => s.building_id).filter(notNull)]);
    const quiet = Math.max(0, allB.size - bids.length);
    const mets = (["icr", "ltv", "occupancy"] as MetricKey[]).filter((k) => forecast.metrics[k]);
    const hotMetric = new Set<string>();
    hotSig.forEach((s) => s.forEach((m) => hotMetric.add(m))); hotEv.forEach((s) => s.forEach((m) => hotMetric.add(m)));
    if (forecast.breach_metric) hotMetric.add(forecast.breach_metric);

    const bHot = (b: string) => sigs.some((s) => s.building_id === b && hotSig.has(s.id));
    nodes.push({ id: "loan", kind: "loan", label: loan.name, sub: `${gbp(loan.amount_gbp)} · ${loan.sector}`, hot: isHot, col: 0 });
    for (const b of bids) nodes.push({ id: `b${b}`, kind: "building", label: `Building ${b.replace(/^bld_/, "")}`, sub: "From Cortile", hot: isHot && bHot(b), col: 1 });
    if (quiet) nodes.push({ id: "bq", kind: "building", label: `${quiet} other building${quiet === 1 ? "" : "s"}`, sub: "Checked, all fine", hot: false, col: 1 });
    for (const s of sigs) nodes.push({ id: `s${s.id}`, kind: "signal", label: KIND_LABEL[s.kind] ?? s.kind, sub: sigValue(s), hot: isHot && hotSig.has(s.id), col: 2 });
    for (const e of evs) nodes.push({ id: `e${e.id}`, kind: "evidence", label: EV_LABEL[e.kind] ?? e.kind, sub: clip(e.title, 26), hot: isHot, col: 2 });
    for (const m of mets) {
      const mm = forecast.metrics[m]!;
      nodes.push({ id: `m${m}`, kind: "metric", label: `${METRIC_LABEL[m]}`, sub: `${fmt(m, mm.m6.mid)} in 6 mo, limit ${fmt(m, mm.limit)}`, hot: isHot && hotMetric.has(m), col: 3 });
    }
    for (const b of bids) links.push({ source: "loan", target: `b${b}`, hot: isHot && bHot(b) });
    if (quiet) links.push({ source: "loan", target: "bq", hot: false });
    for (const s of sigs) {
      if (s.building_id != null) links.push({ source: `b${s.building_id}`, target: `s${s.id}`, hot: isHot && hotSig.has(s.id) });
      const ms = hotSig.get(s.id);
      if (ms) ms.forEach((m) => mets.includes(m as MetricKey) && links.push({ source: `s${s.id}`, target: `m${m}`, hot: isHot }));
    }
    for (const e of evs) {
      links.push({ source: "loan", target: `e${e.id}`, hot: isHot });
      hotEv.get(e.id)?.forEach((m) => mets.includes(m as MetricKey) && links.push({ source: `e${e.id}`, target: `m${m}`, hot: isHot }));
    }
    // fixed layered layout
    const xs = [-390, -140, 120, 380], gap = 50;
    for (let c = 0; c < 4; c++) {
      const col = nodes.filter((n) => n.col === c);
      col.forEach((n, i) => { n.fx = xs[c]; n.fy = (i - (col.length - 1) / 2) * gap; });
    }
    return { nodes, links };
  }, [loan, forecast, signals, evidence, glow]);

  const NW = 168, NH = 38;
  return (
    <div ref={wrap} className="relative dotgrid" style={{ height: H }} role="img"
      aria-label={`Knowledge graph for ${loan.name}: loan, buildings, warning signs and the covenants they affect. Paths that drive the forecast are highlighted.`}>
      <ForceGraph2D
        ref={fg}
        graphData={data}
        width={w}
        height={H}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={0}
        enableNodeDrag={false}
        onEngineStop={() => fg.current?.zoomToFit(200, 24)}
        onNodeHover={(n) => setHover((n as GNode) ?? null)}
        nodeRelSize={1}
        linkColor={(l) => ((l as GLink).hot ? color : "#CFC8BB")}
        linkWidth={(l) => ((l as GLink).hot ? 2.5 : 1)}
        linkDirectionalParticles={(l) => ((l as GLink).hot ? 2 : 0)}
        linkDirectionalParticleWidth={3}
        linkDirectionalParticleColor={() => color}
        linkCurvature={0.15}
        nodePointerAreaPaint={(n, c, ctx) => { const x = (n as GNode).x ?? 0, y = (n as GNode).y ?? 0; ctx.fillStyle = c; ctx.fillRect(x - NW / 2, y - NH / 2, NW, NH); }}
        nodeCanvasObject={(n, ctx) => {
          const g = n as GNode; const x = (g.x ?? 0) - NW / 2, y = (g.y ?? 0) - NH / 2;
          ctx.save();
          if (g.hot) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
          ctx.beginPath(); ctx.roundRect(x, y, NW, NH, 8); ctx.fillStyle = g.hot ? (forecast.status === "red" ? "#FEF3F2" : "#FFFAEB") : "#FFFFFF"; ctx.fill();
          ctx.shadowBlur = 0; ctx.lineWidth = g.hot ? 1.8 : 1; ctx.strokeStyle = g.hot ? color : "#CFC8BB"; ctx.stroke();
          ctx.restore();
          ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
          ctx.font = "500 7px Inter, system-ui, sans-serif"; ctx.fillStyle = g.hot ? color : "#8A857A";
          ctx.fillText(KIND_TAG[g.kind], x + 8, y + 11);
          ctx.font = "600 10px Inter, system-ui, sans-serif"; ctx.fillStyle = g.hot ? "#1E1D1A" : "#5F5B53";
          ctx.fillText(clip(g.label, 24), x + 8, y + 22);
          ctx.font = "400 8px Inter, system-ui, sans-serif"; ctx.fillStyle = "#5F5B53";
          ctx.fillText(clip(g.sub, 32), x + 8, y + 32);
        }}
        nodeCanvasObjectMode={() => "replace"}
      />
      {hover && (
        <div className="absolute left-3 bottom-3 card px-3 py-2 text-[12px] pointer-events-none max-w-[320px]">
          <b>{hover.label}</b> · {hover.sub}
        </div>
      )}
    </div>
  );
}

