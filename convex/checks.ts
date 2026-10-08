// The check and its answers (spec 0002). Each function acts on the signed in student's one check only.
// A completed check never changes: after `complete`, answers are refused.
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { TOTAL_QUESTIONS, answersOf, fail, optionBelongsTo, requireStudent, validQuestion } from "./helpers";

// Saves one or more answers. All or nothing: one bad answer refuses the whole batch and writes nothing.
// `answeredAt` is the device time, cut down to the server's now. The same option again is a no op, and an
// older `answeredAt` never replaces a newer stored one.
export const saveAnswers = mutation({
  args: {
    answers: v.array(v.object({ q: v.number(), optionId: v.string(), answeredAt: v.number() })),
  },
  returns: v.object({ saved: v.number() }),
  handler: async (ctx, args) => {
    const { check } = await requireStudent(ctx);
    if (check.completedAt !== undefined) fail("check_completed");
    if (args.answers.length < 1 || args.answers.length > TOTAL_QUESTIONS) fail("invalid_input");

    const seen = new Set<number>();
    for (const a of args.answers) {
      if (!validQuestion(a.q) || seen.has(a.q) || !optionBelongsTo(a.q, a.optionId) || !Number.isFinite(a.answeredAt)) fail("invalid_input");
      seen.add(a.q);
    }

    const now = Date.now();
    for (const a of args.answers) {
      const answeredAt = Math.min(Math.max(a.answeredAt, 0), now);
      const row = await ctx.db.query("answers").withIndex("by_checkId_and_q", (q) => q.eq("checkId", check._id).eq("q", a.q)).unique();
      if (!row) {
        await ctx.db.insert("answers", { checkId: check._id, q: a.q, optionId: a.optionId, answeredAt });
      } else if (row.optionId !== a.optionId && answeredAt >= row.answeredAt) {
        await ctx.db.patch("answers", row._id, { optionId: a.optionId, answeredAt });
      }
    }
    return { saved: args.answers.length };
  },
});

// Finishes the check once all 18 answers are on the server. Called again it returns the same time.
export const complete = mutation({
  args: {},
  returns: v.object({ completedAt: v.number() }),
  handler: async (ctx) => {
    const { check } = await requireStudent(ctx);
    if (check.completedAt !== undefined) return { completedAt: check.completedAt };
    const rows = await answersOf(ctx, check._id);
    if (new Set(rows.map((r) => r.q)).size < TOTAL_QUESTIONS) fail("answers_missing");
    const completedAt = Date.now();
    await ctx.db.patch("checks", check._id, { completedAt });
    return { completedAt };
  },
});

// Remembers on the server that the student has opened their report, so every device resumes at the report.
export const markReportSeen = mutation({
  args: {},
  returns: v.object({ reportSeenAt: v.number() }),
  handler: async (ctx) => {
    const { check } = await requireStudent(ctx);
    if (check.completedAt === undefined) fail("not_completed");
    if (check.reportSeenAt !== undefined) return { reportSeenAt: check.reportSeenAt };
    const reportSeenAt = Date.now();
    await ctx.db.patch("checks", check._id, { reportSeenAt });
    return { reportSeenAt };
  },
});

// One time import of answers an earlier version of the page kept only in the browser. Format checked, marked
// `imported`, and only works while the check has no answers (so a second try is refused).
export const importLocal = mutation({
  args: { answers: v.record(v.string(), v.string()) },
  returns: v.object({ imported: v.number() }),
  handler: async (ctx, args) => {
    const { check } = await requireStudent(ctx);
    if (check.completedAt !== undefined) fail("check_completed");

    const entries = Object.entries(args.answers);
    if (entries.length < 1 || entries.length > TOTAL_QUESTIONS) fail("invalid_input");
    const parsed: { q: number; optionId: string }[] = [];
    for (const [key, optionId] of entries) {
      const m = /^q(\d{1,2})$/.exec(key);
      const q = m ? Number(m[1]) : NaN;
      if (!validQuestion(q) || key !== `q${q}` || !optionBelongsTo(q, optionId)) fail("invalid_input"); // the key is exactly q<q>, not q07
      parsed.push({ q, optionId });
    }

    if (check.source === "imported" || (await answersOf(ctx, check._id)).length > 0) fail("already_has_answers");

    const now = Date.now();
    for (const a of parsed) await ctx.db.insert("answers", { checkId: check._id, q: a.q, optionId: a.optionId, answeredAt: now });
    await ctx.db.patch("checks", check._id, { source: "imported" });
    return { imported: parsed.length };
  },
});
