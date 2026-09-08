"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

export default function ManualAddPage() {
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [flaggedBy, setFlaggedBy] = useState("Shop Staff");
  const [submitted, setSubmitted] = useState<{
    productName: string;
    brand: string;
    modelNumber?: string;
  } | null>(null);
  const [flaggedRecallIds, setFlaggedRecallIds] = useState<Set<string>>(new Set());
  const [loggedNeedsReview, setLoggedNeedsReview] = useState(false);

  const results = useQuery(api.match.matchProduct, submitted ?? "skip");
  const addProduct = useMutation(api.products.addProduct);
  const flagProduct = useMutation(api.flags.flagProduct);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!productName.trim() || !brand.trim()) return;
    setFlaggedRecallIds(new Set());
    setLoggedNeedsReview(false);
    setSubmitted({
      productName: productName.trim(),
      brand: brand.trim(),
      modelNumber: modelNumber.trim() || undefined,
    });
  }

  async function handleFlag(recallId: string, confidence: "high" | "medium" | "needs_review") {
    if (!submitted) return;
    const productId = await addProduct({
      name: submitted.productName,
      brand: submitted.brand,
      modelNumber: submitted.modelNumber,
      addedBy: flaggedBy || "Shop Staff",
    });
    await flagProduct({
      productId,
      recallId: recallId as Id<"recalls">,
      confidence,
      flaggedBy: flaggedBy || "Shop Staff",
    });
    setFlaggedRecallIds((prev) => new Set(prev).add(recallId));
  }

  async function handleLogNeedsReview() {
    if (!submitted) return;
    const productId = await addProduct({
      name: submitted.productName,
      brand: submitted.brand,
      modelNumber: submitted.modelNumber,
      addedBy: flaggedBy || "Shop Staff",
    });
    // No confident (or no) recall match: log it with no recallId so it
    // still shows on the dashboard for manual review instead of being a
    // silent false negative.
    await flagProduct({
      productId,
      confidence: "needs_review",
      flaggedBy: flaggedBy || "Shop Staff",
    });
    setLoggedNeedsReview(true);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Manual Add</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Enter what&apos;s on the shelf. We&apos;ll check it against active US safety recalls.
      </p>

      <form onSubmit={handleSearch} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium">Product name</label>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g. 9-Drawer Fabric Dresser"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Brand</label>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="e.g. Mainstays"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">
            Model number <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
            value={modelNumber}
            onChange={(e) => setModelNumber(e.target.value)}
            placeholder="e.g. GX000392AAK"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Your name</label>
          <input
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm transition-colors focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
            value={flaggedBy}
            onChange={(e) => setFlaggedBy(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={!productName.trim() || !brand.trim()}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Check for recalls
        </button>
      </form>

      {submitted && (
        <div className="mt-8 animate-fade-in">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Matches
          </h2>
          {results === undefined && (
            <p className="mt-3 text-sm text-zinc-500">Searching…</p>
          )}
          {results && results.length === 0 && (
            <div className="mt-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No recall match found for this product.
              </p>
              <button
                onClick={handleLogNeedsReview}
                disabled={loggedNeedsReview}
                className="mt-3 rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                {loggedNeedsReview ? "Logged for manual review" : "Log for manual review"}
              </button>
            </div>
          )}
          <ul className="mt-3 space-y-3">
            {results?.map((match) => (
              <li
                key={match.recallId}
                className="rounded-lg border border-zinc-200 p-4 transition-shadow hover:shadow-sm dark:border-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{match.recall.productName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {match.recall.brand} · {match.recall.recallNumber} ·{" "}
                      {match.recall.recallDate}
                    </p>
                  </div>
                  <ConfidenceBadge confidence={match.confidence} />
                </div>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {match.recall.hazardDescription}
                </p>
                <p className="mt-1 text-xs text-zinc-400">{match.matchReason}</p>
                <button
                  onClick={() => handleFlag(match.recallId, match.confidence)}
                  disabled={flaggedRecallIds.has(match.recallId)}
                  className="mt-3 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {flaggedRecallIds.has(match.recallId) ? "Flagged ✓" : "Flag this"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
