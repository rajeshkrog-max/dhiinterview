// The data the public report page draws from (spec 0010, AC-4 and AC-12). The ONE function that builds it, kept in its own small file so a
// test can read the whole source and fail if it ever reaches for anything a stranger must not see.
// It reads: the student's name (first word only is sent), the finished check, the saved result, and the picture path from `pictureFor`.
// It never reads the flags table, the leads, the feedback, or the email, phone, age and class of the student. The result goes through
// `flatten` with `NO_FLAGS`, the same rule as the saved PDF copy (spec 0006), so no flag text can be drawn from it.
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { pictureFor } from "./avatarState";
import { NO_FLAGS, findResult } from "./resultsCore";
import { flatten } from "../src/lib/result";

export type SharePayload = {
  completedAt: string;
  seed: string;
  profile: { name: string; avatar?: string };
  result: unknown;
};

/** The payload for a share row, or null when its check is not finished or has no result (the caller answers 404). */
export async function buildSharePayload(ctx: QueryCtx, share: Doc<"reportShares">): Promise<SharePayload | null> {
  const student = await ctx.db.get("students", share.studentId);
  const check = await ctx.db.get("checks", share.checkId);
  if (!student || !check || check.studentId !== student._id || check.completedAt === undefined) return null;
  const result = await findResult(ctx, check._id);
  if (!result) return null;
  const avatar = await pictureFor(ctx, student._id);
  return {
    completedAt: new Date(check.completedAt).toISOString(),
    seed: check.seed,
    profile: { name: student.name.trim().split(/\s+/)[0] ?? "", ...(avatar ? { avatar } : {}) },
    result: flatten({
      engineVersion: result.engineVersion,
      scoredAt: result.scoredAt,
      dhiStart: result.dhiStart,
      styleKey: result.styleKey,
      confidence: result.confidence,
      detail: result.detail,
      flags: NO_FLAGS,
    }),
  };
}
