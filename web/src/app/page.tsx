import Link from "next/link";
import { ArrowDown, ArrowRight, BarChart3, Brain, Building2, CheckCircle2, Clock, FileSearch, FileText, Globe, LayoutGrid, LineChart, ListChecks, Newspaper, PenLine, Search, TrendingUp, UserCheck, type LucideIcon } from "lucide-react";
import { getBundle } from "@/lib/data";
import { STATUS_COLOR, STATUS_NAME, loanSite } from "@/lib/labels";
import { byUrgency, countByStatus, scoreSummary } from "@/lib/view";
import type { Bundle, Step } from "@/lib/types";
import Logo from "@/components/Logo";
import Spark from "@/components/Spark";
import { Spotlight } from "@/components/ui/spotlight";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/* ---------- workflow: step name -> friendly partner + one-line caption ---------- */
type Stage = { match: RegExp; partner: string; caption: string; Icon: LucideIcon };
const STAGES: Stage[] = [
  { match: /load/i, partner: "Canary", caption: "Loads the loan book", Icon: ListChecks },
  { match: /covenant.*extract|extract/i, partner: "V7 Go", caption: "Reads the loan contract", Icon: FileText },
  { match: /cortile|signal/i, partner: "Cortile", caption: "Building operations data", Icon: Building2 },
  { match: /comps/i, partner: "Listings and auctions", caption: "Rent and sale comparables", Icon: Search },
  { match: /market/i, partner: "MSCI RCA", caption: "Market value trend", Icon: TrendingUp },
  { match: /news/i, partner: "Parallel", caption: "Live news", Icon: Newspaper },
  { match: /correction|recall/i, partner: "cognee", caption: "Remembers analyst corrections", Icon: Brain },
  { match: /forecast/i, partner: "Canary", caption: "Forecasts 3 and 6 months ahead", Icon: LineChart },
  { match: /backtest/i, partner: "Canary", caption: "Checks itself against the past", Icon: FileSearch },
  { match: /memo|draft/i, partner: "Grok", caption: "Writes the memo", Icon: PenLine },
  { match: /sign-off|await|approve/i, partner: "You", caption: "Approve or dismiss", Icon: UserCheck },
];
const FALLBACK_STEPS = ["Load loans", "Extract covenants", "Pull Cortile signals", "Value comps", "Market trend", "News", "Recall corrections", "Forecast covenants", "Backtest score", "Draft memo", "Await analyst sign-off"];
const STEP_STATUS: Record<string, string> = { done: "Done", fallback: "Backup used", failed: "Failed", waiting: "Waiting for you" };

function stageFor(name: string): Stage {
  // check the more specific patterns first (e.g. "Extract covenants" must not hit "covenant" forecast)
  const order = [1, 0, 2, 3, 4, 5, 6, 8, 7, 9, 10];
  return STAGES[order.map((i) => i).find((i) => STAGES[i].match.test(name)) ?? 0];
}

function compsCited(b: Bundle): number {
  const n = b.evidence
    .filter((e) => ["rent_comp", "value_comp", "auction"].includes(e.kind))
    .reduce((s, e) => s + (typeof (e.source as { count?: unknown }).count === "number" ? ((e.source as { count: number }).count) : 0), 0);
  return n > 0 ? n : b.evidence.length;
}

const num = (n: number) => n.toLocaleString("en-GB");

