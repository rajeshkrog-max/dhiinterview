// The challenge mock's style label (spec 0005, AC-3 and AC-10): js/api.js reads it from the saved result copy on the
// device, synchronously, and returns null when there is none. api.js is a plain browser script, so it is loaded the way
// a page loads it: after a fake localStorage exists.
import { beforeEach, describe, expect, test, vi } from "vitest";

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
