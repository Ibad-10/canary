"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { STATUS_COLOR } from "@/lib/labels";
import type { Status } from "@/lib/types";
import { EASE, Reveal, SectionHead, SpotCard, type LandingData } from "./primitives";
import { s } from "./styles";

function Graph() {
  const nodes = [
    { x: 60, y: 90, l: "Loan", c: "#1E1D1A" },
    { x: 170, y: 40, l: "Building", c: "#5F5B53" },
    { x: 170, y: 140, l: "Building", c: "#5F5B53" },
    { x: 290, y: 20, l: "Arrears", c: STATUS_COLOR.amber.dot },
    { x: 300, y: 80, l: "Repairs", c: STATUS_COLOR.green.dot },
    { x: 290, y: 150, l: "EWS1 overdue", c: STATUS_COLOR.red.dot },
    { x: 400, y: 90, l: "ICR covenant", c: STATUS_COLOR.red.dot },
  ];
  const edges: [number, number, boolean][] = [[0, 1, true], [0, 2, false], [1, 3, true], [1, 4, false], [2, 5, false], [3, 6, true], [5, 6, false], [4, 6, false]];
  return (
    <svg viewBox="0 0 460 180" className="w-full h-auto" aria-hidden="true">
      {edges.map(([a, b, hot], i) => (
        <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke={hot ? "#D92D20" : "#D9D3C7"} strokeWidth={hot ? 2 : 1.25} className={hot ? s.dash : ""} />
      ))}
      {nodes.map((n, i) => (
        <motion.g key={i} initial={{ opacity: 0, scale: 0.6 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.1 * i, duration: 0.4, ease: EASE }} style={{ transformOrigin: `${n.x}px ${n.y}px` }}>
          {i === 6 && <circle cx={n.x} cy={n.y} r={16} fill="#D92D20" opacity={0.15} />}
          <circle cx={n.x} cy={n.y} r={i === 0 || i === 6 ? 8 : 6} fill={n.c} />
          <text x={n.x} y={n.y + 22} textAnchor="middle" fontSize="11" fill="#5F5B53">{n.l}</text>
        </motion.g>
      ))}
    </svg>
  );
}

function Stress({ icr, limit }: { icr: number; limit: number }) {
  const [bp, setBp] = useState(0);
  const stressed = icr * (5 / (5 + bp / 100));
  const status: Status = stressed < limit ? "red" : stressed < limit * 1.1 ? "amber" : "green";
  const c = STATUS_COLOR[status];
  const w = Math.max(4, Math.min(100, (stressed / (limit * 2)) * 100));
  return (
    <div className="mt-auto">
      <div className="flex items-end justify-between">
        <motion.p key={status} initial={{ scale: 0.9, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} className="serif text-[40px] leading-none tnum" style={{ color: c.text }}>{stressed.toFixed(2)}x</motion.p>
        <span className="pill" style={{ color: c.text, background: c.bg, borderColor: c.bd }}>{status === "red" ? "Breach" : status === "amber" ? "Watch" : "On track"}</span>
      </div>
      <div className="relative h-2.5 rounded-full bg-[#F0ECE4] mt-4 overflow-hidden">
        <motion.span className="absolute inset-y-0 left-0 rounded-full" animate={{ width: `${w}%`, backgroundColor: c.dot }} transition={{ duration: 0.35, ease: EASE }} />
        <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: "50%" }} />
      </div>
      <label className="block mt-5 text-[13px] text-sub">
        Rates <b className="text-ink tnum">+{(bp / 100).toFixed(2)}%</b>
        <input type="range" min={0} max={300} step={25} value={bp} onChange={(e) => setBp(Number(e.target.value))} className={`${s.range} w-full mt-2`} aria-label="Interest rate rise" />
      </label>
      <p className="text-[11px] text-sub mt-1">Illustrative: ICR {icr.toFixed(2)}x on a 5% base, limit {limit.toFixed(2)}x marked.</p>
    </div>
  );
}

