// Commands for the team and helpers for bulk queueing (spec 0004). Every function is internal: run them with
// `npx convex run sheetAdmin:<name>`; none can be called from a browser.
//
//   sheetAdmin:retryFailed                  puts every failed row back in the queue
//   sheetAdmin:refill                       sends every lead and feedback again (safe at any time; rows are found by reference code)
//   sheetAdmin:refill '{"prune":true}'      also removes the rows that do not belong (a reference code that is not a record), then refills.
//                                           Rows that belong are never moved or emptied, so team notes stay beside their students.
//                                           Add "dryRun":true to only report what it would remove, "force":true to allow it when the
//                                           database holds no record of a kind. The outcome shows on the Sync status tab (Last prune).
//   sheetAdmin:exportCsv '{"kind":"lead"}'  prints the leads (or "feedback") as CSV text, a page at a time; pass the returned
//                                           "cursor" back as {"kind":"lead","cursor":"..."} until "isDone" is true
//   sheetAdmin:status                       the copy health: configured, rows waiting, rows failed, last success, last error
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { ACTIVE_KINDS } from "./sheetFlushCore";
import { kindValidator, loadRows } from "./sheetRows";
import { KIND_HEADER, csvLine, type SheetKind } from "./sheetRowsCore";
import { enqueueSheet, summary } from "./sheetSync";

const PAGE = 100;

// Queues every record of one kind again, a page at a time, forgetting what was last sent so the whole row is sent
// again. Used for a tab made just now and by `refill`.
export const queueAll = internalMutation({
  args: { kind: kindValidator, cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cursor = args.cursor ?? null;
    if (args.kind === "lead") {
      const page = await ctx.db.query("leads").paginate({ numItems: PAGE, cursor });
      for (const lead of page.page) await enqueueSheet(ctx, "lead", lead._id, lead.studentId, "upsert", { resetHash: true, quiet: true });
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.sheetAdmin.queueAll, { kind: "lead", cursor: page.continueCursor });
    } else {
      const page = await ctx.db.query("feedback").paginate({ numItems: PAGE, cursor });
      for (const fb of page.page) await enqueueSheet(ctx, "feedback", fb._id, fb.studentId, "upsert", { resetHash: true, quiet: true });
      if (!page.isDone) await ctx.scheduler.runAfter(0, internal.sheetAdmin.queueAll, { kind: "feedback", cursor: page.continueCursor });
    }
    await ctx.scheduler.runAfter(1000, internal.sheetFlush.run, {});
    return null;
  },
});

// Puts failed rows back in the queue with fresh tries. A page at a time, so any number of rows is fine.
export const retryFailed = internalMutation({
  args: {},
  returns: v.object({ requeued: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("sheetSync").withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "failed")).take(PAGE);
    for (const row of rows) await ctx.db.patch("sheetSync", row._id, { status: "pending", attempts: 0, nextAttemptAt: now, lastError: undefined });
    const more = rows.length === PAGE;
    if (more) await ctx.scheduler.runAfter(0, internal.sheetAdmin.retryFailed, {});
    else if (rows.length > 0) await ctx.scheduler.runAfter(1000, internal.sheetFlush.run, {});
    return { requeued: rows.length, more };
  },
});

// Rebuilds the Sheet from the database. Every row is sent again and updated in place, found by its reference code. With
// `prune` (run by the Node job, which holds the lease so no copy runs meanwhile) rows that do not belong are removed first.
export const refill = internalMutation({
  args: { prune: v.optional(v.boolean()), dryRun: v.optional(v.boolean()), force: v.optional(v.boolean()) },
  returns: v.object({ started: v.literal(true), mode: v.union(v.literal("refill"), v.literal("prune"), v.literal("dryRun")) }),
  handler: async (ctx, args) => {
    if (args.prune || args.dryRun) {
      await ctx.scheduler.runAfter(0, internal.sheetFlush.pruneAndRefill, {
        tries: 0,
        ...(args.dryRun ? { dryRun: true } : {}),
        ...(args.force ? { force: true } : {}),
      });
      return { started: true as const, mode: args.dryRun ? ("dryRun" as const) : ("prune" as const) };
    }
    for (const kind of ACTIVE_KINDS) await ctx.scheduler.runAfter(0, internal.sheetAdmin.queueAll, { kind });
    return { started: true as const, mode: "refill" as const };
  },
});

// The reference codes of every lead or feedback, up to 500 a page, so a prune knows which Sheet rows belong.
export const recordKeys = internalQuery({
  args: { kind: kindValidator, cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ keys: v.array(v.string()), cursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const cursor = args.cursor ?? null;
    const page =
      args.kind === "lead"
        ? await ctx.db.query("leads").paginate({ numItems: 500, cursor })
        : await ctx.db.query("feedback").paginate({ numItems: 500, cursor });
    return { keys: page.page.map((r) => r.studentId as string), cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone };
  },
});

// The CSV fallback when the Sheet is not available. Same columns as the Sheet, one page of up to 100 rows per call.
// A cell a spreadsheet could read as a formula gets a leading quote.
export const exportCsv = internalQuery({
  args: { kind: kindValidator, cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.object({ csv: v.string(), cursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    const kind: SheetKind = args.kind;
    const cursor = args.cursor ?? null;
    const page =
      kind === "lead"
        ? await ctx.db.query("leads").paginate({ numItems: PAGE, cursor })
        : await ctx.db.query("feedback").paginate({ numItems: PAGE, cursor });
    const rows = await loadRows(ctx, kind, page.page.map((r) => r._id));
    const lines = rows.map((r) => csvLine(r.values));
    if (cursor === null) lines.unshift(csvLine(KIND_HEADER[kind]));
    return { csv: lines.join("\n") + (lines.length ? "\n" : ""), cursor: page.isDone ? null : page.continueCursor, isDone: page.isDone };
  },
});

// A quick look at the copy: `npx convex run sheetAdmin:status`.
export const status = summary;
