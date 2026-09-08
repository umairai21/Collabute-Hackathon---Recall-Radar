"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

const BORDER_BY_CONFIDENCE: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  needs_review: "border-l-zinc-400",
};

type StatusFilter = "open" | "all" | "resolved";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "resolved", label: "Resolved" },
];

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatRecallDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function daysSince(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function StatTile({
  label,
  value,
  accent,
  accentBg,
}: {
  label: string;
  value: number;
  accent: string;
  accentBg: string;
}) {
  return (
    <div
      className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
      style={{ borderLeftWidth: 4, borderLeftColor: accent }}
    >
      <p className="text-2xl font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-0.5 text-xs font-medium text-zinc-500">{label}</p>
      <div className="mt-2 h-1 w-full rounded-full" style={{ backgroundColor: accentBg }} />
    </div>
  );
}

export default function DashboardPage() {
  const flags = useQuery(api.flags.getDashboard);
  const refreshRecalls = useAction(api.recallsActions.refreshRecalls);
  const resolveFlag = useMutation(api.flags.resolveFlag);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [search, setSearch] = useState("");

  async function handleRefresh() {
    setRefreshing(true);
    setRefreshResult(null);
    try {
      const result = await refreshRecalls({});
      setRefreshResult(
        `Fetched ${result.fetched}, ${result.afterCutoff} since 2026-01-01, +${result.inserted} new`
      );
    } catch (err) {
      setRefreshResult(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const stats = useMemo(() => {
    const all = flags ?? [];
    const open = all.filter((f) => f.status === "open");
    return {
      open: open.length,
      high: open.filter((f) => f.confidence === "high").length,
      medium: open.filter((f) => f.confidence === "medium").length,
      needsReview: open.filter((f) => f.confidence === "needs_review").length,
      resolved: all.filter((f) => f.status === "resolved").length,
    };
  }, [flags]);

  const topBrands = useMemo(() => {
    const open = (flags ?? []).filter((f) => f.status === "open");
    const counts = new Map<string, number>();
    for (const f of open) {
      counts.set(f.product.brand, (counts.get(f.product.brand) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [flags]);

  const visibleFlags = useMemo(() => {
    if (!flags) return flags;
    const byStatus = filter === "all" ? flags : flags.filter((f) => f.status === filter);
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter(
      (f) =>
        f.product.name.toLowerCase().includes(q) ||
        f.product.brand.toLowerCase().includes(q)
    );
  }, [flags, filter, search]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Live Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Flagged products, updated in real time.
          </p>
        </div>
        <div className="text-right">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh Now"}
          </button>
          {refreshResult && (
            <p className="mt-1 text-xs text-zinc-500">{refreshResult}</p>
          )}
        </div>
      </div>

      {flags && flags.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          <StatTile label="Open" value={stats.open} accent="#18181b" accentBg="#e4e4e7" />
          <StatTile label="High confidence" value={stats.high} accent="#dc2626" accentBg="#fecaca" />
          <StatTile label="Medium confidence" value={stats.medium} accent="#d97706" accentBg="#fde68a" />
          <StatTile label="Needs review" value={stats.needsReview} accent="#71717a" accentBg="#e4e4e7" />
          <StatTile label="Resolved" value={stats.resolved} accent="#16a34a" accentBg="#bbf7d0" />
        </div>
      )}

      {topBrands.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-xs font-medium text-zinc-500">Most flagged brands:</span>
          {topBrands.map(([brand, count]) => (
            <span
              key={brand}
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
            >
              {brand}
              <span className="text-zinc-400">·</span>
              <span className="tabular-nums">{count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 border-b border-zinc-200">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                filter === f.key
                  ? "border-zinc-900 text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product or brand…"
          className="w-full max-w-xs rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
        />
      </div>

      {flags === undefined && (
        <p className="mt-8 text-sm text-zinc-500">Loading…</p>
      )}
      {flags && flags.length === 0 && (
        <p className="mt-8 text-sm text-zinc-500">
          Nothing flagged yet. Try the Voice Agent or Manual Add view.
        </p>
      )}
      {flags && flags.length > 0 && visibleFlags?.length === 0 && (
        <p className="mt-8 text-sm text-zinc-500">Nothing matches this filter.</p>
      )}

      <ul className="mt-6 space-y-4">
        {visibleFlags?.map((flag) => {
          const age = flag.recall ? daysSince(flag.recall.recallDate) : null;
          return (
            <li
              key={flag.flaggedId}
              id={flag.flaggedId}
              className={`animate-fade-in flex gap-4 rounded-lg border border-zinc-200 border-l-4 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${BORDER_BY_CONFIDENCE[flag.confidence]} ${flag.status === "resolved" ? "opacity-50" : ""}`}
            >
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100">
                {flag.enrichedImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={flag.enrichedImageUrl}
                    alt={flag.product.name}
                    className="h-full w-full object-cover"
                  />
                ) : flag.recall ? (
                  <span className="animate-pulse text-[10px] text-zinc-400">
                    loading photo…
                  </span>
                ) : (
                  <span className="text-[10px] text-zinc-400">no photo</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-900">{flag.product.name}</p>
                    <p className="text-xs text-zinc-500">
                      {flag.product.brand}
                      {flag.product.modelNumber ? ` · Model ${flag.product.modelNumber}` : ""}
                    </p>
                  </div>
                  <ConfidenceBadge confidence={flag.confidence} />
                </div>

                {flag.recall ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-zinc-700">
                      {flag.recall.productName} — {flag.recall.recallNumber}
                    </p>

                    <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
                      <span>Recalled {formatRecallDate(flag.recall.recallDate)}</span>
                      {age !== null && (
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            age <= 14
                              ? "bg-red-50 text-red-600"
                              : age <= 90
                                ? "bg-amber-50 text-amber-700"
                                : "bg-zinc-100 text-zinc-500"
                          }`}
                        >
                          {age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`}
                        </span>
                      )}
                    </p>

                    {flag.aiSummary ? (
                      <div className="mt-2 flex items-start gap-2 rounded-lg bg-blue-50 p-3">
                        <span className="mt-0.5 text-sm">✨</span>
                        <p className="text-sm text-blue-900">{flag.aiSummary}</p>
                      </div>
                    ) : (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
                        Summarizing…
                      </p>
                    )}

                    <details className="mt-2 text-sm text-zinc-600">
                      <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700">
                        Full CPSC notice
                      </summary>
                      <p className="mt-2">{flag.recall.hazardDescription}</p>
                      <p className="mt-2">
                        <span className="font-semibold">Remedy: </span>
                        {flag.enrichedRemedyText ?? flag.recall.remedyText}
                      </p>
                    </details>

                    <a
                      href={flag.recall.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                    >
                      View CPSC recall page
                    </a>
                  </>
                ) : (
                  <p className="mt-2 text-sm italic text-zinc-500">
                    No confident recall match — flagged for manual review.
                  </p>
                )}

                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-400">
                    Flagged by {flag.flaggedBy} · {formatTimestamp(flag.flaggedAt)}
                  </p>
                  {flag.status === "open" ? (
                    <button
                      onClick={() => resolveFlag({ flaggedId: flag.flaggedId as Id<"flaggedProducts"> })}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium hover:bg-zinc-100"
                    >
                      Mark resolved
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-zinc-400">Resolved</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
