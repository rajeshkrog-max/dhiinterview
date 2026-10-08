// The copy queue (spec 0004). One `sheetSync` row per (kind, refId) remembers what still has to reach the Sheet.
// `enqueueSheet` is called inside the save mutation, so a save and its queue row exist together or not at all.
// The copy job (sheetFlush.run) takes a lease here, claims due rows, and reports each result back with markResult.
// Nothing here is callable from a browser: every function is internal. Errors stored here are short Google reasons only.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { MAX_ATTEMPTS, retryDelayMs, type SheetKind } from "./sheetRowsCore";
import { kindValidator, loadRows } from "./sheetRows";

export const LEASE_MS = 4 * 60 * 1000; // a copy run holds the lease this long at most
export const FIRST_COPY_DELAY_MS = 5000; // a save is copied about 5 seconds later
export const COUNT_CAP = 500; // the status shows "500+" past this

export const sheetConfigured = (): boolean => Boolean(env.SHEET_ID && env.GOOGLE_SERVICE_ACCOUNT_KEY);

// Adds or refreshes the queue row for one record and schedules a copy. Same transaction as the save.
// Refreshing resets the tries; a row that a job is sending right now goes back to pending, and that job's result is
// then ignored (markResult only accepts rows still `sending`), so the newer content is always sent again.
export async function enqueueSheet(
  ctx: MutationCtx,
  kind: SheetKind,
  refId: string,
  key: string,
  op: "upsert" | "delete",
  opts: { resetHash?: boolean; quiet?: boolean } = {},
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db.query("sheetSync").withIndex("by_kind_and_refId", (q) => q.eq("kind", kind).eq("refId", refId)).unique();
  if (existing) {
    await ctx.db.patch("sheetSync", existing._id, {
      key,
      op,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lastError: undefined,
      ...(op === "delete" || opts.resetHash ? { rowHash: undefined } : {}),
    });
  } else {
    await ctx.db.insert("sheetSync", { kind, refId, key, op, status: "pending", attempts: 0, nextAttemptAt: now });
  }
  // A bulk caller (refill, the daily check) passes `quiet` and schedules one run for the whole page itself.
  if (!opts.quiet) await ctx.scheduler.runAfter(FIRST_COPY_DELAY_MS, internal.sheetFlush.run, {});
}

async function statusRow(ctx: MutationCtx): Promise<Doc<"sheetStatus"> | null> {
  return await ctx.db.query("sheetStatus").first();
}

// Takes the one at a time lease. False when another run holds it. An expired lease means no run is working, so any row
// left `sending` by a run that died goes back to pending.
export const acquire = internalMutation({
  args: { now: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const status = await statusRow(ctx);
    if (status?.leaseUntil !== undefined && status.leaseUntil > args.now) return false;
    const leaseUntil = args.now + LEASE_MS;
    if (status) await ctx.db.patch("sheetStatus", status._id, { lastRunAt: args.now, leaseUntil });
    else await ctx.db.insert("sheetStatus", { lastRunAt: args.now, leaseUntil });
    const stale = await ctx.db.query("sheetSync").withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "sending")).take(200);
    for (const row of stale) await ctx.db.patch("sheetSync", row._id, { status: "pending", nextAttemptAt: args.now });
    return true;
  },
});

const claimedValidator = v.object({
  id: v.id("sheetSync"),
  kind: kindValidator,
  refId: v.string(),
  key: v.string(),
  op: v.union(v.literal("upsert"), v.literal("delete")),
  attempts: v.number(),
  rowHash: v.optional(v.string()),
});

// The due rows, marked `sending`. Returns nothing when the caller's lease has run out (so a slow run stops by itself).
export const claim = internalMutation({
  args: { now: v.number(), limit: v.number() },
  returns: v.array(claimedValidator),
  handler: async (ctx, args) => {
    const status = await statusRow(ctx);
    if (!status || status.leaseUntil === undefined || status.leaseUntil <= args.now) return [];
    const due = await ctx.db
      .query("sheetSync")
      .withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "pending").lte("nextAttemptAt", args.now))
      .take(Math.min(args.limit, 100));
    for (const row of due) await ctx.db.patch("sheetSync", row._id, { status: "sending" });
    return due.map((r) => ({ id: r._id, kind: r.kind, refId: r.refId, key: r.key, op: r.op, attempts: r.attempts, rowHash: r.rowHash }));
  },
});

const resultValidator = v.object({
  id: v.id("sheetSync"),
  ok: v.boolean(),
  error: v.optional(v.string()), // a short Google reason, never record content
  rowHash: v.optional(v.string()), // the fingerprint of the row that was sent
});

// Sets each row to sent, or back to pending with a longer wait, or to failed after the 10th try.
export const markResult = internalMutation({
  args: { results: v.array(resultValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const r of args.results) {
      const row = await ctx.db.get("sheetSync", r.id);
      if (!row || row.status !== "sending") continue; // queued again meanwhile: the newer content is sent next
      if (r.ok) {
        await ctx.db.patch("sheetSync", r.id, {
          status: "sent",
          sentAt: now,
          attempts: 0,
          lastError: undefined,
          rowHash: row.op === "delete" ? undefined : r.rowHash,
        });
      } else {
        const attempts = row.attempts + 1;
        const lastError = (r.error ?? "unknown error").slice(0, 200);
        if (attempts >= MAX_ATTEMPTS) await ctx.db.patch("sheetSync", r.id, { status: "failed", attempts, lastError });
        else await ctx.db.patch("sheetSync", r.id, { status: "pending", attempts, lastError, nextAttemptAt: now + retryDelayMs(attempts) });
      }
    }
    return null;
  },
});

