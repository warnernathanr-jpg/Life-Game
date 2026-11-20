"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV = [
  { href: "/city", label: "City", icon: "🏙️" },
  { href: "/tasks", label: "Tasks", icon: "✅" },
  { href: "/focus", label: "Focus", icon: "⏱️" },
  { href: "/stats", label: "Stats", icon: "📊" },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

/** Links in the header on wide screens. */
export function TopNav() {
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
          <span aria-hidden>{l.icon}</span>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Fixed tab bar at the bottom on phones. */
export function BottomNav() {
  const isActive = useActive();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
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
                <span aria-hidden className={`text-xl leading-none ${active ? "" : "opacity-80 grayscale-[30%]"}`}>{l.icon}</span>
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
