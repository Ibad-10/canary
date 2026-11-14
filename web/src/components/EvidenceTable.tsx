"use client";
import { useMemo, useState } from "react";
import { Database, FileText, Flag, Globe, LineChart, List, X } from "lucide-react";
import type { Evidence, Forecast, Signal, Source } from "@/lib/types";
import { sourceLabel, valueUnit } from "@/lib/calc";
import { evidenceName, humanise, plainEffect, signalName, shortDate } from "@/lib/labels";
import { writeRow } from "@/lib/supabase";
import { useAuthor } from "@/lib/useAuthor";
import { useToast } from "./Toast";

type Row = { key: string; cat: string; finding: string; sub: string; value: string; why: string; label: string; source: Source; signalKind: string; hot: boolean };
const ICON = { db: Database, list: List, url: Globe, doc: FileText, msci: LineChart } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const SIGNALS = "Warning signs";

const FACT_LABEL: Record<string, string> = {
  dataset: "Dataset", table: "Table", tool: "Tool", sector: "Sector", series: "Series", metric: "Note", as_of: "As of", note: "Note", published: "Published", query: "Search used", page: "Page", clause: "Clause", label: "Label",
};
function sourceFacts(source: Source): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(source)) {
    if (v == null || typeof v === "boolean") continue;
    if (Array.isArray(v)) {
      if (k === "iqr" && v.length === 2) out.push(["Typical range", `${Number(v[0]).toLocaleString("en-GB")} to ${Number(v[1]).toLocaleString("en-GB")}`]);
      else out.push([k.endsWith("_ids") ? "Records used" : humanise(k), `${v.length}`]);
      continue;
    }
    if (k === "url") continue;
    if (k === "count") { out.push(["Records in total", String(v)]); continue; }
    const text = typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? shortDate(v) : String(v);
    out.push([FACT_LABEL[k] ?? humanise(k), text]);
  }
  return out;
}

