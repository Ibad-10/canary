"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, Copy, Mail } from "lucide-react";
import { inline } from "./Markdown";
import { parseLetter } from "@/lib/letters";

export type LetterFigure = { label: string; value: string; tone?: "red" | "amber" };

export default function BorrowerLetter({ loanId, loanName, body, figures, startOpen = false, showLoanLink = true }: {
  loanId: string | null; loanName: string; body: string; figures: LetterFigure[]; startOpen?: boolean; showLoanLink?: boolean;
}) {
  const l = parseLetter(body);
  const long = l.body.length > 700;
  const [open, setOpen] = useState(startOpen || !long);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(l.copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="rounded-xl border border-line bg-white" aria-label={`Borrower letter for ${loanName}`}>
      <header className="px-4 pt-4 pb-3 border-b border-line">
        <div className="flex items-start gap-3">
          <span className="w-8 h-8 rounded-full bg-[#F4F1EC] grid place-items-center shrink-0"><Mail className="w-4 h-4 text-sub" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[14px] font-semibold">{loanName}</h3>
              {loanId && <span className="text-[12px] text-sub tnum">{loanId}</span>}
              <span className="pill p-neutral ml-auto">Draft, not sent</span>
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
              {l.recipient && <><dt className="text-sub">To</dt><dd className="font-medium">{l.recipient}</dd></>}
              {l.subject && <><dt className="text-sub">Subject</dt><dd className="font-medium">{l.subject}</dd></>}
              {l.deadline && <><dt className="text-sub">Reply by</dt><dd className="tnum">{l.deadline}</dd></>}
            </dl>
          </div>
        </div>
        {figures.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-3" aria-label="Covenant figures quoted">
            {figures.map((f) => (
              <li key={f.label} className={`pill tnum ${f.tone === "red" ? "p-red" : f.tone === "amber" ? "p-amb" : "p-neutral"}`}>
                <span className="text-sub font-normal">{f.label}</span> {f.value}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="relative px-4 py-4">
        <div className={`text-[14px] leading-6 text-[#3A3833] space-y-3 max-w-[640px] ${open ? "" : "overflow-hidden"}`} style={open ? undefined : { maxHeight: 180 }}>
          {l.body.split(/\n\s*\n/).map((block, i) => {
            const lines = block.split("\n").map((s) => s.trim()).filter(Boolean);
            const isBullet = (s: string) => /^[-*]\s+/.test(s);
            const lead = lines[0] && !isBullet(lines[0]) ? lines[0] : null;
            const bullets = lines.slice(lead ? 1 : 0);
            if (bullets.length && bullets.every(isBullet)) {
              return (
                <div key={i}>
                  {lead && <p>{inline(lead, `b${i}`)}</p>}
                  <ul className="mt-1 space-y-1 list-disc pl-5 marker:text-[#B7AF9F]">
                    {bullets.map((s, j) => <li key={j}>{inline(s.replace(/^[-*]\s+/, ""), `b${i}-${j}`)}</li>)}
                  </ul>
                </div>
              );
            }
            return <p key={i}>{lines.map((s, j) => <Fragment key={j}>{j > 0 && <br />}{inline(s, `p${i}-${j}`)}</Fragment>)}</p>;
          })}
        </div>
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(to top, #fff 20%, rgba(255,255,255,0))" }} aria-hidden="true" />}
      </div>

      <footer className="px-4 pb-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost" onClick={copy} aria-live="polite">
          {copied ? <Check className="w-4 h-4 text-grn-t" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
          {copied ? "Copied" : "Copy letter"}
        </button>
        {long && (
          <button type="button" className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <ChevronDown className="w-4 h-4 transition-transform" style={open ? { transform: "rotate(180deg)" } : undefined} aria-hidden="true" />
            {open ? "Show less" : "Show full letter"}
          </button>
        )}
        {showLoanLink && loanId && (
          <Link href={`/desk/memo/${loanId}`} className="ml-auto text-[13px] font-medium inline-flex items-center gap-1">This loan&apos;s memo <ArrowRight className="w-3 h-3" aria-hidden="true" /></Link>
        )}
      </footer>
    </article>
  );
}
