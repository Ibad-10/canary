"use client";
import { useState } from "react";
import { writeRow } from "@/lib/supabase";
import { useToast } from "./Toast";
import { useAuthor } from "@/lib/useAuthor";

export default function DismissButton({ loanId, signalKind, persist, readOnly = false }: { loanId: string; signalKind: string; persist: boolean; readOnly?: boolean }) {
  const [done, setDone] = useState(false);
  const { toast, show } = useToast();
  const author = useAuthor();
  async function go() {
    const r = await writeRow("corrections", { loan_id: loanId, signal_kind: signalKind, note: "Dismissed: not a concern", author }, persist);
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
