import { Info } from "lucide-react";

/** Label with a short hover/focus tooltip. */
export default function Tip({ label, tip, className = "" }: { label: React.ReactNode; tip: string; className?: string }) {
  return (
    <span className={`tip inline-flex items-center gap-1 border-b border-dotted border-[#B7AF9F] ${className}`} tabIndex={0}>
      {label}<Info className="w-3 h-3 text-sub" aria-hidden="true" />
      <span className="tt" role="tooltip">{tip}</span>
    </span>
  );
}
