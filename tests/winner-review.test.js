// The winner review procedure and its CSV helper (spec 0019, AC-2 and AC-6): the helper turns what `convex run` prints into a real CSV
// file, never overwrites, and the written procedure covers who runs it, what to look for, who to contact and deleting the file.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { csvFromRunOutput } from "../tools/winner-csv.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("tools/winner-csv.mjs", () => {
  const csv = 'rank,referrer\r\n1,"Asha R."\r\n';

  test("covers AC-2: the string the CLI prints as JSON becomes the real CSV text, with its line breaks", () => {
    expect(csvFromRunOutput(JSON.stringify(csv) + "\n")).toBe(csv);
    expect(csvFromRunOutput(JSON.stringify(csv))).toBe(csv);
  });

  test("covers AC-2: log lines before the result do not matter, and the last JSON string wins", () => {
    expect(csvFromRunOutput(`some log\r\n"not it"\r\n${JSON.stringify(csv)}\r\n`)).toBe(csv);
  });

  test("covers AC-2: output with no CSV text is an error, never an empty file", () => {
    expect(() => csvFromRunOutput("")).toThrow();
    expect(() => csvFromRunOutput("{ ok: true }")).toThrow();
    expect(() => csvFromRunOutput('"unterminated')).toThrow();
  });

  test("covers AC-2: it asks for a new file name, refuses an existing file and touches nothing", () => {
    const script = fileURLToPath(new URL("../tools/winner-csv.mjs", import.meta.url));
    const usage = spawnSync(process.execPath, [script], { encoding: "utf8" });
    expect(usage.status).toBe(2);
    expect(usage.stderr).toContain("Usage");
    const dir = mkdtempSync(join(tmpdir(), "winner-"));
    try {
      const file = join(dir, "review-test.csv");
      writeFileSync(file, "keep me");
      const again = spawnSync(process.execPath, [script, file], { encoding: "utf8" });
      expect(again.status).toBe(2);
      expect(again.stderr).toContain("already exists");
      expect(readFileSync(file, "utf8")).toBe("keep me");
      const bad = spawnSync(process.execPath, [script, join(dir, "x.csv"), "--oops"], { encoding: "utf8" });
      expect(bad.status).toBe(2);
      expect(existsSync(join(dir, "x.csv"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("covers AC-2: it prints no email, name or note, only the file name and a row count", () => {
    const text = read("tools/winner-csv.mjs");
    const logs = [...text.matchAll(/console\.(?:log|error)\(([^;]*)\);/g)].map((m) => m[1]).join("\n");
    expect(logs).not.toMatch(/\$\{csv\}|stdout|email/i); // the text itself and the raw output are never printed; a row count is
  });

  test("covers AC-2: the review file name stays out of git", () => {
    expect(read(".gitignore")).toMatch(/^review-\*\.csv$/m);
  });
});

describe("tools/WINNER-REVIEW.md (AC-6)", () => {
  const doc = read("tools/WINNER-REVIEW.md");

  test("covers AC-6: who runs it, never in an AI session, and production needs --prod and the owner's yes", () => {
    expect(doc).toMatch(/owner, or one team member the owner names/);
    expect(doc).toMatch(/Never in an AI session/);
    expect(doc).toMatch(/--prod/);
    expect(doc).toMatch(/owner's yes/);
  });

  test("covers AC-6: the three warnings and the whole timeline of each referrer, not just the feedback text", () => {
    for (const w of ["burst", "same_text", "fast_finish"]) expect(doc).toContain(`\`${w}\``);
    expect(doc).toMatch(/whole timeline/);
  });

  test("covers AC-6: every command is named, with the CSV step", () => {
    for (const c of ["challengeAdmin:top10", "challengeAdmin:reject", "challengeAdmin:restore", "challengeAdmin:ranking", "tools/winner-csv.mjs"]) expect(doc).toContain(c);
  });

  test("covers AC-6: how to contact the winner, a parent or guardian under 18, and deleting the CSV after the announcement", () => {
    expect(doc).toMatch(/email/i);
    expect(doc).toMatch(/phone/i);
    expect(doc).toMatch(/under 18/);
    expect(doc).toMatch(/parent or guardian/);
    expect(doc).toMatch(/delete the CSV/i);
  });

  test("covers AC-6: PowerShell quoting is explained, because the team's machine is Windows", () => {
    expect(doc).toMatch(/PowerShell/);
    expect(doc).toContain('\\"');
  });
});
