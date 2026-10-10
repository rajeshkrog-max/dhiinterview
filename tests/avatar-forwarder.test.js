// The Pages forwarder for the stored profile picture (spec 0011, AC-8): GET only, the key shape is checked before anything is
// forwarded, nothing of the browser's request goes upstream, the safe headers are set in code, and the edge cache keeps a good
// answer for 50 minutes (the browser 10) and an unknown key for 60 seconds. A fake cache and a fake upstream stand in for Cloudflare and Convex.
import { describe, expect, test, vi } from "vitest";
import { forward } from "../functions/api/avatar/[[path]].ts";

const KEY = "AbCdEfGhIjKlMnOpQrStUv"; // 22 characters
const SITE = "https://site.example";
const ENV = { CONVEX_SITE_URL: "https://convex.example" };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function fakeCache() {
  const store = new Map();
  return {
    store,
    match: vi.fn(async (req) => {
      const r = store.get(req.url);
      return r ? r.clone() : undefined;
    }),
    put: vi.fn(async (req, res) => void store.set(req.url, res.clone())),
  };
}
const waited = [];
const waitUntil = (p) => waited.push(p);
const flush = async () => {
  await Promise.all(waited.splice(0));
};
const good = () => new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg", etag: `"${KEY}"`, "set-cookie": "x=1", "cache-control": "public, max-age=3600" } });
const req = (path, init) => new Request(SITE + path, init);

describe("the avatar forwarder", () => {
  test("covers AC-8: a good key is forwarded with no cookie and no Authorization, and answers with the safe headers and the image", async () => {
    const up = vi.fn(async () => good());
    const res = await forward(req(`/api/avatar/${KEY}`, { headers: { cookie: "session=1", authorization: "Bearer abc" } }), ENV, fakeCache(), waitUntil, up);
    expect(res.status).toBe(200);
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(JPEG));
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(res.headers.get("cache-control")).toBe("public, max-age=600"); // the browser keeps it 10 minutes
    expect(res.headers.get("etag")).toBe(`"${KEY}"`);
    expect(res.headers.get("set-cookie")).toBeNull(); // never passed on
    const [target, init] = up.mock.calls[0];
    expect(String(target)).toBe(`https://convex.example/api/avatar/${KEY}`);
    expect(JSON.stringify(init.headers).toLowerCase()).not.toMatch(/cookie|authorization/);
    expect(init.headers["accept-encoding"]).toBe("identity");
    expect(init.redirect).toBe("manual");
  });

  test("covers AC-8: only GET; every other method is 405 and never reaches Convex", async () => {
    const up = vi.fn();
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await forward(req(`/api/avatar/${KEY}`, { method }), ENV, null, waitUntil, up);
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("GET");
    }
    expect(up).not.toHaveBeenCalled();
  });

  test("covers AC-8: a badly shaped key is a 404 that never reaches Convex", async () => {
    const up = vi.fn();
    for (const path of ["/api/avatar/", "/api/avatar/short", `/api/avatar/${KEY}x`, `/api/avatar/${KEY.slice(1)}`, "/api/avatar/..%2F..%2Fsecret", `/api/avatar/${KEY}/more`, "/api/avatar/AbCdEfGhIjKlMnOpQrSt!!", "/other"]) {
      const res = await forward(req(path), ENV, null, waitUntil, up);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("cache-control"), path).toBe("no-store");
    }
    expect(up).not.toHaveBeenCalled();
  });

  test("covers AC-8: a second request is answered from the edge cache with no Convex call; a query string makes no new entry", async () => {
    const cache = fakeCache();
    const up = vi.fn(async () => good());
    await forward(req(`/api/avatar/${KEY}`), ENV, cache, waitUntil, up);
    await flush();
    const again = await forward(req(`/api/avatar/${KEY}?x=1&y=2`), ENV, cache, waitUntil, up);
    expect(again.status).toBe(200);
    expect(up).toHaveBeenCalledTimes(1);
    expect(cache.store.size).toBe(1);
    expect(again.headers.get("cache-control")).toBe("public, max-age=600");
    // the edge keeps its own copy 50 minutes, so edge plus browser never passes the hour promised for a Remove
    expect(cache.store.get(`${SITE}/api/avatar/${KEY}`).headers.get("cache-control")).toBe("public, max-age=3000");
  });

  test("covers AC-8: an unknown key is 404 with no-store for the browser and is kept 60 seconds at the edge", async () => {
    const cache = fakeCache();
    const up = vi.fn(async () => new Response("Not found", { status: 404 }));
    const first = await forward(req(`/api/avatar/${KEY}`), ENV, cache, waitUntil, up);
    expect(first.status).toBe(404);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.text()).toBe("Not found");
    await flush();
    const stored = cache.store.get(`${SITE}/api/avatar/${KEY}`);
    expect(stored.headers.get("cache-control")).toBe("public, max-age=60");
    const second = await forward(req(`/api/avatar/${KEY}`), ENV, cache, waitUntil, up);
    expect(second.status).toBe(404);
    expect(second.headers.get("cache-control")).toBe("no-store"); // the browser is never told to keep a 404
    expect(up).toHaveBeenCalledTimes(1);
  });

  test("covers AC-8: If-None-Match with the ETag is a 304 with no body", async () => {
    const cache = fakeCache();
    const up = vi.fn(async () => good());
    const res = await forward(req(`/api/avatar/${KEY}`, { headers: { "if-none-match": `"${KEY}"` } }), ENV, cache, waitUntil, up);
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    await flush();
    const cached = await forward(req(`/api/avatar/${KEY}`, { headers: { "if-none-match": `"${KEY}"` } }), ENV, cache, waitUntil, up);
    expect(cached.status).toBe(304);
    expect(up).toHaveBeenCalledTimes(1);
  });

  test("covers AC-8: a wrong upstream (a 500, an HTML answer, an oversized or empty body, or a thrown error) is a 502 that is never kept", async () => {
    const cache = fakeCache();
    const answers = [
      () => new Response("boom", { status: 500 }),
      () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
      () => new Response(new Uint8Array(300 * 1024), { status: 200, headers: { "content-type": "image/jpeg" } }),
      () => new Response(new Uint8Array(), { status: 200, headers: { "content-type": "image/jpeg" } }),
      () => {
        throw new TypeError("down");
      },
    ];
    for (const a of answers) {
      const res = await forward(req(`/api/avatar/${KEY}`), ENV, cache, waitUntil, async () => a());
      expect(res.status).toBe(502);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    await flush();
    expect(cache.store.size).toBe(0);
  });

  test("covers AC-8: with no CONVEX_SITE_URL the answer is 503 and nothing is forwarded", async () => {
    const up = vi.fn();
    const res = await forward(req(`/api/avatar/${KEY}`), {}, null, waitUntil, up);
    expect(res.status).toBe(503);
    expect(up).not.toHaveBeenCalled();
  });

  test("covers AC-8: with no edge cache available (local), it still forwards and answers", async () => {
    const res = await forward(req(`/api/avatar/${KEY}`), ENV, null, waitUntil, async () => good());
    expect(res.status).toBe(200);
  });
});
