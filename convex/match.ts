import { v } from "convex/values";
import { query } from "./_generated/server";
import { rankMatches, type RecallForMatch } from "./lib/match";

/**
 * Given a spoken/typed productName + brand + optional modelNumber, ranks
 * candidate recalls from the `recalls` table:
 *   Tier 1: exact model number match -> "high"
 *   Tier 2: exact/normalized brand match + text similarity -> "medium"
 *   Tier 3: brand-only partial match, or weak similarity only -> "needs_review"
 * See convex/lib/match.ts for the scoring implementation and its noted
 * upgrade path to Convex's search index.
 */
export const matchProduct = query({
  args: {
    productName: v.string(),
    brand: v.string(),
    modelNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const allRecalls = await ctx.db.query("recalls").collect();
    const forMatch: RecallForMatch[] = allRecalls.map((r) => ({
      _id: r._id,
      productName: r.productName,
      brand: r.brand,
      modelNumbers: r.modelNumbers,
      searchText: r.searchText,
    }));

    const ranked = rankMatches(
      {
        productName: args.productName,
        brand: args.brand,
        modelNumber: args.modelNumber,
      },
      forMatch,
      5
    );

    return ranked.flatMap((candidate) => {
      const recall = allRecalls.find((r) => r._id === candidate.recallId);
      if (!recall) return [];
      return [{
        recallId: candidate.recallId,
        confidence: candidate.confidence,
        score: candidate.score,
        matchReason: candidate.matchReason,
        recall: {
          recallNumber: recall.recallNumber,
          productName: recall.productName,
          brand: recall.brand,
          modelNumbers: recall.modelNumbers,
          hazardDescription: recall.hazardDescription,
          recallDate: recall.recallDate,
          remedyText: recall.remedyText,
          sourceUrl: recall.sourceUrl,
        },
      }];
    });
  },
});
