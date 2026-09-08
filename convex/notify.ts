import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const RESEND_API_URL = "https://api.resend.com/emails";

// Hardcoded per spec ("a hardcoded admin address"); swap for an env var
// or a real recipients list before this goes past demo stage.
const ADMIN_EMAIL = process.env.RECALL_RADAR_ADMIN_EMAIL || "admin@example.com";
const FROM_EMAIL = process.env.RECALL_RADAR_FROM_EMAIL || "Recall Radar <onboarding@resend.dev>";
const DASHBOARD_URL = process.env.RECALL_RADAR_APP_URL || "http://localhost:3000";

/**
 * Fires whenever a product is flagged with "high" or "medium" confidence
 * (see convex/flags.ts:flagProduct). Sends a plain HTTP call to Resend's
 * API rather than pulling in their SDK, since fetch is all we need here.
 */
export const notifyTeam = action({
  args: { flaggedId: v.id("flaggedProducts") },
  handler: async (ctx, { flaggedId }) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.warn("RESEND_API_KEY not set; skipping notification for", flaggedId);
      return;
    }

    const flagged = await ctx.runQuery(api.flagsInternal.getFlaggedWithRecall, { flaggedId });
    if (!flagged || !flagged.recall) return;

    const { product, recall } = flagged;
    const dashboardLink = `${DASHBOARD_URL}/dashboard#${flaggedId}`;

    const html = `
      <h2>Recall Radar: product flagged</h2>
      <p><strong>Product:</strong> ${product.name} (${product.brand})</p>
      <p><strong>Matched recall:</strong> ${recall.productName} — ${recall.recallNumber}</p>
      <p><strong>Hazard:</strong> ${recall.hazardDescription}</p>
      <p><a href="${dashboardLink}">View on the dashboard</a></p>
    `;

    try {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [ADMIN_EMAIL],
          subject: `Recall Radar: ${product.name} flagged (${flagged.flagged.confidence})`,
          html,
        }),
      });
      if (!response.ok) {
        console.error(`Resend send failed: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      console.error("notifyTeam error:", err);
    }
  },
});