export default function EvidenceTable({ loanId, persist, readOnly = false, forecast, signals, evidence }: { loanId: string; persist: boolean; readOnly?: boolean; forecast: Forecast; signals: Signal[]; evidence: Evidence[] }) {
  const [open, setOpen] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [cat, setCat] = useState<string>("all");
  const { toast, show } = useToast();
  const author = useAuthor();

  const rows = useMemo<Row[]>(() => {
    const whySig = new Map<number, string>(), whyEv = new Map<number, string>();
    for (const d of forecast.drivers ?? []) {
      const t = cap(plainEffect(d.effect_text));
      d.signal_ids?.forEach((id) => !whySig.has(id) && whySig.set(id, t));
      d.evidence_ids?.forEach((id) => !whyEv.has(id) && whyEv.set(id, t));
    }
    const sRows: Row[] = signals.map((s) => ({
      key: `s${s.id}`, cat: SIGNALS, finding: signalName(s.kind), sub: s.detail, value: valueUnit(s.value, s.unit),
      why: whySig.get(s.id) ?? "Within normal range, not moving the forecast.", label: sourceLabel(s.source).text,
      source: s.source, signalKind: s.kind, hot: whySig.has(s.id),
    }));
    const eRows: Row[] = evidence.map((e) => ({
      key: `e${e.id}`, cat: evidenceName(e.kind), finding: e.title, sub: evidenceName(e.kind), value: valueUnit(e.value, e.unit),
      why: whyEv.get(e.id) ?? "Context for the forecast.",
      label: e.label || sourceLabel(e.source).text, source: { ...e.source, ...(e.label ? { label: e.label } : {}) }, signalKind: e.kind, hot: whyEv.has(e.id),
    }));
    return [...sRows, ...eRows].sort((a, b) => Number(b.hot) - Number(a.hot));
  }, [forecast, signals, evidence]);

  const cats = useMemo(() => [...new Set(rows.map((r) => r.cat))], [rows]);
  const inCat = rows.filter((r) => cat === "all" || r.cat === cat);
  const visible = all || cat !== "all" ? inCat : [...inCat.filter((r) => r.hot).slice(0, 12), ...inCat.filter((r) => !r.hot).slice(0, 4)];

  async function flag() {
    if (!open) return;
    setBusy(true);
    const r = await writeRow("corrections", { loan_id: loanId, signal_kind: open.signalKind, note: note || `Flagged as wrong: ${open.finding}`, author }, persist);
    setBusy(false);
    show(r.ok ? (r.where === "supabase" ? "Correction saved to Canary's memory" : "Correction noted (sample mode, no database connected)") : `Could not save: ${r.error}`, r.ok);
    if (r.ok) { setOpen(null); setNote(""); }
  }

  const link = open && typeof open.source.url === "string" ? open.source.url : null;

  return (
    <section className="card overflow-hidden" aria-labelledby="h-ev">
      <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2">
        <h2 id="h-ev" className="text-[15px] font-semibold mr-2">Every number, with its source</h2>
        <div role="group" aria-label="Filter evidence" className="flex flex-wrap gap-1">
          <button className="chip" aria-pressed={cat === "all"} onClick={() => setCat("all")}>All</button>
          {cats.map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(cat === c ? "all" : c)}>{c}</button>)}
        </div>
      </div>
      {rows.length === 0 ? <p className="p-6 text-[13px] text-sub">No evidence has been collected for this loan yet.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="text-[12px] text-sub bg-[#FAF8F4]">
              <tr className="text-left"><th scope="col" className="font-medium px-4 h-9">What we found</th><th scope="col" className="text-right font-medium px-2">Value</th><th scope="col" className="font-medium pl-8">Why it matters</th><th scope="col" className="font-medium px-4">Source</th></tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const { kind } = sourceLabel(r.source, r.label);
                const Icon = ICON[kind];
                return (
                  <tr key={r.key} id={r.key} className="border-t border-line align-top scroll-mt-24">
                    <td className="px-4 py-3 max-w-[360px]"><div className="font-medium">{r.finding}</div><div className="text-[12px] text-sub mt-0.5">{r.sub}</div></td>
                    <td className="text-right tnum font-semibold px-2 py-3 whitespace-nowrap">{r.value}</td>
                    <td className={`pl-8 py-3 max-w-[300px] ${r.hot ? "text-ink" : "text-sub"}`}>{r.why}</td>
                    <td className="px-4 py-3"><button className="src" onClick={() => setOpen(r)} aria-haspopup="dialog"><Icon className="w-3 h-3" aria-hidden="true" />{r.label}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {cat === "all" && inCat.length > 16 && (
        <div className="px-4 h-10 border-t border-line flex items-center text-[12px] text-sub">
          Showing {visible.length} of {inCat.length}
          <button className="ml-auto underline hover:text-ink" onClick={() => setAll(!all)}>{all ? "Show fewer" : "Show all"}</button>
        </div>
      )}
      <div className={`fixed inset-0 bg-ink/20 z-40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} onClick={() => setOpen(null)} />
      <aside className="fixed top-0 right-0 bottom-0 w-[min(420px,100vw)] bg-white border-l border-line z-50 flex flex-col transition-transform duration-[450ms]"
        style={{ transform: open ? "none" : "translateX(105%)", boxShadow: "-24px 0 48px -24px rgba(30,29,26,.25)", transitionTimingFunction: "var(--ease)" }}
        role="dialog" aria-modal="true" aria-label="Source" aria-hidden={!open}>
        {open && (
          <>
            <div className="flex items-center gap-2 px-6 h-14 border-b border-line">
              <span className="text-[12px] text-sub">Source</span><span className="pill p-neutral">{open.label}</span>
              <button className="ml-auto btn btn-ghost !w-8 !px-0 justify-center" onClick={() => setOpen(null)} aria-label="Close source"><X className="w-4 h-4" aria-hidden="true" /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-[13px] text-sub">{open.sub}</p>
              <h3 className="serif text-[28px] leading-8 mt-1">{open.finding}</h3>
              <div className="tnum text-[20px] font-semibold mt-1">{open.value}</div>
              <p className="text-[13px] text-sub mt-2">{open.why}</p>
              <h4 className="text-[12px] font-semibold mt-6 text-sub">Where it comes from</h4>
              <dl className="mt-2 rounded-xl bg-[#FAF8F4] border border-line px-4 py-1 text-[13px]">
                {sourceFacts(open.source).map(([k, v]) => (
                  <div key={k} className="py-2 border-b border-line last:border-0 flex gap-4"><dt className="text-sub shrink-0">{k}</dt><dd className="ml-auto text-right break-words min-w-0">{v}</dd></div>
                ))}
              </dl>
              {link && <a className="btn btn-ghost mt-3" href={link} target="_blank" rel="noreferrer"><Globe className="w-4 h-4" aria-hidden="true" />Open link</a>}
              <label htmlFor="flag-note" className="text-[12px] font-semibold mt-6 block text-sub">Something wrong? Tell Canary</label>
              <textarea id="flag-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={readOnly} placeholder={readOnly ? "Read-only public demo" : "e.g. The gym is 4% of income, not 18%."} className="mt-2 w-full rounded-xl border border-line bg-white p-3 text-[13px]" />
            </div>
            <div className="p-4 border-t border-line flex gap-2">
              <span className="flex-1 flex" title={readOnly ? "Read-only public demo" : undefined}>
                <button className="btn btn-dark flex-1 justify-center" onClick={flag} disabled={busy || readOnly}><Flag className="w-4 h-4" aria-hidden="true" />Flag as wrong</button>
              </span>
              <button className="btn btn-ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
          </>
        )}
      </aside>
      {toast}
    </section>
  );
}
