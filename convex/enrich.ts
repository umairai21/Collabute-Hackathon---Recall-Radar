import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const CONTEXT_DEV_API_URL = "https://api.context.dev/v1/web/extract";

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    imageUrl: {
      type: "string",
      description: "The URL of the main product photo shown on the recall page",
    },
    remedyText: {
      type: "string",
      description: "The full, formatted remedy / what-to-do instructions for consumers",
    },
  },
};

/**
 * Runs right after a product is flagged. Scrapes the recall's CPSC page
 * (not the CSV) via Context.dev's structured-extraction endpoint to pull
 * a product photo and the full formatted remedy text, then writes them
 * back onto the flaggedProducts record so the dashboard card can swap
 * out of its loading state.
 *
 * Best-effort: Context.dev is enrichment only, not the core data feed, so
 * any failure here (missing API key, scrape error, bad response shape)
 * is logged and swallowed rather than failing the flag itself.
 */
export const enrichFlag = action({
  args: { flaggedId: v.id("flaggedProducts") },
  handler: async (ctx, { flaggedId }) => {
    const apiKey = process.env.CONTEXT_DEV_API_KEY;
    if (!apiKey) {
      console.warn("CONTEXT_DEV_API_KEY not set; skipping enrichment for", flaggedId);
      return;
    }

    const flagged = await ctx.runQuery(api.flagsInternal.getFlaggedWithRecall, { flaggedId });
    if (!flagged || !flagged.recall) return;

    try {
      const response = await fetch(CONTEXT_DEV_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: flagged.recall.sourceUrl,
          schema: ENRICHMENT_SCHEMA,
        }),
      });

      if (!response.ok) {
        console.error(`Context.dev extract failed: ${response.status} ${response.statusText}`);
        return;
      }

      const body = (await response.json()) as {
        data?: { imageUrl?: string; remedyText?: string };
      };
      await ctx.runMutation(api.flags.updateEnrichment, {
        flaggedId,
        enrichedImageUrl: body.data?.imageUrl,
        enrichedRemedyText: body.data?.remedyText,
      });
    } catch (err) {
      console.error("enrichFlag error:", err);
    }
  },
});
