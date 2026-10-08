// Public HTTP routes served at the deployment's .convex.site address.
// GET /health is what the site health check (functions/api/health.ts) calls. It reads no data and
// returns nothing about students. The sign in routes (/api/auth/*) are registered below.
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

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

// Same address as the site (forwarded by functions/api/auth), so no CORS is needed.
authComponent.registerRoutes(http, createAuth);

export default http;
