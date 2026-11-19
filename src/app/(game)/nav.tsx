"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/today", label: "Today", icon: "✅" },
  { href: "/city", label: "City", icon: "🏙️" },
  { href: "/coins", label: "Coins", icon: "🪙" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
              active ? "bg-white text-emerald-900" : "text-emerald-50 hover:bg-white/10"
            }`}
          >
            <span aria-hidden>{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
