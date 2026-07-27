import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  clipboards: defineTable({
    clipboardId: v.string(),
    title: v.string(),
    content: v.string(),
    version: v.number(),
  }).index("by_clipboardId", ["clipboardId"]),
});
