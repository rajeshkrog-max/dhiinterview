// The report copy job as a Convex action (spec 0006). `runDue` does one job, then looks again shortly: a job that finds
// nothing due stops, so the chain ends by itself. The minute cron (crons.ts) restarts it, which also picks up a job whose
// process died (its lease runs out and the row is counted as a failed try). The work is in reportMakeCore.ts.
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { NEXT_JOB_GAP_MS } from "./reportCore";
import { runOneJob } from "./reportMakeCore";

export const runDue = internalAction({
  args: {},
  handler: async (ctx) => {
    const outcome = await runOneJob(ctx, {
      config: {
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        apiToken: env.CLOUDFLARE_API_TOKEN,
        secret: env.REPORT_RENDER_SECRET,
        baseUrl: env.REPORT_RENDER_BASE_URL,
      },
      fetch,
      now: Date.now,
    });
    if (outcome !== "idle") await ctx.scheduler.runAfter(NEXT_JOB_GAP_MS, internal.reportMake.runDue, {});
    return null;
  },
});

// The minute cron: starts `runDue` only when a row is due or stuck.
export const runIfDue = internalAction({
  args: {},
  handler: async (ctx) => {
    if (await ctx.runQuery(internal.reportCopy.hasWork, {})) await ctx.scheduler.runAfter(0, internal.reportMake.runDue, {});
    return null;
  },
});
