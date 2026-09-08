import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const addProduct = mutation({
  args: {
    name: v.string(),
    brand: v.string(),
    modelNumber: v.optional(v.string()),
    addedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const productId = await ctx.db.insert("products", {
      name: args.name,
      brand: args.brand,
      modelNumber: args.modelNumber,
      addedBy: args.addedBy,
      createdAt: Date.now(),
    });
    return productId;
  },
});
