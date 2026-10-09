// The scoring lock (spec 0005, AC-4). Fixed answers go through the SAME score.js the browser and the server load, and
// the output must equal what was stored for the current DhiScore.ENGINE_VERSION in tests/fixtures/score-lock.json.
//
// To change scoring on purpose: bump ENGINE_VERSION in score.js, then ADD a new version key to the fixture with the
// new output, and add that version's hash to PINNED below. Never edit an older version's entry: those are the results
// real students were given. The pinned hash makes a rewritten entry fail the test, so changing a frozen entry takes a
// visible edit in two places instead of a quiet regenerate.
import { describe, expect, test } from "vitest";
import lock from "../tests/fixtures/score-lock.json";
import { ENGINE_VERSION, scoreAnswers } from "./scoring";

type Case = { answers: Record<string, string>; expected: unknown };
const versions = lock.versions as Record<string, Record<string, Case>>;
const current = versions[String(ENGINE_VERSION())];
const roundTrip = (x: unknown) => JSON.parse(JSON.stringify(x));

// SHA-256 of each version's entry (keys sorted, so formatting and key order do not matter). Add a line for a new version.
const PINNED: Record<string, string> = {
  "1": "24b146e536598962702801999795456de42a52f0f90c0889b6a6dd659ae26f2d",
};
const canon = (v: unknown): string =>
  Array.isArray(v)
    ? "[" + v.map(canon).join(",") + "]"
    : v && typeof v === "object"
      ? "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon((v as Record<string, unknown>)[k])).join(",") + "}"
      : JSON.stringify(v);
const sha256 = async (text: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

describe("scoring lock", () => {
  test("covers AC-4: the fixture has an entry for the current ENGINE_VERSION, and none for a newer one", () => {
    expect(current, `no entry for ENGINE_VERSION ${ENGINE_VERSION()} in tests/fixtures/score-lock.json: add one when you bump the version`).toBeDefined();
    expect(Math.max(...Object.keys(versions).map(Number))).toBe(ENGINE_VERSION());
  });

  test("covers AC-4: every version in the fixture has a pinned hash, and the entry still matches it (a frozen entry was not rewritten)", async () => {
    expect(Object.keys(versions).sort()).toEqual(Object.keys(PINNED).sort());
    for (const [ver, entry] of Object.entries(versions)) {
      expect(await sha256(canon(entry)), `version ${ver}: its locked entry changed. Bump ENGINE_VERSION and add a new entry instead of editing this one`).toBe(PINNED[ver]);
    }
  });

  test("covers AC-4: the locked cases include all first options, a mixed set and a set that triggers every flag", () => {
    expect(Object.keys(current).sort()).toEqual(["allFirstOption", "everyFlag", "mixed"]);
    const flags = (current.everyFlag.expected as { flags: Record<string, boolean> }).flags;
    expect(Object.values(flags).every((f) => f === true)).toBe(true);
  });

  test.each(["allFirstOption", "mixed", "everyFlag"])("covers AC-4: %s scores exactly as locked (change the scoring without bumping ENGINE_VERSION and this fails)", (name) => {
    const { answers, expected } = current[name];
    expect(roundTrip(scoreAnswers(answers, lock.seed))).toEqual(expected);
  });
});
