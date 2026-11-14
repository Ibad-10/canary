import Link from "next/link";
import { ArrowRight, Clock, Mail, Sparkles, Check, X } from "lucide-react";
import { getBundle } from "@/lib/data";
import { fmt, METRICS } from "@/lib/calc";
import { METRIC_NAME, STATUS_COLOR, STATUS_NAME, STATUS_ORDER, driverSentence, loanTitle } from "@/lib/labels";
import { byUrgency, countByStatus, monthYear } from "@/lib/view";
import type { MetricKey } from "@/lib/types";
import Markdown from "@/components/Markdown";
import MemoDecision from "@/components/MemoDecision";
import BorrowerLetter from "@/components/BorrowerLetter";
import { letterFigures } from "@/lib/letters";
import StatusPill from "@/components/StatusPill";

export const dynamic = "force-dynamic";

export default async function MemoPage() {
  const b = await getBundle();
  const memo = b.drafts.find((d) => d.kind === "memo" && d.loan_id == null) ?? b.drafts.find((d) => d.kind === "memo");
  const chases = b.drafts.filter((d) => d.kind === "chase");
  const loanById = new Map(b.loans.map((l) => [l.id, l]));
  const when = new Date(b.run.created_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const nextSeq = Math.max(0, ...b.steps.map((s) => s.seq)) + 1;
  const counts = countByStatus(b.forecasts);
  const flagged = byUrgency(b.forecasts, b.loans).filter((f) => f.status !== "green");

  if (!memo) {
    return (
      <div className="card p-8 text-center">
        <h1 className="serif text-[32px]">Weekly memo</h1>
        <p className="text-sub mt-2">No memo has been drafted for this run yet.</p>
      </div>
    );
  }
  const st = memo.status;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-6 min-w-0">
        <div>
          <h1 className="serif text-[36px] leading-[40px] md:text-[40px] md:leading-[44px]">Weekly memo</h1>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {STATUS_ORDER.map((s) => (
              <span key={s} className="pill" style={{ color: STATUS_COLOR[s].text, background: STATUS_COLOR[s].bg, borderColor: STATUS_COLOR[s].bd }}>
                <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[s].dot }} aria-hidden="true" />{counts[s]} {STATUS_NAME[s].toLowerCase()}
              </span>
            ))}
            <span className={`pill ${st === "approved" ? "p-grn" : st === "dismissed" ? "p-neutral" : "p-amb"}`}>
              {st === "approved" ? <Check className="w-3 h-3" aria-hidden="true" /> : st === "dismissed" ? <X className="w-3 h-3" aria-hidden="true" /> : <Clock className="w-3 h-3" aria-hidden="true" />}
              {st === "approved" ? "Approved" : st === "dismissed" ? "Dismissed" : "Waiting for sign-off"}
            </span>
            {b.source === "fixture" && <span className="pill p-gold">Sample data</span>}
          </div>
        </div>

        <section aria-label="Loans that need attention" className="grid gap-4 md:grid-cols-2">
          {flagged.length === 0 && <p className="card p-6 text-[14px] text-sub md:col-span-2">No loans need attention this week.</p>}
          {flagged.map((f) => {
            const l = loanById.get(f.loan_id);
            if (!l) return null;
            const k: MetricKey = (f.breach_metric as MetricKey | null) && f.metrics[f.breach_metric as MetricKey] ? (f.breach_metric as MetricKey) : (METRICS.find((m) => f.metrics[m]) ?? "icr");
            const m = f.metrics[k];
            return (
              <article key={f.loan_id} className="card p-4 flex flex-col" style={{ borderTop: `3px solid ${STATUS_COLOR[f.status].dot}` }}>
                <div className="flex items-center gap-2"><StatusPill status={f.status} /><span className="ml-auto text-[12px] text-sub">{f.breach_month ? `First breach ${monthYear(f.breach_month)}` : "No breach forecast"}</span></div>
                <h2 className="text-[16px] font-semibold mt-3">{loanTitle(l)}</h2>
                {m && <p className="text-[13px] mt-1 tnum"><span className="text-sub">{METRIC_NAME[k]}:</span> {fmt(k, m.now)} now → <b>{fmt(k, m.m6.mid)}</b> in 6 months (limit {fmt(k, m.limit)})</p>}
                <ul className="mt-3 space-y-1.5 text-[13px] text-[#3A3833]">
                  {(f.drivers ?? []).slice(0, 3).map((d, i) => <li key={i} className="flex gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: STATUS_COLOR[f.status].dot }} aria-hidden="true" />{driverSentence(d)}</li>)}
                </ul>
                <div className="mt-auto pt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium">
                  <Link href={`/desk/memo/${f.loan_id}`} className="inline-flex items-center gap-1">This loan&apos;s memo <ArrowRight className="w-3 h-3" aria-hidden="true" /></Link>
                  <Link href={`/desk/loan/${f.loan_id}`} className="inline-flex items-center gap-1 text-sub">Open deep dive <ArrowRight className="w-3 h-3" aria-hidden="true" /></Link>
                </div>
              </article>
            );
          })}
        </section>

        <details className="card group">
          <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-2 text-[15px] font-semibold">
            <Sparkles className="w-4 h-4 text-gold" aria-hidden="true" />Read full memo
            <span className="ml-auto text-[12px] font-normal text-sub">Drafted by Grok at {when}</span>
          </summary>
          <div className="px-5 pb-6 border-t border-line pt-5 overflow-x-auto"><Markdown md={memo.body_md} /></div>
        </details>

        {chases.length > 0 && (
          <details className="card" open>
            <summary className="cursor-pointer list-none px-5 py-4 flex items-center gap-2 text-[15px] font-semibold"><Mail className="w-4 h-4" aria-hidden="true" />Borrower letters ({chases.length})<span className="ml-auto text-[12px] font-normal text-sub">Drafts, not sent</span></summary>
            <div className="px-5 pb-5 space-y-4 border-t border-line pt-4">
              {chases.map((c) => {
                const l = c.loan_id ? loanById.get(c.loan_id) : undefined;
                return (
                  <BorrowerLetter key={c.id} loanId={c.loan_id} loanName={l ? loanTitle(l) : c.title} body={c.body_md}
                    figures={letterFigures(b.forecasts.find((f) => f.loan_id === c.loan_id))} />
                );
              })}
            </div>
          </details>
        )}
      </div>
      <div className="flex flex-col gap-4 self-start xl:sticky xl:top-20">
        <MemoDecision persist={b.source !== "fixture"} readOnly={b.source === "demo"} draftId={memo.id} runId={b.run.id} status={memo.status} decidedBy={memo.decided_by} decidedAt={memo.decided_at} nextSeq={nextSeq} />
        <div className="card p-4 text-[12px] text-sub leading-5">
          Every number in the memo is quoted from the forecast. The language model writes the words only.
        </div>
      </div>
    </div>
  );
}
