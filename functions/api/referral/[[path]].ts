// Cloudflare Pages Function: forwards GET /api/referral/validate?code= (the public code check of the live challenge, spec 0016) to the
// Convex deployment, so a browser only ever talks to the site's own address and no CORS is needed. GET only, and only that one path.
// A code whose shape is plainly wrong is answered here without calling Convex. What goes upstream is the code and a hashed copy of the
// visitor's address in `x-visitor`: Convex uses it only as the key of its rate limit, so one visitor cannot use up the limit for everyone.
// The address itself is never sent, no cookie and no Authorization header go upstream, and a `set-cookie` never comes back. Never cached,
// never indexed. Pages Function responses are not touched by public/_headers, so every header is set here, in code. Needs CONVEX_SITE_URL.
interface Env {
  CONVEX_SITE_URL?: string;
}

const VALIDATE_PATH = "/api/referral/validate";
const SHAPE_RE = /^[A-Za-z0-9]{1,12}$/; // a real code is 7 characters; the page cuts the box at 8
const PRIVATE = { "cache-control": "no-store", "x-robots-tag": "noindex", "x-content-type-options": "nosniff" };
const JSON_TYPE = { "content-type": "application/json" };

// 32 hex characters of SHA 256 over a fixed label and the address. Not secret and not meant to be: it only has to be stable per visitor.
async function visitorKey(request: Request): Promise<string> {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const bytes = new TextEncoder().encode("dhirise-referral-check|" + ip);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET", ...PRIVATE } });
  }
  const url = new URL(request.url);
  if (url.pathname !== VALIDATE_PATH) {
    return new Response(JSON.stringify({ code: "unavailable" }), { status: 404, headers: { ...JSON_TYPE, ...PRIVATE } });
  }
  const code = url.searchParams.get("code") ?? "";
  if (!SHAPE_RE.test(code)) {
    return new Response(JSON.stringify({ ok: false, reason: "format" }), { status: 200, headers: { ...JSON_TYPE, ...PRIVATE } });
  }
  if (!env.CONVEX_SITE_URL) {
    return new Response("Not configured", { status: 503, headers: PRIVATE });
  }

  const target = new URL(VALIDATE_PATH, env.CONVEX_SITE_URL);
  target.searchParams.set("code", code);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "GET",
      headers: { accept: "application/json", "accept-encoding": "identity", "x-visitor": await visitorKey(request) },
      redirect: "manual",
    });
  } catch {
    return new Response(JSON.stringify({ code: "unavailable_upstream" }), { status: 502, headers: { ...JSON_TYPE, ...PRIVATE } });
  }
  // Only the two answers the route gives are passed on; anything else from upstream is a fault, shown as a plain 502.
  if (upstream.status !== 200 && upstream.status !== 429) {
    return new Response(JSON.stringify({ code: "unavailable_upstream" }), { status: 502, headers: { ...JSON_TYPE, ...PRIVATE } });
  }
  return new Response(upstream.body, { status: upstream.status, headers: { ...JSON_TYPE, ...PRIVATE } });
};
