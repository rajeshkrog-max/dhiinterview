// Cloudflare Pages Function: forwards GET /api/team/* (the team list and the saved report PDF, spec 0008) to the Convex
// deployment, so the browser only talks to the site's own address. GET only, never cached. Only the Authorization header (the
// team member's token) and the query string are passed on; nothing else of the browser's request is. Pages Function responses
// are not touched by public/_headers, so the no-store rule is set here too. Needs CONVEX_SITE_URL (see wrangler.toml).
interface Env {
  CONVEX_SITE_URL?: string;
}

const MAX_QUERY = 4200; // a list cursor is the longest thing sent; a longer query is refused here, before it reaches Convex

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET", "cache-control": "private, no-store" } });
  }
  if (!env.CONVEX_SITE_URL) {
    return new Response("Not configured", { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  const url = new URL(request.url);
  if (url.search.length > MAX_QUERY) {
    return new Response(JSON.stringify({ code: "bad_request" }), { status: 400, headers: { "content-type": "application/json", "cache-control": "private, no-store" } });
  }
  const target = new URL(url.pathname + url.search, env.CONVEX_SITE_URL);

  const headers = new Headers({ accept: "application/pdf, application/json", "accept-encoding": "identity" });
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const upstream = await fetch(target, { method: "GET", headers, redirect: "manual" });
  const out = new Headers(upstream.headers);
  out.set("cache-control", "private, no-store");
  out.set("x-content-type-options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
