// Cloudflare Pages Function: forwards GET /api/shared/payload (the data the public report page draws from, spec 0010) to the Convex
// deployment, so a browser only ever talks to the site's own address and no CORS is needed. GET only, and only that one path. The link
// code arrives in the `x-share-token` header and goes upstream in the same header; no cookie and no Authorization header go upstream, and
// a `set-cookie` never comes back. Never cached, never indexed. Pages Function responses are not touched by public/_headers, so every
// header is set here, in code. Needs CONVEX_SITE_URL (see wrangler.toml).
interface Env {
  CONVEX_SITE_URL?: string;
}

const PAYLOAD_PATH = "/api/shared/payload";
const MAX_TOKEN = 120; // a real code is about 80 characters; anything longer is not forwarded
const PRIVATE = { "cache-control": "no-store", "x-robots-tag": "noindex", "x-content-type-options": "nosniff" };

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET", ...PRIVATE } });
  }
  if (!env.CONVEX_SITE_URL) {
    return new Response("Not configured", { status: 503, headers: PRIVATE });
  }
  const url = new URL(request.url);
  // The same answer as a link that does not work, so nothing about the route tells a caller anything.
  if (url.pathname !== PAYLOAD_PATH) {
    return new Response(JSON.stringify({ code: "unavailable" }), { status: 404, headers: { "content-type": "application/json", ...PRIVATE } });
  }

  const headers = new Headers({ accept: "application/json", "accept-encoding": "identity" });
  const token = request.headers.get("x-share-token");
  if (token && token.length <= MAX_TOKEN) headers.set("x-share-token", token);

  let upstream: Response;
  try {
    upstream = await fetch(new URL(PAYLOAD_PATH, env.CONVEX_SITE_URL), { method: "GET", headers, redirect: "manual" });
  } catch {
    // The site could not reach Convex: a plain 502 with the private headers, which the page shows as "We could not open this report" with a retry.
    return new Response(JSON.stringify({ code: "unavailable_upstream" }), { status: 502, headers: { "content-type": "application/json", ...PRIVATE } });
  }
  const out = new Headers({ "content-type": upstream.headers.get("content-type") ?? "application/json", ...PRIVATE });
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
