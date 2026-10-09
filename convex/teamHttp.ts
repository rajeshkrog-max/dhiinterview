// The two HTTP routes of the team link to the saved report (spec 0008), reached through the site's own address
// (functions/api/team), so no CORS is added. Both are GET only and both answer `private, no-store`.
//  - GET /api/team/list?cursor=&ref=   the students whose copy is ready (name, class, date), or the one a code names
//  - GET /api/team/report?s=           that student's stored PDF, exactly as stored
// Each route finds the caller from the bearer token and runs the team check inside the internal function it calls, so a
// signed out visitor gets 401 and any account that is not on the list gets 403 with no student data in the answer.
// Nothing here puts a phone, an email, a score or a flag in an answer, an error or a log line.
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { downloadName } from "./reportCore";
import { retryMessage } from "./teamCore";

const NO_STORE = "private, no-store";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": NO_STORE, "x-content-type-options": "nosniff" },
  });

// A visitor with no session at all: refused here, before any function runs. One log line with the reason and nothing else.
const signedOut = () => {
  console.log("team: refused not_signed_in");
  return json(401, { code: "not_signed_in" });
};

export const teamList = httpAction(async (ctx, req) => {
  if (!(await ctx.auth.getUserIdentity())) return signedOut();
  const params = new URL(req.url).searchParams;
  const cursor = params.get("cursor");
  const res = await ctx.runQuery(internal.team.list, {
    ...(cursor ? { cursor } : {}),
    ...(params.has("ref") ? { ref: params.get("ref") ?? "" } : {}),
  });
  if (res.ok) return json(200, { rows: res.rows, next: res.next });
  if (res.code === "not_signed_in") return json(401, { code: res.code });
  if (res.code === "not_team") return json(403, { code: res.code });
  return json(400, { code: res.code });
});

export const teamReport = httpAction(async (ctx, req) => {
  if (!(await ctx.auth.getUserIdentity())) return signedOut();
  const s = new URL(req.url).searchParams.get("s") ?? "";
  const res = await ctx.runMutation(internal.team.openFile, { ref: s.slice(0, 200) });
  if (!res.ok) {
    if (res.code === "not_signed_in") return json(401, { code: res.code });
    if (res.code === "not_team") return json(403, { code: res.code });
    if (res.code === "rate_limited") return json(429, { code: res.code, retryAt: res.retryAt, message: retryMessage(res.retryAt) });
    return json(404, { code: "not_ready" });
  }
  const blob = await ctx.storage.get(res.storageId);
  if (!blob) return json(404, { code: "not_ready" }); // the row exists, the file just went: the rare delivery that failed (AC-5)
  return new Response(blob, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${downloadName(res.name)}"`,
      "cache-control": NO_STORE,
      "x-content-type-options": "nosniff",
    },
  });
});
