// Builds the Sheet rows from the database (spec 0004). Reads the lead, the student and the consent the lead points at;
// never the sensitive flags or any result. Used by the copy job (`build`) and by the daily check and the CSV export.
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import type { Reader } from "./helpers";
import { feedbackRow, leadRow, rowFingerprint, type SheetKind } from "./sheetRowsCore";

export type BuiltRow = { refId: string; key: string; values: string[]; hash: string };

export const kindValidator = v.union(v.literal("lead"), v.literal("feedback"));

// One built row per record that still exists. A record that is gone (erased) is simply left out.
export async function loadRows(ctx: Reader, kind: SheetKind, refIds: readonly string[]): Promise<BuiltRow[]> {
  const out: BuiltRow[] = [];
  for (const refId of refIds) {
    const values = await loadValues(ctx, kind, refId);
    if (!values) continue;
    out.push({ refId, key: values[0], values, hash: await rowFingerprint(values) });
  }
  return out;
}

async function loadValues(ctx: Reader, kind: SheetKind, refId: string): Promise<string[] | null> {
  if (kind === "lead") {
    const id = ctx.db.normalizeId("leads", refId);
    const lead = id ? await ctx.db.get("leads", id) : null;
    if (!lead) return null;
    const student = await ctx.db.get("students", lead.studentId);
    const consent = await ctx.db.get("consents", lead.consentId);
    if (!student || !consent) return null;
    return leadRow(student, lead, consent);
  }
  const id = ctx.db.normalizeId("feedback", refId);
  const feedback = id ? await ctx.db.get("feedback", id) : null;
  if (!feedback) return null;
  const student = await ctx.db.get("students", feedback.studentId);
  if (!student) return null;
  // The phone is the one the student gave on the phone step for this check (empty when there is none).
  const lead = await ctx.db.query("leads").withIndex("by_checkId", (q) => q.eq("checkId", feedback.checkId)).unique();
  return feedbackRow(student, lead?.phone, feedback);
}

export const build = internalQuery({
  args: { kind: kindValidator, refIds: v.array(v.string()) },
  returns: v.array(v.object({ refId: v.string(), key: v.string(), values: v.array(v.string()), hash: v.string() })),
  handler: async (ctx, args) => await loadRows(ctx, args.kind, args.refIds),
});
