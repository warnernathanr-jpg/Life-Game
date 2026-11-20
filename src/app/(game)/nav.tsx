"use client";

import { ChartColumn, ListChecks, Map, Target, Timer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/city", label: "City", Icon: Map },
  { href: "/tasks", label: "Tasks", Icon: ListChecks },
  { href: "/goals", label: "Goals", Icon: Target },
  { href: "/focus", label: "Focus", Icon: Timer },
  { href: "/stats", label: "Stats", Icon: ChartColumn },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

/** Small counts shown on tabs (e.g. tasks due today, coins to collect), rendered on the server. */
export type NavBadges = Partial<Record<string, ReactNode>>;

/** Links in the header on wide screens. */
export function TopNav({ badges }: { badges?: NavBadges }) {
  const isActive = useActive();
  return (
    <nav aria-label="Main" className="hidden gap-1 md:flex">
      {NAV.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(l.href) ? "page" : undefined}
          className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
            isActive(l.href) ? "bg-accent text-on-accent" : "text-white/80 hover:bg-white/10"
          }`}
        >
          <l.Icon className="size-4" aria-hidden />
          {l.label}
          {badges?.[l.href]}
        </Link>
      ))}
    </nav>
  );
}

/** Fixed tab bar at the bottom on phones. */
export function BottomNav({ badges }: { badges?: NavBadges }) {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface md:hidden"
      style={{ paddingBottom: "var(--nav-pad, env(safe-area-inset-bottom, 0px))" }}
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV.map((l) => {
          const active = isActive(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? "text-accent-text" : "text-muted"
                }`}
              >
                <span className="relative">
                  <l.Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                  {badges?.[l.href] && <span className="absolute -top-1.5 left-4">{badges[l.href]}</span>}
                </span>
                {l.label}
                <span aria-hidden className={`mt-0.5 h-0.5 w-6 rounded-full ${active ? "bg-accent" : "bg-transparent"}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
