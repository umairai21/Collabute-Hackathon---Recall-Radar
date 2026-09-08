"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const LINKS = [
  { href: "/", label: "Detect Recall" },
  { href: "/dashboard", label: "Dashboard" },
];

export function NavBar() {
  const pathname = usePathname();
  const flags = useQuery(api.flags.getDashboard);
  const openCount = flags?.filter((f) => f.status === "open").length ?? 0;

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-sm font-bold text-white">
            R
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Recall Radar
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {link.label}
                {link.href === "/dashboard" && openCount > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      active
                        ? "bg-white/20"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {openCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
