// The report feedback (spec 0003; the replacement of a weak note is spec 0016, AC-9). `submit` saves the signed in student's rating and note once. The server decides
// `genuine` itself (convex/feedbackRules.ts). Nothing here takes a student id, and the note is never returned.
// Expected refusals come back as { ok: false, code } so a refused attempt still uses up a rate limit token.
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { hasEnded } from "./challengeRules";
import { MAX_NOTE_CHARS, MIN_NOTE_CHARS, isGenuine, trimNote, validRating } from "./feedbackRules";
import { requireStudent } from "./helpers";
import { rateLimiter } from "./limits";
import { enqueueSheet } from "./sheetSync";

const resultValidator = v.union(
  v.object({ ok: v.literal(true), alreadySaved: v.boolean(), genuine: v.boolean() }),
  v.object({ ok: v.literal(false), code: v.string() }),
);

const refuse = (code: string) => ({ ok: false as const, code });

export const submit = mutation({
  args: { rating: v.number(), text: v.string(), canShare: v.boolean() },
  returns: resultValidator,
  handler: async (ctx, args) => {
    const { student, check } = await requireStudent(ctx);

    const limit = await rateLimiter.limit(ctx, "submitFeedback", { key: student._id });
    if (!limit.ok) return refuse("rate_limited");

    // One feedback per check, the first one kept. One exception (spec 0016, AC-9): a saved note that is not genuine is replaced by a later
    // note that is, until the deadline. A genuine note is never replaced, and a later weak note changes nothing.
    const existing = await ctx.db.query("feedback").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
    if (existing) {
      const now = Date.now();
      const later = trimNote(args.text);
      const better = !existing.genuine && !hasEnded(now) && validRating(args.rating) && later.length >= MIN_NOTE_CHARS && later.length <= MAX_NOTE_CHARS && isGenuine(later);
      if (!better) return { ok: true as const, alreadySaved: true, genuine: existing.genuine };
      await ctx.db.patch("feedback", existing._id, { rating: args.rating, text: later, chars: later.length, genuine: true, genuineAt: now, canShare: args.canShare });
      await enqueueSheet(ctx, "feedback", existing._id, student._id, "upsert"); // the Sheet row is sent again with the new note
      return { ok: true as const, alreadySaved: false, genuine: true };
    }

    const text = trimNote(args.text);
    if (!validRating(args.rating) || text.length < MIN_NOTE_CHARS || text.length > MAX_NOTE_CHARS) return refuse("invalid_input");
    if (check.completedAt === undefined) return refuse("not_completed");
    if (check.reportSeenAt === undefined) return refuse("report_not_seen");

    const genuine = isGenuine(text);
    const feedbackId = await ctx.db.insert("feedback", {
      studentId: student._id,
      checkId: check._id,
      rating: args.rating,
      text,
      chars: text.length,
      genuine,
      // The time a note became genuine: the challenge job (spec 0016) compares it with the deadline. A weak note has none.
      ...(genuine ? { genuineAt: Date.now() } : {}),
      canShare: args.canShare,
    });
    // The copy to the team's Sheet is queued in this same transaction and sent a few seconds later (spec 0004).
    await enqueueSheet(ctx, "feedback", feedbackId, student._id, "upsert");
    return { ok: true as const, alreadySaved: false, genuine };
  },
});
