// The student record (spec 0002). `me` tells a page who is here; `createProfile` makes the student, their
// consent and their one check, once. Every function acts only on the signed in student (see helpers.ts).
import { v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import { isPictureAgreed, pictureEnabled, pictureView } from "./avatarState";
import { recordPendingReferral } from "./challengeCore";
import { isLive } from "./challengeRules";
import { CONSENT_KINDS, CONSENT_TEXTS, CONSENT_VERSION, consentHash } from "./consentText";
import { classValidator } from "./schema";
import { MAX_NAME, ADULT_AGE, answersOf, cleanName, fail, getSignedInUser, requireSignedIn, requireStudent, validAge } from "./helpers";

const meValidator = v.union(
  v.object({ state: v.literal("signedOut") }),
  v.object({ state: v.literal("needsProfile"), googleName: v.string() }),
  v.object({
    state: v.literal("ready"),
    student: v.object({ name: v.string(), age: v.number(), class: classValidator }),
    check: v.object({
      seed: v.string(),
      startedAt: v.number(),
      completedAt: v.union(v.number(), v.null()),
      reportSeenAt: v.union(v.number(), v.null()),
      leadSavedAt: v.union(v.number(), v.null()),
      feedbackSavedAt: v.union(v.number(), v.null()),
      answers: v.record(v.string(), v.string()),
    }),
    // The profile picture (spec 0011). `picture` is the same origin path, only when the student has agreed, has not removed it, is not
    // blocked and the feature is on. `pictureDue` and `pictureRecheckAt` say when the bridge should call `avatars.ensure` (a query must
    // not read the clock, so the weekly check is the browser comparing `pictureRecheckAt` with its own time). The Google address, the
    // storage id and the ETag are never returned (AC-10).
    picture: v.union(v.object({ url: v.string() }), v.null()),
    pictureDue: v.boolean(),
    pictureRecheckAt: v.union(v.number(), v.null()),
    // The one time notice for students who have not agreed to the picture line (AC-2): `ask`, or `later` after Not now with `pictureAskAt`
    // the earliest time to ask again (the browser compares it with its own clock), or `none`.
    pictureNotice: v.union(v.literal("none"), v.literal("ask"), v.literal("later")),
    pictureAskAt: v.union(v.number(), v.null()),
    // True after the student's own Remove, while the team has not blocked it: the report page then offers "Use my Google picture" (AC-9).
    pictureRemoved: v.boolean(),
  }),
);

// Who is here. The page adds a fourth answer, `loading`, until this has been asked. No email is returned.
export const me = query({
  args: {},
  returns: meValidator,
  handler: async (ctx) => {
    const user = await getSignedInUser(ctx);
    if (!user) return { state: "signedOut" as const };
    const student = await ctx.db.query("students").withIndex("by_authUserId", (q) => q.eq("authUserId", user.authUserId)).unique();
    const check = student
      ? await ctx.db.query("checks").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique()
      : null;
    if (!student || !check) {
      return { state: "needsProfile" as const, googleName: user.name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME) };
    }
    const answers: Record<string, string> = {};
    for (const row of await answersOf(ctx, check._id)) answers["q" + row.q] = row.optionId;
    // Only whether, and when. The phone and the feedback text are never returned (spec 0003, AC-12).
    const lead = await ctx.db.query("leads").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
    const feedback = await ctx.db.query("feedback").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
    const pic = await pictureView(ctx, student, user.image);
    return {
      state: "ready" as const,
      student: { name: student.name, age: student.age, class: student.class },
      check: {
        seed: check.seed,
        startedAt: check._creationTime,
        completedAt: check.completedAt ?? null,
        reportSeenAt: check.reportSeenAt ?? null,
        leadSavedAt: lead?._creationTime ?? null,
        feedbackSavedAt: feedback?._creationTime ?? null,
        answers,
      },
      picture: pic.picture,
      pictureDue: pic.due,
      pictureRecheckAt: pic.recheckAt,
      pictureNotice: pic.notice,
      pictureAskAt: pic.askAt,
      pictureRemoved: pic.removed,
    };
  },
});

