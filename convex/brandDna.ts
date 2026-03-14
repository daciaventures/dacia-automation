import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getByProject = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brand_dna")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .order("desc")
      .first();
  },
});

export const getByExternalId = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("brand_dna")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
  },
});

export const create = mutation({
  args: {
    externalId: v.string(),
    project_id: v.string(),
    status: v.string(),
    brand_url: v.optional(v.string()),
    competitor_urls: v.optional(v.string()),
    additional_context: v.optional(v.string()),
    brand_overview: v.optional(v.string()),
    visual_identity: v.optional(v.string()),
    target_audience: v.optional(v.string()),
    tone_and_voice: v.optional(v.string()),
    competitor_analysis: v.optional(v.string()),
    image_prompt_modifier: v.optional(v.string()),
    raw_research: v.optional(v.string()),
    error_message: v.optional(v.string()),
    duration_ms: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = new Date().toISOString();
    await ctx.db.insert("brand_dna", {
      ...args,
      created_at: now,
      updated_at: now,
    });
  },
});

const updateFields = {
  externalId: v.string(),
  status: v.optional(v.string()),
  brand_url: v.optional(v.string()),
  competitor_urls: v.optional(v.string()),
  additional_context: v.optional(v.string()),
  brand_overview: v.optional(v.string()),
  visual_identity: v.optional(v.string()),
  target_audience: v.optional(v.string()),
  tone_and_voice: v.optional(v.string()),
  competitor_analysis: v.optional(v.string()),
  image_prompt_modifier: v.optional(v.string()),
  raw_research: v.optional(v.string()),
  error_message: v.optional(v.string()),
  duration_ms: v.optional(v.number()),
};

export const update = mutation({
  args: updateFields,
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("brand_dna")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
    if (!doc) throw new Error("Brand DNA not found");

    const { externalId, ...rest } = args;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const [key, val] of Object.entries(rest)) {
      if (val !== undefined) updates[key] = val;
    }
    await ctx.db.patch(doc._id, updates);
  },
});

export const remove = mutation({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("brand_dna")
      .withIndex("by_externalId", (q) => q.eq("externalId", args.externalId))
      .first();
    if (!doc) throw new Error("Brand DNA not found");
    await ctx.db.delete(doc._id);
  },
});
