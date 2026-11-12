import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock, FilePenLine, Newspaper } from "lucide-react";
import { getBundle } from "@/lib/data";
import { RESIDENTIAL, STATUS_COLOR, STATUS_HINT, STATUS_NAME, STATUS_ORDER, driverSentence, loanTitle, newsItems, sectorName, shortDate, topDriver } from "@/lib/labels";
import { byUrgency, countByStatus, monthYear, scoreSummary } from "@/lib/view";
import { gbp } from "@/lib/calc";
import Spark from "@/components/Spark";
import StatusPill from "@/components/StatusPill";

export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const b = await getBundle();
  const counts = countByStatus(b.forecasts);
  const loanById = new Map(b.loans.map((l) => [l.id, l]));
  const exposure = (s: string) => b.forecasts.filter((f) => f.status === s).reduce((sum, f) => sum + (loanById.get(f.loan_id)?.amount_gbp ?? 0), 0);
  const attention = byUrgency(b.forecasts, b.loans).filter((f) => f.status !== "green").slice(0, 3);
  const news = newsItems(b.evidence, b.forecasts).filter((n) => n.moved).slice(0, 4);
  const memo = b.drafts.find((d) => d.kind === "memo" && d.loan_id == null) ?? b.drafts.find((d) => d.kind === "memo");
  const sc = scoreSummary(b);
  const headlineN = counts.red + counts.amber;
  const resN = b.loans.filter((l) => RESIDENTIAL.has(l.sector)).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="serif text-[40px] leading-[44px]">
          {headlineN === 0 ? "No loans need attention." : <>{headlineN} of {b.loans.length} loans need attention.</>}
        </h1>
        <p className="text-[14px] text-sub mt-1">{resN} residential and {b.loans.length - resN} commercial loans, checked {shortDate(b.run.as_of)}.</p>
      </div>

      <section aria-label="Loans by status" className="grid gap-4 sm:grid-cols-3">
        {STATUS_ORDER.map((s) => {
          const c = STATUS_COLOR[s];
          return (
            <Link key={s} href={`/desk/dashboard?status=${s}`} className="group min-w-0 rounded-2xl border p-4 sm:p-5 transition-shadow hover:shadow-md" style={{ background: c.bg, borderColor: c.bd }}>
              <div className="flex items-center gap-2 text-[14px] font-medium" style={{ color: c.text }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.dot }} aria-hidden="true" />{STATUS_NAME[s]}
                <ArrowUpRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
              </div>
              <div className="serif text-[56px] leading-[60px] lg:text-[88px] lg:leading-[88px] mt-3 tnum" style={{ color: c.text }}>{counts[s]}</div>
              <div className="text-[13px] mt-2" style={{ color: c.text }}>{counts[s] ? `${gbp(exposure(s))} of loans` : "No loans"}</div>
              <p className="text-[12px] text-sub mt-1 max-w-[260px]">{STATUS_HINT[s]}</p>
            </Link>
          );
        })}
      </section>

      <section aria-labelledby="h-attn">
        <div className="flex items-baseline gap-3">
          <h2 id="h-attn" className="text-[18px] font-semibold">Needs attention</h2>
          <Link href="/desk/dashboard" className="ml-auto text-[13px] text-sub hover:text-ink inline-flex items-center gap-1">All loans <ArrowRight className="w-3 h-3" aria-hidden="true" /></Link>
        </div>
        {attention.length === 0 ? (
          <p className="card p-6 mt-3 text-[14px] text-sub">Nothing is forecast to breach a covenant in the next six months.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 mt-3">
            {attention.map((f) => {
              const l = loanById.get(f.loan_id)!;
              const d = topDriver(f);
              const c = STATUS_COLOR[f.status];
              return (
                <Link key={f.loan_id} href={`/desk/loan/${f.loan_id}`} className="card p-4 flex flex-col hover:shadow-md transition-shadow" style={{ borderTop: `3px solid ${c.dot}` }}>
                  <div className="flex items-center gap-2"><StatusPill status={f.status} /><span className="ml-auto text-[12px] text-sub">{sectorName(l.sector)}</span></div>
                  <h3 className="font-semibold text-[16px] leading-5 mt-3">{loanTitle(l)}</h3>
                  <p className="text-[13px] leading-5 text-[#3A3833] mt-2 min-h-[40px]">{d ? driverSentence(d) : "Close to a covenant limit."}</p>
                  <div className="mt-auto pt-3"><Spark forecast={f} w={220} h={36} /></div>
                  <div className="mt-3 pt-3 border-t border-line flex items-center text-[13px]">
                    <span className="text-sub">First breach</span>
                    <b className="ml-auto tnum">{f.breach_month ? monthYear(f.breach_month) : "None forecast"}</b>
                  </div>
                  <span className="mt-3 text-[13px] font-medium inline-flex items-center gap-1">Open deep dive <ArrowRight className="w-3 h-3" aria-hidden="true" /></span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="h-chg" className="card p-5">
          <h2 id="h-chg" className="text-[18px] font-semibold flex items-center gap-2"><Newspaper className="w-4 h-4" aria-hidden="true" />What changed</h2>
          {news.length === 0 ? (
            <p className="text-[14px] text-sub mt-3">No news has moved a forecast in this run.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {news.map((n) => (
                <li key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0">
                      {n.url ? <a href={n.url} target="_blank" rel="noreferrer" className="font-medium text-[14px] leading-5 hover:underline">{n.headline}</a> : <span className="font-medium text-[14px]">{n.headline}</span>}
                      <p className="text-[12px] text-sub mt-0.5">{[n.domain, shortDate(n.published)].filter(Boolean).join(" · ")}</p>
                      <p className="text-[13px] mt-1">
                        <Link href={`/desk/loan/${n.loanId}?tab=news`} className="underline decoration-dotted">{loanTitle(loanById.get(n.loanId) ?? { name: n.loanId })}</Link>: {n.why}
                      </p>
                    </div>
                    <span className={`pill shrink-0 ${n.severity === "high" ? "p-red" : n.severity === "medium" ? "p-amb" : "p-neutral"}`}>{n.severityLabel}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section aria-label="Memo" className="card p-5">
            <h2 className="text-[16px] font-semibold flex items-center gap-2"><FilePenLine className="w-4 h-4" aria-hidden="true" />Weekly memo</h2>
            {memo ? (
              <>
                <p className={`pill mt-3 ${memo.status === "approved" ? "p-grn" : memo.status === "dismissed" ? "p-neutral" : "p-amb"}`}>
                  {memo.status === "approved" ? <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> : <Clock className="w-3 h-3" aria-hidden="true" />}
                  {memo.status === "approved" ? "Approved" : memo.status === "dismissed" ? "Dismissed" : "Waiting for sign-off"}
                </p>
                <p className="text-[13px] text-sub mt-2">A draft for you to read and sign. Nothing is sent without your approval.</p>
                <Link href="/desk/memo" className="btn btn-dark mt-4">{memo.status === "draft" ? "Review and sign off" : "Open memo"}</Link>
              </>
            ) : (
              <p className="text-[13px] text-sub mt-3">No memo has been drafted yet.</p>
            )}
          </section>
          <section aria-label="Accuracy" className="card p-5">
            <h2 className="text-[16px] font-semibold">Backtest accuracy</h2>
            {sc && sc.total > 0 ? (
              <>
                <p className="serif text-[44px] leading-[48px] mt-2 tnum">{sc.caught}<span className="text-[20px] text-sub"> of {sc.total} caught</span></p>
                <p className="text-[13px] text-sub">{sc.missed} missed · {sc.falseAlarms} false alarms</p>
                <Link href="/desk/log" className="text-[13px] underline decoration-dotted mt-2 inline-block">See how it was scored</Link>
              </>
            ) : (
              <p className="text-[13px] text-sub mt-3">No backtest has been run yet.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
