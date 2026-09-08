import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Small helper query shared by the enrichFlag and notifyTeam actions,
 * which each need the flagged product joined with its recall and product
 * rows but can't read the database directly (actions have no ctx.db).
 */
export const getFlaggedWithRecall = query({
  args: { flaggedId: v.id("flaggedProducts") },
  handler: async (ctx, { flaggedId }) => {
    const flagged = await ctx.db.get(flaggedId);
    if (!flagged) return null;
    const product = await ctx.db.get(flagged.productId);
    if (!product) return null;
    const recall = flagged.recallId ? await ctx.db.get(flagged.recallId) : null;
    return { flagged, product, recall };
  },
});
