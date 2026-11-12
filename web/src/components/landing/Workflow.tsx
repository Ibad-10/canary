"use client";

import { useRef, useState } from "react";
import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { Brain, Building2, CheckCircle2, Clock, FileSearch, FileText, LineChart, ListChecks, Newspaper, PenLine, Search, TrendingUp, UserCheck, type LucideIcon } from "lucide-react";
import { EASE, SectionHead, type LandingData } from "./primitives";

type Stage = { match: RegExp; partner: string; caption: string; Icon: LucideIcon };
const STAGES: Stage[] = [
  { match: /load/i, partner: "Canary", caption: "Loads the loan book and covenant limits.", Icon: ListChecks },
  { match: /covenant.*extract|extract/i, partner: "V7 Go", caption: "Reads each facility agreement and pulls the covenants.", Icon: FileText },
  { match: /cortile|signal/i, partner: "Cortile", caption: "Arrears, repairs, compliance and service charge per building.", Icon: Building2 },
  { match: /comps/i, partner: "Listings and auctions", caption: "Rent and sale comparables near each asset.", Icon: Search },
  { match: /market/i, partner: "MSCI RCA", caption: "Market value trend for the sector and city.", Icon: TrendingUp },
  { match: /news/i, partner: "Parallel", caption: "Live news on the borrower and the building.", Icon: Newspaper },
  { match: /correction|recall/i, partner: "cognee", caption: "Recalls what analysts corrected last time.", Icon: Brain },
  { match: /forecast/i, partner: "Canary", caption: "Forecasts ICR and LTV 3 and 6 months ahead, with a range.", Icon: LineChart },
  { match: /backtest/i, partner: "Canary", caption: "Scores itself against past loans.", Icon: FileSearch },
  { match: /memo|draft/i, partner: "Grok", caption: "Drafts the watchlist memo, every line cited.", Icon: PenLine },
  { match: /sign-off|await|approve/i, partner: "You", caption: "Approve, edit or dismiss. Nothing goes out without you.", Icon: UserCheck },
];
const ORDER = [1, 0, 2, 3, 4, 5, 6, 8, 7, 9, 10];
const stageFor = (name: string) => STAGES[ORDER.find((i) => STAGES[i].match.test(name)) ?? 0];
const STEP_STATUS: Record<string, string> = { done: "Done", fallback: "Backup used", failed: "Failed", waiting: "Waiting for you" };

export function Workflow({ steps, live }: Pick<LandingData, "steps" | "live">) {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 70%", "end 60%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const [active, setActive] = useState(-1);
  const [hover, setHover] = useState<number | null>(null);
  useMotionValueEvent(scrollYProgress, "change", (v) => setActive(Math.floor(v * steps.length + 0.15) - 0));
  const lit = hover ?? active;

  return (
    <section id="how" className="px-6 md:px-12 py-24 md:py-32 scroll-mt-16">
      <div className="max-w-[1280px] mx-auto grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-12 lg:gap-20">
        <div className="lg:sticky lg:top-32 self-start">
          <SectionHead eyebrow="How it works" title="Data in, forecast out, a person decides." sub="One pipeline runs across the whole book. Each step names the source it used." />
        </div>

        <ol ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
          <span aria-hidden="true" className="absolute left-[19px] top-2 bottom-2 w-px bg-line" />
          <motion.span aria-hidden="true" style={{ scaleY: fill }} className="absolute left-[19px] top-2 bottom-2 w-px origin-top bg-gradient-to-b from-canary via-[#F5B800] to-ink" />
          {steps.map((st, i) => {
            const stage = stageFor(st.step);
            const on = i <= lit;
            const label = STEP_STATUS[st.status];
            return (
              <motion.li
                key={`${st.step}-${i}`}
                onPointerEnter={() => setHover(i)}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, ease: EASE }}
                className="relative pl-16 pb-8 last:pb-0 group"
              >
                <motion.span
                  animate={{ backgroundColor: on ? "#FFD60A" : "#FFFFFF", borderColor: on ? "#E5BF00" : "#E6E1D8", scale: i === lit ? 1.1 : 1 }}
                  transition={{ duration: 0.3 }}
                  className="absolute left-0 top-0 w-10 h-10 rounded-xl border grid place-items-center"
                >
                  <stage.Icon className={`w-[18px] h-[18px] transition-colors ${on ? "text-ink" : "text-sub"}`} aria-hidden="true" />
                </motion.span>
                <div className={`rounded-2xl border px-5 py-4 transition-all duration-300 ${i === lit ? "bg-white border-line shadow-[0_12px_30px_-18px_rgba(30,29,26,.35)]" : "border-transparent"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] text-sub tnum">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className={`text-[16px] font-semibold transition-colors ${on ? "text-ink" : "text-sub"}`}>{st.step}</h3>
                    <span className="pill p-neutral !h-6">{stage.partner}</span>
                    {live && label && (
                      <span className={`pill !h-6 ${st.status === "done" ? "p-grn" : st.status === "waiting" ? "p-amb" : st.status === "failed" ? "p-red" : "p-neutral"}`}>
                        {st.status === "waiting" ? <Clock className="w-3 h-3" aria-hidden="true" /> : <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}{label}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] leading-6 text-sub mt-1">{stage.caption}</p>
                </div>
              </motion.li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
