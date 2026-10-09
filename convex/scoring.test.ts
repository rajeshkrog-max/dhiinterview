// The server side wrapper around score.js (spec 0005, AC-2, AC-4, AC-8): how a raw score is split into the saved
// headline, the detail block and the flags, and what happens when the engine is missing. Pure code, no database.
import { afterEach, describe, expect, test, vi } from "vitest";
import { ENGINE_VERSION, scoreAnswers, splitResult, type RawScore } from "./scoring";

const FLAG_NAMES = ["keepsFeelingsInside", "lowCareerClarity", "heavyExpectations", "selfDoubt", "sleepStrain", "lowMood", "lowConsistency"];
const answers = (pick: (n: number) => number) => Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, `q${i + 1}o${pick(i + 1)}`]));
const engine = () => globalThis as unknown as { DhiScore?: unknown };

afterEach(() => vi.restoreAllMocks());

describe("scoreAnswers", () => {
  test("covers AC-2: all 18 option ids score as complete with a seeded, boolean lowConsistency", () => {
    const raw = scoreAnswers(answers(() => 2), "seed-a");
    expect(raw.answered).toBe(18);
    expect(raw.complete).toBe(true);
    expect(typeof raw.flags.lowConsistency).toBe("boolean");
  });

  test("covers AC-2: the same answers and seed always give the same result", () => {
    expect(scoreAnswers(answers((n) => (n % 4) + 1), "seed-a")).toEqual(scoreAnswers(answers((n) => (n % 4) + 1), "seed-a"));
  });

  test("covers AC-2: an unknown option id is not scored, so the answered count falls short of 18 (makeResult then refuses to save)", () => {
    const a = answers(() => 1);
    a.q7 = "q7o9";
    a.q8 = "not an option";
    expect(scoreAnswers(a, "seed-a").answered).toBe(16);
  });

  test("covers AC-2: a score the same for every device does not depend on the seed except for lowConsistency", () => {
    const a = answers(() => 3);
    const one = scoreAnswers(a, "seed-a");
    const two = scoreAnswers(a, "seed-b");
    expect({ ...one, flags: undefined }).toEqual({ ...two, flags: undefined });
  });
});

describe("splitResult", () => {
  const raw = () => scoreAnswers(answers((n) => (n % 4) + 1), "seed-a");

  test("covers AC-8: the flags are separated and the detail block holds none of the seven flag names", () => {
    const { detail, flags } = splitResult(raw());
    expect(Object.keys(flags).sort()).toEqual([...FLAG_NAMES].sort());
    expect(JSON.stringify(detail)).not.toMatch(new RegExp(FLAG_NAMES.join("|")));
  });

  test("covers AC-8: the headline fields are lifted out of the detail block, nothing is saved twice", () => {
    const r = raw();
    const split = splitResult(r);
    expect(split).toMatchObject({ dhiStart: r.dhiStart, styleKey: r.styleKey, confidence: r.confidence });
    for (const k of ["dhiStart", "styleKey", "confidence", "flags", "answered", "complete"]) expect(split.detail).not.toHaveProperty(k);
    expect(Object.keys(split.detail).sort()).toEqual(["areas", "bottom", "indices", "lowest", "state", "style", "styleGap", "subject", "top"]);
  });

  test("covers AC-2: a lowConsistency that could not be worked out (no seed) is saved as false, never null", () => {
    const noSeed: RawScore = { ...raw(), flags: { ...raw().flags, lowConsistency: null } };
    expect(splitResult(noSeed).flags.lowConsistency).toBe(false);
  });

  test("covers AC-2: the detail block holds only values Convex can store (no undefined)", () => {
    const undefinedAt = (v: unknown, path = ""): string[] =>
      v === undefined ? [path] : v && typeof v === "object" ? Object.entries(v).flatMap(([k, x]) => undefinedAt(x, `${path}.${k}`)) : [];
    expect(undefinedAt(splitResult(raw()).detail)).toEqual([]);
  });
});

describe("the engine", () => {
  test("covers AC-4: ENGINE_VERSION is a whole number of at least 1", () => {
    expect(Number.isInteger(ENGINE_VERSION())).toBe(true);
    expect(ENGINE_VERSION()).toBeGreaterThanOrEqual(1);
  });

  test("covers AC-6: when the scoring engine is not loaded, asking for the version or a score throws instead of returning a guess", () => {
    const saved = engine().DhiScore;
    try {
      engine().DhiScore = undefined;
      expect(() => ENGINE_VERSION()).toThrow("scoring engine not loaded");
      expect(() => scoreAnswers(answers(() => 1), "s")).toThrow("scoring engine not loaded");
    } finally {
      engine().DhiScore = saved;
    }
  });

  test("covers AC-6: an engine without a whole number version is treated as not loaded", () => {
    const saved = engine().DhiScore as { ENGINE_VERSION: unknown };
    try {
      engine().DhiScore = { ...saved, ENGINE_VERSION: "1" };
      expect(() => ENGINE_VERSION()).toThrow("scoring engine not loaded");
    } finally {
      engine().DhiScore = saved;
    }
  });
});
