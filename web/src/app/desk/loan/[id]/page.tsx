import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ArrowUpRight, FileText, Mail } from "lucide-react";
import { getBundle } from "@/lib/data";
import { METRICS, detailLine, fmt, fmtCov, gbp, headline, pp } from "@/lib/calc";
import type { Forecast, Loan, MetricKey, Status } from "@/lib/types";
import { L, METRIC_NAME, METRIC_TIP, STATUS_COLOR, STATUS_HINT, driverSentence, loanTitle, newsItems, sectorName, shortDate, signalName } from "@/lib/labels";
import { monthYear } from "@/lib/view";
import StatusPill from "@/components/StatusPill";
import CovenantChart from "@/components/CovenantChart";
import LoanGraph from "@/components/LoanGraph";
import EvidenceTable from "@/components/EvidenceTable";
import DismissButton from "@/components/DismissButton";
import LoanTabs, { type TabDef } from "@/components/LoanTabs";
import Tip from "@/components/Tip";

export const dynamic = "force-dynamic";

function metricStatus(f: Forecast, k: MetricKey): Status {
  const m = f.metrics[k]; if (!m) return "green";
  const below = k !== "ltv";
  const lim = pp(k, m.limit), trap = pp(k, m.cash_trap);
  const vals = [m.m3?.mid, m.m6?.mid].map((x) => pp(k, x)).filter((x): x is number => x != null);
  if (lim != null && vals.some((v) => (below ? v < lim : v > lim))) return "red";
  if (trap != null && vals.some((v) => (below ? v <= trap : v >= trap))) return "amber";
  return "green";
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-line last:border-0 flex items-baseline gap-4">
      <dt className="text-[13px] text-sub">{label}</dt>
      <dd className="ml-auto text-[14px] font-medium text-right tnum">{value}</dd>
    </div>
  );
}

function covenantRows(loan: Loan, f: Forecast) {
  const c = loan.covenants;
  const rows: { k: MetricKey; rule: string; limit?: number; trap?: number; trapRule: string }[] = [
    { k: "icr", rule: "at least", limit: c.icr_min, trap: c.icr_cash_trap, trapRule: "below" },
    { k: "ltv", rule: "at most", limit: c.ltv_max, trap: c.ltv_cash_trap, trapRule: "above" },
    { k: "occupancy", rule: "at least", limit: c.occupancy_min, trap: c.occupancy_cash_trap, trapRule: "below" },
  ];
  return rows.filter((r) => r.limit != null || r.trap != null).map((r) => ({ ...r, six: f.metrics[r.k]?.m6?.mid }));
}

