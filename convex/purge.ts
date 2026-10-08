// Daily clean up (spec 0002, AC-10). A sign in account that never finished the form is deleted 7 days after it
// was created, with its sessions, linked accounts (the encrypted Google tokens) and verification rows. An account
// that has a student record is never touched, and neither is one with session activity in the last 24 hours.
// Works in small pages and continues itself, so it never reads or writes too much in one transaction.
// Counts only are logged: no names or emails.
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const DAY = 24 * 60 * 60 * 1000;
export const ABANDONED_AFTER_MS = 7 * DAY;
const ACTIVE_WINDOW_MS = DAY;
const PAGE = 25;

type AuthUser = { _id: string; email: string };

export const purgeAbandoned = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), now: v.optional(v.number()), deleted: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      where: [{ field: "createdAt", operator: "lt", value: now - ABANDONED_AFTER_MS }],
      paginationOpts: { numItems: PAGE, cursor: args.cursor ?? null },
    });

    let deleted = args.deleted ?? 0;
    for (const user of page.page as unknown as AuthUser[]) {
      const student = await ctx.db.query("students").withIndex("by_authUserId", (q) => q.eq("authUserId", user._id)).first();
      if (student) continue;
      const recent = await ctx.runQuery(components.betterAuth.adapter.findMany, {
        model: "session",
        where: [
          { field: "userId", operator: "eq", value: user._id },
          { field: "updatedAt", operator: "gt", value: now - ACTIVE_WINDOW_MS, connector: "AND" },
        ],
        paginationOpts: { numItems: 1, cursor: null },
      });
      if (recent.page.length > 0) continue;

      // Each delete is a page of its own; an account holds only a handful of rows of each kind.
      const rows: { model: "session" | "account" | "verification" | "user"; field: string; value: string }[] = [
        { model: "session", field: "userId", value: user._id },
        { model: "account", field: "userId", value: user._id },
        { model: "verification", field: "identifier", value: user.email },
        { model: "user", field: "_id", value: user._id },
      ];
      for (const r of rows) {
        await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
          // the component types `field` as the union of every table's fields, so spell the input out
          input: { model: r.model, where: [{ field: r.field, operator: "eq" as const, value: r.value }] } as never,
          paginationOpts: { numItems: 100, cursor: null },
        });
      }
      deleted += 1;
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.purge.purgeAbandoned, { cursor: page.continueCursor, now: args.now, deleted });
    } else {
      console.log(`purgeAbandoned: deleted ${deleted} abandoned sign in account(s)`);
    }
    return null;
  },
});
