"use client";
import dynamic from "next/dynamic";
import type { Evidence, Forecast, Loan, Signal } from "@/lib/types";

const Inner = dynamic(() => import("./LoanGraphInner"), {
  ssr: false,
  loading: () => <div className="h-[440px] grid place-items-center text-[13px] text-sub">Loading graph…</div>,
});

export default function LoanGraph(props: { loan: Loan; forecast: Forecast; signals: Signal[]; evidence: Evidence[] }) {
  return <Inner {...props} />;
}
