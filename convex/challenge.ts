// Joining the Founding Circle Challenge and reading where the student stands (spec 0017, scope row 11; spec 0016, row 10).
//  - `join` makes the student's entry and code once the rules (and, under 18, the parent) are ticked. The student comes from the session
//    (requireStudent); nothing takes a student id, and the browser never says "under 18": the age is read from `students` here.
//  - `me` is the student's own view: their code, their counts and the challenge dates. A friend's name or email is never in it.
// Expected refusals return { ok: false, code } so the join limit keeps its count. Nothing here logs, and no code is ever put in a message.
//  - `leaderboard` is the public board (spec 0018): the top 50 as the job last wrote them, readable only by a signed in student.
import { v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import { rowFor } from "./challengeBoard";
import { dropEntry, makeUniqueCode, recount } from "./challengeCore";
import { ENDS_AT_MS, hasEnded, isLive } from "./challengeRules";
import { CHALLENGE_CONSENT_VERSION, CONSENT_KINDS, CONSENT_TEXTS, consentHash } from "./consentText";
import { ADULT_AGE, requireStudent } from "./helpers";
import { rateLimiter } from "./limits";
import { findResult } from "./resultsCore";
import { boardRowValidator } from "./schema";

const joinRefusal = v.union(
  v.literal("not_open"),
  v.literal("ended"),
  v.literal("rate_limited"),
  v.literal("rules"),
  v.literal("parentConsent"),
  v.literal("no_result"),
);

const refuse = <C extends string>(code: C) => ({ ok: false as const, code });

// Joins the challenge. The order matters: the switch and the deadline answer first and use no limit token; then the 5 an hour limit is
// counted; then a repeat join returns the same code and changes nothing; then the ticks; then the finished check (the board needs a style).
export const join = mutation({
  args: { rulesAccepted: v.boolean(), parentConsent: v.optional(v.boolean()), hideName: v.optional(v.boolean()) },
  returns: v.union(v.object({ ok: v.literal(true), code: v.string() }), v.object({ ok: v.literal(false), code: joinRefusal })),
  handler: async (ctx, args) => {
    const { student, check } = await requireStudent(ctx);
    if (!isLive(env)) return refuse("not_open");
    const now = Date.now();
    if (hasEnded(now)) return refuse("ended");
    const allowed = await rateLimiter.limit(ctx, "challengeJoin", { key: student._id });
    if (!allowed.ok) return refuse("rate_limited");

    const existing = await ctx.db.query("challengeEntries").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).first();
    if (existing) return { ok: true as const, code: existing.code };

    if (args.rulesAccepted !== true) return refuse("rules");
    if (student.age < ADULT_AGE && args.parentConsent !== true) return refuse("parentConsent");
    if (check.completedAt === undefined || !(await findResult(ctx, check._id))) return refuse("no_result");

    // The exact words, stored the first time this version is used, then a consent row that is only ever added (AC-3).
    const text = CONSENT_KINDS[CHALLENGE_CONSENT_VERSION] === "challenge" ? CONSENT_TEXTS[CHALLENGE_CONSENT_VERSION] : undefined;
    if (text === undefined) throw new Error("challenge consent text missing");
    const stored = await ctx.db.query("consentTexts").withIndex("by_version", (q) => q.eq("version", CHALLENGE_CONSENT_VERSION)).unique();
    if (!stored) await ctx.db.insert("consentTexts", { version: CHALLENGE_CONSENT_VERSION, hash: await consentHash(text), text });
    const consentId = await ctx.db.insert("consents", {
      studentId: student._id,
      kind: "challenge",
      textVersion: CHALLENGE_CONSENT_VERSION,
      ageAtConsent: student.age,
      guardianPresent: student.age < ADULT_AGE && args.parentConsent === true,
      acceptedAt: now,
    });

    const code = await makeUniqueCode(ctx, student.name);
    await ctx.db.insert("challengeEntries", {
      studentId: student._id,
      code,
      joinedAt: now,
      consentId,
      hideName: args.hideName === true,
      validCount: 0,
    });
    // The counter follows the referral rows. A student who left and joins again starts with the valid referrals they already earned.
    await recount(ctx, student._id);
    return { ok: true as const, code };
  },
});

