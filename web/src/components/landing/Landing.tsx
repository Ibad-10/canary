"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Hero, Nav } from "./Hero";
import { Workflow } from "./Workflow";
import { Bento } from "./Bento";
import { CountUp, EASE, Reveal, SectionHead, type CaseStudy, type LandingData } from "./primitives";
import StatusPill from "@/components/StatusPill";
import { s } from "./styles";

const gbpM = (n: number) => (Math.abs(n) < 1e6 ? `£${Math.round(n / 1e3).toLocaleString("en-GB")}k` : `£${(n / 1e6).toFixed(1)}m`);
const fmtMetric = (m: "icr" | "ltv", v: number | null) => (v == null ? "–" : m === "icr" ? `${v.toFixed(2)}x` : `${v.toFixed(1)}%`);
const monthName = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : null);

function CaseCard({ c, i }: { c: CaseStudy; i: number }) {
  const label = c.metric === "icr" ? "Interest cover" : "Loan-to-value";
  const breached = c.metric === "icr" ? (c.m6 ?? 9) < (c.limit ?? 0) : (c.m6 ?? 0) > (c.limit ?? 999);
  return (
    <Reveal delay={i * 0.08} className="h-full">
      <motion.div whileHover={{ y: -4 }} transition={{ duration: 0.25 }} className="card h-full p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] text-sub">{c.id} · {gbpM(c.amount)} at {c.ratePct}%</p>
            <p className="font-medium text-[15px] leading-5 mt-1">{c.name}</p>
          </div>
          <StatusPill status={c.status} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#F6F3EC] p-3"><p className="text-[11px] text-sub">{label} now</p><p className="serif text-[22px] tnum">{fmtMetric(c.metric, c.now)}</p></div>
          <div className="rounded-xl bg-[#F6F3EC] p-3"><p className="text-[11px] text-sub">Limit</p><p className="serif text-[22px] tnum">{fmtMetric(c.metric, c.limit)}</p></div>
          <div className={`rounded-xl p-3 ${breached ? "bg-[#FBE9E7]" : "bg-[#FFF4D6]"}`}><p className="text-[11px] text-sub">In 6 months</p><p className="serif text-[22px] tnum">{fmtMetric(c.metric, c.m6)}</p></div>
        </div>
        <div>
          <p className="text-[12px] font-medium text-sub uppercase tracking-[0.1em]">Why</p>
          <ul className="mt-2 space-y-1.5">
            {c.drivers.map((d) => (
              <li key={d.label} className="text-[13px] leading-5"><span>{d.label}</span> <span className="text-sub">— {d.effect}</span></li>
            ))}
          </ul>
        </div>
        <p className="mt-auto text-[13px] leading-5 border-t border-line pt-3">
          {monthName(c.breachMonth)
            ? <>Forecast breach <b>{monthName(c.breachMonth)}</b>. A quarterly borrower pack would show it 60–90 days after that.</>
            : <>Heading for the cash-trap zone. Canary flags it now, before the next quarterly test.</>}
        </p>
        <Link href={`/desk/loan/${c.id}`} className="text-[13px] font-medium inline-flex items-center gap-1 hover:underline">See the evidence <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" /></Link>
      </motion.div>
    </Reveal>
  );
}

