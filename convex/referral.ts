// The public code check (spec 0016, AC-2): "is this a real code, and whose?". Called only by the HTTP route (referralHttp.ts), which has
// already checked the shape of the code. It is a mutation, not a query, because it counts the visitor in the rate limiter first.
// It answers only what the code's owner chose to show: their first name, or "a friend" when they chose to hide their name. It never
// says whether the person asking is new or already has a profile (the page words that for everyone), and there is no "self" answer.
// Nothing is logged: no code, no name, no visitor key.
import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";
import { CODE_RE, hasEnded, isLive } from "./challengeRules";
import { rateLimiter } from "./limits";

export const HIDDEN_OWNER_NAME = "a friend";
const MAX_SHOWN_NAME = 30;

// The owner's first word, one capital then lower case (the same look as the earlier mock), cut to 30 characters. Empty gives "a friend".
export function shownFirstName(fullName: string): string {
  const first = (fullName.trim().split(/\s+/)[0] ?? "").slice(0, MAX_SHOWN_NAME);
  return first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : HIDDEN_OWNER_NAME;
}

export const check = internalMutation({
  // `visitor` is the forwarder's hashed address (32 hex characters) or "direct" when a caller skipped the forwarder.
  args: { code: v.string(), visitor: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), referrerFirstName: v.string() }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal("format"), v.literal("unknown"), v.literal("ended"), v.literal("slow")) }),
  ),
  handler: async (ctx, args) => {
    const code = args.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) return { ok: false as const, reason: "format" as const };
    if (hasEnded(Date.now())) return { ok: false as const, reason: "ended" as const };
    const allowed = await rateLimiter.limit(ctx, "referralCheck", { key: args.visitor });
    if (!allowed.ok) return { ok: false as const, reason: "slow" as const };
    // With the switch off no referral would be recorded, so no hint is given.
    if (!isLive(env)) return { ok: false as const, reason: "unknown" as const };
    const entry = await ctx.db.query("challengeEntries").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!entry) return { ok: false as const, reason: "unknown" as const };
    const owner = await ctx.db.get("students", entry.studentId);
    if (!owner) return { ok: false as const, reason: "unknown" as const };
    return { ok: true as const, referrerFirstName: entry.hideName ? HIDDEN_OWNER_NAME : shownFirstName(owner.name) };
  },
});
