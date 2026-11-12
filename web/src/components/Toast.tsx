"use client";
import { useState, type ReactNode } from "react";
import { Check, AlertTriangle } from "lucide-react";

export function useToast(): { toast: ReactNode; show: (msg: string, ok?: boolean) => void } {
  const [t, setT] = useState<{ msg: string; ok: boolean; id: number } | null>(null);
  const show = (msg: string, ok = true) => {
    const id = Date.now();
    setT({ msg, ok, id });
    setTimeout(() => setT((c) => (c && c.id === id ? null : c)), 4000);
  };
  const toast = t ? (
    <div key={t.id} role="status" className="toast fixed bottom-6 right-6 z-[60] card px-4 h-12 flex items-center gap-2 text-[14px]" style={{ boxShadow: "0 12px 32px -8px rgba(30,29,26,.25)" }}>
      <span className={`w-6 h-6 rounded-full grid place-items-center ${t.ok ? "bg-grn-bg" : "bg-red-bg"}`}>
        {t.ok ? <Check className="w-4 h-4 text-grn-t" aria-hidden="true" /> : <AlertTriangle className="w-4 h-4 text-red-t" aria-hidden="true" />}
      </span>
      {t.msg}
    </div>
  ) : null;
  return { toast, show };
}
