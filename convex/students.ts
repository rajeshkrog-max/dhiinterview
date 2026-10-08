// The student record (spec 0002). `me` tells a page who is here; `createProfile` makes the student, their
// consent and their one check, once. Every function acts only on the signed in student (see helpers.ts).
import { v } from "convex/values";
import { env, mutation, query } from "./_generated/server";
import { CONSENT_KINDS, CONSENT_TEXTS, consentHash } from "./consentText";
import { classValidator } from "./schema";
import { MAX_NAME, ADULT_AGE, answersOf, cleanName, fail, getSignedInUser, requireSignedIn, validAge } from "./helpers";

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

    // Only a landing version counts here: the phone text cannot stand in for it (spec 0003, AC-14).
    const text = CONSENT_KINDS[args.consent.version] === "landing" ? CONSENT_TEXTS[args.consent.version] : undefined;
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
    return { studentId };
  },
});