function BusinessCase({ data }: { data: LandingData }) {
  const ex = data.cases.find((c) => c.metric === "icr") ?? data.cases[0];
  const interest = ex ? (ex.amount * ex.ratePct) / 100 : 0;
  const need = ex?.limit && ex.metric === "icr" ? interest * ex.limit : null;
  return (
    <section id="case" className="px-6 md:px-12 py-20 md:py-24 border-y border-line bg-white/60">
      <div className="max-w-[1280px] mx-auto">
        <SectionHead eyebrow="The business case" title="Lenders find out about a breach months after it starts." sub="Here is why that happens, what it costs, and what Canary caught in this run." />

        <div className="grid gap-px mt-12 md:grid-cols-3 rounded-2xl overflow-hidden border border-line bg-line">
          <Reveal className="bg-white p-6 md:p-8">
            <p className="serif text-[52px] leading-none md:text-[64px]"><CountUp prefix="60–" value={90} suffix=" days" /></p>
            <p className="text-[14px] leading-6 mt-4"><b>The lag.</b> Covenants are tested quarterly, from borrower packs that arrive 60–90 days after the quarter ends. A problem that starts in month one can be five months old before anyone sees it.</p>
            <p className="text-[11px] text-sub mt-3">Smart Capital Center, CRE covenant monitoring guide (2026)</p>
          </Reveal>
          <Reveal delay={0.08} className="bg-white p-6 md:p-8">
            <p className="serif text-[52px] leading-none md:text-[64px]"><CountUp value={125} suffix="%" /></p>
            <p className="text-[14px] leading-6 mt-4"><b>The thin margin.</b> Rent must typically cover interest by 125%.{ex && need ? <> On {ex.id}, {gbpM(ex.amount)} at {ex.ratePct}% costs {gbpM(interest)} a year in interest, so the building must earn at least {gbpM(need)}. A few empty units or a repair bill closes that gap fast.</> : null}</p>
            <p className="text-[11px] text-sub mt-3">PRA Supervisory Statement SS13/16; example uses this run&apos;s loan terms</p>
          </Reveal>
          <Reveal delay={0.16} className="bg-white p-6 md:p-8">
            <p className="serif text-[52px] leading-none md:text-[64px]">{gbpM(data.exposure.flagged)}</p>
            <p className="text-[14px] leading-6 mt-4"><b>What&apos;s at stake here.</b> {data.atRisk} of {data.loans} loans ({gbpM(data.exposure.flagged)} of a {gbpM(data.exposure.total)} book) are flagged today from {data.signals} building signals: repairs, vacancies, arrears, overdue fire-safety items and local news.</p>
            <p className="text-[11px] text-sub mt-3">Latest Canary run. Building and market data are real; the loan terms are synthetic.</p>
          </Reveal>
        </div>

        {data.score && (
          <Reveal className="mt-6">
            <p className="text-[14px] leading-6 rounded-2xl border border-line bg-white px-5 py-4">
              <b>In-sample illustration:</b> forecasting from 31 May 2026 (some building signals are current snapshots, not point-in-time), Canary caught {data.score.caught} of {data.score.total} loans that later moved into trouble, with {data.score.falseAlarms} false alarm{data.score.falseAlarms === 1 ? "" : "s"}.
            </p>
          </Reveal>
        )}

        {data.cases.length > 0 && (
          <>
            <h3 className="serif text-[28px] md:text-[34px] mt-16">Real examples from this run</h3>
            <p className="text-[14px] text-sub mt-1">Each one traced to the building data that caused it.</p>
            <div className="grid gap-5 mt-6 md:grid-cols-2 lg:grid-cols-3">
              {data.cases.map((c, i) => <CaseCard key={c.id} c={c} i={i} />)}
            </div>
            <p className="text-[11px] text-sub mt-3">Value haircut sizes for safety and remediation items are model assumptions, shown on each loan&apos;s evidence page.</p>
          </>
        )}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-6 md:px-12 py-20 md:py-28">
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, ease: EASE }}
        className="relative max-w-[1280px] mx-auto overflow-hidden rounded-[28px] bg-ink text-white px-8 py-16 md:px-16 md:py-20"
      >
        <div aria-hidden="true" className={`${s.blobA} absolute rounded-full blur-[90px] opacity-25 w-[420px] h-[420px] -right-24 -top-40 bg-canary`} />
        <div className="relative grid md:grid-cols-[minmax(0,1fr)_auto] gap-8 items-end">
          <div>
            <h2 className="serif text-[40px] leading-[1.05] md:text-[60px] max-w-[640px]">See which loans need you today.</h2>
            <p className="text-[16px] text-white/70 mt-4 max-w-[480px]">The desk shows the board, the reasons and the draft memo, ready for sign-off.</p>
          </div>
          <Link href="/desk" className="group btn !min-h-12 !px-7 !text-[16px] bg-canary text-ink hover:bg-[#FFE34D] justify-self-start">
            Open the desk <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

export default function Landing({ data, logo }: { data: LandingData; logo: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex-1 flex flex-col overflow-x-clip">
        <Nav logo={logo} />
        <Hero data={data} />
        <BusinessCase data={data} />
        <Workflow steps={data.steps} live={data.live} />
        <Bento data={data} />
        <FinalCta />
        <footer className="px-6 md:px-12 pb-10">
          <div className="max-w-[1280px] mx-auto flex flex-wrap items-center gap-x-6 gap-y-2 pt-6 border-t border-line text-[13px] text-sub">
            {logo}
            <span>Loan early-warning desk. Grok Bot Real Estate Hackathon, 2026.</span>
            <Link href="/desk" className="ml-auto hover:text-ink">Desk</Link>
            <a href="#how" className="hover:text-ink">How it works</a>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
