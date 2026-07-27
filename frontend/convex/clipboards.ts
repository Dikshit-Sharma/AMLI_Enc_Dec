import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

export const get = query({
  args: { clipboardId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("clipboards")
      .withIndex("by_clipboardId", (q) => q.eq("clipboardId", args.clipboardId))
      .unique();
    if (!doc) return null;
    return {
      id: doc.clipboardId,
      title: doc.title,
      content: doc.content,
      version: doc.version,
    };
  },
});

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    let id = generateId();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await ctx.db
        .query("clipboards")
        .withIndex("by_clipboardId", (q) => q.eq("clipboardId", id))
        .unique();
      if (!existing) break;
      id = generateId();
      attempts++;
    }
    await ctx.db.insert("clipboards", {
      clipboardId: id,
      title: args.title,
      content: "",
      version: 0,
      updatedAt: Date.now(),
    });
    return { id };
  },
});

export const update = mutation({
  args: {
    clipboardId: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("clipboards")
      .withIndex("by_clipboardId", (q) => q.eq("clipboardId", args.clipboardId))
      .unique();
    if (!doc) throw new Error("Clipboard not found");
    const patch: Record<string, unknown> = { version: doc.version + 1, updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.content !== undefined) patch.content = args.content;
    await ctx.db.patch(doc._id, patch);
    return { ok: true };
  },
});

export const remove = mutation({
  args: { clipboardId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("clipboards")
      .withIndex("by_clipboardId", (q) => q.eq("clipboardId", args.clipboardId))
      .unique();
    if (!doc) throw new Error("Clipboard not found");
    await ctx.db.delete(doc._id);
    return { ok: true };
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.db.query("clipboards").take(5000);
    return docs.map((doc) => ({
      id: doc.clipboardId,
      title: doc.title,
      version: doc.version,
      contentLength: doc.content.length,
      createdAt: doc._creationTime,
      updatedAt: doc.updatedAt,
    }));
  },
});
