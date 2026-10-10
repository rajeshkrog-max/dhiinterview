// The public route of the private report link (spec 0010), reached through the site's own address (functions/api/shared), so no CORS
// is needed and none is added. GET /api/shared/payload with the link code in the `x-share-token` header (never in the address, so it is
// not in a log line of ours). The code is the capability: the signature is checked here, then `shares.publicRead` checks the rest.
// Every code that does not work answers the same 404 with the same body (AC-7). Nothing is cached or indexed.
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { UNAVAILABLE_BODY, verifyShareCode } from "./shareCore";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex" },
  });

export const sharedPayload = httpAction(async (ctx, req) => {
  const ids = await verifyShareCode(env.SHARE_LINK_SECRET, req.headers.get("x-share-token"));
  const out = await ctx.runMutation(internal.shares.publicRead, ids ? { shareId: ids.shareId, generation: ids.generation } : {});
  if (out.status === "ok") return json(200, out.payload);
  if (out.status === "slow") return json(429, { code: "slow_down" });
  return json(404, UNAVAILABLE_BODY);
});
