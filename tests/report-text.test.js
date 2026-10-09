// The report words file (spec 0005, AC-12 and AC-3): the report version and the band word live here, not in score.js.
import { beforeAll, describe, expect, test } from "vitest";

let T, Score;
beforeAll(async () => {
  globalThis.window = globalThis; // reportText.js hangs its object on `window`, like a page
  await import("../public/dhiinterviews/js/engine/questions.js");
  await import("../public/dhiinterviews/js/engine/score.js");
  await import("../public/dhiinterviews/js/engine/reportText.js");
  T = globalThis.DhiReportText;
  Score = globalThis.DhiScore;
});

describe("report text", () => {
  test("covers AC-12: REPORT_VERSION exists as DhiReportText.VERSION, a whole number starting at 1", () => {
    expect(Number.isInteger(T.VERSION)).toBe(true);
    expect(T.VERSION).toBeGreaterThanOrEqual(1);
  });

  test("covers AC-3: band moved out of DhiScore into reportText.js and uses the same cut points as the scoring", () => {
    expect(Score.band).toBeUndefined();
    expect([0, 44, 45, 69, 70, 100].map(T.band)).toEqual(["Next to grow", "Next to grow", "Growing", "Growing", "Strong", "Strong"]);
    // every area band score.js saves is one of the words the report knows
    const answers = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, `q${i + 1}o${(i % 4) + 1}`]));
    const result = Score.score(answers, { seed: "s" });
    for (const a of Object.values(result.areas)) {
      expect(a.band).toBe(T.band(a.score));
      expect(T.bands[a.band]).toBeDefined();
    }
  });

  test("covers AC-4: score.js carries ENGINE_VERSION as a whole number", () => {
    expect(Number.isInteger(Score.ENGINE_VERSION)).toBe(true);
  });
});
