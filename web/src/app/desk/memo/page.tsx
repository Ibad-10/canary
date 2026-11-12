import Link from "next/link";
import { Clock, Mail, Sparkles, Check, X } from "lucide-react";
import { getBundle } from "@/lib/data";
import Markdown from "@/components/Markdown";
import MemoDecision from "@/components/MemoDecision";

export const dynamic = "force-dynamic";

export default async function MemoPage() {
  const b = await getBundle();
  const memo = b.drafts.find((d) => d.kind === "memo" && d.loan_id == null) ?? b.drafts.find((d) => d.kind === "memo");
  const chases = b.drafts.filter((d) => d.kind === "chase");
  const loanName = new Map(b.loans.map((l) => [l.id, l.name]));
  const when = new Date(b.run.created_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const nextSeq = Math.max(0, ...b.steps.map((s) => s.seq)) + 1;

  if (!memo) {
    return (
      <div className="card p-8 text-center">
        <h1 className="serif text-[32px]">Watchlist memo</h1>
        <p className="text-sub mt-2">No memo has been drafted for this run yet.</p>
      </div>
    );
  }
  const st = memo.status;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <article className="card rise p-8">
          <div className="flex items-center gap-2 text-[12px] text-sub">
            <Sparkles className="w-4 h-4 text-gold" aria-hidden="true" />Drafted by Canary ({memo.model}) at {when}
            <span className={`ml-auto pill ${st === "approved" ? "p-grn" : st === "dismissed" ? "p-neutral" : "p-amb"}`}>
              {st === "approved" ? <Check className="w-3 h-3" aria-hidden="true" /> : st === "dismissed" ? <X className="w-3 h-3" aria-hidden="true" /> : <Clock className="w-3 h-3" aria-hidden="true" />}
              {st === "approved" ? "Approved" : st === "dismissed" ? "Dismissed" : "Waiting sign-off"}
            </span>
          </div>
          <h1 className="serif text-[40px] leading-[44px] mt-4">Watchlist memo</h1>
          <p className="text-[13px] text-sub mt-1">{memo.title}{b.source === "fixture" && <> · <span className="text-gold">Sample data</span></>}</p>
          <div className="mt-6"><Markdown md={memo.body_md} /></div>
        </article>

        {chases.length > 0 && (
          <section aria-labelledby="h-chases" className="space-y-3">
            <h2 id="h-chases" className="text-[14px] font-semibold flex items-center gap-2"><Mail className="w-4 h-4" aria-hidden="true" />Chases to borrowers</h2>
            {chases.map((c) => (
              <div key={c.id} className="card rise p-4">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  {c.title}
                  <span className="ml-auto pill p-neutral">Draft, not sent</span>
                </div>
                {c.loan_id && <Link href={`/desk/loan/${c.loan_id}`} className="text-[12px] text-sub hover:underline">{loanName.get(c.loan_id) ?? c.loan_id}</Link>}
                <div className="text-[13px] text-sub mt-2 leading-5 whitespace-pre-line">{c.body_md}</div>
              </div>
            ))}
          </section>
        )}
      </div>
      <div className="flex flex-col gap-4 self-start">
        <MemoDecision persist={b.source !== "fixture"} draftId={memo.id} runId={b.run.id} status={memo.status} decidedBy={memo.decided_by} decidedAt={memo.decided_at} nextSeq={nextSeq} />
        <div className="card rise p-4 text-[12px] text-sub leading-5" style={{ animationDelay: "100ms" }}>
          Every number in the memo is quoted from the forecast and carries a footnote to its source. The language model writes the words only.
        </div>
      </div>
    </div>
  );
}
