// The Pages forwarder for the public code check (spec 0016, AC-2): GET only, one path, a plainly wrong code is answered without calling
// Convex, a hashed visitor key (never the address) goes upstream, nothing of the browser's request goes upstream, and only 200 and 429
// come back (anything else is a plain 502). A fake fetch stands in for Convex.
import { afterEach, describe, expect, test, vi } from "vitest";
import { onRequest } from "../functions/api/referral/[[path]].ts";

const SITE = "https://site.example";
const ENV = { CONVEX_SITE_URL: "https://convex.example" };
const req = (path, init) => new Request(SITE + path, init);
const call = (path, init, env = ENV) => onRequest({ request: req(path, init), env });
const upstream = (status = 200, body = { ok: true, referrerFirstName: "Ananya" }) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "set-cookie": "x=1" } }));

afterEach(() => vi.unstubAllGlobals());

describe("the referral forwarder", () => {
  test("covers AC-2: a good code is forwarded with a hashed visitor key and nothing of the browser's request", async () => {
    const up = upstream();
    vi.stubGlobal("fetch", up);
    const res = await call("/api/referral/validate?code=ANA4K7Q", { headers: { cookie: "session=1", authorization: "Bearer abc", "cf-connecting-ip": "203.0.113.9" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, referrerFirstName: "Ananya" });
    const [target, init] = up.mock.calls[0];
    expect(String(target)).toBe("https://convex.example/api/referral/validate?code=ANA4K7Q");
    expect(init.headers["x-visitor"]).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(init)).not.toMatch(/203\.0\.113\.9|cookie|authorization|session=1|Bearer/i);
    expect(init.headers["accept-encoding"]).toBe("identity");
    expect(init.redirect).toBe("manual");
  });

  test("covers AC-2: the same visitor gets the same key, a different visitor a different one", async () => {
    const up = upstream();
    vi.stubGlobal("fetch", up);
    await call("/api/referral/validate?code=ANA4K7Q", { headers: { "cf-connecting-ip": "198.51.100.1" } });
    await call("/api/referral/validate?code=ANA4K7Q", { headers: { "cf-connecting-ip": "198.51.100.1" } });
    await call("/api/referral/validate?code=ANA4K7Q", { headers: { "cf-connecting-ip": "198.51.100.2" } });
    const keys = up.mock.calls.map((c) => c[1].headers["x-visitor"]);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });

  test("covers AC-2: the answer is private, never cached or indexed, and a set-cookie is never passed on", async () => {
    vi.stubGlobal("fetch", upstream());
    const res = await call("/api/referral/validate?code=ANA4K7Q");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  test("covers AC-2: a code of the wrong shape is answered here as format and never reaches Convex", async () => {
    const up = upstream();
    vi.stubGlobal("fetch", up);
    // (a short but plain code such as "AB" is passed on; Convex answers format for it, and its own tests cover that)
    for (const code of ["", "!!!!!!!", "ABCDEFGHIJKLM", "AB CD"]) {
      const res = await call(`/api/referral/validate?code=${encodeURIComponent(code)}`);
      expect(res.status, code).toBe(200);
      expect(await res.json(), code).toEqual({ ok: false, reason: "format" });
    }
    expect((await call("/api/referral/validate")).status).toBe(200);
    expect(up).not.toHaveBeenCalled();
  });

  test("covers AC-2: only GET; every other method is 405 and never reaches Convex", async () => {
    const up = upstream();
    vi.stubGlobal("fetch", up);
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const res = await call("/api/referral/validate?code=ANA4K7Q", { method });
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("GET");
    }
    expect(up).not.toHaveBeenCalled();
  });

  test("covers AC-2: any other path is a 404 and is not forwarded", async () => {
    const up = upstream();
    vi.stubGlobal("fetch", up);
    for (const path of ["/api/referral/me", "/api/referral/validate/extra", "/api/referral/"]) expect((await call(path)).status, path).toBe(404);
    expect(up).not.toHaveBeenCalled();
  });

  test("covers AC-2: the limit answer (429) is passed on; any other upstream status, or a failed call, is a plain 502", async () => {
    vi.stubGlobal("fetch", upstream(429, { code: "slow_down" }));
    const slow = await call("/api/referral/validate?code=ANA4K7Q");
    expect(slow.status).toBe(429);
    expect(await slow.json()).toEqual({ code: "slow_down" });
    vi.stubGlobal("fetch", upstream(500, { error: "boom with details" }));
    const broken = await call("/api/referral/validate?code=ANA4K7Q");
    expect(broken.status).toBe(502);
    expect(JSON.stringify(await broken.json())).not.toMatch(/boom/);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect((await call("/api/referral/validate?code=ANA4K7Q")).status).toBe(502);
  });

  test("covers AC-2: with no Convex address configured it says so with a 503", async () => {
    vi.stubGlobal("fetch", upstream());
    expect((await call("/api/referral/validate?code=ANA4K7Q", undefined, {})).status).toBe(503);
  });
});
