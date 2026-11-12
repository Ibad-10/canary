"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FilePenLine, LayoutGrid, ListChecks } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarSeparator,
} from "@/components/ui/sidebar";
import Logo from "@/components/Logo";
import { STATUS_COLOR, STATUS_NAME } from "@/lib/labels";
import type { Status } from "@/lib/types";

export type SidebarLoan = { id: string; title: string; status: Status };

export default function DeskSidebar({ loans, memoWaiting }: { loans: SidebarLoan[]; memoWaiting: boolean }) {
  const path = usePathname();
  const main = [
    { href: "/desk", label: "Summary", Icon: LayoutGrid, active: path === "/desk" },
    { href: "/desk/dashboard", label: "Dashboard", Icon: BarChart3, active: path.startsWith("/desk/dashboard") },
    { href: "/desk/memo", label: "Memo", Icon: FilePenLine, active: path.startsWith("/desk/memo"), badge: memoWaiting ? "Sign-off" : null },
    { href: "/desk/log", label: "Log", Icon: ListChecks, active: path.startsWith("/desk/log") },
  ];
  return (
    <Sidebar>
      <SidebarHeader className="px-4 pt-5 pb-3">
        <Link href="/desk" aria-label="Canary summary"><Logo /></Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.map(({ href, label, Icon, active, badge }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton isActive={active} render={<Link href={href} />}>
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                  {badge && <SidebarMenuBadge className="text-amb-t">{badge}</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Loans</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {loans.map((l) => (
                <SidebarMenuItem key={l.id}>
                  <SidebarMenuButton size="sm" isActive={path === `/desk/loan/${l.id}`} render={<Link href={`/desk/loan/${l.id}`} />}>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[l.status].dot }} aria-hidden="true" />
                    <span className="truncate">{l.title}</span>
                    <span className="sr-only">{STATUS_NAME[l.status]}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 pb-4">
        <p className="text-[11px] leading-4 text-sub">Real Cortile and listings data. Loan terms are synthetic.</p>
      </SidebarFooter>
    </Sidebar>
  );
}
