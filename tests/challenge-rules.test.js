// The challenge rules that the browser repeats must equal the server's (spec 0015, AC-4; spec 0016, AC-1). The deadline is written in
// convex/challengeRules.ts and again in challenge-config.js; the code pattern is written there and again in js/api.js. This fails if they differ.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CODE_RE, ENDS_AT_ISO } from "../convex/challengeRules";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("rules the browser repeats", () => {
  test("covers AC-4: the deadline in challenge-config.js is the server's deadline", () => {
    expect(read("public/dhiinterviews/js/challenge-config.js")).toContain(`endsAt: "${ENDS_AT_ISO}"`);
  });

  test("covers AC-4: js/api.js has no deadline of its own that could differ", () => {
    const api = read("public/dhiinterviews/js/api.js");
    const dates = api.match(/\d{4}-\d{2}-\d{2}T[\d:+.-]+/g) || [];
    for (const d of dates) expect(d, d).toBe(ENDS_AT_ISO);
  });

  test("covers 0016 AC-1: the code pattern in js/api.js is the server's pattern", () => {
    const m = read("public/dhiinterviews/js/api.js").match(/var CODE_RE = \/(.+)\/;/);
    expect(m && m[1]).toBe(CODE_RE.source);
  });
});
