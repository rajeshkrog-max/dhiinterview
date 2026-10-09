// The browser side of the saved result (spec 0005): the adapter, the shape check for a device copy, and the wait, box and
// retry controller. These are the pure parts of src/lib/result.ts, so no Convex client and no page is needed. Fake timers
// stand in for the clock; the box is a recorder that knows whether it is showing.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flatten, isFlat, startResult } from "../src/lib/result.ts";

const detail = (over = {}) => ({
  style: { v: 10, p: 80, k: 10 },
  styleGap: 70,
  state: { calm: 50, restless: 30, low: 20 },
  areas: { routine: { score: 60, band: "Growing", negatives: 0 } },
  top: [{ area: "routine" }],
  bottom: [{ area: "drive" }],
  lowest: "drive",
  indices: { studyReadiness: 60, emotionalBalance: 60, focusEnergy: 60, direction: 60 },
  subject: { heavy: "maths", style: "p", key: "maths-p", optionId: "q15o1" },
  ...over,
});
const flags = { keepsFeelingsInside: false, lowCareerClarity: true, heavyExpectations: false, selfDoubt: false, sleepStrain: false, lowMood: false, lowConsistency: false };
const view = (over = {}) => ({ engineVersion: 1, scoredAt: 1700000000000, dhiStart: 62, styleKey: "p", confidence: "clear", detail: detail(), flags, ...over });

describe("flatten (the one adapter)", () => {
  test("covers AC-13: it rebuilds the old flat object from the headline, the detail block and the flags", () => {
    const flat = flatten(view());
    expect(flat).toMatchObject({ dhiStart: 62, styleKey: "p", confidence: "clear", engineVersion: 1, scoredAt: 1700000000000, styleGap: 70, lowest: "drive" });
    expect(flat.style).toEqual({ v: 10, p: 80, k: 10 });
    expect(flat.flags).toEqual(flags);
    expect(flat.areas.routine.band).toBe("Growing");
  });

  test("covers AC-13: answered and complete are added by the adapter (a result exists only for 18 answers)", () => {
    expect(flatten(view())).toMatchObject({ answered: 18, complete: true });
  });

  test("covers AC-13: a missing lowest, styleGap or subject becomes a safe default", () => {
    const flat = flatten(view({ detail: detail({ lowest: undefined, styleGap: undefined, subject: undefined }) }));
    expect(flat).toMatchObject({ lowest: null, styleGap: 0, subject: null });
  });

  test("covers AC-13: a saved block missing a part the pages need is refused, not half drawn", () => {
    for (const missing of ["areas", "style", "state", "indices", "top", "bottom"]) {
      expect(() => flatten(view({ detail: detail({ [missing]: undefined }) })), missing).toThrow("bad_result");
    }
    expect(() => flatten(view({ detail: null }))).toThrow("bad_result");
    expect(() => flatten(view({ detail: detail({ top: "no" }) }))).toThrow("bad_result");
  });
});

describe("isFlat (the shape check for a copy read from the device)", () => {
  test("covers AC-10: a flattened result passes", () => {
    expect(isFlat(flatten(view()))).toBe(true);
  });

  test("covers AC-10: anything that is not the whole object fails", () => {
    const good = flatten(view());
    for (const bad of [null, undefined, "x", 5, [], {}, { ...good, areas: undefined }, { ...good, top: "no" }, { ...good, flags: null }, { ...good, dhiStart: "62" }, { ...good, styleKey: "z" }, { ...good, indices: [] }]) {
      expect(isFlat(bad), JSON.stringify(bad)?.slice(0, 40)).toBe(false);
    }
  });
});