export default async function LoanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  const b = await getBundle();
  const loan = b.loans.find((l) => l.id === id);
  const f = b.forecasts.find((x) => x.loan_id === id);
  if (!loan || !f) notFound();
  const signals = b.signals.filter((s) => s.loan_id === id);
  const evidence = b.evidence.filter((e) => e.loan_id === id);
  const news = newsItems(evidence, [f]);
  const metricKeys = METRICS.filter((k) => f.metrics[k]);
  const dismissKind = f.drivers?.[0]?.kind ?? f.breach_metric ?? "loan";
  const chase = b.drafts.find((d) => d.kind === "chase" && d.loan_id === id);
  const col = STATUS_COLOR[f.status];
  const v7 = b.steps.find((s) => /v7/i.test(s.owner));
  const file = loan.contract_file ? loan.contract_file.split(/[\\/]/).pop()! : null;
  const contractSource = file && /\.pdf$/i.test(file) && v7 ? `Extracted by V7 Go from ${file}` : file ? `Terms from ${file}` : "Terms on file";

  /* ---------- tabs ---------- */
  const overview = (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
          {metricKeys.map((k) => {
            const m = f.metrics[k]!; const st = metricStatus(f, k); const c = STATUS_COLOR[st];
            const lim = pp(k, m.limit);
            const scale = k === "icr" ? Math.max(2.5, (pp(k, m.now) ?? 0) * 1.2, (lim ?? 0) * 1.3) : 100;
            const p = ((pp(k, m.m6.mid) ?? 0) / scale) * 100;
            return (
              <div key={k} className="rounded-2xl border p-4 bg-white" style={{ borderColor: st === "green" ? "#E6E1D8" : c.bd, background: st === "green" ? "#fff" : c.bg }}>
                <div className="text-[13px] text-sub"><Tip label={`${METRIC_NAME[k]} in 6 months`} tip={METRIC_TIP[k]} /></div>
                <div className="serif text-[44px] leading-[48px] mt-1 tnum" style={{ color: c.text }}>{fmt(k, m.m6.mid)}</div>
                <div className="relative h-2.5 rounded-full bg-white border border-line mt-3">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, p)}%`, background: c.dot }} />
                  {lim != null && <div className="absolute -top-1 h-[18px] w-[3px] rounded bg-ink" style={{ left: `${Math.min(99, (lim / scale) * 100)}%` }} title={`${L.limit} ${fmtCov(k, m.limit)}`} />}
                </div>
                <dl className="text-[12px] text-sub mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 tnum">
                  <dt>Now</dt><dd className="text-right text-ink">{fmt(k, m.now)}</dd>
                  <dt>Range</dt><dd className="text-right text-ink">{fmt(k, m.m6.lo)} to {fmt(k, m.m6.hi)}</dd>
                  <dt>{L.limit}</dt><dd className="text-right text-ink">{fmtCov(k, m.limit)}</dd>
                </dl>
              </div>
            );
          })}
        </div>
        <section className="card p-5" aria-labelledby="h-main">
          <h2 id="h-main" className="text-[15px] font-semibold">{L.mainReason}</h2>
          {f.drivers?.length ? (
            <ul className="mt-2 space-y-2 text-[14px]">
              {f.drivers.slice(0, 3).map((d, i) => <li key={i} className="flex gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col.dot }} aria-hidden="true" />{driverSentence(d)}</li>)}
            </ul>
          ) : <p className="text-[13px] text-sub mt-2">No warning signs are moving the forecast.</p>}
        </section>
      </div>
      <div className="space-y-4">
        <section className="card p-5" aria-label="Key facts">
          <h2 className="text-[15px] font-semibold">Key facts</h2>
          <dl className="mt-1">
            <Fact label={L.loanSize} value={gbp(loan.amount_gbp)} />
            <Fact label={L.propertyValue} value={gbp(loan.value_gbp)} />
            <Fact label={L.rate} value={`${loan.rate_pct}%`} />
            <Fact label={L.sector} value={sectorName(loan.sector)} />
            <Fact label={L.borrower} value={loan.borrower} />
            <Fact label={L.owner} value={loan.owner} />
            <Fact label={L.firstBreach} value={f.status === "red" && f.breach_month ? monthYear(f.breach_month) : "None forecast"} />
          </dl>
          {loan.synthetic_note && <p className="text-[11px] leading-4 text-sub mt-2">Loan terms are synthetic. Buildings and market data are real.</p>}
        </section>
        <section className="card p-5" aria-label="Actions">
          <h2 className="text-[15px] font-semibold">Next step</h2>
          <p className="text-[13px] text-sub mt-1">{f.status === "red" ? "Move to the red watchlist and ask the borrower for an update." : f.status === "amber" ? "Keep on the watchlist. It is heading for a cash-trap level." : "No action needed. Canary keeps watching."}</p>
          <div className="mt-3 flex flex-col gap-2">
            <Link href={`/desk/memo/${loan.id}`} className="btn btn-dark justify-center"><FileText className="w-4 h-4" aria-hidden="true" />Review the memo</Link>
            <DismissButton persist={b.source !== "fixture"} loanId={loan.id} signalKind={dismissKind} />
          </div>
          {chase && <p className="text-[12px] text-sub mt-3 flex items-center gap-1.5"><Mail className="w-3 h-3" aria-hidden="true" />Borrower letter drafted, not sent.</p>}
        </section>
      </div>
    </div>
  );

  const forecast = (
    <section className="card overflow-hidden" aria-labelledby="h-chart">
      <div className="px-4 pt-4"><h2 id="h-chart" className="text-[15px] font-semibold">Forecast</h2><p className="text-[12px] text-sub mt-0.5">Past months, the 6-month range, the covenant limit and the cash-trap level.</p></div>
      <CovenantChart key={f.loan_id} forecast={f} asOf={b.run.as_of} />
    </section>
  );

  const why = (
    <div className="space-y-4">
      <section className="card overflow-hidden" aria-labelledby="h-graph">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b border-line">
          <h2 id="h-graph" className="text-[15px] font-semibold">How we got here</h2>
          <span className="text-[12px] text-sub">Loan, buildings, warning signs, rule at risk</span>
          <span className="ml-auto flex items-center gap-4 text-[12px] text-sub">
            <span className="flex items-center gap-1"><span className="w-4 h-[2px]" style={{ background: col.dot }} aria-hidden="true" />Problem path</span>
            <span className="flex items-center gap-1"><span className="w-4 h-px bg-[#CFC8BB]" aria-hidden="true" />Checked, fine</span>
          </span>
        </div>
        <LoanGraph loan={loan} forecast={f} signals={signals} evidence={evidence} />
      </section>
      <section className="card p-5" aria-labelledby="h-drv">
        <h2 id="h-drv" className="text-[15px] font-semibold">What is moving the forecast</h2>
        {f.drivers?.length ? (
          <ul className="mt-3 divide-y divide-line">
            {f.drivers.map((d, i) => (
              <li key={i} className="py-3 first:pt-0 last:pb-0">
                <p className="text-[14px] font-medium">{signalName(d.kind)}</p>
                <p className="text-[13px] text-[#3A3833] mt-0.5">{driverSentence(d)}</p>
                <p className="text-[12px] text-sub mt-0.5">{d.label.replace(/\(ILLUSTRATIVE\)/g, "(illustrative estimate)")}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13px] text-sub mt-2">Nothing is moving the forecast.</p>}
      </section>
    </div>
  );

  const evidenceTab = <EvidenceTable persist={b.source !== "fixture"} loanId={loan.id} forecast={f} signals={signals} evidence={evidence.filter((e) => e.kind !== "news")} />;

  const newsTab = news.length === 0 ? (
    <p className="card p-6 text-[14px] text-sub">No news has been found for this borrower or area.</p>
  ) : (
    <div className="grid gap-4 md:grid-cols-2">
      {news.map((n) => (
        <article key={n.id} className="card p-5 flex flex-col">
          <div className="flex items-center gap-2">
            <span className={`pill ${n.severity === "high" ? "p-red" : n.severity === "medium" ? "p-amb" : "p-neutral"}`}>{n.severityLabel}</span>
            {n.moved && <span className="pill p-neutral">Moved the forecast</span>}
          </div>
          <h3 className="font-semibold text-[16px] leading-6 mt-3">{n.headline}</h3>
          <p className="text-[12px] text-sub mt-1">{[n.domain, shortDate(n.published)].filter(Boolean).join(" · ")}</p>
          <p className="text-[13px] mt-3"><b>Why it matters:</b> {n.why}</p>
          {n.url && <a href={n.url} target="_blank" rel="noreferrer" className="btn btn-ghost mt-4 self-start">Read the article <ArrowUpRight className="w-4 h-4" aria-hidden="true" /></a>}
        </article>
      ))}
    </div>
  );

  const crows = covenantRows(loan, f);
  const contract = (
    <section className="card overflow-hidden" aria-labelledby="h-terms">
      <div className="px-5 py-4 border-b border-line flex flex-wrap items-center gap-2">
        <h2 id="h-terms" className="text-[15px] font-semibold">Covenant terms</h2>
        <span className="pill p-neutral ml-auto"><FileText className="w-3 h-3" aria-hidden="true" />{contractSource}</span>
      </div>
      {crows.length ? (
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAF8F4] text-[12px] text-sub"><tr className="text-left"><th scope="col" className="font-medium h-9 px-5">Rule</th><th scope="col" className="font-medium">{L.limit}</th><th scope="col" className="font-medium">{L.cashTrap}</th><th scope="col" className="font-medium px-5 text-right">In 6 months</th></tr></thead>
          <tbody>
            {crows.map((r) => (
              <tr key={r.k} className="border-t border-line">
                <td className="px-5 py-3 font-medium">{METRIC_NAME[r.k]}</td>
                <td className="tnum">{r.limit != null ? `${r.rule} ${fmtCov(r.k, r.limit)}` : "–"}</td>
                <td className="tnum text-sub">{r.trap != null ? `${r.trapRule} ${fmtCov(r.k, r.trap)}` : "–"}</td>
                <td className="px-5 text-right tnum font-medium">{fmt(r.k, r.six)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="p-5 text-[13px] text-sub">No covenant terms are on file for this loan.</p>}
      <div className="px-5 py-4 border-t border-line text-[12px] text-sub space-y-1">
        {loan.covenants.test && <p>The lender tests {loan.covenants.test === "ICR" ? "interest cover" : loan.covenants.test.toLowerCase()} on the covenant date.</p>}
        <p>Below the cash-trap level the lender may hold cash back. Past the limit the loan is in breach.</p>
        {loan.synthetic_note && <p>Loan terms are synthetic. Buildings and market data are real.</p>}
      </div>
    </section>
  );

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview", content: overview },
    { id: "forecast", label: "Forecast", content: forecast },
    { id: "why", label: "Why", content: why },
    { id: "evidence", label: "Evidence", badge: evidence.filter((e) => e.kind !== "news").length + signals.length, content: evidenceTab },
    { id: "news", label: "News", badge: news.length, content: newsTab },
    { id: "contract", label: "Contract", content: contract },
  ];

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/desk/dashboard" />}>Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{loanTitle(loan)}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-sub">
        <StatusPill status={f.status} />
        <span>{sectorName(loan.sector)}</span><span aria-hidden="true">·</span><span>{loan.borrower}</span><span aria-hidden="true">·</span><span className="tnum">{loan.id}</span>
      </div>
      <h1 className="serif text-[40px] leading-[44px] mt-2">{loanTitle(loan)}</h1>
      <p className="text-[18px] leading-7 mt-1 max-w-[760px]" style={{ color: col.text }}>{headline(f, b.run.as_of)}</p>
      <p className="text-[14px] text-sub mt-1 max-w-[760px]">{detailLine(f)} <span className="sr-only">{STATUS_HINT[f.status]}</span></p>
      <div className="mt-6"><LoanTabs tabs={tabs} initial={tab ?? "overview"} /></div>
    </>
  );
}
