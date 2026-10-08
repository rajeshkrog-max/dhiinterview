"use node";
// The copy job (spec 0004). A Node action because it uses the Google auth library. Only one run works at a time
// (the lease in sheetSync.acquire); a run that finds no Sheet set up records "not set up" and stops, so saves and
// queued rows are never affected. The real work is in sheetFlushCore.ts, which a test can run with a fake Google.
import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { runFlush, runPrune, type SheetsClient } from "./sheetFlushCore";
import { createSheetsClient } from "./sheetsGoogle";

type Started = { client: SheetsClient } | { error: string };

// The Google client for this deployment's own Sheet, or why there is none. Never throws.
function start(): Started {
  const key = env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const sheetId = env.SHEET_ID;
  if (!key || !sheetId) return { error: "not set up" };
  try {
    return { client: createSheetsClient(key, sheetId) };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : "could not start" };
  }
}

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const started = start();
    if ("error" in started) {
      await ctx.runMutation(internal.sheetSync.finishRun, { now: Date.now(), ok: false, error: started.error });
      return null;
    }
    await runFlush(ctx, started.client);
    return null;
  },
});

// `sheetAdmin:refill` with `prune` (or `dryRun`): removes the rows that do not belong, then queues every record again.
// It holds the lease while it works, so no copy run can write rows meanwhile. The work is in sheetFlushCore.runPrune.
export const pruneAndRefill = internalAction({
  args: { tries: v.number(), dryRun: v.optional(v.boolean()), force: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const started = start();
    if ("error" in started) {
      await ctx.runMutation(internal.sheetSync.notePrune, { note: `prune did not start: ${started.error}` });
      return null;
    }
    const result = await runPrune(ctx, started.client, { dryRun: args.dryRun, force: args.force });
    if (result.busy) {
      // Another run is working: try again in a minute, up to 5 times, then say so on the status tab.
      if (args.tries < 5) await ctx.scheduler.runAfter(60_000, internal.sheetFlush.pruneAndRefill, { ...args, tries: args.tries + 1 });
      else await ctx.runMutation(internal.sheetSync.notePrune, { note: result.note });
    }
    return null;
  },
});
