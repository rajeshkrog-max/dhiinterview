// The saved PDF copy of a report: the database side (spec 0006). A student's report page asks for a copy with `request`
// (fire and forget); the job in reportMake.ts draws it on Cloudflare's machines and `attach` keeps it. Rules:
//  - one `reportFiles` row per check, found by index, so reopening or two devices at once never make a second row (AC-2)
//  - no public function takes a student, check or auth user id: the student comes from the session (requireStudent)
//  - `payload` never reads the flags table, email or phone (AC-5); `storageId` is never returned to a browser (AC-8)
//  - only one job runs at a time across all students, and a job that dies is picked up when its lease ends (AC-7, AC-10)
// Errors stored here are short codes only, never student data.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { getSignedInUser, requireStudent } from "./helpers";
import { rateLimiter } from "./limits";
import { FRESH_ROUND_AFTER_MS, LEASE_MS, UNATTACHED_FILE_MS, afterCountedFailure } from "./reportCore";
import { REPORT_VERSION } from "./reportVersion";
import { NO_FLAGS, findResult } from "./resultsCore";
import { enqueueSheet } from "./sheetSync";
import { flatten } from "../src/lib/result";

const stateValidator = v.union(v.literal("queued"), v.literal("making"), v.literal("ready"), v.literal("failed"));

// Asks for the signed in student's copy. Cheap and safe to call on every report open: it queues a job only when none
// is held, running or waiting for a later try, and the hourly allowance is used only when a job is really queued (AC-10).
export const request = mutation({
  args: {},
  returns: v.union(v.object({ ok: v.literal(true), state: stateValidator }), v.object({ ok: v.literal(false), code: v.string() })),
  handler: async (ctx) => {
    let student: Doc<"students">;
    let check: Doc<"checks">;
    try {
      ({ student, check } = await requireStudent(ctx));
    } catch (e) {
      const code = e instanceof ConvexError ? (e.data as { code?: unknown } | null)?.code : null;
      return { ok: false as const, code: code === "no_profile" ? "no_profile" : "not_signed_in" };
    }
    if (check.completedAt === undefined) return { ok: false as const, code: "not_completed" };
    const result = await findResult(ctx, check._id);
    if (!result) return { ok: false as const, code: "no_result" };

    const now = Date.now();
    const row = await ctx.db.query("reportFiles").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();

    if (row) {
      const holdsCurrent = row.storageId !== undefined && (row.reportVersion ?? 0) >= REPORT_VERSION;
      if (row.state === "ready" && holdsCurrent) return { ok: true as const, state: row.state };
      if (row.state === "queued" || row.state === "making") {
        // already on its way; if the report version moved meanwhile the job notices before it attaches
        if (row.wantedVersion < REPORT_VERSION) await ctx.db.patch("reportFiles", row._id, { wantedVersion: REPORT_VERSION });
        return { ok: true as const, state: row.state };
      }
      if (row.state === "failed" && !holdsCurrent && row.failedAt !== undefined && now - row.failedAt <= FRESH_ROUND_AFTER_MS) {
        return { ok: true as const, state: row.state }; // this round ended recently: not tried again yet
      }
    }

    // A job really is needed now: this is the only place the student's allowance is used.
    const allowed = await rateLimiter.limit(ctx, "reportCopy", { key: student._id });
    if (!allowed.ok) return { ok: false as const, code: "rate_limited" };

    if (row) {
      await ctx.db.patch("reportFiles", row._id, {
        state: "queued",
        resultId: result._id,
        wantedVersion: REPORT_VERSION,
        attempts: 0,
        nextAttemptAt: now,
        leaseUntil: undefined,
        failedAt: undefined,
        lastError: undefined,
      });
    } else {
      await ctx.db.insert("reportFiles", {
        studentId: student._id,
        checkId: check._id,
        resultId: result._id,
        state: "queued",
        wantedVersion: REPORT_VERSION,
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
      });
    }
    await ctx.scheduler.runAfter(0, internal.reportMake.runDue, {});
    return { ok: true as const, state: "queued" as const };
  },
});

// Where the signed in student's copy stands. Signed out (or no row) is just "none"; it never throws.
export const status = query({
  args: {},
  returns: v.object({ state: v.union(v.literal("none"), stateValidator), ready: v.boolean() }),
  handler: async (ctx) => {
    const user = await getSignedInUser(ctx);
    if (!user) return { state: "none" as const, ready: false };
    const student = await ctx.db.query("students").withIndex("by_authUserId", (q) => q.eq("authUserId", user.authUserId)).unique();
    if (!student) return { state: "none" as const, ready: false };
    const check = await ctx.db.query("checks").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique();
    if (!check) return { state: "none" as const, ready: false };
    const row = await ctx.db.query("reportFiles").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
    if (!row) return { state: "none" as const, ready: false };
    return { state: row.state, ready: row.storageId !== undefined };
  },
});

