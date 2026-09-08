import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Records a flagged product, optionally against a matched recall (a
 * "needs_review" flag with no confident match at all has no recallId —
 * it's still logged so staff can look at it, per the "no false positive"
 * demo path). Immediately schedules the Context.dev enrichment action
 * and (for high/medium confidence) the team-notification email, both of
 * which run asynchronously so this mutation returns fast and the
 * dashboard shows the new card right away with enrichment fields filling
 * in a moment later.
 */
export const flagProduct = mutation({
  args: {
    productId: v.id("products"),
    recallId: v.optional(v.id("recalls")),
    confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("needs_review")),
    flaggedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const flaggedId = await ctx.db.insert("flaggedProducts", {
      productId: args.productId,
      recallId: args.recallId,
      confidence: args.confidence,
      flaggedBy: args.flaggedBy,
      flaggedAt: Date.now(),
      status: "open",
    });

    if (args.recallId) {
      await ctx.scheduler.runAfter(0, api.enrich.enrichFlag, { flaggedId });
      await ctx.scheduler.runAfter(0, api.summarize.summarizeFlag, { flaggedId });
    }
    if (args.confidence === "high" || args.confidence === "medium") {
      await ctx.scheduler.runAfter(0, api.notify.notifyTeam, { flaggedId });
    }

    return flaggedId;
  },
});

export const updateEnrichment = mutation({
  args: {
    flaggedId: v.id("flaggedProducts"),
    enrichedImageUrl: v.optional(v.string()),
    enrichedRemedyText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flaggedId, {
      enrichedImageUrl: args.enrichedImageUrl,
      enrichedRemedyText: args.enrichedRemedyText,
    });
  },
});

export const updateSummary = mutation({
  args: {
    flaggedId: v.id("flaggedProducts"),
    aiSummary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flaggedId, { aiSummary: args.aiSummary });
  },
});

export const resolveFlag = mutation({
  args: { flaggedId: v.id("flaggedProducts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.flaggedId, { status: "resolved" });
  },
});

/**
 * Live dashboard feed: every flagged product joined with its recall and
 * product details, newest first, including enrichment fields once
 * enrichFlag has populated them. Convex subscriptions make this update in
 * the browser automatically whenever any of the underlying rows change.
 */
export const getDashboard = query({
  args: {},
  handler: async (ctx) => {
    const flags = await ctx.db.query("flaggedProducts").withIndex("by_flaggedAt").order("desc").collect();

    const results = [];
    for (const flag of flags) {
      const product = await ctx.db.get(flag.productId);
      if (!product) continue;
      const recall = flag.recallId ? await ctx.db.get(flag.recallId) : null;
      results.push({
        flaggedId: flag._id,
        confidence: flag.confidence,
        status: flag.status,
        flaggedBy: flag.flaggedBy,
        flaggedAt: flag.flaggedAt,
        enrichedImageUrl: flag.enrichedImageUrl,
        enrichedRemedyText: flag.enrichedRemedyText,
        aiSummary: flag.aiSummary,
        product: {
          name: product.name,
          brand: product.brand,
          modelNumber: product.modelNumber,
        },
        recall: recall
          ? {
              recallNumber: recall.recallNumber,
              productName: recall.productName,
              hazardDescription: recall.hazardDescription,
              recallDate: recall.recallDate,
              remedyText: recall.remedyText,
              sourceUrl: recall.sourceUrl,
            }
          : null,
      });
    }
    return results;
  },
});
