import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clock, Mail, ShieldCheck, Sparkles, X } from "lucide-react";
import { getBundle } from "@/lib/data";
import { headline, detailLine, fmt, fmtCov } from "@/lib/calc";
import { METRIC_NAME, STATUS_COLOR, driverSentence, loanTitle } from "@/lib/labels";
import { monthYear } from "@/lib/view";
import { focusMetric, letterFigures, memoForLoan } from "@/lib/letters";
import Markdown from "@/components/Markdown";
import StatusPill from "@/components/StatusPill";
import BorrowerLetter from "@/components/BorrowerLetter";

export const dynamic = "force-dynamic";

export default async function LoanMemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await getBundle();
  const loan = b.loans.find((l) => l.id === id);
  const f = b.forecasts.find((x) => x.loan_id === id);
  if (!loan || !f) notFound();
  const memo = b.drafts.find((d) => d.kind === "memo" && d.loan_id === id)
    ?? b.drafts.find((d) => d.kind === "memo" && d.loan_id == null)
    ?? b.drafts.find((d) => d.kind === "memo");
  const chase = b.drafts.find((d) => d.kind === "chase" && d.loan_id === id);
  const sections = memo ? (memo.loan_id === id ? [{ heading: null, items: [memo.body_md] }] : memoForLoan(memo.body_md, id)) : [];
  const sectionMd = sections.map((s) => [s.heading ? `## ${s.heading}` : "", ...s.items.map((t) => (memo?.loan_id === id ? t : `- ${t}`))].filter(Boolean).join("\n")).join("\n\n");
  const k = focusMetric(f);
  const m = k ? f.metrics[k] : undefined;
  const col = STATUS_COLOR[f.status];
  const st = memo?.status;
  const when = memo ? new Date(b.run.created_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="space-y-6" style={{ maxWidth: 880 }}>
      <Link href="/desk/memo" className="text-[13px] text-sub inline-flex items-center gap-1 hover:text-ink"><ArrowLeft className="w-3 h-3" aria-hidden="true" />Back to full memo</Link>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={f.status} />
          {st && (
            <span className={`pill ${st === "approved" ? "p-grn" : st === "dismissed" ? "p-neutral" : "p-amb"}`}>
              {st === "approved" ? <Check className="w-3 h-3" aria-hidden="true" /> : st === "dismissed" ? <X className="w-3 h-3" aria-hidden="true" /> : <Clock className="w-3 h-3" aria-hidden="true" />}
              Memo {st === "approved" ? "approved" : st === "dismissed" ? "dismissed" : "waiting for sign-off"}
            </span>
          )}
          {b.source === "fixture" && <span className="pill p-gold">Sample data</span>}
          <span className="text-[12px] text-sub ml-auto tnum">{loan.id}</span>
        </div>
        <h1 className="serif text-[36px] leading-[40px] md:text-[40px] md:leading-[44px] mt-3">{loanTitle(loan)}</h1>
        <p className="text-[15px] mt-2">{headline(f, b.run.as_of)}</p>
        <p className="text-[13px] text-sub mt-1">{loan.borrower} · {loan.owner}</p>
      </div>

      <section className="card p-5" style={{ borderTop: `3px solid ${col.dot}` }} aria-labelledby="h-figs">
        <h2 id="h-figs" className="text-[15px] font-semibold">Covenant figures</h2>
        {k && m ? (
          <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 tnum">
            <div><dt className="text-[12px] text-sub">{METRIC_NAME[k]} now</dt><dd className="text-[20px] font-medium mt-0.5">{fmt(k, m.now)}</dd></div>
            <div><dt className="text-[12px] text-sub">In 6 months</dt><dd className="text-[20px] font-medium mt-0.5" style={{ color: col.text }}>{fmt(k, m.m6.mid)}</dd><dd className="text-[12px] text-sub">{fmt(k, m.m6.lo)} to {fmt(k, m.m6.hi)}</dd></div>
            <div><dt className="text-[12px] text-sub">Limit</dt><dd className="text-[20px] font-medium mt-0.5">{fmtCov(k, m.limit)}</dd>{m.cash_trap != null && <dd className="text-[12px] text-sub">Cash trap {fmtCov(k, m.cash_trap)}</dd>}</div>
            <div><dt className="text-[12px] text-sub">First breach</dt><dd className="text-[20px] font-medium mt-0.5">{f.status === "red" && f.breach_month ? monthYear(f.breach_month) : "None forecast"}</dd></div>
          </dl>
        ) : <p className="text-[13px] text-sub mt-2">No covenant figures on file for this loan.</p>}
        <p className="text-[13px] text-sub mt-4">{detailLine(f)}</p>
      </section>

      {sectionMd ? (
        <section className="card" aria-labelledby="h-memo">
          <div className="px-5 py-4 flex items-center gap-2 border-b border-line">
            <Sparkles className="w-4 h-4 text-gold" aria-hidden="true" />
            <h2 id="h-memo" className="text-[15px] font-semibold">What the memo says about this loan</h2>
            {when && <span className="ml-auto text-[12px] text-sub">Drafted by Grok at {when}</span>}
          </div>
          <div className="px-5 py-5 overflow-x-auto"><Markdown md={sectionMd} /></div>
        </section>
      ) : (
        <section className="card p-5" aria-labelledby="h-none">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-grn-t" aria-hidden="true" />
            <h2 id="h-none" className="text-[15px] font-semibold">{f.status === "green" ? "No action needed" : "Not covered in this week's memo"}</h2>
          </div>
          <p className="text-[14px] mt-2">{f.status === "green" ? "This loan is on track, so the memo does not discuss it. Canary keeps watching." : "The memo for this run does not mention this loan."}</p>
          {f.drivers?.length ? (
            <ul className="mt-3 space-y-1.5 text-[13px] text-[#3A3833]">
              {f.drivers.slice(0, 3).map((d, i) => <li key={i} className="flex gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: col.dot }} aria-hidden="true" />{driverSentence(d)}</li>)}
            </ul>
          ) : null}
        </section>
      )}

      {chase ? (
        <section aria-labelledby="h-letter" className="space-y-3">
          <h2 id="h-letter" className="text-[15px] font-semibold flex items-center gap-2"><Mail className="w-4 h-4" aria-hidden="true" />Borrower letter</h2>
          <BorrowerLetter loanId={loan.id} loanName={loanTitle(loan)} body={chase.body_md} figures={letterFigures(f)} startOpen showLoanLink={false} />
        </section>
      ) : f.status !== "green" ? (
        <p className="text-[13px] text-sub flex items-center gap-1.5"><Mail className="w-3 h-3" aria-hidden="true" />No borrower letter drafted for this loan.</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link href={`/desk/loan/${loan.id}`} className="btn btn-ghost">Open deep dive <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        <Link href="/desk/memo" className="btn btn-ghost"><ArrowLeft className="w-4 h-4" aria-hidden="true" />Back to full memo</Link>
      </div>
    </div>
  );
}
