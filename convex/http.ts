// Public HTTP routes served at the deployment's .convex.site address.
// GET /health is what the site health check (functions/api/health.ts) calls. It reads no data and
// returns nothing about students. The sign in routes (/api/auth/*) are registered below, and the report copy routes
// (/api/files/report, /api/render/payload) come from reportHttp.ts, and the team routes (/api/team/*) from teamHttp.ts, and the
// profile picture (/api/avatar/<key>) from avatarHttp.ts.
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { avatarImage } from "./avatarHttp";
import { reportFile, renderPayload } from "./reportHttp";
import { sharedPayload } from "./shareHttp";
import { teamList, teamReport } from "./teamHttp";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response(JSON.stringify({ ok: true, service: "convex" }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }),
});

// The saved report PDF (spec 0006): the student's own download, and the data for the render page.
http.route({ path: "/api/files/report", method: "GET", handler: reportFile });
http.route({ path: "/api/render/payload", method: "GET", handler: renderPayload });

// The private link to a report (spec 0010): the data the public page draws from, for a valid signed link code only.
http.route({ path: "/api/shared/payload", method: "GET", handler: sharedPayload });

// The team link to the saved report (spec 0008): the list and the PDF, for named Google accounts only.
http.route({ path: "/api/team/list", method: "GET", handler: teamList });
http.route({ path: "/api/team/report", method: "GET", handler: teamReport });

// The stored Google profile picture (spec 0011): any path under /api/avatar/ is read as a key; a bad or unknown key is a 404.
http.route({ pathPrefix: "/api/avatar/", method: "GET", handler: avatarImage });

// Same address as the site (forwarded by functions/api/auth), so no CORS is needed.
authComponent.registerRoutes(http, createAuth);

export default http;
