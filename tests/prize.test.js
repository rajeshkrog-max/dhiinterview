// The prize amount is written once for the browser screens (challenge-config.js) and once for the built pages
// (src/lib/prize.ts). This fails if they differ, or if the old amount comes back anywhere a student reads it.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PRIZE_AMOUNT, PRIZE_TITLE } from "../src/lib/prize";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("prize amount", () => {
  test("the browser config and the built pages say the same thing", () => {
    const cfg = read("public/dhiinterviews/js/challenge-config.js");
    expect(cfg).toContain(`amount: "${PRIZE_AMOUNT}"`);
    expect(cfg).toContain(`title: "${PRIZE_TITLE}"`);
  });

  test("no screen types the amount by hand, and the old amount is gone", () => {
    const files = [
      "public/dhiinterviews/js/challenge-ui.js",
      "public/dhiinterviews/js/challenge.js",
      "public/dhiinterviews/js/leaderboard.js",
      "src/pages/dhiinterviews/terms.astro",
      "src/pages/dhiinterviews/leaderboard.astro",
      "src/pages/dhiinterviews/challenge.astro",
      "public/dhiinterviews/js/challenge-config.js",
    ];
    for (const f of files) expect(read(f), f).not.toMatch(/2,?999/);
    for (const f of files.slice(0, 6)) expect(read(f), f).not.toMatch(/₹\s?\d/);
  });

  test("the terms and the leaderboard line print the shared amount", () => {
    expect(read("src/pages/dhiinterviews/terms.astro")).toContain("{PRIZE_AMOUNT}");
    expect(read("src/pages/dhiinterviews/leaderboard.astro")).toContain("PRIZE_TITLE");
  });
});
