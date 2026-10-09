// The two HTTP routes of the report copy (spec 0006), both reached through the site's own address (functions/api/*), so no
// CORS is needed and none is added.
//  - GET /api/files/report: the signed in student's own PDF, as a download only. The route carries no id, so another
//    student's file cannot be named; the student comes from the bearer token's session (AC-8).
//  - GET /api/render/payload: the data the render page draws from, for a valid signed token only (AC-9).
// Neither is cached. The file route never returns a storage address.
import { env, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { downloadName, verifyRenderToken } from "./reportCore";

const NO_STORE = "private, no-store";

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": NO_STORE, "x-content-type-options": "nosniff", ...extra },
  });

export const reportFile = httpAction(async (ctx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return json(401, { code: "not_signed_in" });
  const file = await ctx.runQuery(internal.reportCopy.ownFile, {});
  if (!file) return json(404, { code: "no_copy" });
  const blob = await ctx.storage.get(file.storageId);
  if (!blob) return json(404, { code: "no_copy" });
  return new Response(blob, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${downloadName(file.name)}"`,
      "cache-control": NO_STORE,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
    },
  });
});

export const renderPayload = httpAction(async (ctx, req) => {
  const ids = await verifyRenderToken(env.REPORT_RENDER_SECRET, req.headers.get("x-render-token"), Date.now());
  if (!ids) return json(401, { code: "bad_token" }, { "x-robots-tag": "noindex" });
  const data = await ctx.runQuery(internal.reportCopy.payload, ids);
  if (!data) return json(401, { code: "bad_token" }, { "x-robots-tag": "noindex" });
  return json(200, data, { "x-robots-tag": "noindex" });
});
