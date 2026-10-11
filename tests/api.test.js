// The challenge mock's style label (spec 0005, AC-3 and AC-10): js/api.js reads it from the saved result copy on the
// device, synchronously, and returns null when there is none. api.js is a plain browser script, so it is loaded the way
// a page loads it: after a fake localStorage exists.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const SESSION = "dhirise.session.v1";
const RESULT = "dhirise.result.v1";

function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}
const session = (extra = {}) => ({ v: 1, owner: "u1", profile: { name: "Asha Rao", age: 20, class: "College" }, completedAt: "2026-10-09T10:00:00.000Z", answers: {}, ...extra });
const copy = (extra = {}) => ({ v: 1, owner: "u1", result: { styleKey: "p", dhiStart: 62 }, ...extra });
const put = (s, r) => {
  if (s) localStorage.setItem(SESSION, JSON.stringify(s));
  if (r) localStorage.setItem(RESULT, JSON.stringify(r));
};
const style = async () => (await globalThis.DhiApi.getMe()).style;

beforeEach(async () => {
  vi.resetModules();
  globalThis.localStorage = makeStorage();
  delete globalThis.DhiApi;
  delete globalThis.DhiScore;
  await import("../public/dhiinterviews/js/api.js");
});

describe("validateCode (spec 0016, AC-2)", () => {
  const stubFetch = (impl) => vi.stubGlobal("fetch", vi.fn(impl));
  const json = (status, body) => new Response(JSON.stringify(body), { status });
  const check = (code) => globalThis.DhiApi.validateCode(code);
  // a fixed day before the deadline, so the page's own "has it ended" check does not depend on when the test runs
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("covers AC-2: a good code calls the route with the code in capitals and no credentials, and gives the owner's first name", async () => {
    stubFetch(async () => json(200, { ok: true, referrerFirstName: "Ananya" }));
    expect(await check(" ana4k7q ")).toEqual({ ok: true, referrerFirstName: "Ananya" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/referral/validate?code=ANA4K7Q");
    expect(init.credentials).toBe("omit");
  });

  test("covers AC-2: a wrong shape is answered here without calling the route", async () => {
    stubFetch(async () => json(200, {}));
    expect(await check("abc")).toEqual({ ok: false, reason: "format" });
    expect(await check("ASH0000")).toEqual({ ok: false, reason: "format" });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("covers AC-2: unknown and ended come from the route; there is no self answer", async () => {
    stubFetch(async () => json(200, { ok: false, reason: "unknown" }));
    expect(await check("ANA4K7Q")).toEqual({ ok: false, reason: "unknown" });
    stubFetch(async () => json(200, { ok: false, reason: "self" }));
    expect(await check("ANA4K7Q")).toEqual({ ok: false, reason: "unchecked" });
  });

  test("covers AC-2: over the limit, a server fault, a broken answer or no network all give unchecked and never throw", async () => {
    for (const impl of [async () => json(429, { code: "slow_down" }), async () => json(502, {}), async () => new Response("not json", { status: 200 }), async () => { throw new Error("offline"); }]) {
      stubFetch(impl);
      expect(await check("ANA4K7Q")).toEqual({ ok: false, reason: "unchecked" });
    }
  });

  test("covers AC-2: a first name that is not text is not trusted", async () => {
    stubFetch(async () => json(200, { ok: true, referrerFirstName: { x: 1 } }));
    expect(await check("ANA4K7Q")).toEqual({ ok: false, reason: "unchecked" });
  });
});

describe("the style label from the saved result copy", () => {
  test("covers AC-3: it names the style from the copy for each of the three style keys", async () => {
    for (const [key, name] of [["v", "Explorer"], ["p", "Achiever"], ["k", "Builder"]]) {
      put(session(), copy({ result: { styleKey: key } }));
      expect(await style()).toBe(name);
    }
  });

  test("covers AC-3: it needs no scoring engine on the page", async () => {
    put(session(), copy());
    expect(globalThis.DhiScore).toBeUndefined();
    expect(await style()).toBe("Achiever");
  });

  test("covers AC-10: no copy on this device gives null", async () => {
    put(session());
    expect(await style()).toBeNull();
  });

  test("covers AC-10: a copy that belongs to another account gives null", async () => {
    put(session(), copy({ owner: "someone-else" }));
    expect(await style()).toBeNull();
  });

  test("covers AC-10: an unfinished check gives null even if a copy is lying around", async () => {
    put(session({ completedAt: null }), copy());
    expect(await style()).toBeNull();
  });

  test("covers AC-10: a session with no owner, a wrong copy version or a copy with no result gives null", async () => {
    put(session({ owner: null }), copy({ owner: null }));
    expect(await style()).toBeNull();
    put(session(), copy({ v: 2 }));
    expect(await style()).toBeNull();
    put(session(), { v: 1, owner: "u1" });
    expect(await style()).toBeNull();
  });

  test("covers AC-3: an unknown style key gives null, never a made up label", async () => {
    put(session(), copy({ result: { styleKey: "zz" } }));
    expect(await style()).toBeNull();
  });

  test("covers AC-10: broken stored text never throws", async () => {
    put(session());
    localStorage.setItem(RESULT, "{not json");
    expect(await style()).toBeNull();
  });
});

// The board and the student's own place come from the server through the browser bridge (spec 0018, AC-6 to AC-8): api.js ranks nothing itself.
describe("the leaderboard and my rank from the server (spec 0018)", () => {
  const BOARD = {
    rows: [
      { rank: 1, displayName: "Ananya S.", cls: "Class 10", style: "Builder", valid: 5 },
      { rank: 2, displayName: "Ravi K.", cls: "College", style: "Explorer", valid: 4, avatar: "/api/avatar/abcdefghijklmnopqrstuv" },
      { rank: 3, displayName: "Anonymous Achiever", style: "Achiever", valid: 4 },
    ],
    computedAt: 1760000000000,
    frozen: false,
    endsAt: Date.parse("2026-10-30T23:59:00+05:30"),
    myRank: 2,
  };
  const ME = { open: true, joined: true, code: "ANA4K7Q", hideName: false, valid: 4, pending: 1, rank: 2, toNext: 2, nextRank: 1, endsAt: BOARD.endsAt, frozen: false };
  const bridge = (over = {}) => {
    globalThis.DhiSession = { challenge: { leaderboard: vi.fn(async () => BOARD), me: vi.fn(async () => ME), ...over } };
  };
  afterEach(() => {
    delete globalThis.DhiSession;
  });

  test("covers AC-8: getLeaderboard gives the server's rows in order with the student's own row marked, a hidden class as empty text, and no demo rows", async () => {
    bridge();
    const rows = await globalThis.DhiApi.getLeaderboard();
    expect(rows).toEqual([
      { rank: 1, displayName: "Ananya S.", cls: "Class 10", style: "Builder", valid: 5, avatar: null, me: false },
      { rank: 2, displayName: "Ravi K.", cls: "College", style: "Explorer", valid: 4, avatar: "/api/avatar/abcdefghijklmnopqrstuv", me: true },
      { rank: 3, displayName: "Anonymous Achiever", cls: "", style: "Achiever", valid: 4, avatar: null, me: false },
    ]);
  });

  test("covers AC-8: boardInfo gives the time the job wrote the board and whether it is final; it is null before the first read", async () => {
    bridge();
    expect(globalThis.DhiApi.boardInfo()).toBeNull();
    await globalThis.DhiApi.getLeaderboard();
    expect(globalThis.DhiApi.boardInfo()).toEqual({ computedAt: BOARD.computedAt, frozen: false, endsAt: BOARD.endsAt });
    bridge({ leaderboard: async () => ({ ...BOARD, frozen: true }) });
    await globalThis.DhiApi.getLeaderboard();
    expect(globalThis.DhiApi.boardInfo().frozen).toBe(true);
  });

  test("covers AC-6: when the board cannot be had (no bridge, a failed read) getLeaderboard gives null, never made up rows", async () => {
    expect(await globalThis.DhiApi.getLeaderboard()).toBeNull();
    bridge({ leaderboard: async () => null });
    expect(await globalThis.DhiApi.getLeaderboard()).toBeNull();
    bridge({ leaderboard: async () => { throw new Error("offline"); } });
    expect(await globalThis.DhiApi.getLeaderboard()).toBeNull();
    expect(globalThis.DhiApi.boardInfo()).toBeNull();
  });

  test("covers AC-7: getMyRank gives the rank, toNext and nextRank the server wrote, and does not work them out", async () => {
    bridge();
    expect(await globalThis.DhiApi.getMyRank()).toEqual({ rank: 2, valid: 4, pending: 1, toNext: 2, nextRank: 1 });
  });

  test("covers AC-7: a student with no valid referral yet has no rank; a student who has not joined has nothing", async () => {
    bridge({ me: async () => ({ ...ME, valid: 0, rank: null, toNext: null, nextRank: null }) });
    expect(await globalThis.DhiApi.getMyRank()).toEqual({ rank: null, valid: 0, pending: 1, toNext: null, nextRank: null });
    bridge({ me: async () => ({ ...ME, joined: false, code: null }) });
    expect(await globalThis.DhiApi.getMyRank()).toEqual({ rank: null, valid: 0, pending: 0, toNext: null, nextRank: null });
    delete globalThis.DhiSession;
    expect(await globalThis.DhiApi.getMyRank()).toEqual({ rank: null, valid: 0, pending: 0, toNext: null, nextRank: null });
  });

  test("covers AC-8: the file keeps no demo rows and no ranking of its own", () => {
    const text = require("node:fs").readFileSync(new URL("../public/dhiinterviews/js/api.js", import.meta.url), "utf8");
    expect(text).not.toMatch(/demo: true|var DEMO|function ranking/);
  });
});