// Creates exactly one student, one consent record and one check. Called again for the same account it returns
// the student it already has and changes nothing, so two devices at once, or a double tap, cannot make a second.
export const createProfile = mutation({
  args: {
    name: v.string(),
    age: v.number(),
    class: classValidator,
    guardianPresent: v.boolean(),
    consent: v.object({ version: v.string(), hash: v.string() }),
    referralCode: v.optional(v.string()),
  },
  returns: v.object({ studentId: v.id("students") }),
  handler: async (ctx, args) => {
    const user = await requireSignedIn(ctx);

    const existing = await ctx.db.query("students").withIndex("by_authUserId", (q) => q.eq("authUserId", user.authUserId)).unique();
    if (existing) return { studentId: existing._id };

    // Google must say the address is verified. The fake test sign in (dev only) has no such thing.
    if (!user.emailVerified && env.TEST_SIGNIN_ENABLED !== "true") fail("invalid_input");

    const name = cleanName(args.name);
    if (!name || !validAge(args.age)) fail("invalid_input");
    if (args.age < ADULT_AGE && !args.guardianPresent) fail("guardian_required");

    // Only the current landing version counts for a new student: an older text (saved rows still point at it) may lack a line the
    // current one has, such as the team access line of v3 (spec 0008, AC-11), and a stale page reloads on consent_text_changed.
    // The phone text cannot stand in for it either (spec 0003, AC-14).
    const text = args.consent.version === CONSENT_VERSION && CONSENT_KINDS[args.consent.version] === "landing" ? CONSENT_TEXTS[args.consent.version] : undefined;
    if (text === undefined) fail("consent_text_changed");
    const hash = await consentHash(text);
    if (args.consent.hash !== hash) fail("consent_text_changed");

    // The same Google address under another sign in account is a conflict, not a second student.
    const sameEmail = await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", user.email)).first();
    if (sameEmail) fail("account_conflict");

    // A referral code is format checked only (whether it is valid is scope row 10). A bad one is dropped, never an error.
    const code = args.referralCode?.trim().toUpperCase();
    const referralCodeEntered = code && /^[A-Z0-9]{1,8}$/.test(code) ? code : undefined;

    // The text of this version is stored the first time it is used, and never changed.
    const stored = await ctx.db.query("consentTexts").withIndex("by_version", (q) => q.eq("version", args.consent.version)).unique();
    if (!stored) await ctx.db.insert("consentTexts", { version: args.consent.version, hash, text });

    const now = Date.now();
    const studentId = await ctx.db.insert("students", {
      authUserId: user.authUserId,
      email: user.email,
      name,
      age: args.age,
      class: args.class,
      ...(referralCodeEntered ? { referralCodeEntered } : {}),
    });
    await ctx.db.insert("consents", {
      studentId,
      kind: "landing",
      textVersion: args.consent.version,
      ageAtConsent: args.age,
      guardianPresent: args.guardianPresent,
      acceptedAt: now,
    });
    await ctx.db.insert("checks", { studentId, seed: crypto.randomUUID(), source: "fresh" });
    // A pending referral for the owner of the code, when there is one and the challenge is open (spec 0016, AC-3). A bad code is dropped.
    await recordPendingReferral(ctx, studentId, code, isLive(env), now);
    return { studentId };
  },
});

// The one time picture notice for a student who agreed to an older text (spec 0011, AC-2). Records one new `landing` consent row for the
// current version, the way createProfile does, so the audit trail shows exactly what was agreed and when. A repeat tap, or a second device,
// records nothing more. Under 18 needs the guardian tick, and the answer is a result (not a throw) so the page can say it kindly.
export const acceptPicture = mutation({
  args: { notice: v.object({ version: v.string(), hash: v.string() }), guardianTick: v.optional(v.boolean()) },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), code: v.union(v.literal("consent_text_changed"), v.literal("needs_guardian"), v.literal("off")) })),
  handler: async (ctx, args) => {
    if (!pictureEnabled()) return { ok: false as const, code: "off" as const }; // AC-16
    const { student } = await requireStudent(ctx);
    // Only the current text counts, and its fingerprint must match what the page showed.
    const text = args.notice.version === CONSENT_VERSION && CONSENT_KINDS[args.notice.version] === "landing" ? CONSENT_TEXTS[args.notice.version] : undefined;
    if (text === undefined || args.notice.hash !== (await consentHash(text))) return { ok: false as const, code: "consent_text_changed" as const };
    if (await isPictureAgreed(ctx, student._id)) return { ok: true as const }; // already agreed: no second row
    if (student.age < ADULT_AGE && args.guardianTick !== true) return { ok: false as const, code: "needs_guardian" as const };
    const stored = await ctx.db.query("consentTexts").withIndex("by_version", (q) => q.eq("version", args.notice.version)).unique();
    if (!stored) await ctx.db.insert("consentTexts", { version: args.notice.version, hash: args.notice.hash, text });
    await ctx.db.insert("consents", {
      studentId: student._id,
      kind: "landing",
      textVersion: args.notice.version,
      ageAtConsent: student.age,
      guardianPresent: args.guardianTick === true,
      acceptedAt: Date.now(),
    });
    return { ok: true as const };
  },
});

// "Not now": carries on with initials, never blocks the check or the report, and asks again after 14 days (AC-2).
export const declinePicture = mutation({
  args: {},
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx) => {
    if (!pictureEnabled()) return { ok: true as const };
    const { student } = await requireStudent(ctx);
    await ctx.db.patch("students", student._id, { pictureNoticeDeclinedAt: Date.now() });
    return { ok: true as const };
  },
});
