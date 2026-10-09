// The student's saved result (spec 0005). Each function acts on the signed in student's own check only, and these
// two are the only functions that return a flag. Nothing here updates, replaces or deletes a result.
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, requireStudent } from "./helpers";
import { findResult, makeResult, resultView, viewOf } from "./resultsCore";

// The saved result of the signed in student's check, or null when the check has none yet.
export const mine = query({
  args: {},
  returns: v.union(v.null(), resultView),
  handler: async (ctx) => {
    const { check } = await requireStudent(ctx);
    const result = await findResult(ctx, check._id);
    return result ? await viewOf(ctx, result) : null;
  },
});

// The same, made first if it is missing: a check finished before results existed, or whose Finish timed out on the
// device. An unfinished check is refused. Two asks at once make one result.
export const ensure = mutation({
  args: {},
  returns: resultView,
  handler: async (ctx) => {
    const { check } = await requireStudent(ctx);
    if (check.completedAt === undefined) fail("not_completed");
    const result = (await findResult(ctx, check._id)) ?? (await makeResult(ctx, check));
    return await viewOf(ctx, result);
  },
});
