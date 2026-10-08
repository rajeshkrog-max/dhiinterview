// The phone step (spec 0003). `submit` saves the signed in student's number once, with the exact consent text they saw.
// Nothing here takes a student id, and the phone is never returned by any function. Expected refusals come back as
// { ok: false, code } (not a throw) so a refused attempt still uses up a rate limit token.
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { CONSENT_KINDS, CONSENT_TEXTS, consentHash } from "./consentText";
import { ADULT_AGE, requireStudent } from "./helpers";
import { rateLimiter } from "./limits";
import { enqueueSheet } from "./sheetSync";

const PHONE = /^[6-9]\d{9}$/;

const resultValidator = v.union(
  v.object({ ok: v.literal(true), alreadySaved: v.boolean() }),
  v.object({ ok: v.literal(false), code: v.string() }),
);

const refuse = (code: string) => ({ ok: false as const, code });

export const submit = mutation({
  args: {
    phone: v.string(),
    wantsCommunity: v.boolean(),
    guardianPresent: v.boolean(),
    consent: v.object({ version: v.string(), hash: v.string() }),
  },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const { student, check } = await requireStudent(ctx);

    // The limiter counts every attempt, valid or not.
    const limit = await rateLimiter.limit(ctx, "submitLead", { key: student._id });
    if (!limit.ok) return refuse("rate_limited");

    // One lead per check, the first one kept. Two calls at once conflict on this read and one retries and finds the other.
    const existing = await ctx.db.query("leads").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
    if (existing) return { ok: true as const, alreadySaved: true };

    if (!PHONE.test(args.phone)) return refuse("invalid_input");
    if (check.completedAt === undefined) return refuse("not_completed");
    if (student.age < ADULT_AGE && !args.guardianPresent) return refuse("guardian_required");

    // Only a lead version counts here: the landing text cannot stand in for it (AC-14), and the fingerprint must match.
    const text = CONSENT_KINDS[args.consent.version] === "lead" ? CONSENT_TEXTS[args.consent.version] : undefined;
    if (text === undefined) return refuse("consent_text_changed");
    const hash = await consentHash(text);
    if (args.consent.hash !== hash) return refuse("consent_text_changed");

    const stored = await ctx.db.query("consentTexts").withIndex("by_version", (q) => q.eq("version", args.consent.version)).unique();
    if (!stored) await ctx.db.insert("consentTexts", { version: args.consent.version, hash, text });

    // The same number on another student is allowed; this lead is only marked.
    const phoneSeenBefore = (await ctx.db.query("leads").withIndex("by_phone", (q) => q.eq("phone", args.phone)).first()) !== null;

    const now = Date.now();
    const consentId = await ctx.db.insert("consents", {
      studentId: student._id,
      kind: "lead",
      textVersion: args.consent.version,
      ageAtConsent: student.age,
      guardianPresent: args.guardianPresent,
      acceptedAt: now,
    });
    const leadId = await ctx.db.insert("leads", {
      studentId: student._id,
      checkId: check._id,
      phone: args.phone,
      wantsCommunity: args.wantsCommunity,
      ...(args.wantsCommunity ? { whatsappOptInAt: now, whatsappStatus: "new" as const } : {}),
      phoneSeenBefore,
      consentId,
    });
    // The copy to the team's Sheet is queued in this same transaction and sent a few seconds later (spec 0004).
    await enqueueSheet(ctx, "lead", leadId, student._id, "upsert");
    return { ok: true as const, alreadySaved: false };
  },
});
