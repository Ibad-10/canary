"use client";
import { useState } from "react";
import { addCorrection } from "@/lib/actions";
import type { WriteResult } from "@/lib/author";
import { useToast } from "./Toast";

export default function DismissButton({ loanId, signalKind, persist, readOnly = false }: { loanId: string; signalKind: string; persist: boolean; readOnly?: boolean }) {
  const [done, setDone] = useState(false);
  const { toast, show } = useToast();
  async function go() {
    const r: WriteResult = persist
      ? await addCorrection(loanId, signalKind, "Dismissed: not a concern").catch((e: Error) => ({ ok: false, where: "supabase", error: e.message }))
      : { ok: true, where: "local" };
    if (r.ok) setDone(true);
    show(r.ok ? (r.where === "supabase" ? "Dismissal saved to Canary's memory" : "Dismissal noted (sample mode, no database connected)") : `Could not save: ${r.error}`, r.ok);
  }
  return (
    <>
      <span className="block" title={readOnly ? "Read-only public demo" : undefined}>
        <button onClick={go} disabled={done || readOnly} className="btn btn-ghost justify-center w-full">
          {done ? "Dismissed - Canary will remember" : "Not a concern - dismiss"}
        </button>
      </span>
      {toast}
    </>
  );
}
