// The local copy of the check and the resume rule (spec 0002, AC-4 and AC-5). store.js is a plain browser script,
// so it is loaded the way a page loads it: after a fake localStorage and a fake window exist.
import { beforeEach, describe, expect, test, vi } from "vitest";

const KEY = "dhirise.session.v1";

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    _m: m,
  };
}

let store;
beforeEach(async () => {
  vi.resetModules();
  globalThis.localStorage = makeStorage();
  delete globalThis.DhiSession;
  delete globalThis.DhiStore;
  await import("../public/dhiinterviews/js/engine/store.js");
  store = globalThis.DhiStore;
});

const full = (extra = {}) => ({ v: 1, owner: "u1", profile: { name: "A", age: 20, class: "College" }, seed: "s", startedAt: "x", completedAt: null, reportSeenAt: null, answers: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, `q${i + 1}o1`])), ...extra });
const some = (n) => ({ answers: Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i + 1}`, `q${i + 1}o1`])), completedAt: null });

describe("urlFor", () => {
  test("covers AC-4: question 1 and 2 have their own pages, the rest use questions.html?q=N", () => {
    expect(store.urlFor(1)).toBe("question.html");
    expect(store.urlFor(2)).toBe("question2.html");
    expect(store.urlFor(3)).toBe("questions.html?q=3");
    expect(store.urlFor(18)).toBe("questions.html?q=18");
  });
});

describe("resumeTarget (the one table, spec 0002 Feature design)", () => {
  test("covers AC-4: no answers goes to meet.html", () => {
    expect(store.resumeTarget({ answers: {}, completedAt: null })).toBe("meet.html");
  });
  test("covers AC-4: 1 to 17 answers goes to the first unanswered question", () => {
    expect(store.resumeTarget(some(1))).toBe("question2.html");
    expect(store.resumeTarget(some(2))).toBe("questions.html?q=3");
    expect(store.resumeTarget(some(17))).toBe("questions.html?q=18");
    const gap = some(17);
    delete gap.answers.q9;
    expect(store.resumeTarget(gap)).toBe("questions.html?q=9");
  });
  test("covers AC-4: all 18 answered but not finished goes to question 18 (the finish step)", () => {
    expect(store.resumeTarget(some(18))).toBe("questions.html?q=18");
  });
  test("covers AC-4: finished goes to done.html until the report was seen, then to the report", () => {
    expect(store.resumeTarget(full({ completedAt: "t" }))).toBe("done.html");
    expect(store.resumeTarget(full({ completedAt: "t", leadSavedAt: "t", reportSeenAt: "t" }))).toBe("report-student.html");
  });
  test("spec 0003 AC-7: a finished check with no saved lead goes to done.html even when the report was seen", () => {
    expect(store.resumeTarget(full({ completedAt: "t", reportSeenAt: "t" }))).toBe("done.html");
    expect(store.resumeTarget(full({ completedAt: "t", leadSavedAt: "t" }))).toBe("done.html");
  });
  test("spec 0003 AC-7: requireLead lets a student with a saved lead through and sends the rest to done.html", async () => {
    const replaced = [];
    globalThis.location = { replace: (u) => replaced.push(u), reload: () => replaced.push("reload") };
    delete globalThis.DhiSession;
    expect(store.requireLead(full({ completedAt: "t", leadSavedAt: "t" }))).toBe(true);
    expect(replaced).toEqual([]);
    expect(store.requireLead(full({ completedAt: "t" }))).toBe(false);
    expect(replaced).toEqual(["done.html"]);
    // the cache was behind: after the server answers and the lead is there, the page reloads instead
    replaced.length = 0;
    localStorage.setItem(KEY, JSON.stringify(full({ completedAt: "t" })));
    globalThis.DhiSession = { ready: async () => localStorage.setItem(KEY, JSON.stringify(full({ completedAt: "t", leadSavedAt: "t" }))) };
    expect(store.requireLead()).toBe(false);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(replaced).toEqual(["reload"]);
    delete globalThis.DhiSession; delete globalThis.location;
  });
  test("covers AC-4: with no argument it reads the cached check on this device", () => {
    localStorage.setItem(KEY, JSON.stringify(full({ completedAt: "t", leadSavedAt: "t", reportSeenAt: "t" })));
    expect(store.resumeTarget()).toBe("report-student.html");
  });
});

describe("firstMissing", () => {
  test("covers AC-7: returns the first unanswered question, or 0 when all 18 are there", () => {
    expect(store.firstMissing(some(0))).toBe(1);
    expect(store.firstMissing(some(5))).toBe(6);
    expect(store.firstMissing(some(18))).toBe(0);
  });
});

describe("get, answer and seed", () => {
  test("covers AC-5: with no copy on the device, get returns an empty check and does not write one", () => {
    const c = store.get();
    expect(c.answers).toEqual({});
    expect(c.profile).toBeNull();
    expect(c.completedAt).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test("covers AC-5: a corrupt or foreign copy is ignored", () => {
    localStorage.setItem(KEY, "{not json");
    expect(store.get().answers).toEqual({});
    localStorage.setItem(KEY, JSON.stringify({ v: 2, answers: {} }));
    expect(store.get().profile).toBeNull();
  });

  test("covers AC-5: an answer is kept on the device at once and handed to the sync queue", () => {
    localStorage.setItem(KEY, JSON.stringify(full({ answers: {} })));
    const queued = vi.fn();
    globalThis.DhiSession = { queueAnswer: queued };
    store.answer(4, "q4o3");
    expect(store.get().answers.q4).toBe("q4o3");
    expect(queued).toHaveBeenCalledWith(4, "q4o3");
  });

  test("covers AC-5: the last answer for a question wins locally", () => {
    localStorage.setItem(KEY, JSON.stringify(full({ answers: {} })));
    store.answer(4, "q4o1");
    store.answer(4, "q4o4");
    expect(store.get().answers.q4).toBe("q4o4");
  });

  test("covers AC-8 and AC-9: with no signed in owner on this device, an answer is not stored or queued", () => {
    const queued = vi.fn();
    globalThis.DhiSession = { queueAnswer: queued };
    store.answer(4, "q4o3");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(queued).not.toHaveBeenCalled();
  });

  test("covers AC-4: the shuffle seed is the one made on the server, the same on every device", () => {
    localStorage.setItem(KEY, JSON.stringify(full({ seed: "server-seed-123" })));
    expect(store.seed()).toBe("server-seed-123");
  });
});