// The signed in student's held file and the name for the download, or null. Internal: only GET /api/files/report calls it,
// and it finds the student from the session of that request, never from an input (AC-8).
export const ownFile = internalQuery({
  args: {},
  returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), name: v.string() })),
  handler: async (ctx) => {
    const user = await getSignedInUser(ctx);
    if (!user) return null;
    const student = await ctx.db.query("students").withIndex("by_authUserId", (q) => q.eq("authUserId", user.authUserId)).unique();
    if (!student) return null;
    const check = await ctx.db.query("checks").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique();
    if (!check) return null;
    const row = await ctx.db.query("reportFiles").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
    if (!row || row.storageId === undefined) return null;
    return { storageId: row.storageId, name: student.name };
  },
});

// The data the render page draws from (spec 0006, value sourcing). Internal: only GET /api/render/payload calls it, after
// the signed token was checked. Only the first name and class leave the students row; the result is flattened with every
// flag set to false (it never reads the flags table); no email, no phone.
export const payload = internalQuery({
  args: { studentId: v.string(), checkId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      completedAt: v.string(),
      seed: v.string(),
      profile: v.object({ name: v.string(), class: v.string() }),
      result: v.any(),
      wantedVersion: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const studentId = ctx.db.normalizeId("students", args.studentId);
    const checkId = ctx.db.normalizeId("checks", args.checkId);
    if (!studentId || !checkId) return null;
    const student = await ctx.db.get("students", studentId);
    const check = await ctx.db.get("checks", checkId);
    if (!student || !check || check.studentId !== student._id || check.completedAt === undefined) return null;
    const row = await ctx.db.query("reportFiles").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
    const result = await findResult(ctx, check._id);
    if (!row || !result) return null;
    const flat = flatten({
      engineVersion: result.engineVersion,
      scoredAt: result.scoredAt,
      dhiStart: result.dhiStart,
      styleKey: result.styleKey,
      confidence: result.confidence,
      detail: result.detail,
      flags: NO_FLAGS,
    });
    return {
      completedAt: new Date(check.completedAt).toISOString(),
      seed: check.seed,
      profile: { name: student.name.trim().split(/\s+/)[0] ?? "", class: student.class },
      result: flat,
      wantedVersion: row.wantedVersion,
    };
  },
});

// ---------- the job's side ----------

const jobValidator = v.object({ id: v.id("reportFiles"), studentId: v.id("students"), checkId: v.id("checks"), version: v.number() });

// A counted failure of the row: the next try, or `failed` after the fifth. Only a `making` row is touched.
async function countFailure(ctx: MutationCtx, row: Doc<"reportFiles">, code: string, now: number): Promise<void> {
  const next = afterCountedFailure(row.attempts, now);
  if (next.state === "failed") {
    await ctx.db.patch("reportFiles", row._id, { state: "failed", attempts: next.attempts, failedAt: now, lastError: code, leaseUntil: undefined, nextAttemptAt: undefined });
  } else {
    await ctx.db.patch("reportFiles", row._id, { state: "queued", attempts: next.attempts, nextAttemptAt: next.nextAttemptAt, lastError: code, leaseUntil: undefined });
  }
}

// Takes the next job: the oldest queued row that is due, when no other job is running and the day's budget is not used up.
// A `making` row whose lease ran out belonged to a job that died; it is counted as a failed try first. Returns null for nothing to do.
export const claim = internalMutation({
  args: {},
  returns: v.union(v.null(), jobValidator),
  handler: async (ctx) => {
    const now = Date.now();
    const making = await ctx.db.query("reportFiles").withIndex("by_state_and_nextAttemptAt", (q) => q.eq("state", "making")).take(50);
    let running = false;
    for (const row of making) {
      if (row.leaseUntil !== undefined && row.leaseUntil > now) running = true;
      else await countFailure(ctx, row, "lease_expired", now);
    }
    if (running) return null; // one job at a time across all students

    const due = await ctx.db
      .query("reportFiles")
      .withIndex("by_state_and_nextAttemptAt", (q) => q.eq("state", "queued").lte("nextAttemptAt", now))
      .first();
    if (!due) return null;

    const day = await rateLimiter.limit(ctx, "reportCopyDay", { key: "all" });
    if (!day.ok) return null; // the row stays queued; the minute job asks again, so nothing is lost
    await ctx.db.patch("reportFiles", due._id, { state: "making", leaseUntil: now + LEASE_MS, lastAttemptAt: now, nextAttemptAt: undefined });
    return { id: due._id, studentId: due.studentId, checkId: due.checkId, version: due.wantedVersion };
  },
});

