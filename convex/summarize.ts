import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-120b";

const SYSTEM_PROMPT =
  "You summarize US product-safety recall notices for busy retail shop staff " +
  "who are not lawyers. Given a hazard description and a remedy, write exactly " +
  "two short sentences in plain English: (1) what's dangerous about the " +
  "product, (2) what the shop/consumer should do about it. No legal jargon, " +
  "no citations of acts or standards, no boilerplate preamble — just the two " +
  "sentences.";

/**
 * Runs right after a product is flagged (see convex/flags.ts:flagProduct).
 * The CPSC hazard/remedy text is dense and legalistic; this distills it into
 * a two-sentence plain-English summary for the dashboard card via Groq's
 * OpenAI-compatible chat completions endpoint. Best-effort, same pattern as
 * enrichFlag/notifyTeam: missing key or API failure just skips the summary
 * rather than failing the flag itself.
 */
export const summarizeFlag = action({
  args: { flaggedId: v.id("flaggedProducts") },
  handler: async (ctx, { flaggedId }) => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.warn("GROQ_API_KEY not set; skipping summary for", flaggedId);
      return;
    }

    const flagged = await ctx.runQuery(api.flagsInternal.getFlaggedWithRecall, { flaggedId });
    if (!flagged || !flagged.recall) return;

    try {
      const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          max_tokens: 300,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `Product: ${flagged.product.name} (${flagged.product.brand})\nHazard: ${flagged.recall.hazardDescription}\nRemedy: ${flagged.flagged.enrichedRemedyText ?? flagged.recall.remedyText}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error(`Groq summarize failed: ${response.status} ${response.statusText}`);
        return;
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) {
        await ctx.runMutation(api.flags.updateSummary, { flaggedId, aiSummary: text });
      }
    } catch (err) {
      console.error("summarizeFlag error:", err);
    }
  },
});
