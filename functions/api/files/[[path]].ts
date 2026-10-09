// Cloudflare Pages Function: forwards GET /api/files/* (the student's own report PDF, spec 0006) to the Convex deployment, so
// the browser only talks to the site's own address. GET only, never cached. The Authorization header (the student's token)
// and nothing else of the browser's is passed on. Pages Function responses are not touched by public/_headers, so the
// no-store rule is set here too. Needs CONVEX_SITE_URL (see wrangler.toml).
interface Env {
  CONVEX_SITE_URL?: string;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET", "cache-control": "private, no-store" } });
  }
  if (!env.CONVEX_SITE_URL) {
    return new Response("Not configured", { status: 503, headers: { "cache-control": "private, no-store" } });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname, env.CONVEX_SITE_URL); // no query string: the route takes no input

  const headers = new Headers({ accept: "application/pdf, application/json", "accept-encoding": "identity" });
  const auth = request.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const upstream = await fetch(target, { method: "GET", headers, redirect: "manual" });
  const out = new Headers(upstream.headers);
  out.set("cache-control", "private, no-store");
  out.set("x-content-type-options", "nosniff");
  return new Response(upstream.body, { status: upstream.status, headers: out });
};
