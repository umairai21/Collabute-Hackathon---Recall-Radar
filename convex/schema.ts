import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  recalls: defineTable({
    recallNumber: v.string(),
    productName: v.string(),
    brand: v.string(),
    modelNumbers: v.array(v.string()),
    dateCode: v.optional(v.string()),
    hazardDescription: v.string(),
    recallDate: v.string(), // ISO date string, e.g. "2026-08-27"
    units: v.string(),
    incidents: v.string(),
    remedyText: v.string(),
    soldAt: v.string(),
    sourceUrl: v.string(),
    searchText: v.string(), // lowercased productName + brand + description, for matching
  })
    .index("by_recallNumber", ["recallNumber"])
    .index("by_recallDate", ["recallDate"])
    // Full text search over searchText, filterable by brand. Lets matchProduct
    // upgrade from the in-memory Dice-coefficient fallback to a real search
    // index query (see convex/lib/match.ts) once the recall set grows large
    // enough that collect()-and-score-in-JS stops being fine.
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["brand"],
    }),

  products: defineTable({
    name: v.string(),
    brand: v.string(),
    modelNumber: v.optional(v.string()),
    addedBy: v.string(),
    createdAt: v.number(),
  }),

  flaggedProducts: defineTable({
    productId: v.id("products"),
    // Optional: a "needs_review" flag from a product with no confident
    // (or no) recall candidate still gets logged for manual review, per
    // the demo's "no false positive" path, so this can be absent.
    recallId: v.optional(v.id("recalls")),
    confidence: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("needs_review")
    ),
    flaggedBy: v.string(),
    flaggedAt: v.number(),
    status: v.union(v.literal("open"), v.literal("resolved")),
    enrichedImageUrl: v.optional(v.string()),
    enrichedRemedyText: v.optional(v.string()),
    aiSummary: v.optional(v.string()),
  })
    .index("by_flaggedAt", ["flaggedAt"])
    .index("by_status", ["status"])
    .index("by_productId", ["productId"]),
});
