// Cloudflare Pages Function: forwards GET /api/avatar/<key> (the stored Google profile picture, spec 0011) to the Convex deployment, so a
// browser only ever talks to the site's own address and the strict content policies of the team and public pages need no change.
// GET only. The key is checked here before anything is forwarded, so a bad shape never reaches Convex. No cookie and no Authorization
// header go upstream, and nothing but the type, length and ETag comes back (never a set-cookie). Pages Function responses are not
// touched by public/_headers, so every header is set here, in code. A good answer is kept at the edge for 50 minutes (and a browser for 10) and an unknown key
// for 60 seconds (the Cache API), so a 100 row board costs a handful of Convex calls, not 100. Needs CONVEX_SITE_URL (wrangler.toml).
interface Env {
  CONVEX_SITE_URL?: string;
}

const KEY_RE = /^[A-Za-z0-9_-]{22}$/;
const PREFIX = "/api/avatar/";
const MAX_BYTES = 256 * 1024; // the stored file is at most 200 KB; this is only a guard against a wrong upstream
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// A Remove is promised to vanish within an hour. The edge keeps a good answer for 50 minutes and tells the browser to keep it for 10, so
// even a browser that gets the answer in the edge copy's last second holds it for at most 50 + 10 = 60 minutes.
const EDGE_TTL = 3000;
const BROWSER_TTL = 600;
const MISSING_TTL = 60;

const SAFE: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
  "content-security-policy": "default-src 'none'; sandbox",
};

const notFound = (cacheControl: string) =>
  new Response("Not found", { status: 404, headers: { ...SAFE, "content-type": "text/plain", "cache-control": cacheControl } });

// What a browser is told: a good answer may be kept for 10 minutes (whatever the edge copy says about itself), a 404 never (the edge
// keeps it for 60 seconds on its own).
function toClient(r: Response, request: Request): Response {
  if (r.status === 404) return notFound("no-store");
  const etag = r.headers.get("etag");
  if (etag && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ...SAFE, etag, "cache-control": `public, max-age=${BROWSER_TTL}` } });
  }
  const headers = new Headers(r.headers);
  headers.set("cache-control", `public, max-age=${BROWSER_TTL}`);
  return new Response(r.body, { status: r.status, headers });
}

export async function forward(
  request: Request,
  env: Env,
  cache: Cache | null,
  waitUntil: (p: Promise<unknown>) => void,
  upstreamFetch: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { ...SAFE, allow: "GET", "cache-control": "no-store" } });
  }
  if (!env.CONVEX_SITE_URL) {
    return new Response("Not configured", { status: 503, headers: { ...SAFE, "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  const key = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : "";
  if (!KEY_RE.test(key)) return notFound("no-store");

  // One cache entry per key, whatever query string or headers came with the request.
  const cacheKey = new Request(new URL(PREFIX + key, url.origin).toString(), { method: "GET" });
  const hit = cache ? await cache.match(cacheKey) : undefined;
  if (hit) return toClient(hit, request);

  let upstream: Response;
  try {
    upstream = await upstreamFetch(new URL(PREFIX + key, env.CONVEX_SITE_URL), {
      method: "GET",
      headers: { accept: "image/jpeg, image/png, image/webp", "accept-encoding": "identity" },
      redirect: "manual",
    });
  } catch {
    return new Response("Bad gateway", { status: 502, headers: { ...SAFE, "cache-control": "no-store" } });
  }

  if (upstream.status === 404) {
    if (cache) waitUntil(cache.put(cacheKey, notFound(`public, max-age=${MISSING_TTL}`)));
    return notFound("no-store");
  }
  const type = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (upstream.status !== 200 || !IMAGE_TYPES.has(type)) {
    // Anything else is a fault upstream: say so, and keep nothing.
    return new Response("Bad gateway", { status: 502, headers: { ...SAFE, "cache-control": "no-store" } });
  }
  const body = await upstream.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return new Response("Bad gateway", { status: 502, headers: { ...SAFE, "cache-control": "no-store" } });

  const headers: Record<string, string> = {
    ...SAFE,
    "content-type": type,
    "content-length": String(body.byteLength),
    "cache-control": `public, max-age=${EDGE_TTL}`, // the edge's own lifetime; `toClient` gives the browser the shorter one
    etag: upstream.headers.get("etag") ?? `"${key}"`,
  };
  if (cache) waitUntil(cache.put(cacheKey, new Response(body.slice(0), { status: 200, headers })));
  return toClient(new Response(body, { status: 200, headers }), request);
}

export const onRequest = async ({
  request,
  env,
  waitUntil,
}: {
  request: Request;
  env: Env;
  waitUntil: (p: Promise<unknown>) => void;
}): Promise<Response> => {
  // `caches.default` is the Workers edge cache; it is not in the browser typings.
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
  return forward(request, env, cache, waitUntil);
};
