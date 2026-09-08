import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { ParsedRecall } from "./lib/parseRecalls";

const parsedRecallValidator = v.object({
  recallNumber: v.string(),
  productName: v.string(),
  brand: v.string(),
  modelNumbers: v.array(v.string()),
  dateCode: v.optional(v.string()),
  hazardDescription: v.string(),
  recallDate: v.string(),
  units: v.string(),
  incidents: v.string(),
  remedyText: v.string(),
  soldAt: v.string(),
  sourceUrl: v.string(),
  searchText: v.string(),
});

/**
 * Upserts parsed recall rows, skipping any whose recallNumber already
 * exists so both the seed script and the daily refreshRecalls action can
 * be re-run cheaply without duplicating data.
 *
 * Public (not internal) so the local seed script can call it directly
 * over ConvexHttpClient without needing a deploy key. Recall data is
 * public CPSC information, so there's no sensitivity concern for this
 * MVP; add an admin check here before using this pattern in production.
 */
export const upsertRecalls = mutation({
  args: { recalls: v.array(parsedRecallValidator) },
  handler: async (ctx, { recalls }) => {
    let inserted = 0;
    let skipped = 0;
    for (const recall of recalls as ParsedRecall[]) {
      const existing = await ctx.db
        .query("recalls")
        .withIndex("by_recallNumber", (q) => q.eq("recallNumber", recall.recallNumber))
        .unique();
      if (existing) {
        skipped++;
        continue;
      }
      await ctx.db.insert("recalls", recall);
      inserted++;
    }
    return { inserted, skipped };
  },
});
