// The data the public report page draws from (spec 0010, AC-4 and AC-12). The ONE function that builds it, kept in its own small file so a
// test can read the whole source and fail if it ever reaches for anything a stranger must not see.
// It reads: the student's name (first word only is sent), the finished check, the saved result, and the picture path from `pictureFor`.
// It never reads the flags table, the leads, the feedback, or the email, phone, age and class of the student. The result goes through
// `flatten` with `NO_FLAGS`, the same rule as the saved PDF copy (spec 0006), so no flag text can be drawn from it, and with the mood split
// and the quoted answers taken out (see `publicDetail`), which the PDF copy still carries because only the team and the student open it.
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { pictureFor } from "./avatarState";
import { NO_FLAGS, findResult } from "./resultsCore";
import { flatten } from "../src/lib/result";

// What the saved detail gives away even with the flags set to false (review 2026-10-11, blocker): the mood split carries the exact rule of
// the low mood flag (`low` at 35 or more), and the "said" answer of a top or bottom area is the student's own option, which for the feelings
// areas IS the option that sets the self doubt or low mood flag. A stranger gets neither: the split is sent empty (the page then draws no
// donut) and each area is sent without its quoted answer (the page then draws no "what we noticed" line).
function publicDetail(detail: unknown): unknown {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return detail;
  const d = detail as Record<string, unknown>;
  const withoutSaid = (x: unknown) => (Array.isArray(x) ? x.map((a) => (typeof a === "object" && a !== null ? { ...a, said: null } : a)) : x);
  return { ...d, state: {}, top: withoutSaid(d.top), bottom: withoutSaid(d.bottom) };
}

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
      detail: publicDetail(result.detail),
      flags: NO_FLAGS,
    }),
  };
}
