"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { parseRecallCsv } from "./lib/parseRecalls";

const CPSC_CSV_URL =
  "https://www.cpsc.gov/s3fs-public/recall-data/recalls_recall_listing.csv";
const CUTOFF_DATE = "2026-01-01";

/**
 * Fetches the full CPSC recall CSV (no date-range query params — the feed
 * doesn't support them reliably, so we pull everything and filter here),
 * parses it with the same logic the seed script uses, keeps only recalls
 * on/after CUTOFF_DATE, and upserts. Safe to call repeatedly: upsertRecalls
 * skips rows whose recallNumber already exists. Runs daily via
 * convex/crons.ts, and can be triggered manually from the dashboard's
 * "Refresh Now" button for the demo.
 */
export const refreshRecalls = action({
  args: {},
  handler: async (ctx) => {
    const response = await fetch(CPSC_CSV_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch CPSC recall CSV: ${response.status} ${response.statusText}`);
    }
    const csvText = await response.text();
    const parsed = parseRecallCsv(csvText);
    const filtered = parsed.filter((r) => r.recallDate >= CUTOFF_DATE);

    // Batch to keep individual mutation payloads reasonable.
    const BATCH_SIZE = 100;
    let inserted = 0;
    let skipped = 0;
    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
      const batch = filtered.slice(i, i + BATCH_SIZE);
      const result = await ctx.runMutation(api.recalls.upsertRecalls, { recalls: batch });
      inserted += result.inserted;
      skipped += result.skipped;
    }

    return { fetched: parsed.length, afterCutoff: filtered.length, inserted, skipped };
  },
});
