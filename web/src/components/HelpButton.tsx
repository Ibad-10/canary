"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle } from "lucide-react";

const HELP: { match: (p: string) => boolean; title: string; lines: string[] }[] = [
  { match: (p) => p === "/desk", title: "Summary", lines: [
    "The three tiles count loans by status: breach risk, watch and on track. Click a tile to filter the dashboard.",
    "Needs attention shows the loans closest to breaking a loan rule, with the main reason and the first month it could break.",
    "What changed lists news that moved a forecast." ] },
  { match: (p) => p.startsWith("/desk/dashboard"), title: "Dashboard", lines: [
    "Each bar shows headroom: how far a loan is from its covenant limit in 6 months. Bars to the left of the line are past the limit.",
    "Use the chips and search to filter. Every chart and the table follow the filters.",
    "Move the What if sliders to stress rates and property values. Click any bar or row to open the deep dive." ] },
  { match: (p) => p.startsWith("/desk/loan"), title: "Loan deep dive", lines: [
    "Overview gives the verdict and key numbers. Forecast shows the next 6 months against the limit.",
    "Why maps the loan to the buildings and warning signs behind the forecast. Click any box for its detail.",
    "Evidence and News show every source. Flag anything that looks wrong and Canary remembers." ] },
  { match: (p) => p.startsWith("/desk/memo"), title: "Memo", lines: [
    "The cards summarise each loan that needs attention, built from the forecast numbers.",
    "The full memo is a draft written by Grok. Read it, then approve or dismiss.",
    "Nothing is sent to borrowers. Chase letters stay drafts." ] },
  { match: (p) => p.startsWith("/desk/log"), title: "Log", lines: [
    "Every step of the run is listed with who did it and when, so the decision can be audited.",
    "The backtest replays the past: it forecast from older data and checked what really happened." ] },
];

export default function HelpButton() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const h = HELP.find((x) => x.match(path));
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", click); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", click); document.removeEventListener("keydown", key); };
  }, [open]);
  if (!h) return null;
  return (
    <div ref={ref} className="relative">
      <button className="btn btn-ghost !px-3" aria-expanded={open} aria-controls="help-pop" onClick={() => setOpen(!open)}>
        <HelpCircle className="w-4 h-4" aria-hidden="true" /><span className="hidden sm:inline">How to read this</span><span className="sm:hidden">Help</span>
      </button>
      {open && (
        <div id="help-pop" role="dialog" aria-label={`How to read ${h.title}`} className="absolute right-0 top-full mt-2 w-[340px] card p-4 z-50">
          <p className="text-[14px] font-semibold">How to read this page</p>
          <ul className="mt-2 space-y-2 text-[13px] leading-5 text-[#3A3833]">{h.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
