"use server";
import { getAdmin } from "./supabase";
import { DESK_OWNER, type WriteResult } from "./author";

const DECISIONS = ["approved", "dismissed"] as const;
const KIND = /^[a-z][a-z0-9_]{0,63}$/;
const LOAN_ID = /^[A-Za-z0-9_-]{1,64}$/;
const NOTE_MAX = 1000;

function refuseDemo(): WriteResult | null {
  return process.env.CANARY_DATA === "demo" ? { ok: false, where: "local", error: "Read-only public demo" } : null;
}

/** Approve or dismiss a memo draft and add the sign-off line to that run's log. run_id and seq come from the database. */
export async function decideMemo(draftId: number, decision: string): Promise<WriteResult> {
  const demo = refuseDemo();
  if (demo) return demo;
  if (!Number.isSafeInteger(draftId) || draftId <= 0) return { ok: false, where: "supabase", error: "Invalid draft id" };
  if (!(DECISIONS as readonly string[]).includes(decision)) return { ok: false, where: "supabase", error: "Invalid decision" };
  const sb = getAdmin();
  if (!sb) return { ok: true, where: "local" };

  const { data: draft, error: e1 } = await sb.from("drafts").select("id, run_id, status").eq("id", draftId).maybeSingle();
  if (e1) return { ok: false, where: "supabase", error: e1.message };
  if (!draft) return { ok: false, where: "supabase", error: "Draft not found" };
  if (draft.status !== "draft") return { ok: false, where: "supabase", error: `Draft already ${draft.status}` };

  const now = new Date().toISOString();
  const u = await sb.from("drafts").update({ status: decision, decided_by: DESK_OWNER, decided_at: now }).eq("id", draftId).eq("status", "draft").select("id");
  if (u.error) return { ok: false, where: "supabase", error: u.error.message };
  if (!u.data?.length) return { ok: false, where: "supabase", error: "Draft was decided elsewhere" };

  const { data: last } = await sb.from("steps").select("seq").eq("run_id", draft.run_id).order("seq", { ascending: false }).limit(1);
  const i = await sb.from("steps").insert({
    run_id: draft.run_id, seq: (last?.[0]?.seq ?? 0) + 1, step: "Analyst sign-off", owner: DESK_OWNER, status: "done",
    detail: decision === "approved" ? "Memo approved. Chases stay drafts, nothing sent." : "Memo dismissed. Nothing sent.", started_at: now, finished_at: now,
  });
  if (i.error) return { ok: true, where: "supabase", error: `decision saved, but the log entry failed: ${i.error.message}` };
  return { ok: true, where: "supabase" };
}

/** Record an analyst correction ("flag as wrong" or "not a concern") against a known loan. */
export async function addCorrection(loanId: string, signalKind: string, note: string): Promise<WriteResult> {
  const demo = refuseDemo();
  if (demo) return demo;
  if (typeof loanId !== "string" || !LOAN_ID.test(loanId)) return { ok: false, where: "supabase", error: "Invalid loan id" };
  if (typeof signalKind !== "string" || !KIND.test(signalKind)) return { ok: false, where: "supabase", error: "Invalid signal kind" };
  const text = typeof note === "string" ? note.trim() : "";
  if (!text) return { ok: false, where: "supabase", error: "Note is empty" };
  if (text.length > NOTE_MAX) return { ok: false, where: "supabase", error: `Note is over ${NOTE_MAX} characters` };
  const sb = getAdmin();
  if (!sb) return { ok: true, where: "local" };

  const { data: loan, error: e1 } = await sb.from("loans").select("id").eq("id", loanId).maybeSingle();
  if (e1) return { ok: false, where: "supabase", error: e1.message };
  if (!loan) return { ok: false, where: "supabase", error: "Loan not found" };

  const { error } = await sb.from("corrections").insert({ loan_id: loanId, signal_kind: signalKind, note: text, author: DESK_OWNER });
  if (error) return { ok: false, where: "supabase", error: error.message };
  return { ok: true, where: "supabase" };
}
