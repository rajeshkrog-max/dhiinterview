// Cloudflare Pages Function: forwards GET /api/render/* (the data the report render page draws from, spec 0006) to the
// Convex deployment. Only the signed render token header is passed on: no cookies, no Authorization. GET only, never cached,
// never indexed. Needs CONVEX_SITE_URL (see wrangler.toml).
interface Env {
  CONVEX_SITE_URL?: string;
}

const PRIVATE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET", ...PRIVATE } });
  }
  if (!env.CONVEX_SITE_URL) {
    return new Response("Not configured", { status: 503, headers: PRIVATE });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname, env.CONVEX_SITE_URL);

  const headers = new Headers({ accept: "application/json", "accept-encoding": "identity" });
  const token = request.headers.get("x-render-token");
  if (token) headers.set("x-render-token", token);

  const upstream = await fetch(target, { method: "GET", headers, redirect: "manual" });
  const out = new Headers(upstream.headers);
  for (const [k, v] of Object.entries(PRIVATE)) out.set(k, v);
  out.set("x-content-type-options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
