"use client";
import { useMemo, useState } from "react";
import { Maximize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { Evidence, Forecast, Loan, MetricKey, Signal } from "@/lib/types";
import { fmt, gbp, sourceLabel } from "@/lib/calc";
import { evidenceName, loanTitle, METRIC_NAME, sectorName, signalName, STATUS_COLOR, driverSentence } from "@/lib/labels";
import { monthYear } from "@/lib/view";

type Kind = "loan" | "hub" | "signal" | "evidence" | "metric" | "other";
type GNode = { id: string; kind: Kind; col: 0 | 1 | 2 | 3; title: string; sub: string; hot: boolean; x: number; y: number; detail: Detail };
type Detail = { what: string; value?: string; month?: string; sources: string[]; effects: string[]; evidenceLink?: boolean; extra?: string[] };
type GEdge = { from: string; to: string; hot: boolean };

const NW = 196, NH = 48, ROW = 62, COLX = [8, 252, 496, 740], W = 944, TOP = 40;
const TAG: Record<Kind, string> = { loan: "Loan", hub: "Buildings", signal: "Warning sign", evidence: "Evidence", metric: "Covenant at risk", other: "Checked" };
const clip = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const metricOf = (m: string | undefined): MetricKey | null => (m === "icr" || m === "ltv" || m === "occupancy" ? m : m === "rent" ? "icr" : m === "value" ? "ltv" : null);

function unitText(rows: Signal[]): string {
  const u = (rows[0]?.unit ?? "").trim();
  const sum = rows.reduce((s, r) => s + (Number.isFinite(r.value) ? r.value : 0), 0);
  if (/^gbp$/i.test(u)) return gbp(sum, 0);
  if (!u) return plural(rows.length, "record");
  const one = u.replace(/s$/i, "");
  const n = Math.round(sum * 10) / 10;
  return `${n} ${n === 1 ? one : /s$/i.test(u) ? u : u + "s"}`;
}

export default function LoanGraphInner({ loan, forecast, signals, evidence }: { loan: Loan; forecast: Forecast; signals: Signal[]; evidence: Evidence[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const hotCol = forecast.status === "amber" ? STATUS_COLOR.amber : STATUS_COLOR.red;

  const { nodes, edges, height } = useMemo(() => {
    const drivers = forecast.drivers ?? [];
    const sigById = new Map(signals.map((s) => [s.id, s]));
    const evById = new Map(evidence.map((e) => [e.id, e]));
    // group driver signals/evidence by kind
    const sigGroups = new Map<string, { rows: Signal[]; ds: Forecast["drivers"] }>();
    const evGroups = new Map<string, { rows: Evidence[]; ds: Forecast["drivers"] }>();
    for (const d of drivers) {
      for (const id of d.signal_ids ?? []) {
        const s = sigById.get(id); if (!s) continue;
        const g = sigGroups.get(s.kind) ?? { rows: [], ds: [] };
        if (!g.rows.includes(s)) g.rows.push(s);
        if (!g.ds.includes(d)) g.ds.push(d);
        sigGroups.set(s.kind, g);
      }
      for (const id of d.evidence_ids ?? []) {
        const e = evById.get(id); if (!e) continue;
        const g = evGroups.get(e.kind) ?? { rows: [], ds: [] };
        if (!g.rows.includes(e)) g.rows.push(e);
        if (!g.ds.includes(d)) g.ds.push(d);
        evGroups.set(e.kind, g);
      }
    }
    const hotKinds = new Set(sigGroups.keys());
    const otherKinds = [...new Set(signals.map((s) => s.kind))].filter((k) => !hotKinds.has(k));
    const mets = (["icr", "ltv", "occupancy"] as MetricKey[]).filter((k) => forecast.metrics[k]);
    const live = forecast.status !== "green";
    const metricsHit = new Set<MetricKey>();
    const effectLines = (ds: Forecast["drivers"]) => ds.map((d) => `${driverSentence(d)}`);
    for (const d of drivers) { const m = metricOf(d.delta?.metric); if (m) metricsHit.add(m); }

    const allB = new Set<string>([...(loan.building_ids ?? []), ...signals.map((s) => s.building_id).filter((b): b is string => !!b)]);
    const hotB = new Set<string>(); sigGroups.forEach((g) => g.rows.forEach((r) => r.building_id && hotB.add(r.building_id)));

    // column 2 rows
    const c2: GNode[] = [];
    const sigList = [...sigGroups.entries()].sort((a, b) => (metricOf(a[1].ds[0]?.delta?.metric) ?? "z").localeCompare(metricOf(b[1].ds[0]?.delta?.metric) ?? "z"));
    for (const [kind, g] of sigList) {
      const b = new Set(g.rows.map((r) => r.building_id).filter(Boolean)).size;
      const last = [...g.rows].sort((a, b2) => b2.month.localeCompare(a.month))[0];
      c2.push({ id: `s:${kind}`, kind: "signal", col: 2, title: signalName(kind), sub: `${unitText(g.rows)}${b ? ` in ${plural(b, "building")}` : ""}`, hot: live, x: COLX[2], y: 0,
        detail: { what: `${signalName(kind)} found in the building data${b ? ` across ${plural(b, "building")}` : ""}.`, value: unitText(g.rows), month: last ? monthYear(last.month) : undefined,
          sources: [...new Set(g.rows.map((r) => sourceLabel(r.source).text))], effects: effectLines(g.ds), evidenceLink: true, extra: g.rows.slice(0, 3).map((r) => r.detail).filter(Boolean) } });
    }
    const evList = [...evGroups.entries()];
    const evNodes: GNode[] = evList.map(([kind, g]) => ({
      id: `e:${kind}`, kind: "evidence", col: 2, title: evidenceName(kind), sub: plural(g.rows.length, "item"), hot: live, x: COLX[2], y: 0,
      detail: { what: `${evidenceName(kind)} used to adjust the forecast.`, value: g.rows[0]?.title, sources: [...new Set(g.rows.map((r) => r.label || sourceLabel(r.source).text))],
        effects: effectLines(g.ds), evidenceLink: kind !== "news", extra: g.rows.slice(0, 3).map((r) => r.title) } }));
    const other: GNode[] = otherKinds.length ? [{ id: "o", kind: "other", col: 2, title: "Other checks, all fine", sub: plural(otherKinds.length, "kind"), hot: false, x: COLX[2], y: 0,
      detail: { what: "These checks ran and are not moving the forecast.", sources: ["Cortile"], effects: [], extra: otherKinds.map(signalName) } }] : [];
    const col2 = [...c2, ...evNodes, ...other];
    col2.forEach((n, i) => (n.y = TOP + i * ROW));
    const span = (ns: GNode[]) => (ns.length ? (ns[0].y + ns[ns.length - 1].y) / 2 : TOP);

    const nodes: GNode[] = [...col2];
    const sigAndOther = [...c2, ...other];
    nodes.push({ id: "hub:b", kind: "hub", col: 1, title: `${plural(allB.size, "building")}`, sub: hotB.size ? `${hotB.size} with warning signs` : "none with warning signs", hot: live && hotB.size > 0, x: COLX[1], y: span(sigAndOther.length ? sigAndOther : col2),
      detail: { what: `The ${plural(allB.size, "building")} behind this loan, from Cortile.`, value: hotB.size ? `${hotB.size} with warning signs` : "No warning signs", sources: ["Cortile"], effects: [] } });
    if (evNodes.length) nodes.push({ id: "hub:e", kind: "hub", col: 1, title: "Outside evidence", sub: "Market, news, comparables", hot: live, x: COLX[1], y: span(evNodes),
      detail: { what: "Market data, news and sale or rent comparables that apply to the whole loan.", sources: [...new Set(evList.flatMap(([, g]) => g.rows.map((r) => r.label || sourceLabel(r.source).text)))], effects: [] } });
    // keep the two hubs apart
    const hb = nodes.find((n) => n.id === "hub:b")!, he = nodes.find((n) => n.id === "hub:e");
    if (he && Math.abs(he.y - hb.y) < NH + 14) he.y = hb.y + NH + 14;
    const loanN: GNode = { id: "loan", kind: "loan", col: 0, title: clip(loanTitle(loan), 24), sub: `${gbp(loan.amount_gbp)} · ${sectorName(loan.sector)}`, hot: live, x: COLX[0], y: 0,
      detail: { what: `${loan.name}. Borrower: ${loan.borrower}.`, value: `${gbp(loan.amount_gbp)} at ${loan.rate_pct}%`, sources: ["Loan terms (synthetic)"], effects: [] } };
    nodes.push(loanN);
    const mNodes: GNode[] = mets.map((m, i) => {
      const mm = forecast.metrics[m]!;
      const hit = metricsHit.has(m);
      return { id: `m:${m}`, kind: "metric" as Kind, col: 3 as const, title: METRIC_NAME[m], sub: `${fmt(m, mm.m6.mid)} in 6 mo, limit ${fmt(m, mm.limit)}`, hot: live && hit, x: COLX[3], y: TOP + i * ROW,
        detail: { what: `${METRIC_NAME[m]} is a rule in the loan agreement.`, value: `${fmt(m, mm.now)} now, ${fmt(m, mm.m6.mid)} in 6 months`, month: forecast.breach_metric === m && forecast.breach_month ? `First breach ${monthYear(forecast.breach_month)}` : undefined,
          sources: ["Forecast engine"], effects: drivers.filter((d) => metricOf(d.delta?.metric) === m).map(driverSentence), extra: [`Limit ${fmt(m, mm.limit)}${mm.cash_trap != null ? `, cash-trap level ${fmt(m, mm.cash_trap)}` : ""}`] } };
    });
    const colMid = (col2.length ? (col2[0].y + col2[col2.length - 1].y) / 2 : TOP);
    const mShift = colMid - span(mNodes);
    mNodes.forEach((n) => (n.y += mShift));
    loanN.y = colMid;
    nodes.push(...mNodes);

    const edges: GEdge[] = [];
    const hubB = "hub:b";
    edges.push({ from: "loan", to: hubB, hot: live && hotB.size > 0 });
    if (evNodes.length) edges.push({ from: "loan", to: "hub:e", hot: live });
    for (const n of c2) edges.push({ from: hubB, to: n.id, hot: live });
    for (const n of other) edges.push({ from: hubB, to: n.id, hot: false });
    for (const n of evNodes) edges.push({ from: "hub:e", to: n.id, hot: live });
    const link = (id: string, ds: Forecast["drivers"]) => {
      const ms = new Set(ds.map((d) => metricOf(d.delta?.metric)).filter((m): m is MetricKey => !!m && mets.includes(m)));
      ms.forEach((m) => edges.push({ from: id, to: `m:${m}`, hot: live }));
    };
    sigList.forEach(([k, g]) => link(`s:${k}`, g.ds));
    evList.forEach(([k, g]) => link(`e:${k}`, g.ds));
    const maxY = Math.max(...nodes.map((n) => n.y));
    return { nodes, edges, height: maxY + NH + 20 };
  }, [loan, forecast, signals, evidence]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const trail = useMemo(() => {
    const id = hover ?? sel;
    if (!id) return null;
    const keep = new Set<string>([id]);
    const up = (x: string) => edges.filter((e) => e.to === x).forEach((e) => { if (!keep.has(e.from)) { keep.add(e.from); up(e.from); } });
    const down = (x: string) => edges.filter((e) => e.from === x).forEach((e) => { if (!keep.has(e.to)) { keep.add(e.to); down(e.to); } });
    up(id); down(id);
    return keep;
  }, [hover, sel, edges]);

  const selected = sel ? byId.get(sel) : null;
  const path = (a: GNode, b: GNode) => {
    const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };
  const heads = ["Loan", "Buildings", "Warning signs & evidence", "Covenant at risk"];

  return (
    <div className="grid lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 border-b border-line text-[12px] text-sub">
          <span>Click any box to see the detail.</span>
          <span className="flex items-center gap-1"><span className="w-4 h-[3px] rounded" style={{ background: hotCol.dot }} aria-hidden="true" />Drives the forecast</span>
          <span className="flex items-center gap-1"><span className="w-4 h-px bg-[#B7AF9F]" aria-hidden="true" />Checked, not a driver</span>
          <span className="ml-auto flex items-center gap-1">
            <button className="chip !min-h-7" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.15).toFixed(2)))} aria-label="Zoom out"><ZoomOut className="w-3 h-3" aria-hidden="true" /></button>
            <button className="chip !min-h-7" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.15).toFixed(2)))} aria-label="Zoom in"><ZoomIn className="w-3 h-3" aria-hidden="true" /></button>
            <button className="chip !min-h-7" onClick={() => setZoom(1)}><Maximize2 className="w-3 h-3" aria-hidden="true" />Fit</button>
            <button className="chip !min-h-7" onClick={() => { setSel(null); setHover(null); setZoom(1); }}><RotateCcw className="w-3 h-3" aria-hidden="true" />Reset</button>
          </span>
        </div>
        <div className="overflow-auto dotgrid" style={{ maxHeight: 560 }}>
          <svg viewBox={`0 0 ${W} ${height}`} style={{ width: `${zoom * 100}%`, minWidth: 640 }} className="block h-auto" role="group" aria-label={`Knowledge graph for ${loanTitle(loan)}`}>
            {heads.map((h, i) => <text key={h} x={COLX[i] + NW / 2} y={18} textAnchor="middle" fontSize="12" fontWeight="600" fill="#5F5B53">{h}</text>)}
            {edges.map((e, i) => {
              const a = byId.get(e.from), b = byId.get(e.to); if (!a || !b) return null;
              const on = !trail || (trail.has(e.from) && trail.has(e.to));
              return <path key={i} d={path(a, b)} fill="none" stroke={e.hot ? hotCol.dot : "#C9C2B5"} strokeWidth={e.hot ? 2.5 : 1} strokeOpacity={on ? (e.hot ? 0.9 : 0.8) : 0.12} />;
            })}
            {nodes.map((n) => {
              const on = !trail || trail.has(n.id);
              const isSel = sel === n.id;
              return (
                <g key={n.id} tabIndex={0} role="button" aria-label={`${n.title}. ${n.sub}`} aria-pressed={isSel} className="cursor-pointer outline-none" opacity={on ? 1 : 0.3}
                  onClick={() => setSel(isSel ? null : n.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSel(isSel ? null : n.id))}
                  onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.id)} onBlur={() => setHover(null)}>
                  <title>{`${n.title}: ${n.sub}`}</title>
                  <rect x={n.x} y={n.y} width={NW} height={NH} rx="9" fill={n.hot ? hotCol.bg : "#FFFFFF"} stroke={isSel ? "#1E1D1A" : n.hot ? hotCol.dot : "#CFC8BB"} strokeWidth={isSel ? 2.5 : n.hot ? 1.8 : 1} />
                  <text x={n.x + 10} y={n.y + 14} fontSize="9.5" fill={n.hot ? hotCol.text : "#8A857A"}>{TAG[n.kind]}</text>
                  <text x={n.x + 10} y={n.y + 29} fontSize="13" fontWeight="600" fill={n.hot ? "#1E1D1A" : "#5F5B53"}>{clip(n.title, 24)}</text>
                  <text x={n.x + 10} y={n.y + 42} fontSize="10.5" fill="#5F5B53">{clip(n.sub, 32)}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <aside className={`border-line p-4 ${selected ? "fixed bottom-0 inset-x-0 z-40 max-h-[65vh] overflow-y-auto bg-white border-t shadow-[0_-12px_32px_-12px_rgba(30,29,26,.3)] rounded-t-2xl" : "hidden"} lg:static lg:block lg:max-h-none lg:shadow-none lg:rounded-none lg:border-t-0 lg:border-l lg:min-h-[200px]`} aria-live="polite" aria-label="Detail">
        {!selected ? (
          <p className="text-[13px] text-sub">Click any box to see what it is, where the data comes from and which covenant it pushes.</p>
        ) : (
          <div>
            <div className="flex items-center"><p className="text-[12px] text-sub">{TAG[selected.kind]}</p><button className="ml-auto chip lg:hidden" onClick={() => setSel(null)}>Close</button></div>
            <h3 className="serif text-[24px] leading-7">{selected.title}</h3>
            <p className="text-[13px] mt-2">{selected.detail.what}</p>
            {selected.detail.value && <p className="text-[13px] mt-3"><b>{selected.detail.value}</b>{selected.detail.month ? <span className="text-sub"> · {selected.detail.month}</span> : null}</p>}
            {selected.detail.extra && selected.detail.extra.length > 0 && <ul className="mt-2 text-[12px] text-sub list-disc pl-4 space-y-1">{selected.detail.extra.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            {selected.detail.effects.length > 0 && (
              <div className="mt-3"><p className="text-[12px] font-semibold text-sub">What it does to the covenant</p>
                <ul className="mt-1 text-[13px] space-y-1">{selected.detail.effects.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            )}
            <div className="mt-3"><p className="text-[12px] font-semibold text-sub">Source</p><p className="text-[13px]">{selected.detail.sources.join(", ")}</p></div>
            {selected.detail.evidenceLink && <a href="?tab=evidence" className="btn btn-ghost mt-4">See it in the Evidence tab</a>}
          </div>
        )}
      </aside>
    </div>
  );
}