describe("startResult (the wait, the box and the retry)", () => {
  let shown;
  let boxCalls;
  const box = (show, retry, error) => {
    boxCalls.push({ show, error });
    shown = show ? { retry, error } : null;
  };
  // a load that the test settles by hand
  const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
    return { promise, resolve, reject };
  };
  const tick = async (ms) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    shown = null;
    boxCalls = [];
  });
  afterEach(() => vi.useRealTimers());

  test("covers AC-13: a result that arrives at once resolves, and no box ever shows, even after the wait would have ended", async () => {
    const p = startResult({ load: async () => "R", box, waitMs: 10000 });
    await expect(p).resolves.toBe("R");
    await tick(60000);
    expect(boxCalls.filter((c) => c.show)).toEqual([]);
  });

  test("covers AC-13: a result that takes longer than the wait shows the box at 10 seconds, and removes it when the result comes", async () => {
    const d = deferred();
    const p = startResult({ load: () => d.promise, box, waitMs: 10000 });
    await tick(9999);
    expect(shown).toBeNull();
    await tick(2);
    expect(shown).not.toBeNull();
    d.resolve("R");
    await expect(p).resolves.toBe("R");
    expect(shown).toBeNull();
  });

  test("covers AC-13: a failure shows the box at once, with the reason, and Try again starts a new attempt that can succeed", async () => {
    const first = new Error("offline");
    const loads = [() => Promise.reject(first), () => Promise.resolve("R")];
    const p = startResult({ load: () => loads.shift()(), box, waitMs: 10000 });
    await tick(0);
    expect(shown.error).toBe(first);
    shown.retry();
    await expect(p).resolves.toBe("R");
    expect(shown).toBeNull();
  });

  test("covers AC-13: the box never comes back over a page that has drawn (slow first attempt, Try again, first attempt wins, second still hanging)", async () => {
    const a1 = deferred();
    const a2 = deferred();
    const attempts = [a1, a2];
    let loads = 0;
    const p = startResult({ load: () => attempts[loads++].promise, box, waitMs: 10000 });
    await tick(10001); // the box shows at 10 s
    expect(shown).not.toBeNull();
    await tick(1000);
    shown.retry(); // the student taps Try again at 11 s: attempt 2 starts and hangs
    expect(shown).toBeNull();
    await tick(3000);
    a1.resolve("R1"); // attempt 1 finishes at 14 s: the page draws
    await expect(p).resolves.toBe("R1");
    expect(shown).toBeNull();
    await tick(60000); // attempt 2's timer would have fired at 21 s
    expect(shown).toBeNull();
    expect(boxCalls.at(-1).show).toBe(false);
    a2.resolve("R2"); // and its late answer changes nothing
    await tick(0);
    expect(shown).toBeNull();
  });

  test("covers AC-13: an older attempt failing while a newer one is running does not bring the box back", async () => {
    const a1 = deferred();
    const a2 = deferred();
    const attempts = [a1, a2];
    let loads = 0;
    startResult({ load: () => attempts[loads++].promise, box, waitMs: 10000 });
    await tick(10001);
    shown.retry(); // attempt 2 starts
    a1.reject(new Error("old")); // attempt 1 fails later
    await tick(0);
    expect(shown).toBeNull();
    a2.reject(new Error("new")); // the newest one failing does show it
    await tick(0);
    expect(shown.error.message).toBe("new");
  });

  test("covers AC-13: a Try again button that is still in hand after the result has arrived does nothing and does not load again", async () => {
    const d = deferred();
    let loads = 0;
    const p = startResult({ load: () => (loads++, d.promise), box, waitMs: 10000 });
    await tick(10001);
    const staleRetry = shown.retry; // the button the student could still be holding
    d.resolve("R");
    await p;
    expect(loads).toBe(1);
    staleRetry();
    await tick(60000);
    expect(loads).toBe(1);
    expect(shown).toBeNull();
  });

  test("covers AC-14: a load that sent the page elsewhere (null) never resolves and shows no box", async () => {
    let resolved = false;
    startResult({ load: async () => null, box, waitMs: 10000 }).then(() => (resolved = true));
    await tick(60000);
    expect(resolved).toBe(false);
    expect(boxCalls.filter((c) => c.show)).toEqual([]);
  });

  test("covers AC-13: a slow attempt after Try again can still win, and the retry cancels the old timer so only one box timer is live", async () => {
    const a1 = deferred();
    const a2 = deferred();
    const attempts = [a1, a2];
    let loads = 0;
    const p = startResult({ load: () => attempts[loads++].promise, box, waitMs: 10000 });
    await tick(10001);
    shown.retry(); // timer 1 already fired; timer 2 starts now
    expect(vi.getTimerCount()).toBe(1);
    a2.resolve("R2");
    await expect(p).resolves.toBe("R2");
    expect(vi.getTimerCount()).toBe(0);
  });
});
