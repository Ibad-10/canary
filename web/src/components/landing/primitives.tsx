"use client";

import { useEffect, useRef, type ReactNode, type PointerEvent } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import type { Status } from "@/lib/types";
import { s } from "./styles";

export type BoardRow = { id: string; site: string; status: Status; icr: number | null; limit: number | null; m6: number | null };
export type LandingData = {
  board: BoardRow[];
  counts: Record<Status, number>;
  loans: number;
  signals: number;
  comps: number;
  atRisk: number;
  sectors: number;
  score: { caught: number; total: number; falseAlarms: number } | null;
  steps: { step: string; status: string }[];
  live: boolean;
  exposure: { flagged: number; total: number };
  cases: CaseStudy[];
};

export type CaseStudy = {
  id: string;
  name: string;
  status: Status;
  amount: number;
  ratePct: number;
  metric: "icr" | "ltv";
  now: number | null;
  limit: number | null;
  m6: number | null;
  breachMonth: string | null;
  drivers: { label: string; effect: string }[];
};

export const EASE = [0.22, 1, 0.36, 1] as const;

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function WordReveal({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text} role="text">
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden align-bottom pb-[0.08em] -mb-[0.08em]">
          <motion.span
            className="inline-block"
            initial={{ y: "105%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.8, ease: EASE, delay: delay + i * 0.06 }}
          >
            {w}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

export function CountUp({ value, prefix = "", suffix = "", className }: { value: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const fmt = (n: number) => `${prefix}${Math.round(n).toLocaleString("en-GB")}${suffix}`;
  useEffect(() => {
    if (!inView || !ref.current) return;
    if (reduce) { ref.current.textContent = fmt(value); return; }
    const c = animate(0, value, { duration: 1.6, ease: EASE, onUpdate: (v) => { if (ref.current) ref.current.textContent = fmt(v); } });
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce]);
  return (
    <span className={`relative inline-grid tnum ${className ?? ""}`}>
      <span className="invisible col-start-1 row-start-1" aria-hidden="true">{fmt(value)}</span>
      <span ref={ref} className="col-start-1 row-start-1" aria-label={fmt(value)}>{fmt(0)}</span>
    </span>
  );
}

export function SpotCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <div onPointerMove={onMove} className={`${s.spot} card overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <Reveal>
      <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-gold">{eyebrow}</p>
      <h2 className="serif text-[36px] leading-[42px] md:text-[48px] md:leading-[54px] mt-3 max-w-[720px]">{title}</h2>
      {sub && <p className="text-[16px] leading-7 text-sub mt-3 max-w-[560px]">{sub}</p>}
    </Reveal>
  );
}
