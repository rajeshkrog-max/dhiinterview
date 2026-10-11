// The public route of the code check (spec 0016, AC-2), reached through the site's own address (functions/api/referral), so no CORS is
// needed. GET /api/referral/validate?code=. It answers 200 with { ok: true, referrerFirstName } or { ok: false, reason } where reason is
// `format`, `unknown` or `ended`; over the limit (or too many callers at once for the limit rows to keep up) it answers 429 `slow_down`,
// never a 500. The forwarder sends a hashed visitor address in `x-visitor`, which is the limit key, so one visitor cannot use up the limit
// for everyone. Never cached, never indexed. Nothing here is logged except a count-free line for a lost race.
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { isWriteConflict } from "./shareCore";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" },
  });

const VISITOR_RE = /^[0-9a-f]{32}$/;
const MAX_CODE = 40; // a real code is 7 characters; a longer one is never looked at

export const referralValidate = httpAction(async (ctx, req) => {
  const code = (new URL(req.url).searchParams.get("code") ?? "").slice(0, MAX_CODE);
  const header = req.headers.get("x-visitor") ?? "";
  const visitor = VISITOR_RE.test(header) ? header : "direct"; // a caller that skipped the forwarder shares one bucket
  let out;
  try {
    out = await ctx.runMutation(internal.referral.check, { code, visitor });
  } catch (e) {
    if (!isWriteConflict(e)) throw e;
    console.warn("code check lost its race on the rate limit rows");
    return json(429, { code: "slow_down" });
  }
  if (out.ok) return json(200, out);
  if (out.reason === "slow") return json(429, { code: "slow_down" });
  return json(200, { ok: false, reason: out.reason });
});
