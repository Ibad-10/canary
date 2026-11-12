"use client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Status } from "@/lib/types";
import { STATUS_COLOR, STATUS_NAME } from "@/lib/labels";

export type SectorDatum = { sector: string; name: string; red: number; amber: number; green: number };

export default function SectorChart({ data, onPick }: { data: SectorDatum[]; onPick: (sector: string) => void }) {
  if (!data.length) return <p className="p-6 text-[13px] text-sub">No loans match the filters.</p>;
  return (
    <div className="h-[280px] px-2 pb-2" role="img" aria-label="Number of loans in each status, by sector">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 8 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke="#EFEBE4" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#5F5B53" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={104} tick={{ fontSize: 12, fill: "#1E1D1A" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "#F4F1EC" }} contentStyle={{ borderRadius: 10, border: "1px solid #E6E1D8", fontSize: 12 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {(["red", "amber", "green"] as Status[]).map((s) => (
            <Bar key={s} dataKey={s} name={STATUS_NAME[s]} stackId="a" fill={STATUS_COLOR[s].dot} cursor="pointer" radius={s === "green" ? [0, 4, 4, 0] : 0}
              onClick={(d) => { const sec = (d as unknown as { payload?: SectorDatum }).payload?.sector; if (sec) onPick(sec); }} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