// Hide my name (spec 0017, AC-5): changes how the student shows on the leaderboard (at once) and in the code check hint, until the deadline.
export const setHideName = mutation({
  args: { hideName: v.boolean() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), code: v.union(v.literal("not_joined"), v.literal("ended")) })),
  handler: async (ctx, args) => {
    const { student } = await requireStudent(ctx);
    if (hasEnded(Date.now())) return refuse("ended");
    const entry = await ctx.db.query("challengeEntries").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).first();
    if (!entry) return refuse("not_joined");
    if (entry.hideName !== args.hideName) {
      await ctx.db.patch("challengeEntries", entry._id, { hideName: args.hideName });
      // A name goes on or off the public board at once, not at the next run. The row is rebuilt by `rowFor` and keeps the count the board already shows.
      const snapshot = await ctx.db.query("leaderboardSnapshots").first();
      const at = snapshot && entry.rank !== undefined ? snapshot.rows.findIndex((r) => r.rank === entry.rank) : -1;
      if (snapshot && at >= 0) {
        const row = await rowFor(ctx, { ...entry, hideName: args.hideName }, snapshot.rows[at].rank);
        if (row) await ctx.db.patch("leaderboardSnapshots", snapshot._id, { rows: snapshot.rows.map((r, i) => (i === at ? { ...row, valid: r.valid } : r)) });
      }
    }
    return { ok: true as const };
  },
});

// Leave the challenge (spec 0017, AC-6), as easy as joining. Deletes the student's entry, so their code answers `unknown`, and the board loses
// their row at once (`dropEntry` takes it out and closes the ranks up, also after the freeze). It keeps the consent row and the referral rows:
// friends' referrals keep their own status but count for nobody while the student is out. Allowed at any time, also after the deadline. A
// student can join again before the deadline and gets a new code.
export const leave = mutation({
  args: {},
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), code: v.literal("not_joined") })),
  handler: async (ctx) => {
    const { student } = await requireStudent(ctx);
    const entry = await ctx.db.query("challengeEntries").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).first();
    if (!entry) return refuse("not_joined");
    await dropEntry(ctx, entry);
    return { ok: true as const };
  },
});

const PENDING_READ_CAP = 1000;

// Where the signed in student stands. A query cannot read the clock, so it gives the dates and the browser compares them with its own clock;
// the server job decides what is late. `valid` is the entry's count (up to 5 minutes behind the job); `pending` is counted live from the
// referral rows. `rank`, `toNext` and `nextRank` are what the job last wrote on the student's own entry (null with no valid referral), so
// this stays one entry read; `toNext` is the closest place above's count minus mine plus 1 (0 in first place). `frozen` is the board's final state.
export const me = query({
  args: {},
  returns: v.object({
    open: v.boolean(), // CHALLENGE_LIVE is on: the join button works. When it is off the page says the challenge has not opened.
    joined: v.boolean(),
    code: v.union(v.string(), v.null()),
    hideName: v.boolean(),
    valid: v.number(),
    pending: v.number(),
    rank: v.union(v.number(), v.null()),
    toNext: v.union(v.number(), v.null()),
    nextRank: v.union(v.number(), v.null()),
    endsAt: v.number(),
    frozen: v.boolean(),
  }),
  handler: async (ctx) => {
    const { student } = await requireStudent(ctx);
    const snapshot = await ctx.db.query("leaderboardSnapshots").first();
    const base = { open: isLive(env), endsAt: ENDS_AT_MS, frozen: snapshot?.frozen ?? false };
    const entry = await ctx.db.query("challengeEntries").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).first();
    if (!entry) return { ...base, joined: false, code: null, hideName: false, valid: 0, pending: 0, rank: null, toNext: null, nextRank: null };
    const pending = await ctx.db
      .query("referrals")
      .withIndex("by_referrerId_and_status", (q) => q.eq("referrerId", student._id).eq("status", "pending"))
      .take(PENDING_READ_CAP);
    return {
      ...base,
      joined: true,
      code: entry.code,
      hideName: entry.hideName,
      valid: entry.validCount,
      pending: pending.length,
      rank: entry.rank ?? null,
      toNext: entry.toNext ?? null,
      nextRank: entry.nextRank ?? null,
    };
  },
});

// The public board (spec 0018, AC-6): the rows the job wrote, exactly as stored (rank, displayName, cls, style, valid, avatar), when they were
// written, whether the board is final, and the deadline. Signed in students only: a signed out caller gets `not_signed_in`. `myRank` is the
// caller's own place when they are on the board (so the page can mark their row) and null otherwise; it is a number, never an id. A query
// cannot read the clock, so the page compares `endsAt` with its own and the job alone decides `frozen`.
export const leaderboard = query({
  args: {},
  returns: v.object({
    rows: v.array(boardRowValidator),
    computedAt: v.union(v.number(), v.null()),
    frozen: v.boolean(),
    endsAt: v.number(),
    myRank: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const { student } = await requireStudent(ctx);
    const snapshot = await ctx.db.query("leaderboardSnapshots").first();
    const rows = snapshot?.rows ?? [];
    const entry = await ctx.db.query("challengeEntries").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).first();
    const myRank = entry?.rank !== undefined && rows.some((r) => r.rank === entry.rank) ? entry.rank : null;
    return { rows, computedAt: snapshot?.computedAt ?? null, frozen: snapshot?.frozen ?? false, endsAt: ENDS_AT_MS, myRank };
  },
});
