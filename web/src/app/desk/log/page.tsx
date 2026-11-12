import { CheckCircle2, CircleX, BellOff, Clock, AlertTriangle, RotateCcw } from "lucide-react";
import { getBundle } from "@/lib/data";
import type { Score, Step } from "@/lib/types";

import { STATUS_NAME, humanise, loanTitle } from "@/lib/labels";

export const dynamic = "force-dynamic";

const OUTCOME: Record<string, string> = { caught: "Caught", missed: "Missed", clear: "Correctly clear", false_alarm: "False alarm", false_alarms: "False alarm" };
const statusName = (s?: string) => (s && s in STATUS_NAME ? STATUS_NAME[s as keyof typeof STATUS_NAME] : "–");

const NOTE = "backtest: forecast from data to 31 May 2026, checked against 12 Nov 2026";
const tm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "–");
function dur(s: Step) {
  if (!s.started_at || !s.finished_at) return "";
  const d = (Date.parse(s.finished_at) - Date.parse(s.started_at)) / 1000;
  return d < 1 ? "<1 s" : d < 90 ? `${Math.round(d)} s` : `${Math.round(d / 60)} min`;
}
const ST = {
  done: { cls: "p-grn", Icon: CheckCircle2, label: "Done", head: "bg-[#F4F1EC] text-sub border-line" },
  fallback: { cls: "p-amb", Icon: RotateCcw, label: "Fallback", head: "bg-amb-bg text-amb-t border-amb-bd" },
  failed: { cls: "p-red", Icon: AlertTriangle, label: "Failed", head: "bg-red-bg text-red-t border-red-bd" },
  waiting: { cls: "p-neutral", Icon: Clock, label: "Waiting", head: "bg-[#FFFBEB] text-gold border-[#F5DC6E]" },
} as const;

type PerLoan = { loan_id: string; predicted?: string; actual?: string; outcome: string };
function normScore(score: Score | null) {
  if (!score) return null;
  const raw = score.per_loan;
  let per: PerLoan[] = [];
  if (Array.isArray(raw)) per = raw.map((r: Record<string, unknown>) => ({ loan_id: String(r.loan_id ?? r.id), predicted: r.predicted as string, actual: r.actual as string, outcome: String(r.outcome ?? r.result ?? "") }));
  else if (raw && typeof raw === "object") per = Object.entries(raw as Record<string, Record<string, unknown>>).map(([id, r]) => ({ loan_id: id, predicted: r?.predicted as string, actual: r?.actual as string, outcome: String(r?.outcome ?? r?.result ?? "") }));
  const cnt = (o: string) => per.filter((p) => p.outcome.replace("alarm", "alarm") === o).length;
  const num = (v: unknown, fb: number) => (typeof v === "number" ? v : fb);
  const caught = num(score.caught, cnt("caught"));
  const missed = num(score.missed, cnt("missed"));
  const fa = num(score.false_alarms ?? score.false_alarm, per.filter((p) => p.outcome.startsWith("false")).length);
  return { caught, missed, fa, total: caught + missed, per, note: typeof score.note === "string" ? score.note : NOTE };
}