// Ends a job that did not produce a copy. `counted` uses up one of the five tries; `wait` (Browser Run 429 or 5xx) does not and
// tries again after `waitMs`; `fatal` (missing settings) ends the round at once. A row that is no longer `making` is left alone.
export const finishFailed = internalMutation({
  args: { id: v.id("reportFiles"), kind: v.union(v.literal("counted"), v.literal("wait"), v.literal("fatal")), code: v.string(), waitMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("reportFiles", args.id);
    if (!row || row.state !== "making") return null;
    const now = Date.now();
    const code = args.code.slice(0, 60);
    if (args.kind === "counted") await countFailure(ctx, row, code, now);
    else if (args.kind === "wait") await ctx.db.patch("reportFiles", row._id, { state: "queued", nextAttemptAt: now + (args.waitMs ?? 60000), lastError: code, leaseUntil: undefined });
    else await ctx.db.patch("reportFiles", row._id, { state: "failed", failedAt: now, lastError: code, leaseUntil: undefined, nextAttemptAt: undefined });
    return null;
  },
});

// Keeps a finished PDF. The new file is attached first, then the old one is deleted (AC-3). The first copy of a student also queues their Leads row again (spec 0008). The same or an older version
// never replaces the held copy, and a copy stamped with a version the row no longer wants is thrown away and asked for again.
export const attach = internalMutation({
  args: { id: v.id("reportFiles"), storageId: v.id("_storage"), size: v.number(), sha256: v.string(), version: v.number() },
  returns: v.union(v.literal("attached"), v.literal("discarded"), v.literal("again")),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("reportFiles", args.id);
    if (!row || row.state !== "making") {
      await ctx.storage.delete(args.storageId);
      return "discarded" as const;
    }
    const now = Date.now();
    if (row.wantedVersion > args.version) {
      await ctx.storage.delete(args.storageId);
      await ctx.db.patch("reportFiles", row._id, { state: "queued", nextAttemptAt: now, leaseUntil: undefined });
      return "again" as const;
    }
    if (row.storageId !== undefined && (row.reportVersion ?? 0) >= args.version) {
      await ctx.storage.delete(args.storageId);
      await ctx.db.patch("reportFiles", row._id, { state: "ready", attempts: 0, leaseUntil: undefined, failedAt: undefined, lastError: undefined });
      return "discarded" as const;
    }
    const old = row.storageId;
    await ctx.db.patch("reportFiles", row._id, {
      state: "ready",
      storageId: args.storageId,
      size: args.size,
      sha256: args.sha256,
      reportVersion: args.version,
      readyAt: now,
      ...(old !== undefined ? { replacedAt: now } : {}),
      attempts: 0,
      leaseUntil: undefined,
      nextAttemptAt: undefined,
      failedAt: undefined,
      lastError: undefined,
    });
    if (old !== undefined) {
      await ctx.storage.delete(old);
    } else {
      // The first time this student's copy is ready: the Leads row gets its team link (column N, spec 0008, AC-8). A student with no
      // phone step has no Leads row and so no link; one whose phone step comes later gets the link when that row is first built.
      const lead = await ctx.db.query("leads").withIndex("by_checkId", (q) => q.eq("checkId", row.checkId)).unique();
      if (lead) await enqueueSheet(ctx, "lead", lead._id, row.studentId, "upsert");
    }
    return "attached" as const;
  },
});

// Is there work for the job? Used by the minute cron so it starts the action only when something is due or stuck.
export const hasWork = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db.query("reportFiles").withIndex("by_state_and_nextAttemptAt", (q) => q.eq("state", "queued").lte("nextAttemptAt", now)).first();
    if (due) return true;
    return (await ctx.db.query("reportFiles").withIndex("by_state_and_nextAttemptAt", (q) => q.eq("state", "making")).first()) !== null;
  },
});

// The daily clean up: a stored file that no row holds, older than a day, is deleted (AC-11). A page at a time; it continues itself.
// (Convex storage is used only by report copies today. If another feature stores files, give them a way to be told apart first.)
export const sweep = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - UNATTACHED_FILE_MS;
    const page = await ctx.db.system.query("_storage").paginate({ numItems: 50, cursor: args.cursor ?? null });
    let deleted = 0;
    for (const file of page.page) {
      if (file._creationTime >= cutoff) continue;
      const held = await ctx.db.query("reportFiles").withIndex("by_storageId", (q) => q.eq("storageId", file._id as Id<"_storage">)).first();
      if (held) continue;
      await ctx.storage.delete(file._id);
      deleted += 1;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.reportCopy.sweep, { cursor: page.continueCursor });
    else if (deleted > 0) console.log(`reportCopy.sweep: deleted ${deleted} unattached file(s)`);
    return null;
  },
});
