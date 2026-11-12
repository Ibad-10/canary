import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import type { Status } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/calc";

const CFG = {
  red: { cls: "p-red", Icon: AlertTriangle },
  amber: { cls: "p-amb", Icon: Eye },
  green: { cls: "p-grn", Icon: CheckCircle2 },
} as const;

export default function StatusPill({ status }: { status: Status }) {
  const { cls, Icon } = CFG[status] ?? CFG.green;
  return (
    <span className={`pill ${cls}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
