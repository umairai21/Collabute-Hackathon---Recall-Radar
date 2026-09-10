"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useConversation } from "@elevenlabs/react";
import { api } from "@/convex/_generated/api";

const LINKS = [
  { href: "/", label: "Detect Recall" },
  { href: "/dashboard", label: "Dashboard" },
];

export function NavBar() {
  const pathname = usePathname();
  const flags = useQuery(api.flags.getDashboard);
  const openCount = flags?.filter((f) => f.status === "open").length ?? 0;
  // The conversation lives in a layout-level provider now (see
  // VoiceSessionProvider), so it keeps running across page navigation —
  // this reads its live status to show/control it from anywhere, not just
  // from the "/" page where it was started.
  const { status, isSpeaking, endSession } = useConversation();
  const voiceConnected = status === "connected";

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
        <nav className="flex items-center gap-2">
          {voiceConnected && (
            <span className="flex items-center gap-1.5 rounded-full border border-blue-300 bg-blue-50 py-1 pl-3 pr-1.5 text-xs font-semibold text-blue-900">
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75 ${
                    isSpeaking ? "animate-ping" : ""
                  }`}
                />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
              </span>
              {isSpeaking ? "Speaking" : "Listening"}
              <button
                onClick={() => endSession()}
                className="ml-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 hover:bg-blue-200"
              >
                End
              </button>
            </span>
          )}
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
