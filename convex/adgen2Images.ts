import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByProject = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("adgen2_images")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .order("desc")
      .collect();
    // Attach storage URLs
    return await Promise.all(
      images.map(async (img) => ({
        ...img,
        imageUrl: img.storageId ? await ctx.storage.getUrl(img.storageId) : null,
      }))
    );
  },
});

export const getByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const img = await ctx.db
      .query("adgen2_images")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
    if (!img) return null;
    return {
      ...img,
      imageUrl: img.storageId ? await ctx.storage.getUrl(img.storageId) : null,
    };
  },
});

export const create = mutation({
  args: {
    externalId: v.string(),
    project_id: v.string(),
    brand_dna_id: v.optional(v.string()),
    template_name: v.optional(v.string()),
    filled_prompt: v.string(),
    original_template: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fal_image_url: v.optional(v.string()),
    aspect_ratio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    reference_image_urls: v.optional(v.string()),
    used_edit_endpoint: v.optional(v.boolean()),
    status: v.optional(v.string()),
    error_message: v.optional(v.string()),
    is_favorite: v.optional(v.boolean()),
    tags: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("adgen2_images", {
      ...args,
      created_at: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: {
    externalId: v.string(),
    status: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    fal_image_url: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    error_message: v.optional(v.string()),
    is_favorite: v.optional(v.boolean()),
    tags: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const img = await ctx.db
      .query("adgen2_images")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
    if (!img) throw new Error("Image not found");

    const { externalId, ...rest } = args;
    const updates: Record<string, any> = {};
    for (const [key, val] of Object.entries(rest)) {
      if (val !== undefined) updates[key] = val;
    }
    await ctx.db.patch(img._id, updates);
  },
});

export const remove = mutation({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const img = await ctx.db
      .query("adgen2_images")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
    if (!img) throw new Error("Image not found");
    // Clean up storage blob
    if (img.storageId) {
      await ctx.storage.delete(img.storageId);
    }
    await ctx.db.delete(img._id);
  },
});
