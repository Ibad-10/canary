"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { Hero, Nav } from "./Hero";
import { Workflow } from "./Workflow";
import { Bento } from "./Bento";
import { CountUp, EASE, Reveal, type LandingData } from "./primitives";
import { s } from "./styles";

function Metrics({ data }: { data: LandingData }) {
  const live = [
    { v: data.loans, l: "loans watched" },
    { v: data.signals, l: "warning signals read" },
    { v: data.comps, l: "comparables cited" },
    { v: data.atRisk, l: "loans flagged now" },
  ];
  return (
    <section className="px-6 md:px-12 py-20 md:py-24 border-y border-line bg-white/60">
      <div className="max-w-[1280px] mx-auto">
        <div className="grid gap-10 md:grid-cols-2">
          <Reveal>
            <p className="serif text-[64px] leading-none md:text-[88px]"><CountUp prefix="60–" value={90} suffix=" days" /></p>
            <p className="text-[15px] leading-6 mt-4 max-w-[420px]">Covenants are tested quarterly, from borrower packs that arrive 60–90 days after the period.</p>
            <p className="text-[12px] text-sub mt-2">Smart Capital Center, CRE covenant monitoring guide (2026)</p>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="serif text-[64px] leading-none md:text-[88px]"><CountUp value={125} suffix="%" /></p>
            <p className="text-[15px] leading-6 mt-4 max-w-[420px]">UK buy-to-let lenders typically need rent to cover interest by at least 125%.</p>
            <p className="text-[12px] text-sub mt-2">PRA Supervisory Statement SS13/16</p>
          </Reveal>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px mt-16 rounded-2xl overflow-hidden border border-line bg-line">
          {live.map((t, i) => (
            <Reveal key={t.l} delay={i * 0.06} className="bg-white p-6">
              <p className="serif text-[44px] leading-none"><CountUp value={t.v} /></p>
              <p className="text-[13px] text-sub mt-2">{t.l}</p>
            </Reveal>
          ))}
        </div>
        <p className="text-[12px] text-sub mt-3">Canary today, from the latest run. Real building, rent and market data; loan terms are synthetic.</p>
      </div>
    </section>
  );
}

const TOOLS = ["V7 Go", "Cortile", "MSCI RCA", "Grok", "xAI", "Supabase", "cognee", "Parallel", "Vercel"];

function Marquee() {
  const row = [...TOOLS, ...TOOLS];
  return (
    <section className="py-14" aria-label="Built with">
      <p className="text-center text-[12px] uppercase tracking-[0.14em] text-sub">Built with</p>
      <div className={`${s.marquee} mt-6 overflow-hidden`}>
        <ul className={s.track}>
          {row.map((t, i) => (
            <li key={i} aria-hidden={i >= TOOLS.length} className="px-8 md:px-12 serif text-[28px] md:text-[34px] text-[#8E887C] hover:text-ink transition-colors whitespace-nowrap">{t}</li>
          ))}
        </ul>
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
        <Marquee />
        <Metrics data={data} />
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