export default async function LogPage() {
  const b = await getBundle();
  const sc = normScore(b.scoreRun?.score ?? b.run.score);
  const name = new Map(b.loans.map((l) => [l.id, loanTitle(l)]));
  return (
    <>
      <h1 className="rise serif text-[40px] leading-[44px]" style={{ animationDelay: "40ms" }}>Who did what, and when.</h1>
      <p className="rise text-[15px] text-sub mt-1" style={{ animationDelay: "60ms" }}>Each step is logged with its owner and time, so anyone can audit the decision.</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px] mt-6">
        <div className="card rise p-6 dotgrid" style={{ animationDelay: "100ms" }}>
          <ol className="flex flex-col items-center">
            {b.steps.length === 0 && <li className="text-sub text-[13px]">No steps logged for this run yet.</li>}
            {b.steps.map((s, i) => {
              const c = ST[s.status as keyof typeof ST] ?? ST.done;
              const human = !["Canary engine", "Grok"].includes(s.owner);
              return (
                <li key={s.id ?? i} className="w-full max-w-[560px] flex flex-col items-center">
                  {i > 0 && <span aria-hidden="true" className="w-px h-4 bg-[#CFC8BB]" />}
                  <div className="rise w-full rounded-xl border bg-white overflow-hidden" style={{ borderColor: human && s.status === "done" ? "#ABEFC6" : "#E6E1D8", animationDelay: `${120 + i * 50}ms` }}>
                    <div className={`flex items-center gap-2 px-4 h-6 text-[11px] font-medium border-b ${human && s.status === "done" ? "bg-grn-bg text-grn-t border-grn-bd" : c.head}`}>
                      <span className="tnum">#{s.seq}</span>{human ? "Human gate" : s.owner === "Grok" ? "Writing" : "Engine"}
                      <span className="ml-auto tnum">{tm(s.finished_at ?? s.started_at)}</span>
                    </div>
                    <div className="flex items-center gap-4 px-4 py-2">
                      <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-semibold shrink-0 ${human ? "bg-[#E9E3D7] text-ink" : "bg-canary text-ink"}`} aria-hidden="true">{human ? s.owner.split(" ").map((x) => x[0]).join("").slice(0, 2) : s.owner[0]}</span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-medium">{s.step}</div>
                        <div className="text-[12px] text-sub">{s.owner} · {s.detail}</div>
                      </div>
                      <span className="ml-auto shrink-0 text-[12px] tnum text-sub">{dur(s)}</span>
                      <span className={`pill ${c.cls} shrink-0`}><c.Icon className="w-3 h-3" aria-hidden="true" />{c.label}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-4">
          <section className="card rise p-6" style={{ animationDelay: "160ms" }} aria-labelledby="h-acc">
            <div className="flex items-center"><h2 id="h-acc" className="text-[14px] font-semibold">How accurate is Canary?</h2>
              {b.source === "fixture" && <span className="ml-auto pill p-gold">Sample data</span>}</div>
            {sc ? (
              <>
                <p className="text-[12px] text-sub mt-1">{sc.note}</p>
                <div className="serif text-[56px] leading-[56px] mt-4"><span className="tnum">{sc.caught}</span><span className="text-sub text-[32px]"> of {sc.total} caught</span></div>
                <div className="flex h-2 rounded-full overflow-hidden mt-4 gap-[2px]" aria-hidden="true">
                  <div className="bg-grn-dot" style={{ width: `${sc.total ? (sc.caught / sc.total) * 100 : 0}%` }} />
                  <div className="bg-red-dot" style={{ width: `${sc.total ? (sc.missed / sc.total) * 100 : 0}%` }} />
                </div>
                <ul className="mt-4 space-y-2 text-[13px]">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-grn-t" aria-hidden="true" />Caught<span className="ml-auto tnum font-medium">{sc.caught}</span></li>
                  <li className="flex items-center gap-2"><CircleX className="w-4 h-4 text-red-t" aria-hidden="true" />Missed<span className="ml-auto tnum font-medium">{sc.missed}</span></li>
                  <li className="flex items-center gap-2"><BellOff className="w-4 h-4 text-amb-t" aria-hidden="true" />False alarms<span className="ml-auto tnum font-medium">{sc.fa}</span></li>
                </ul>
              </>
            ) : (
              <p className="text-[13px] text-sub mt-3">No backtest has been run yet. Run <code>python -m engine.pipeline --backtest</code>.</p>
            )}
          </section>

          {sc && sc.per.length > 0 && (
            <section className="card rise overflow-hidden" style={{ animationDelay: "200ms" }} aria-label="Backtest per loan">
              <table className="w-full text-[13px]">
                <thead className="bg-[#FAF8F4] text-[12px] text-sub"><tr className="text-left"><th scope="col" className="font-medium h-9 pl-4">Loan</th><th scope="col" className="font-medium">Canary said</th><th scope="col" className="font-medium">What happened</th><th scope="col" className="font-medium pr-4">Result</th></tr></thead>
                <tbody>
                  {sc.per.map((p) => (
                    <tr key={p.loan_id} className="border-t border-line">
                      <td className="pl-4 py-2">{name.get(p.loan_id) ?? p.loan_id}</td>
                      <td className="text-sub">{statusName(p.predicted)}</td>
                      <td className="text-sub">{statusName(p.actual)}</td>
                      <td className="pr-4"><span className={`pill ${p.outcome === "caught" ? "p-grn" : p.outcome === "missed" ? "p-red" : p.outcome.startsWith("false") ? "p-amb" : "p-neutral"}`}>{OUTCOME[p.outcome] ?? (p.outcome ? humanise(p.outcome) : "–")}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