// Gives the lease back without recording a copy result (used by a prune, which is not a copy run).
export const releaseLease = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const status = await statusRow(ctx);
    if (status) await ctx.db.patch("sheetStatus", status._id, { leaseUntil: undefined });
    return null;
  },
});

// Stores the one line outcome of the last prune. Counts only: never a reference code, a name or a phone.
export const notePrune = internalMutation({
  args: { note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = args.note.slice(0, 300);
    const status = await statusRow(ctx);
    if (status) await ctx.db.patch("sheetStatus", status._id, { pruneNote: note });
    else await ctx.db.insert("sheetStatus", { lastRunAt: Date.now(), pruneNote: note });
    return null;
  },
});

// Ends a run: gives the lease back and records how it went. `ok` with no error clears the last error.
export const finishRun = internalMutation({
  args: { now: v.number(), ok: v.boolean(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await statusRow(ctx);
    const patch = {
      lastRunAt: args.now,
      leaseUntil: undefined,
      lastError: args.error ? args.error.slice(0, 200) : undefined,
      ...(args.ok ? { lastSuccessAt: args.now } : {}),
    };
    if (status) await ctx.db.patch("sheetStatus", status._id, patch);
    else await ctx.db.insert("sheetStatus", { lastRunAt: args.now, ...(args.ok ? { lastSuccessAt: args.now } : {}), ...(args.error ? { lastError: args.error.slice(0, 200) } : {}) });
    return null;
  },
});

// The 5 minute cron. Cheap: starts the Node job only when some row is due (or a run died holding the lease).
export const runIfDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    if (!sheetConfigured()) {
      const status = await statusRow(ctx);
      if (status) await ctx.db.patch("sheetStatus", status._id, { lastRunAt: now, lastError: "not set up" });
      else await ctx.db.insert("sheetStatus", { lastRunAt: now, lastError: "not set up" });
      return null;
    }
    const due = await ctx.db
      .query("sheetSync")
      .withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "pending").lte("nextAttemptAt", now))
      .first();
    const stuck = await ctx.db.query("sheetSync").withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", "sending")).first();
    if (due || stuck) await ctx.scheduler.runAfter(0, internal.sheetFlush.run, {});
    return null;
  },
});

export type StatusSummary = {
  configured: boolean;
  waiting: number;
  failed: number;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  pruneNote: string | null;
};

// Rows waiting and failed (counted up to 500), for the Sync status tab and for the team's own check.
export const summary = internalQuery({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    waiting: v.number(),
    failed: v.number(),
    lastRunAt: v.union(v.number(), v.null()),
    lastSuccessAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    pruneNote: v.union(v.string(), v.null()),
  }),
  handler: async (ctx): Promise<StatusSummary> => {
    const count = async (status: "pending" | "sending" | "failed") =>
      (await ctx.db.query("sheetSync").withIndex("by_status_and_nextAttemptAt", (q) => q.eq("status", status)).take(COUNT_CAP + 1)).length;
    const status = await ctx.db.query("sheetStatus").first();
    return {
      configured: sheetConfigured(),
      waiting: Math.min(COUNT_CAP + 1, (await count("pending")) + (await count("sending"))),
      failed: await count("failed"),
      lastRunAt: status?.lastRunAt ?? null,
      lastSuccessAt: status?.lastSuccessAt ?? null,
      lastError: status?.lastError ?? null,
      pruneNote: status?.pruneNote ?? null,
    };
  },
});

export type QueueRow = { id: Id<"sheetSync">; kind: SheetKind; refId: string; key: string; op: "upsert" | "delete"; attempts: number; rowHash?: string };

// The daily check (AC-8): compares the row each lead and feedback would produce now with the fingerprint of the row last
// sent, and queues the ones that changed. This is how a WhatsApp status edited by hand in the dashboard reaches the Sheet.
// A page at a time. Only rows already `sent` are compared: pending, sending and failed ones are handled by the copy itself,
// and a record queued for deletion (or already erased) has no row to compare, so it is never brought back.
export const dailyCheck = internalMutation({
  args: { kind: kindValidator, cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cursor = args.cursor ?? null;
    const page =
      args.kind === "lead"
        ? await ctx.db.query("leads").paginate({ numItems: 100, cursor })
        : await ctx.db.query("feedback").paginate({ numItems: 100, cursor });
    const rows = await loadRows(ctx, args.kind, page.page.map((r) => r._id));
    let queued = 0;
    for (const row of rows) {
      const queue = await ctx.db.query("sheetSync").withIndex("by_kind_and_refId", (q) => q.eq("kind", args.kind).eq("refId", row.refId)).unique();
      if (queue && queue.op === "delete") continue;
      if (!queue || (queue.status === "sent" && queue.rowHash !== row.hash)) {
        await enqueueSheet(ctx, args.kind, row.refId, row.key, "upsert", { quiet: true });
        queued += 1;
      }
    }
    if (queued > 0) await ctx.scheduler.runAfter(1000, internal.sheetFlush.run, {});
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.sheetSync.dailyCheck, { kind: args.kind, cursor: page.continueCursor });
    else if (args.kind === "lead") await ctx.scheduler.runAfter(0, internal.sheetSync.dailyCheck, { kind: "feedback" });
    return null;
  },
});
