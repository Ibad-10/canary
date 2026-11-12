"use client";
import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TabDef = { id: string; label: string; badge?: string | number; content: ReactNode };

export default function LoanTabs({ tabs, initial }: { tabs: TabDef[]; initial: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === initial) ? initial : tabs[0].id);
  const pick = (id: string) => {
    setActive(id);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", id);
    window.history.replaceState(null, "", u);
  };
  return (
    <Tabs value={active} onValueChange={(v) => pick(String(v))} className="gap-0">
      <TabsList variant="line" aria-label="Loan sections" className="h-11 w-full justify-start gap-1 overflow-x-auto overflow-y-hidden border-b border-line p-0">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="h-11 flex-none rounded-none px-4 text-[14px] after:!bottom-0 data-active:font-semibold">
            {t.label}
            {t.badge != null && <span className="ml-1.5 rounded-full bg-[#EFEBE3] px-1.5 py-0.5 text-[11px] tnum text-sub">{t.badge}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} className="pt-6 text-[14px]">
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: "easeOut" }}>
            {t.content}
          </motion.div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
