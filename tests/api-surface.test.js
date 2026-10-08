// Structural checks on the Convex code that no function test can see (spec 0002, AC-9 and AC-14).
// They read the source files, so they fail the day someone adds a function that takes a student id.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const dir = join(process.cwd(), "convex");
const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "testUtils.ts");
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(dir, f), "utf8")]));

// the text of every `args: { ... }` block (up to the matching brace)
function argBlocks(text) {
  const out = [];
  for (const m of text.matchAll(/args:\s*\{/g)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") depth--;
      i++;
    }
    out.push(text.slice(start, i - 1));
  }
  return out;
}

describe("the Convex API surface", () => {
  test("covers AC-9: no student facing function takes a student id, an email or an auth user id as an argument", () => {
    const forbidden = /\b(studentId|authUserId|userId|email|checkId)\b/;
    for (const f of ["students.ts", "checks.ts"]) {
      for (const block of argBlocks(src[f])) {
        expect(block, `${f} args must not name an identity field`).not.toMatch(forbidden);
      }
    }
  });

  test("covers AC-9: every student facing function reads who is calling through helpers.ts, never from its input", () => {
    expect(src["checks.ts"].match(/requireStudent\(ctx\)/g)?.length).toBe(4); // saveAnswers, complete, markReportSeen, importLocal
    expect(src["students.ts"]).toMatch(/requireSignedIn\(ctx\)/);
    expect(src["students.ts"]).toMatch(/getSignedInUser\(ctx\)/);
  });

  test("covers AC-9: the clean up and anything else that touches many students is internal, not callable from a browser", () => {
    expect(src["purge.ts"]).toMatch(/internalMutation\(/);
    expect(src["purge.ts"]).not.toMatch(/export const \w+ = (mutation|query|action)\(/);
  });

  test("covers AC-14: email and password sign in is switched on only by the TEST_SIGNIN_ENABLED flag, read at run time", () => {
    expect(src["auth.ts"]).toMatch(/emailAndPassword:\s*\{\s*enabled:\s*env\.TEST_SIGNIN_ENABLED === "true"/);
  });

  test("covers AC-2: the Google tokens are stored encrypted and no offline access is requested", () => {
    expect(src["auth.ts"]).toMatch(/encryptOAuthTokens:\s*true/);
    expect(src["auth.ts"]).not.toMatch(/accessType\s*:/); // the setting that would ask Google for offline access
  });

  test("covers AC-1: the sign in handshake route is registered once", () => {
    expect(src["http.ts"]).toMatch(/authComponent\.registerRoutes\(http, createAuth\)/);
  });
});
