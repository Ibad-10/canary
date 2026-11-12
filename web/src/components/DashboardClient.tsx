"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Briefcase, Home, Search, SearchX, SlidersHorizontal } from "lucide-react";
import type { Forecast, Loan, Status } from "@/lib/types";
import { STATUS_RANK, pp, stressLocal, type StressedRow } from "@/lib/calc";
import { L, METRIC_TIP, RESIDENTIAL, STATUS_COLOR, STATUS_NAME, STATUS_ORDER, driverSentence, loanCity, loanSite, loanTitle, sectorName, topDriver } from "@/lib/labels";
import { fmtHeadroom, headroom, monthYear } from "@/lib/view";
import { gbp } from "@/lib/calc";
import StatusPill from "./StatusPill";
import HeadroomChart from "./HeadroomChart";
import SectorChart, { type SectorDatum } from "./SectorChart";
import Tip from "./Tip";

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_URL;

type EngineItem = { loan_id?: string; id?: string; status?: string; metrics?: { icr?: { m6?: { mid?: number } }; ltv?: { m6?: { mid?: number } } } };

async function engineStress(rateBps: number, valuePct: number): Promise<Map<string, EngineItem> | null> {
  if (!ENGINE) return null;
  try {
    const res = await fetch(`${ENGINE}/stress?rate_bps=${rateBps}&value_pct=${-valuePct}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    const arr: EngineItem[] = Array.isArray(j) ? j : (j.loans ?? j.results ?? j.forecasts ?? Object.values(j));
    const m = new Map<string, EngineItem>();
    for (const it of arr) {
      const id = it?.loan_id ?? it?.id;
      if (id && ["red", "amber", "green"].includes(String(it.status))) m.set(id, it);
    }
    return m.size ? m : null;
  } catch {
    return null;
  }
}

type Row = {
  l: Loan; f: Forecast; status: Status; icrNow: number | null; icr6: number | null; ltv6: number | null;
  icrLim: number | null; ltvLim: number | null; icrHead: number | null; ltvHead: number | null; reason: string; breach: string | null;
};
type SortKey = "name" | "sector" | "size" | "icrNow" | "icr6" | "icrHead" | "ltv6" | "ltvHead" | "breach" | "status";

type Sort = { key: SortKey; dir: 1 | -1 };
function Th({ k, children, right, className = "", sort, onSort }: { k: SortKey; children: React.ReactNode; right?: boolean; className?: string; sort: Sort; onSort: (k: SortKey) => void }) {
  return (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`font-medium h-10 px-3 whitespace-nowrap ${right ? "text-right" : ""} ${className}`}>
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-ink">
        {children}
        {sort.key === k ? (sort.dir === 1 ? <ArrowUp className="w-3 h-3" aria-hidden="true" /> : <ArrowDown className="w-3 h-3" aria-hidden="true" />) : null}
      </button>
    </th>
  );
}

export default function DashboardClient({ loans, forecasts, initialStatus }: { loans: Loan[]; forecasts: Forecast[]; initialStatus: Status | "all" }) {
  const router = useRouter();
  const [rate, setRate] = useState(0);
  const [val, setVal] = useState(0);
  const [engRes, setEngRes] = useState<{ key: string; map: Map<string, EngineItem> | null } | null>(null);
  const [fStatus, setFStatus] = useState<Status | "all">(initialStatus);
  const [fSector, setFSector] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });

  useEffect(() => {
    if (!ENGINE || (!rate && !val)) return;
    let live = true;
    const t = setTimeout(async () => { const r = await engineStress(rate, val); if (live) setEngRes({ key: `${rate}|${val}`, map: r }); }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [rate, val]);

  const eng = engRes && engRes.key === `${rate}|${val}` ? engRes.map : null;
  const fById = useMemo(() => new Map(forecasts.map((f) => [f.loan_id, f])), [forecasts]);
  const all = useMemo<Row[]>(() => loans.filter((l) => fById.has(l.id)).map((l) => {
    const f = fById.get(l.id)!;
    const local: StressedRow = stressLocal(l, f, rate, val);
    const e = eng?.get(l.id);
    const status = (e?.status as Status | undefined) ?? local.status;
    const icr6 = e?.metrics?.icr?.m6?.mid ?? local.icr6;
    const ltv6 = e?.metrics?.ltv?.m6?.mid != null ? pp("ltv", e.metrics.ltv.m6.mid) : local.ltv6;
    const icrLim = pp("icr", f.metrics.icr?.limit), ltvLim = pp("ltv", f.metrics.ltv?.limit);
    const d = topDriver(f);
    return {
      l, f, status, icrNow: local.icrNow, icr6, ltv6, icrLim, ltvLim,
      icrHead: headroom("icr", icr6, icrLim), ltvHead: headroom("ltv", ltv6, ltvLim),
      reason: d ? driverSentence(d) : "", breach: status === "red" ? f.breach_month : null,
    };
  }), [loans, fById, rate, val, eng]);

  const needle = q.trim().toLowerCase();
  const matchQ = (r: Row) => !needle || [r.l.name, r.l.borrower, r.l.id, sectorName(r.l.sector), r.l.sector, loanCity(r.l)].some((s) => s.toLowerCase().includes(needle));
  const baseFiltered = all.filter((r) => (fStatus === "all" || r.status === fStatus) && matchQ(r));
  const shown = baseFiltered.filter((r) => !fSector || r.l.sector === fSector);

  const counts = { red: 0, amber: 0, green: 0 };
  all.filter((r) => matchQ(r) && (!fSector || r.l.sector === fSector)).forEach((r) => counts[r.status]++);
  const sectors = [...new Set(loans.map((l) => l.sector))];
  const sectorData: SectorDatum[] = sectors.map((s) => {
    const rs = baseFiltered.filter((r) => r.l.sector === s);
    return { sector: s, name: sectorName(s), red: rs.filter((r) => r.status === "red").length, amber: rs.filter((r) => r.status === "amber").length, green: rs.filter((r) => r.status === "green").length };
  }).filter((d) => d.red + d.amber + d.green > 0);

  const sorted = [...shown].sort((a, b) => {
    const k = sort.key;
    const num = (r: Row): number | string => {
      switch (k) {
        case "name": return loanTitle(r.l);
        case "sector": return sectorName(r.l.sector);
        case "size": return r.l.amount_gbp;
        case "icrNow": return r.icrNow ?? -9e9;
        case "icr6": return r.icr6 ?? -9e9;
        case "icrHead": return r.icrHead ?? 9e9;
        case "ltv6": return r.ltv6 ?? -9e9;
        case "ltvHead": return r.ltvHead ?? 9e9;
        case "breach": return r.breach ?? "9999";
        case "status": return STATUS_RANK[r.status];
      }
    };
    const x = num(a), y = num(b);
    const c = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
    return (c || STATUS_RANK[a.status] - STATUS_RANK[b.status] || loanTitle(a.l).localeCompare(loanTitle(b.l))) * sort.dir;
  });

  const stressed = rate > 0 || val > 0;
  const filtered = fStatus !== "all" || fSector !== null || needle !== "";
  const clear = () => { setFStatus("all"); setFSector(null); setQ(""); };
  const open = (id: string) => router.push(`/desk/loan/${id}`);
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }));
  const chartRows = (m: "icr" | "ltv") => shown.map((r) => ({ id: r.l.id, label: loanSite(r.l), now: m === "icr" ? r.icrNow : r.f.metrics.ltv ? stressLocal(r.l, r.f, rate, val).ltvNow : null, six: m === "icr" ? r.icr6 : r.ltv6, limit: m === "icr" ? r.icrLim : r.ltvLim, status: r.status }));



  return (
    <div className="space-y-4">
      <section className="card p-3 flex flex-wrap items-center gap-2" aria-label="Filters">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
          <button className="chip" aria-pressed={fStatus === "all"} onClick={() => setFStatus("all")}>All</button>
          {STATUS_ORDER.map((s) => (
            <button key={s} className="chip" aria-pressed={fStatus === s} onClick={() => setFStatus(fStatus === s ? "all" : s)}>
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s].dot }} aria-hidden="true" />{STATUS_NAME[s]}<span className="tnum opacity-70">{counts[s]}</span>
            </button>
          ))}
        </div>
        <span className="w-px h-6 bg-line mx-1 hidden md:block" aria-hidden="true" />
        <div role="group" aria-label="Filter by sector" className="flex flex-wrap gap-1">
          {sectors.map((s) => (
            <button key={s} className="chip" aria-pressed={fSector === s} onClick={() => setFSector(fSector === s ? null : s)}>
              {RESIDENTIAL.has(s) ? <Home className="w-3 h-3" aria-hidden="true" /> : <Briefcase className="w-3 h-3" aria-hidden="true" />}{sectorName(s)}
            </button>
          ))}
        </div>
        <label className="ml-auto relative">
          <span className="sr-only">Search loans</span>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sub" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search loans" className="h-8 w-[200px] rounded-full border border-line bg-white pl-9 pr-3 text-[13px]" />
        </label>
        {filtered && <button className="chip" onClick={clear}>Clear filters</button>}
      </section>

      <div className="grid gap-4 2xl:grid-cols-2">
        <section className="card overflow-hidden" aria-labelledby="h-icr">
          <div className="px-4 pt-4">
            <h2 id="h-icr" className="text-[15px] font-semibold"><Tip label="Interest cover" tip={METRIC_TIP.icr} /> headroom</h2>
            <p className="text-[12px] text-sub mt-0.5">How far each loan is from its limit in 6 months. Bars left of the line are past it.</p>
          </div>
          <div className="p-3"><HeadroomChart metric="icr" rows={chartRows("icr")} onOpen={open} /></div>
        </section>
        <section className="card overflow-hidden" aria-labelledby="h-ltv">
          <div className="px-4 pt-4">
            <h2 id="h-ltv" className="text-[15px] font-semibold"><Tip label="Loan-to-value" tip={METRIC_TIP.ltv} /> headroom</h2>
            <p className="text-[12px] text-sub mt-0.5">Percentage points left before the limit in 6 months. Tightest first.</p>
          </div>
          <div className="p-3"><HeadroomChart metric="ltv" rows={chartRows("ltv")} onOpen={open} /></div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <section className="card overflow-hidden" aria-labelledby="h-sec">
          <div className="px-4 pt-4"><h2 id="h-sec" className="text-[15px] font-semibold">Status by sector</h2><p className="text-[12px] text-sub mt-0.5">Click a bar to filter the table.</p></div>
          <SectorChart data={sectorData} onPick={(s) => setFSector(fSector === s ? null : s)} />
        </section>
        <section className="card p-4 flex flex-col" aria-labelledby="h-stress">
          <div className="flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" aria-hidden="true" /><h2 id="h-stress" className="text-[15px] font-semibold">What if…?</h2></div>
          <p className="text-[12px] text-sub mt-1">Move a slider and every chart and row re-checks.</p>
          <label htmlFor="rate" className="mt-4 text-[13px] flex justify-between"><span>Interest rates rise by</span><span className="tnum font-semibold">+{(rate / 100).toFixed(2)} pts</span></label>
          <input id="rate" type="range" min={0} max={300} step={25} value={rate} onChange={(e) => setRate(+e.target.value)} className="w-full" />
          <label htmlFor="val" className="mt-2 text-[13px] flex justify-between"><span>Property values fall by</span><span className="tnum font-semibold">−{val}%</span></label>
          <input id="val" type="range" min={0} max={20} step={1} value={val} onChange={(e) => setVal(+e.target.value)} className="w-full" />
          <div className="mt-auto pt-4 text-[13px]" aria-live="polite">
            <p>{stressed ? "With these shocks" : "On today's trend"}:</p>
            <p className="mt-1 flex flex-wrap gap-x-3">
              {STATUS_ORDER.map((s) => <b key={s} style={{ color: STATUS_COLOR[s].text }}>{all.filter((r) => r.status === s).length} {STATUS_NAME[s].toLowerCase()}</b>)}
            </p>
            {stressed && <p className="text-[12px] text-sub mt-1">{eng ? "Re-run by the engine." : "Approximate, worked out in your browser."}</p>}
            {stressed && <button className="chip mt-2" onClick={() => { setRate(0); setVal(0); }}>Reset</button>}
          </div>
        </section>
      </div>

      <section className="card overflow-hidden" aria-labelledby="h-book">
        <div className="px-4 py-3 border-b border-line flex items-center">
          <h2 id="h-book" className="text-[15px] font-semibold">All loans</h2>
          <span className="ml-auto text-[12px] text-sub" aria-live="polite">Showing {sorted.length} of {loans.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Loans with their covenant health. Click a row to open the deep dive. Column headers sort the table.</caption>
            <thead className="bg-[#FAF8F4] text-[12px] text-sub">
              <tr className="border-b border-line text-left">
                <Th sort={sort} onSort={toggleSort} k="name">{L.loan}</Th>
                <Th sort={sort} onSort={toggleSort} k="sector">{L.sector}</Th>
                <Th sort={sort} onSort={toggleSort} k="size" right>{L.loanSize}</Th>
                <Th sort={sort} onSort={toggleSort} k="icrNow" right>{L.icrNow}</Th>
                <Th sort={sort} onSort={toggleSort} k="icr6" right>{L.icr6}</Th>
                <Th sort={sort} onSort={toggleSort} k="icrHead" right>Cover {L.headroom.toLowerCase()}</Th>
                <Th sort={sort} onSort={toggleSort} k="ltv6" right>{L.ltv6}</Th>
                <Th sort={sort} onSort={toggleSort} k="ltvHead" right>LTV {L.headroom.toLowerCase()}</Th>
                <Th sort={sort} onSort={toggleSort} k="breach">{L.firstBreach}</Th>
                <th scope="col" className="font-medium h-10 px-3 hidden 2xl:table-cell">{L.mainReason}</th>
                <Th sort={sort} onSort={toggleSort} k="status">{L.status}</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.l.id} tabIndex={0} className="border-b border-line last:border-0 cursor-pointer" onClick={() => open(r.l.id)} onKeyDown={(e) => e.key === "Enter" && open(r.l.id)}
                  aria-label={`${loanTitle(r.l)}, ${STATUS_NAME[r.status]}. Open deep dive`}>
                  <td className="px-3 py-2.5"><Link href={`/desk/loan/${r.l.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{loanTitle(r.l)}</Link><div className="text-[12px] text-sub">{r.l.borrower}</div></td>
                  <td className="px-3 text-sub whitespace-nowrap">{sectorName(r.l.sector)}</td>
                  <td className="px-3 text-right tnum whitespace-nowrap">{gbp(r.l.amount_gbp)}</td>
                  <td className="px-3 text-right tnum">{r.icrNow != null ? `${r.icrNow.toFixed(2)}x` : "–"}</td>
                  <td className={`px-3 text-right tnum ${r.icrHead != null && r.icrHead < 0 ? "text-red-t font-semibold" : ""}`}>{r.icr6 != null ? `${r.icr6.toFixed(2)}x` : "–"}</td>
                  <td className={`px-3 text-right tnum ${r.icrHead != null && r.icrHead < 0 ? "text-red-t" : "text-sub"}`}>{fmtHeadroom("icr", r.icrHead)}</td>
                  <td className={`px-3 text-right tnum ${r.ltvHead != null && r.ltvHead < 0 ? "text-red-t font-semibold" : ""}`}>{r.ltv6 != null ? `${r.ltv6.toFixed(0)}%` : "–"}</td>
                  <td className={`px-3 text-right tnum whitespace-nowrap ${r.ltvHead != null && r.ltvHead < 0 ? "text-red-t" : "text-sub"}`}>{fmtHeadroom("ltv", r.ltvHead)}</td>
                  <td className="px-3 tnum whitespace-nowrap">{r.breach ? monthYear(r.breach) : <span className="text-sub">{r.status === "red" ? "Under stress" : "None forecast"}</span>}</td>
                  <td className="px-3 text-sub max-w-[260px] hidden 2xl:table-cell"><span className="line-clamp-2">{r.reason}</span></td>
                  <td className="px-3"><StatusPill status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div className="py-12 text-center">
              <SearchX className="w-6 h-6 mx-auto text-sub" aria-hidden="true" />
              <p className="mt-2 font-medium">No loans match</p>
              <p className="text-[13px] text-sub">Try a different filter or search.</p>
              <button className="btn btn-ghost mt-4" onClick={clear}>Clear filters</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