export default async function Landing() {
  const b = await getBundle();
  const counts = countByStatus(b.forecasts);
  const atRisk = counts.red + counts.amber;
  const sc = scoreSummary(b);
  const loanById = new Map(b.loans.map((l) => [l.id, l]));
  const tiles = byUrgency(b.forecasts, b.loans);
  const topRed = tiles.find((f) => f.status !== "green");
  const steps: Pick<Step, "step" | "status">[] = b.steps.length ? b.steps : FALLBACK_STEPS.map((s) => ({ step: s, status: "" }));
  const live = b.steps.length > 0;

  const today: { value: string; label: string }[] = [
    { value: num(b.loans.length), label: "loans watched" },
    { value: num(b.signals.length), label: "warning signals read" },
    { value: num(compsCited(b)), label: "comparables cited" },
    { value: num(atRisk), label: "loans flagged now" },
  ];

  return (
    <div className="flex-1 flex flex-col">
      <header className="h-16 flex items-center gap-6 px-6 md:px-12 max-w-[1280px] w-full mx-auto relative z-10">
        <Link href="/" aria-label="Canary home"><Logo size={28} /></Link>
        <nav className="ml-auto flex items-center gap-2" aria-label="Main">
          <a href="#how" className="text-[14px] text-sub hover:text-ink px-3 h-9 inline-flex items-center rounded-full">How it works</a>
          <Link href="/desk" className="btn btn-dark">Open the desk</Link>
        </nav>
      </header>

      {/* 1. What we are */}
      <section className="relative overflow-hidden">
        <Spotlight className="-top-40 left-0 md:-top-20 md:left-40" />
        <div className="relative z-10 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] gap-12 items-center px-6 md:px-12 py-12 md:py-20 max-w-[1280px] w-full mx-auto">
          <div>
            <h1 className="serif text-[44px] leading-[48px] md:text-[60px] md:leading-[64px] max-w-[640px]">
              Canary, an early-warning desk for landlord property loans.
            </h1>
            <p className="text-[18px] leading-7 text-sub mt-5 max-w-[520px]">Spot a covenant breach months before the quarterly report.</p>
            <div className="mt-8">
              <Link href="/desk" className="btn btn-dark !min-h-12 !px-7 !text-[16px]">Open the desk <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
            </div>
          </div>

          <div aria-label="Live portfolio" role="group" className="card p-5 dotgrid">
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {tiles.map((f) => {
                const l = loanById.get(f.loan_id);
                const c = STATUS_COLOR[f.status];
                return (
                  <li key={f.loan_id} className="rounded-xl border bg-white p-2.5" style={{ borderColor: c.bd }} title={`${l ? loanSite(l) : f.loan_id}: ${STATUS_NAME[f.status]}`}>
                    <div className="flex items-center gap-1.5 text-[11px] text-sub truncate">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.dot }} aria-hidden="true" />
                      <span className="truncate">{l ? loanSite(l) : f.loan_id}</span>
                    </div>
                    <Spark forecast={f} w={96} h={30} />
                    <span className="sr-only">{STATUS_NAME[f.status]}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-sub">
              {(["red", "amber", "green"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s].dot }} aria-hidden="true" />{STATUS_NAME[s]} <b className="text-ink tnum">{counts[s]}</b></span>
              ))}
              <span className="ml-auto">Solid: history. Dashed: forecast.</span>
            </p>
          </div>
        </div>
      </section>

      {/* 2. The business case */}
      <section aria-labelledby="h-case" className="px-6 md:px-12 py-16 bg-[#EFEBE3]/60 border-y border-line">
        <div className="max-w-[1280px] mx-auto">
          <h2 id="h-case" className="serif text-[34px] leading-[40px] md:text-[40px] md:leading-[46px] max-w-[640px]">Loan problems show up in the building long before they show up in the report.</h2>
          <div className="grid gap-4 md:grid-cols-2 mt-8">
            <Card className="bg-white">
              <CardContent className="p-6">
                <p className="serif text-[56px] leading-[60px]">60–90 days</p>
                <p className="text-[15px] leading-6 mt-2">Lenders test covenants quarterly, from borrower packs that often arrive 60–90 days after the period they cover.</p>
                <p className="text-[12px] text-sub mt-3">Source: Smart Capital Center, CRE covenant monitoring guide (2026)</p>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-6">
                <p className="serif text-[56px] leading-[60px]">125%</p>
                <p className="text-[15px] leading-6 mt-2">UK buy-to-let lenders typically require rent to cover interest by at least 125%.</p>
                <p className="text-[12px] text-sub mt-3">Source: PRA Supervisory Statement SS13/16</p>
              </CardContent>
            </Card>
          </div>

          <h3 className="text-[16px] font-semibold mt-12">Canary today</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
            {today.map((t) => (
              <Card key={t.label} className="bg-white">
                <CardContent className="p-5">
                  <p className="serif text-[44px] leading-[48px] tnum">{t.value}</p>
                  <p className="text-[13px] text-sub mt-1">{t.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-[15px]">
            {sc && sc.total > 0
              ? <>In a backtest, Canary <b>caught <span className="tnum">{sc.caught}</span> of <span className="tnum">{sc.total}</span></b> problem loans with <b className="tnum">{sc.falseAlarms}</b> false {sc.falseAlarms === 1 ? "alarm" : "alarms"}.</>
              : <span className="text-sub">No backtest has been run yet.</span>}
          </p>
        </div>
      </section>

      {/* 3. How it works */}
      <section id="how" aria-labelledby="h-how" className="px-6 md:px-12 py-16 scroll-mt-4">
        <div className="max-w-[1280px] mx-auto">
          <h2 id="h-how" className="serif text-[34px] leading-[40px] md:text-[40px] md:leading-[46px]">How it works</h2>
          <p className="text-[15px] text-sub mt-2 max-w-[560px]">Data in, forecast out, a person decides. Nothing is sent without sign-off.</p>
          <ol className="mt-8 flex flex-col md:flex-row md:flex-wrap items-stretch md:items-center gap-2">
            {steps.map((s, i) => {
              const st = stageFor(s.step);
              const status = STEP_STATUS[s.status];
              return (
                <li key={`${s.step}-${i}`} className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
                  <div className="card p-4 md:w-[178px] h-full">
                    <span className="w-8 h-8 rounded-lg bg-[#FFF6CC] border border-[#F5DC6E] grid place-items-center"><st.Icon className="w-4 h-4 text-gold" aria-hidden="true" /></span>
                    <p className="text-[14px] font-semibold mt-3 leading-5">{s.step}</p>
                    <p className="text-[12px] text-sub mt-0.5">{st.partner}</p>
                    <p className="text-[12px] leading-4 mt-1">{st.caption}</p>
                    {live && status && (
                      <span className={`pill mt-3 ${s.status === "done" ? "p-grn" : s.status === "waiting" ? "p-amb" : s.status === "failed" ? "p-red" : "p-neutral"}`}>
                        {s.status === "waiting" ? <Clock className="w-3 h-3" aria-hidden="true" /> : <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}{status}
                      </span>
                    )}
                  </div>
                  {i < steps.length - 1 && (
                    <>
                      <ArrowDown className="w-4 h-4 text-sub self-center md:hidden" aria-hidden="true" />
                      <ArrowRight className="w-4 h-4 text-sub hidden md:block shrink-0" aria-hidden="true" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* 4. What you get */}
      <section aria-labelledby="h-get" className="px-6 md:px-12 pb-16">
        <div className="max-w-[1280px] mx-auto">
          <h2 id="h-get" className="serif text-[34px] leading-[40px] md:text-[40px] md:leading-[46px]">What you get</h2>
          <div className="grid gap-4 md:grid-cols-3 mt-8">
            <Card className="bg-white">
              <CardContent className="p-6 flex flex-col gap-3">
                <span className="w-9 h-9 rounded-xl bg-[#FFF6CC] border border-[#F5DC6E] grid place-items-center"><LayoutGrid className="w-5 h-5 text-gold" aria-hidden="true" /></span>
                <h3 className="text-[16px] font-semibold">Summary at a glance</h3>
                <p className="text-[14px] text-sub">Which loans need you today, and why.</p>
                <div className="flex gap-2 mt-auto pt-2">
                  {(["red", "amber", "green"] as const).map((s) => (
                    <span key={s} className="rounded-xl border px-3 py-1.5 text-center" style={{ background: STATUS_COLOR[s].bg, borderColor: STATUS_COLOR[s].bd, color: STATUS_COLOR[s].text }}>
                      <span className="serif text-[28px] leading-8 tnum block">{counts[s]}</span><span className="text-[11px]">{STATUS_NAME[s]}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-6 flex flex-col gap-3">
                <span className="w-9 h-9 rounded-xl bg-[#FFF6CC] border border-[#F5DC6E] grid place-items-center"><BarChart3 className="w-5 h-5 text-gold" aria-hidden="true" /></span>
                <h3 className="text-[16px] font-semibold">Dashboard and what-if</h3>
                <p className="text-[14px] text-sub">Charts, filters, and a stress test for rates and property values.</p>
                <div className="mt-auto pt-2" aria-hidden="true">
                  <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                    {(["red", "amber", "green"] as const).map((s) => <span key={s} style={{ width: `${(counts[s] / Math.max(1, b.forecasts.length)) * 100}%`, background: STATUS_COLOR[s].dot }} />)}
                  </div>
                  <p className="text-[11px] text-sub mt-1.5 flex items-center gap-1"><Globe className="w-3 h-3" />{new Set(b.loans.map((l) => l.sector)).size} sectors, {b.loans.length} loans</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white">
              <CardContent className="p-6 flex flex-col gap-3">
                <span className="w-9 h-9 rounded-xl bg-[#FFF6CC] border border-[#F5DC6E] grid place-items-center"><Search className="w-5 h-5 text-gold" aria-hidden="true" /></span>
                <h3 className="text-[16px] font-semibold">Deep dive with reasons and sources</h3>
                <p className="text-[14px] text-sub">Every warning shows what drove it and where the data came from.</p>
                {topRed && <div className="mt-auto pt-2"><Spark forecast={topRed} w={200} h={40} /></div>}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 5. Real vs synthetic */}
      <div className="px-6 md:px-12 py-4 border-y border-line bg-white text-center text-[14px]">
        Real building, rent and market data. Loan terms are synthetic and labelled.
      </div>

      {/* 6. Footer CTA */}
      <section className="px-6 md:px-12 py-16 text-center">
        <h2 className="serif text-[34px] leading-[40px]">See which loans need you today.</h2>
        <Link href="/desk" className="btn btn-dark !min-h-12 !px-7 !text-[16px] mt-6">Open the desk <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
      </section>
    </div>
  );
}
