"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Clock } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { useToast } from "./Toast";
import { useAuthor } from "@/lib/useAuthor";

export default function MemoDecision({ draftId, runId, status, decidedBy, decidedAt, nextSeq, persist, readOnly = false }: {
  persist: boolean; readOnly?: boolean; draftId: number; runId: string; status: string; decidedBy: string | null; decidedAt: string | null; nextSeq: number;
}) {
  const router = useRouter();
  const ME = useAuthor();
  const [state, setState] = useState({ status, by: decidedBy, at: decidedAt });
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  async function decide(s: "approved" | "dismissed") {
    setBusy(true);
    const now = new Date().toISOString();
    const sb = persist ? getSupabase() : null;
    let where = "sample mode, not saved to a database";
    if (sb) {
      const u = await sb.from("drafts").update({ status: s, decided_by: ME, decided_at: now }).eq("id", draftId);
      if (u.error) { setBusy(false); show(`Could not save: ${u.error.message}`, false); return; }
      const i = await sb.from("steps").insert({
        run_id: runId, seq: nextSeq, step: "Analyst sign-off", owner: ME, status: "done",
        detail: s === "approved" ? "Memo approved. Chases stay drafts, nothing sent." : "Memo dismissed. Nothing sent.", started_at: now, finished_at: now,
      });
      where = i.error ? `decision saved, but the log entry failed: ${i.error.message}` : "saved to the log";
    }
    setState({ status: s, by: ME, at: now });
    setBusy(false);
    show(`Memo ${s} (${where})`, true);
    router.refresh();
  }

  const decided = state.status === "approved" || state.status === "dismissed";
  return (
    <div className="card rise p-4" style={{ animationDelay: "60ms" }}>
      <h2 className="text-[14px] font-semibold">Your decision</h2>
      <p className="text-[12px] text-sub mt-1">Nothing is sent until you approve, and even then chases stay drafts.</p>
      {decided ? (
        <div className={`mt-4 rounded-xl border px-3 py-3 text-[13px] ${state.status === "approved" ? "bg-grn-bg border-grn-bd text-grn-t" : "bg-[#F4F1EC] border-line text-sub"}`}>
          <b>{state.status === "approved" ? "Approved" : "Dismissed"}</b> by {state.by ?? ME}
          {state.at && <> · {new Date(state.at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-4" title={readOnly ? "Read-only public demo" : undefined}>
          <button className="btn btn-dark justify-center" disabled={busy || readOnly} onClick={() => decide("approved")}><Check className="w-4 h-4" aria-hidden="true" />Approve</button>
          <button className="btn btn-ghost justify-center text-red-t" disabled={busy || readOnly} onClick={() => decide("dismissed")}><X className="w-4 h-4" aria-hidden="true" />Dismiss</button>
        </div>
      )}
      {readOnly && !decided && <p className="text-[12px] text-sub mt-3">Read-only public demo: sign-off is switched off here.</p>}
      {!decided && !readOnly && <p className="text-[12px] text-sub mt-3 flex items-center gap-1"><Clock className="w-3 h-3" aria-hidden="true" />Signing as {ME}</p>}
      {toast}
    </div>
  );
}
