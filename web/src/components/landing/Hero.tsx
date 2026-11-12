"use client";

import Link from "next/link";
import { useState, type ReactNode, type PointerEvent } from "react";
import { motion, useMotionTemplate, useMotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from "motion/react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { STATUS_COLOR, STATUS_NAME } from "@/lib/labels";
import { EASE, WordReveal, type BoardRow, type LandingData } from "./primitives";
import { s } from "./styles";

export function Nav({ logo }: { logo: ReactNode }) {
  const { scrollY } = useScroll();
  const [small, setSmall] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setSmall(v > 24));
  return (
    <div className="fixed top-0 inset-x-0 z-50 flex justify-center px-4 pt-3 pointer-events-none">
      <motion.header
        animate={{ maxWidth: small ? 760 : 1280, paddingTop: small ? 6 : 10, paddingBottom: small ? 6 : 10 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`pointer-events-auto w-full flex items-center gap-4 px-4 rounded-full border transition-colors duration-300 ${small ? "bg-white/70 border-line shadow-[0_8px_30px_-12px_rgba(30,29,26,.25)] backdrop-blur-xl" : "bg-transparent border-transparent"}`}
      >
        <Link href="/" aria-label="Canary home" className="shrink-0">{logo}</Link>
        <nav className="ml-auto flex items-center gap-1" aria-label="Main">
          <a href="#how" className="hidden sm:inline-flex text-[14px] text-sub hover:text-ink px-3 h-9 items-center rounded-full transition-colors">How it works</a>
          <a href="#features" className="hidden sm:inline-flex text-[14px] text-sub hover:text-ink px-3 h-9 items-center rounded-full transition-colors">Features</a>
          <Link href="/desk" className="btn btn-dark">Open the desk</Link>
        </nav>
      </motion.header>
    </div>
  );
}

function Pill({ status }: { status: BoardRow["status"] }) {
  const c = STATUS_COLOR[status];
  return (
    <span className="pill shrink-0" style={{ color: c.text, background: c.bg, borderColor: c.bd }}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === "red" ? s.pulse : ""}`} style={{ background: c.dot }} aria-hidden="true" />
      {STATUS_NAME[status]}
    </span>
  );
}

function BoardPreview({ board, counts }: { board: BoardRow[]; counts: LandingData["counts"] }) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 160, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 160, damping: 18 });
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };
  const reset = () => { mx.set(0); my.set(0); };
  const rows = board.slice(0, 5);

  return (
    <div style={{ perspective: 1200 }} className="w-full">
      <motion.div
        onPointerMove={onMove}
        onPointerLeave={reset}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 1, ease: EASE, delay: 0.5 }}
        className="relative"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="card p-0 overflow-hidden shadow-[0_40px_80px_-30px_rgba(30,29,26,.35)]"
        >
          <div className="flex items-center gap-2 px-5 h-12 border-b border-line bg-[#FAF8F4]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E6E1D8]" /><span className="w-2.5 h-2.5 rounded-full bg-[#E6E1D8]" /><span className="w-2.5 h-2.5 rounded-full bg-[#E6E1D8]" />
            <span className="ml-3 text-[12px] text-sub">Watchlist</span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-sub">
              <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-grn-dot opacity-60 animate-ping motion-reduce:hidden" /><span className="relative w-2 h-2 rounded-full bg-grn-dot" /></span>
              Live
            </span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_140px_auto] gap-x-4 px-5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-sub">
            <span>Loan</span><span className="hidden sm:block">ICR headroom</span><span className="text-right">Status</span>
          </div>
          <ul>
            {rows.map((r, i) => {
              const c = STATUS_COLOR[r.status];
              const pct = r.icr != null && r.limit ? Math.max(4, Math.min(100, ((r.icr - r.limit) / r.limit) * 100 + 30)) : 50;
              const pct6 = r.m6 != null && r.limit ? Math.max(2, Math.min(100, ((r.m6 - r.limit) / r.limit) * 100 + 30)) : pct;
              return (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.9 + i * 0.08 }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_140px_auto] gap-x-4 items-center px-5 py-3 border-t border-line first:border-t-0"
                >
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium truncate">{r.site}</p>
                    <p className="text-[12px] text-sub tnum">ICR {r.icr != null ? `${r.icr.toFixed(2)}x` : "-"}{r.limit ? ` / limit ${r.limit.toFixed(2)}x` : ""}</p>
                  </div>
                  <div className="hidden sm:block" aria-hidden="true">
                    <div className="relative h-2 rounded-full bg-[#F0ECE4] overflow-hidden">
                      <motion.span
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ background: c.dot }}
                        initial={{ width: "0%" }}
                        animate={{ width: [`${pct}%`, `${pct6}%`, `${pct}%`] }}
                        transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.6, delay: 1.2 + i * 0.1 }}
                      />
                    </div>
                  </div>
                  <Pill status={r.status} />
                </motion.li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 border-t border-line bg-[#FAF8F4] text-[12px] text-sub">
            {(["red", "amber", "green"] as const).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[k].dot }} />{STATUS_NAME[k]} <b className="text-ink tnum">{counts[k]}</b></span>
            ))}
            <span className="ml-auto">Bar: ICR now vs 6-month forecast</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE, delay: 1.6 }}
          style={{ transform: "translateZ(60px)" }}
          className="hidden md:flex absolute -left-10 -bottom-8 card px-4 py-3 items-center gap-3 shadow-[0_20px_40px_-20px_rgba(30,29,26,.35)]"
        >
          <span className="w-8 h-8 rounded-lg bg-red-bg border border-red-bd grid place-items-center text-red-t text-[13px] font-semibold">!</span>
          <div>
            <p className="text-[13px] font-medium">{rows[0]?.site ?? "Loan"}: breach forecast</p>
            <p className="text-[11px] text-sub">Flagged from building data, not the borrower pack</p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function Hero({ data }: { data: LandingData }) {
  const mx = useMotionValue(-400);
  const my = useMotionValue(-400);
  const bg = useMotionTemplate`radial-gradient(520px circle at ${mx}px ${my}px, rgba(255,214,10,0.22), transparent 70%)`;
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left);
    my.set(e.clientY - r.top);
  };

  return (
    <section onPointerMove={onMove} className="relative overflow-hidden pt-28 md:pt-36 pb-20 md:pb-28">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <div className={`${s.blobA} absolute rounded-full blur-[90px] opacity-50 w-[520px] h-[520px] -top-48 -left-32 bg-[#FFE27A]`} />
        <div className={`${s.blobB} absolute rounded-full blur-[90px] opacity-50 w-[460px] h-[460px] top-10 -right-40 bg-[#F3D9B1]`} />
        <div className={`absolute inset-0 ${s.grid}`} />
        <motion.div className="absolute inset-0" style={{ background: bg }} />
      </div>

      <div className="relative z-10 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] gap-14 lg:gap-12 items-center px-6 md:px-12 max-w-[1280px] mx-auto">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 h-8 pl-1.5 pr-3 rounded-full border border-line bg-white/80 backdrop-blur text-[13px] text-sub"
          >
            <span className="pill p-gold !h-5 !px-2 !text-[11px]">For property lenders</span>
            Early warning on covenant breaches
          </motion.span>
          <h1 className="serif text-[44px] leading-[1.04] sm:text-[56px] md:text-[72px] mt-6 max-w-[680px] text-balance">
            <WordReveal text="See the covenant breach months before the borrower reports it." delay={0.1} />
          </h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.7 }}
            className="text-[18px] leading-7 text-sub mt-6 max-w-[520px]"
          >
            Canary reads building data on every loan and forecasts ICR and LTV three and six months ahead.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.85 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Link href="/desk" className="group btn btn-dark !min-h-12 !px-7 !text-[16px] shadow-[0_10px_30px_-10px_rgba(30,29,26,.6)]">
              Open the desk <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <a href="#how" className="btn btn-ghost !min-h-12 !px-6 !text-[16px]">
              See how it works <ArrowDown className="w-4 h-4" aria-hidden="true" />
            </a>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="mt-8 text-[13px] text-sub tnum"
          >
            Watching <b className="text-ink">{data.loans}</b> loans now. <b className="text-ink">{data.atRisk}</b> flagged.
          </motion.p>
        </div>
        <BoardPreview board={data.board} counts={data.counts} />
      </div>
    </section>
  );
}
