// Making and reading a saved result (spec 0005). Used by `checks.complete` (makes it at Finish) and by
// `results.mine` / `results.ensure` (reads it, and makes it for a check finished before this shipped).
// Rules: one `results` row and one `resultFlags` row per check, written together, never edited or deleted.
// Flags leave this file only inside `viewOf`, which only the owner's `mine` and `ensure` call.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { TOTAL_QUESTIONS, answersOf, fail } from "./helpers";
import { confidenceValidator, styleKeyValidator } from "./schema";
import { ENGINE_VERSION, scoreAnswers, splitResult, type RawScore } from "./scoring";

export const flagsValidator = v.object({
  keepsFeelingsInside: v.boolean(),
  lowCareerClarity: v.boolean(),
  heavyExpectations: v.boolean(),
  selfDoubt: v.boolean(),
  sleepStrain: v.boolean(),
  lowMood: v.boolean(),
  lowConsistency: v.boolean(),
});

// What the signed in student receives. `detail` is made by the server from fixed code, never from user input.
export const resultView = v.object({
  engineVersion: v.number(),
  scoredAt: v.number(),
  dhiStart: v.number(),
  styleKey: styleKeyValidator,
  confidence: confidenceValidator,
  detail: v.any(),
  flags: flagsValidator,
});

export async function findResult(ctx: QueryCtx | MutationCtx, checkId: Doc<"checks">["_id"]): Promise<Doc<"results"> | null> {
  return await ctx.db.query("results").withIndex("by_checkId", (q) => q.eq("checkId", checkId)).unique();
}

// The result and its flags, shaped for the page. Only the owner's functions call this.
export async function viewOf(ctx: QueryCtx | MutationCtx, result: Doc<"results">) {
  const row = await ctx.db.query("resultFlags").withIndex("by_resultId", (q) => q.eq("resultId", result._id)).unique();
  if (!row) throw new Error("result without flags"); // both rows are written in one transaction, so this cannot happen
  const { keepsFeelingsInside, lowCareerClarity, heavyExpectations, selfDoubt, sleepStrain, lowMood, lowConsistency } = row;
  return {
    engineVersion: result.engineVersion,
    scoredAt: result.scoredAt,
    dhiStart: result.dhiStart,
    styleKey: result.styleKey,
    confidence: result.confidence,
    detail: result.detail,
    flags: { keepsFeelingsInside, lowCareerClarity, heavyExpectations, selfDoubt, sleepStrain, lowMood, lowConsistency },
  };
}

// Scores the check's saved answers and saves the result and the flags, once. A second call finds the first and returns it.
// Only the scoring call is treated as a scoring failure (`scoring_failed`, logged with the check id only); a failed
// database write passes through unchanged. Refuses to save unless exactly 18 answers were scored.
export async function makeResult(ctx: MutationCtx, check: Doc<"checks">): Promise<Doc<"results">> {
  const existing = await findResult(ctx, check._id);
  if (existing) return existing;

  const rows = await answersOf(ctx, check._id);
  const answers: Record<string, string> = {};
  for (const r of rows) answers["q" + r.q] = r.optionId;

  let raw: RawScore;
  let engineVersion: number;
  try {
    engineVersion = ENGINE_VERSION();
    raw = scoreAnswers(answers, check.seed);
  } catch {
    console.error(`scoring_failed check=${check._id}`);
    fail("scoring_failed");
  }
  if (rows.length !== TOTAL_QUESTIONS || raw.answered !== TOTAL_QUESTIONS) {
    console.error(`scoring_failed check=${check._id} answered=${raw.answered}`);
    fail("scoring_failed");
  }

  const { dhiStart, styleKey, confidence, detail, flags } = splitResult(raw);
  const resultId = await ctx.db.insert("results", {
    checkId: check._id,
    studentId: check.studentId,
    engineVersion,
    scoredAt: Date.now(),
    dhiStart,
    styleKey,
    confidence,
    detail,
  });
  await ctx.db.insert("resultFlags", { resultId, studentId: check.studentId, ...flags });
  const saved = await ctx.db.get("results", resultId);
  if (!saved) throw new Error("result not saved");
  return saved;
}
