// The private link to a student's report: the database side (spec 0010). One `reportShares` row per student.
//  - `enable` makes the link (or moves its end date, or makes a new generation) once the student has agreed to the notice. The student
//    comes from the session (requireStudent); no function takes a student id (AC-14).
//  - `status` tells the signed in student where their link stands, and gives them the code of a link that is on, so the page can share it
//    without making a new link (and so without moving the end date: only an explicit Share tap does that, AC-6).
//  - `disable` is Stop sharing. `adminOff` is the team's switch, run from a terminal after a complaint.
//  - `publicRead` is what GET /api/shared/payload calls after it checked the signature itself. A query cannot use the rate limiter,
//    so it is an internal mutation. Every link that does not work answers the same `unavailable` (AC-7).
// Errors are short codes only, never student data, and the link code is never logged.
import { v } from "convex/values";
import { env, internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { CONSENT_KINDS, CONSENT_TEXTS, SHARE_CONSENT_VERSION, consentHash } from "./consentText";
import { ADULT_AGE, requireStudent, type Reader } from "./helpers";
import { rateLimiter } from "./limits";
import { findResult } from "./resultsCore";
import { expiryFor, makeShareCode } from "./shareCore";
import { buildSharePayload } from "./sharePayload";

// The student's share consent for the CURRENT notice version, or null. A new notice version asks again; turning the link off and on does not.
async function currentConsent(ctx: Reader, studentId: Id<"students">): Promise<Id<"consents"> | null> {
  const rows = await ctx.db.query("consents").withIndex("by_studentId", (q) => q.eq("studentId", studentId)).order("desc").take(50);
  return rows.find((r) => r.kind === "share" && r.textVersion === SHARE_CONSENT_VERSION)?._id ?? null;
}

const enableRefusal = v.union(
  v.literal("rate_limited"),
  v.literal("report_not_ready"),
  v.literal("unavailable"),
  v.literal("needs_consent"),
  v.literal("needs_guardian"),
  v.literal("consent_text_changed"),
);

// Makes the signed in student's link, or keeps it going:
//  - no row yet, or the last link is off or has ended (or hit its cap) → a new generation (the old code stays dead)
//  - a live link → the same link, its end moved to 90 days from now (never past 365 days from when it was made) (AC-6)
// The rate limit is counted first (AC-11), then the notice, then the tick (AC-3). `notice` is sent only by the page that just showed the
// notice; without it a student who has not agreed gets `needs_consent`. A student under 18 must also send `guardianTick: true`.
// `unavailable` means this deployment has no SHARE_LINK_SECRET, so no link can be signed. Expected refusals return a result (not a throw),
// so the rate limit count stays.
export const enable = mutation({
  args: { notice: v.optional(v.object({ version: v.string(), hash: v.string() })), guardianTick: v.optional(v.boolean()) },
  returns: v.union(v.object({ ok: v.literal(true), code: v.string(), expiresAt: v.number() }), v.object({ ok: v.literal(false), code: enableRefusal })),
  handler: async (ctx, args) => {
    const { student, check } = await requireStudent(ctx);
    const secret = env.SHARE_LINK_SECRET;
    if (!secret) return { ok: false as const, code: "unavailable" as const };
    const allowed = await rateLimiter.limit(ctx, "shareMake", { key: student._id });
    if (!allowed.ok) return { ok: false as const, code: "rate_limited" as const };
    if (check.completedAt === undefined || !(await findResult(ctx, check._id))) return { ok: false as const, code: "report_not_ready" as const };

    let consentId = await currentConsent(ctx, student._id);
    if (args.notice) {
      // Only the share text of the current version counts: the landing and phone texts cannot stand in for it, and the fingerprint must match.
      const version = args.notice.version;
      const text = version === SHARE_CONSENT_VERSION && CONSENT_KINDS[version] === "share" ? CONSENT_TEXTS[version] : undefined;
      if (text === undefined || args.notice.hash !== (await consentHash(text))) return { ok: false as const, code: "consent_text_changed" as const };
      if (student.age < ADULT_AGE && args.guardianTick !== true) return { ok: false as const, code: "needs_guardian" as const };
      if (!consentId) consentId = await recordConsent(ctx, student._id, student.age, args.guardianTick === true, text);
    } else if (!consentId) {
      return { ok: false as const, code: "needs_consent" as const };
    }

    const now = Date.now();
    const row = await ctx.db.query("reportShares").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique();
    let id: Id<"reportShares">;
    let generation: number;
    let expiresAt: number;
    if (!row) {
      generation = 1;
      expiresAt = expiryFor(now, now);
      id = await ctx.db.insert("reportShares", { studentId: student._id, checkId: check._id, generation, consentId, createdAt: now, expiresAt });
    } else if (row.offAt === undefined && row.expiresAt > now) {
      id = row._id;
      generation = row.generation;
      expiresAt = expiryFor(now, row.createdAt);
      await ctx.db.patch("reportShares", id, { expiresAt });
    } else {
      id = row._id;
      generation = row.generation + 1;
      expiresAt = expiryFor(now, now);
      await ctx.db.patch("reportShares", id, { checkId: check._id, generation, consentId, createdAt: now, expiresAt, offAt: undefined });
    }
    return { ok: true as const, code: await makeShareCode(secret, id, generation), expiresAt };
  },
});

// The consent row, only ever added: kind `share`, the notice version, the student's age, and the under 18 tick as `guardianPresent` (AC-3).
async function recordConsent(ctx: MutationCtx, studentId: Id<"students">, age: number, tick: boolean, text: string): Promise<Id<"consents">> {
  const stored = await ctx.db.query("consentTexts").withIndex("by_version", (q) => q.eq("version", SHARE_CONSENT_VERSION)).unique();
  if (!stored) await ctx.db.insert("consentTexts", { version: SHARE_CONSENT_VERSION, hash: await consentHash(text), text });
  return await ctx.db.insert("consents", { studentId, kind: "share", textVersion: SHARE_CONSENT_VERSION, ageAtConsent: age, guardianPresent: tick, acceptedAt: Date.now() });
}

// Where the signed in student's link stands. A query must not read the clock, so this gives the raw facts and the page decides whether the
// link is on (`!off && expiresAt > its own clock`), the same way `students.me` leaves the weekly picture check to the browser.
//  - `ready`: the check is finished (a student whose check is not finished gets no link, AC-16)
//  - `consented`: a share consent for the current notice version exists (AC-3)
//  - `off`, `expiresAt`: the row's state, or false and null when there is no row yet
//  - `code`: the signed code of the current generation when a row exists and is not off, else null. It is the student's own capability and
//    goes only to them; the page uses it only while `expiresAt` is in the future.
export const status = query({
  args: {},
  returns: v.object({ ready: v.boolean(), consented: v.boolean(), off: v.boolean(), expiresAt: v.union(v.number(), v.null()), code: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    const { student, check } = await requireStudent(ctx);
    const ready = check.completedAt !== undefined && (await findResult(ctx, check._id)) !== null;
    const consented = (await currentConsent(ctx, student._id)) !== null;
    const row = await ctx.db.query("reportShares").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique();
    const secret = env.SHARE_LINK_SECRET;
    const code = row && secret && row.offAt === undefined ? await makeShareCode(secret, row._id, row.generation) : null;
    return { ready, consented, off: row?.offAt !== undefined, expiresAt: row ? row.expiresAt : null, code };
  },
});

// Stop sharing (AC-5). The student's own link only; nothing names a student. Safe to call twice. After it, every request for the old code gets
// the same 404 as any bad link, and sharing again makes a new generation, so the old code stays dead.
export const disable = mutation({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    const { student } = await requireStudent(ctx);
    const row = await ctx.db.query("reportShares").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique();
    if (row && row.offAt === undefined) await ctx.db.patch("reportShares", row._id, { offAt: Date.now() });
    return { ok: true as const };
  },
});

// The team's switch (AC-14), run from a terminal after a complaint: `npx convex run shares:adminOff '{"email":"student@example.com"}'`
// (add `--prod` only on purpose). Not callable from a browser. The student can make a new link later by sharing again.
export const adminOff = internalMutation({
  args: { email: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const student = await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (!student) return { ok: false };
    const row = await ctx.db.query("reportShares").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique();
    if (!row) return { ok: false };
    if (row.offAt === undefined) await ctx.db.patch("reportShares", row._id, { offAt: Date.now() });
    return { ok: true };
  },
});

const readResult = v.union(
  v.object({
    status: v.literal("ok"),
    payload: v.object({ completedAt: v.string(), seed: v.string(), profile: v.object({ name: v.string(), avatar: v.optional(v.string()) }), result: v.any() }),
  }),
  v.object({ status: v.literal("unavailable") }),
  v.object({ status: v.literal("slow") }),
);

// Reads a link for GET /api/shared/payload. `shareId` and `generation` are given only when the signature was good; a bad code is called
// with neither and takes one token from the shared bad code bucket, so a flood of made up codes never makes a key per code (AC-11).
// A valid code takes a token from its own link's bucket first, then everything else is checked (AC-7). Opening never moves the end date.
export const publicRead = internalMutation({
  args: { shareId: v.optional(v.string()), generation: v.optional(v.number()) },
  returns: readResult,
  handler: async (ctx, args) => {
    if (args.shareId === undefined || args.generation === undefined) {
      const bad = await rateLimiter.limit(ctx, "shareBad", { key: "bad" });
      return { status: bad.ok ? ("unavailable" as const) : ("slow" as const) };
    }
    const read = await rateLimiter.limit(ctx, "shareRead", { key: args.shareId });
    if (!read.ok) return { status: "slow" as const };
    const id = ctx.db.normalizeId("reportShares", args.shareId);
    const row = id ? await ctx.db.get("reportShares", id) : null;
    if (!row || row.generation !== args.generation || row.offAt !== undefined || row.expiresAt <= Date.now()) return { status: "unavailable" as const };
    const payload = await buildSharePayload(ctx, row);
    if (!payload) return { status: "unavailable" as const };
    return { status: "ok" as const, payload };
  },
});