function Backtest({ score }: { score: LandingData["score"] }) {
  if (!score || score.total === 0) return <p className="text-[14px] text-sub mt-auto">No backtest has been run yet.</p>;
  return (
    <div className="mt-auto">
      <div className="flex flex-wrap gap-1.5" aria-hidden="true">
        {Array.from({ length: score.total }, (_, i) => (
          <motion.span key={i} initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ delay: 0.05 * i, type: "spring", stiffness: 400, damping: 20 }}
            className="w-6 h-6 rounded-md" style={{ background: i < score.caught ? STATUS_COLOR.green.dot : STATUS_COLOR.red.bd }} />
        ))}
      </div>
      <p className="text-[14px] mt-4">Caught <b className="tnum">{score.caught}</b> of <b className="tnum">{score.total}</b> problem loans, <b className="tnum">{score.falseAlarms}</b> false {score.falseAlarms === 1 ? "alarm" : "alarms"}.</p>
      <p className="text-[11px] text-sub mt-1">In-sample illustration: some building signals are current snapshots, not point-in-time.</p>
    </div>
  );
}

function Memo() {
  const lines = [
    { t: "Arrears at the building rose for three months running.", src: "Cortile" },
    { t: "Comparable rents nearby sit below the underwritten rent.", src: "Comps" },
    { t: "ICR forecast to fall below the limit within six months.", src: "Forecast" },
  ];
  return (
    <div className="mt-auto rounded-xl border border-line bg-[#FAF8F4] p-4 space-y-2.5">
      {lines.map((l, i) => (
        <motion.p key={i} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.25 * i, duration: 0.4, ease: EASE }} className="text-[13px] leading-5">
          {l.t} <sup className="src !h-5 !text-[10px] align-middle">{i + 1} {l.src}</sup>
        </motion.p>
      ))}
      <div className="flex gap-2 pt-1">
        <span className="btn btn-dark !min-h-7 !text-[12px] !px-3">Approve</span>
        <span className="btn btn-ghost !min-h-7 !text-[12px] !px-3">Edit</span>
      </div>
    </div>
  );
}

export function Bento({ data }: { data: LandingData }) {
  const ref = data.board.filter((r) => r.icr != null && r.limit).sort((a, b) => b.icr! / b.limit! - a.icr! / a.limit!)[0] ?? null;
  const icr = ref?.icr ?? 1.45;
  const limit = ref?.limit ?? 1.25;
  return (
    <section id="features" className="px-6 md:px-12 py-24 md:py-32 scroll-mt-16 bg-[#EFEBE3]/60 border-y border-line">
      <div className="max-w-[1280px] mx-auto">
        <SectionHead eyebrow="On the desk" title="Every warning comes with the reason and the source." />
        <div className="grid gap-4 md:grid-cols-6 mt-12">
          <Reveal className="md:col-span-4">
            <SpotCard className="p-6 h-full flex flex-col gap-4 min-h-[320px]">
              <div><h3 className="text-[17px] font-semibold">A knowledge graph per loan</h3><p className="text-[14px] text-sub mt-1">Loan, buildings, signals, covenant. The breach path lights up.</p></div>
              <div className="mt-auto"><Graph /></div>
            </SpotCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.08}>
            <SpotCard className="p-6 h-full flex flex-col gap-4 min-h-[320px]">
              <div><h3 className="text-[17px] font-semibold">Stress test</h3><p className="text-[14px] text-sub mt-1">Move rates. Watch the loan change colour.</p></div>
              <Stress icr={icr} limit={limit} />
            </SpotCard>
          </Reveal>
          <Reveal className="md:col-span-2" delay={0.04}>
            <SpotCard className="p-6 h-full flex flex-col gap-4 min-h-[280px]">
              <div><h3 className="text-[17px] font-semibold">Backtest</h3><p className="text-[14px] text-sub mt-1">Checked against loans that went bad.</p></div>
              <Backtest score={data.score} />
            </SpotCard>
          </Reveal>
          <Reveal className="md:col-span-4" delay={0.12}>
            <SpotCard className="p-6 h-full flex flex-col gap-4 min-h-[280px]">
              <div><h3 className="text-[17px] font-semibold">A memo with citations</h3><p className="text-[14px] text-sub mt-1">Grok drafts it. Each line links to its data. You sign it off.</p></div>
              <Memo />
            </SpotCard>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
