// The per student option shuffle (spec 0002, AC-4): the order comes only from the server seed, so it is the same
// on every device and differs between students. score.js is pure and runs in Node after questions.js.
import { beforeAll, describe, expect, test } from "vitest";

let Score, Q;
beforeAll(async () => {
  await import("../public/dhiinterviews/js/engine/questions.js");
  await import("../public/dhiinterviews/js/engine/score.js");
  Score = globalThis.DhiScore;
  Q = globalThis.DhiQuestions;
});

describe("DhiScore.order", () => {
  test("covers AC-4: the same seed gives the same order every time (any device)", () => {
    for (let n = 1; n <= 18; n++) expect(Score.order(n, "seed-A")).toEqual(Score.order(n, "seed-A"));
  });

  test("covers AC-4: every question shows all four of its own option ids, once each", () => {
    for (let n = 1; n <= 18; n++) {
      const ids = Score.order(n, "seed-A");
      expect([...ids].sort()).toEqual([1, 2, 3, 4].map((k) => `q${n}o${k}`));
    }
  });

  test("covers AC-4: different students (different seeds) get different orders for at least some questions", () => {
    let differing = 0;
    for (let n = 1; n <= 18; n++) if (Score.order(n, "seed-A").join() !== Score.order(n, "seed-B").join()) differing++;
    expect(differing).toBeGreaterThan(5);
  });

  test("covers AC-4: the order does not depend on a name or a date any more (the old seed is gone)", () => {
    expect(Score.seedOf).toBeUndefined();
  });

  test("covers AC-5: the answers stored are option ids, which score the same whatever the screen order was", () => {
    const answers = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, `q${i + 1}o2`]));
    const a = Score.score(answers, { seed: "seed-A" });
    const b = Score.score(answers, { seed: "seed-B" });
    expect(a.styleKey).toBe(b.styleKey);
    expect(Q.TOTAL).toBe(18);
  });
});
