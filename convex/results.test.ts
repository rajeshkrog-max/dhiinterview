/// <reference types="vite/client" />
// The saved result (spec 0005): checks.complete makes it, results.mine and results.ensure read it. Each test names the criterion it covers.
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { makeBackend, opt, profileInput, signInAs } from "../tests/convexTestUtils";
import { ENGINE_VERSION, scoreAnswers, splitResult } from "./scoring";

type Backend = ReturnType<typeof makeBackend>;
type Student = Awaited<ReturnType<typeof student>>;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `error:${String((e as Error).message).slice(0, 60)}`;
  }
};

async function student(t: Backend) {
  const s = await signInAs(t);
  await s.as.mutation(api.students.createProfile, await profileInput());
  return s;
}
const answersFor = (pick: (n: number) => number) => Array.from({ length: 18 }, (_, i) => ({ q: i + 1, optionId: opt(i + 1, pick(i + 1)), answeredAt: Date.now() }));
const fill = (s: Student, pick: (n: number) => number = () => 2) => s.as.mutation(api.checks.saveAnswers, { answers: answersFor(pick) });
const finished = async (t: Backend, pick: (n: number) => number = () => 2) => {
  const s = await student(t);
  await fill(s, pick);
  await s.as.mutation(api.checks.complete, {});
  return s;
};
const count = (t: Backend, table: "results" | "resultFlags") => t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
const theCheck = (t: Backend) => t.run(async (ctx) => (await ctx.db.query("checks").first())!);
// What an older check looks like: finished, but with no result rows.
const dropResults = (t: Backend) =>
  t.run(async (ctx) => {
    for (const r of await ctx.db.query("resultFlags").collect()) await ctx.db.delete("resultFlags", r._id);
    for (const r of await ctx.db.query("results").collect()) await ctx.db.delete("results", r._id);
  });
const engine = () => (globalThis as unknown as { DhiScore: { score: (...a: unknown[]) => unknown; ENGINE_VERSION: number } }).DhiScore;

afterEach(() => vi.restoreAllMocks());

describe("checks.complete makes the result", () => {
  test("covers AC-1: finishing makes exactly one results row and one resultFlags row, with completedAt set in the same step", async () => {
    const t = makeBackend();
    const s = await finished(t);
    expect(await count(t, "results")).toBe(1);
    expect(await count(t, "resultFlags")).toBe(1);
    const check = await theCheck(t);
    expect(check.completedAt).toBeTypeOf("number");
    const row = await t.run(async (ctx) => (await ctx.db.query("results").first())!);
    expect(row.checkId).toBe(check._id);
    expect(row.engineVersion).toBe(1);
    expect(await s.as.query(api.results.mine, {})).not.toBeNull();
  });

  test("covers AC-1: calling complete again, or from two devices at once, still leaves exactly one of each and the same time", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fill(s);
    const [a, b] = await Promise.all([s.as.mutation(api.checks.complete, {}), s.as.mutation(api.checks.complete, {})]);
    const c = await s.as.mutation(api.checks.complete, {});
    expect(a.completedAt).toBe(b.completedAt);
    expect(c.completedAt).toBe(a.completedAt);
    expect(await count(t, "results")).toBe(1);
    expect(await count(t, "resultFlags")).toBe(1);
  });

  test("covers AC-2: the saved result equals what score.js gives in Node, field for field", async () => {
    const t = makeBackend();
    const pick = (n: number) => (n % 4) + 1;
    const s = await finished(t, pick);
    const mine = await s.as.query(api.results.mine, {});
    const answers = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, opt(i + 1, pick(i + 1))]));
    const want = splitResult(scoreAnswers(answers, (await theCheck(t)).seed));
    expect(mine).toMatchObject({ engineVersion: ENGINE_VERSION(), dhiStart: want.dhiStart, styleKey: want.styleKey, confidence: want.confidence, detail: want.detail, flags: want.flags });
    expect(typeof mine!.flags.lowConsistency).toBe("boolean"); // the seed is always on the server, so this is never unknown
  });

  test("covers AC-2: fewer than 18 answers is refused with answers_missing and no result is made", async () => {
    const t = makeBackend();
    const s = await student(t);
    await s.as.mutation(api.checks.saveAnswers, { answers: answersFor(() => 1).slice(0, 17) });
    expect(await code(s.as.mutation(api.checks.complete, {}))).toBe("answers_missing");
    expect(await count(t, "results")).toBe(0);
    expect((await theCheck(t)).completedAt).toBeUndefined();
  });

  test("covers AC-6: if scoring cannot run, the finish fails whole: still unfinished, all 18 answers kept, nothing saved, and the log names only the check id", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fill(s);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(engine(), "score").mockImplementation(() => {
      throw new Error("boom with some student content");
    });
    expect(await code(s.as.mutation(api.checks.complete, {}))).toBe("scoring_failed");
    const check = await theCheck(t);
    expect(check.completedAt).toBeUndefined();
    expect(await t.run(async (ctx) => (await ctx.db.query("answers").collect()).length)).toBe(18);
    expect(await count(t, "results")).toBe(0);
    expect(await count(t, "resultFlags")).toBe(0);
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain(check._id);
    expect(logged).not.toContain("boom");
    expect(logged).not.toContain("student content");

    vi.restoreAllMocks(); // the cause is gone: tapping Finish again works
    const res = await s.as.mutation(api.checks.complete, {});
    expect(res.completedAt).toBeTypeOf("number");
    expect(await count(t, "results")).toBe(1);
  });

  test("covers AC-7: Finish worked on the server but the device timed out; the retry returns the same time and a result exists", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fill(s);
    const first = await s.as.mutation(api.checks.complete, {});
    const retry = await s.as.mutation(api.checks.complete, {});
    expect(retry).toEqual(first);
    expect(await s.as.query(api.results.mine, {})).not.toBeNull();
  });

  test("covers AC-7: a repeated complete on a check that finished before results existed makes the missing result", async () => {
    const t = makeBackend();
    const s = await finished(t);
    const { completedAt } = await s.as.mutation(api.checks.complete, {});
    await dropResults(t);
    expect(await s.as.query(api.results.mine, {})).toBeNull();
    expect(await s.as.mutation(api.checks.complete, {})).toEqual({ completedAt });
    expect(await count(t, "results")).toBe(1);
    expect(await count(t, "resultFlags")).toBe(1);
  });
});

describe("results.mine and results.ensure", () => {
  test("covers AC-7: ensure on an older finished check makes the result, and two asks at once make one", async () => {
    const t = makeBackend();
    const s = await finished(t);
    await dropResults(t);
    expect(await s.as.query(api.results.mine, {})).toBeNull();
    const [a, b] = await Promise.all([s.as.mutation(api.results.ensure, {}), s.as.mutation(api.results.ensure, {})]);
    expect(a).toEqual(b);
    expect(await count(t, "results")).toBe(1);
    expect(await count(t, "resultFlags")).toBe(1);
    expect(await s.as.query(api.results.mine, {})).toEqual(a);
  });

  test("covers AC-7: ensure on an unfinished check is refused with not_completed and makes nothing", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fill(s);
    expect(await code(s.as.mutation(api.results.ensure, {}))).toBe("not_completed");
    expect(await s.as.query(api.results.mine, {})).toBeNull();
    expect(await count(t, "results")).toBe(0);
  });

  test("covers AC-6: ensure never saves a result unless exactly 18 answers were scored", async () => {
    const t = makeBackend();
    const s = await finished(t);
    await dropResults(t);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("answers").first())!;
      await ctx.db.delete("answers", row._id);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await code(s.as.mutation(api.results.ensure, {}))).toBe("scoring_failed");
    expect(await count(t, "results")).toBe(0);
  });

  test("covers AC-5: a saved result never changes, whatever the scoring becomes afterwards", async () => {
    const t = makeBackend();
    const s = await finished(t, (n) => (n % 4) + 1);
    const before = await s.as.query(api.results.mine, {});
    const rowBefore = await t.run(async (ctx) => (await ctx.db.query("results").first())!);
    const real = engine().score;
    vi.spyOn(engine(), "score").mockImplementation((...a: unknown[]) => ({ ...(real as (...x: unknown[]) => object)(...a), dhiStart: 1, styleKey: "v" }));
    engine().ENGINE_VERSION = 2;
    try {
      await s.as.mutation(api.checks.complete, {});
      await s.as.mutation(api.results.ensure, {});
      expect(await s.as.query(api.results.mine, {})).toEqual(before);
      expect(await t.run(async (ctx) => (await ctx.db.query("results").first())!)).toEqual(rowBefore);
    } finally {
      engine().ENGINE_VERSION = 1;
    }
    expect(await count(t, "results")).toBe(1);
  });

  test("covers AC-8: the flags come back with the owner's result, and the saved detail block holds none", async () => {
    const t = makeBackend();
    const s = await finished(t);
    const mine = await s.as.query(api.results.mine, {});
    expect(Object.keys(mine!.flags).sort()).toEqual(
      ["heavyExpectations", "keepsFeelingsInside", "lowCareerClarity", "lowConsistency", "lowMood", "selfDoubt", "sleepStrain"],
    );
    expect(JSON.stringify(mine!.detail)).not.toMatch(/keepsFeelingsInside|lowCareerClarity|heavyExpectations|selfDoubt|sleepStrain|lowMood|lowConsistency/);
    const row = await t.run(async (ctx) => (await ctx.db.query("results").first())!);
    expect(JSON.stringify(row)).not.toMatch(/selfDoubt|lowMood|sleepStrain/);
  });

  test("covers AC-8 and AC-9: a student only ever receives their own result and flags", async () => {
    const t = makeBackend();
    const a = await finished(t, () => 1);
    const b = await finished(t, () => 4);
    const mineA = await a.as.query(api.results.mine, {});
    const mineB = await b.as.query(api.results.mine, {});
    const seeds = await t.run(async (ctx) => (await ctx.db.query("checks").collect()).map((c) => c.seed));
    expect(seeds.length).toBe(2);
    const want = (pick: number, seed: string) => splitResult(scoreAnswers(Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, opt(i + 1, pick)])), seed));
    const same = (x: unknown, y: unknown) => {
      try {
        expect(x).toEqual(y);
        return true;
      } catch {
        return false;
      }
    };
    const matches = (mine: typeof mineA, pick: number) => seeds.some((seed) => same(mine!.detail, want(pick, seed).detail) && same(mine!.flags, want(pick, seed).flags));
    expect(matches(mineA, 1)).toBe(true);
    expect(matches(mineB, 4)).toBe(true);
    expect(same(mineA!.detail, mineB!.detail)).toBe(false);
    expect((await a.as.mutation(api.results.ensure, {})).detail).toEqual(mineA!.detail);
  });

  test("covers AC-9: a signed out caller is refused by mine and ensure, and a signed in student with no profile is refused too", async () => {
    const t = makeBackend();
    await finished(t);
    expect(await code(t.query(api.results.mine, {}))).toBe("not_signed_in");
    expect(await code(t.mutation(api.results.ensure, {}))).toBe("not_signed_in");
    const bare = await signInAs(t);
    expect(await code(bare.as.query(api.results.mine, {}))).toBe("no_profile");
    expect(await code(bare.as.mutation(api.results.ensure, {}))).toBe("no_profile");
  });
});

// The rules that no single call can show: what the code is allowed to do with the two tables.
describe("what the code may do with results", () => {
  const sources = Object.entries(import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>)
    .filter(([name]) => !name.endsWith(".test.ts") && !name.startsWith("./_generated"));
  const using = (re: RegExp) => sources.filter(([, text]) => re.test(text)).map(([name]) => name).sort();

  test("covers AC-5: no function updates, replaces or deletes a results or resultFlags row", () => {
    expect(using(/db\.(patch|replace|delete)\(\s*["'](results|resultFlags)["']/)).toEqual([]);
  });

  test("covers AC-5 and AC-1: rows are inserted only by makeResult, in resultsCore.ts", () => {
    expect(using(/db\.insert\(\s*["'](results|resultFlags)["']/)).toEqual(["./resultsCore.ts"]);
  });

  test("covers AC-8: the flags table is touched only by the schema and resultsCore.ts, and viewOf (which returns them) is called only by results.ts", () => {
    expect(using(/resultFlags/)).toEqual(["./resultsCore.ts", "./schema.ts"]);
    expect(using(/viewOf\(/)).toEqual(["./results.ts", "./resultsCore.ts"]);
  });

  test("covers AC-8: no flag name appears in any other function's source", () => {
    expect(using(/keepsFeelingsInside|selfDoubt|lowMood|sleepStrain/)).toEqual(["./resultsCore.ts", "./schema.ts", "./scoring.ts"]);
  });

  test("covers AC-11: the Sheet copy, lead and feedback functions read no result, and the Sheet columns hold no result field", async () => {
    const sheetish = sources.filter(([name]) => /^\.\/(sheet|leads|feedback)/.test(name));
    expect(sheetish.length).toBeGreaterThan(4);
    for (const [name, text] of sheetish) expect(text, name).not.toMatch(/["'](results|resultFlags)["']|resultsCore|\.\/results/);
    const { LEADS_HEADER, FEEDBACK_HEADER } = await import("./sheetRowsCore");
    expect([...LEADS_HEADER, ...FEEDBACK_HEADER].join(" ")).not.toMatch(/score|style|flag|result|Dhi start/i);
  });
});

describe("failure and security cases", () => {
  test("covers AC-6: if the scoring engine is not loaded on the server, Finish fails whole with scoring_failed and the retry works once it is back", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fill(s);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const g = globalThis as unknown as { DhiScore?: unknown };
    const saved = g.DhiScore;
    g.DhiScore = undefined;
    try {
      expect(await code(s.as.mutation(api.checks.complete, {}))).toBe("scoring_failed");
      expect((await theCheck(t)).completedAt).toBeUndefined();
      expect(await count(t, "results")).toBe(0);
    } finally {
      g.DhiScore = saved;
    }
    expect(await code(s.as.mutation(api.checks.complete, {}))).toBe("ok");
    expect(await count(t, "results")).toBe(1);
  });

  test("covers AC-6: a failed Finish still leaves the answers editable, so the student can change one and finish", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fill(s);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(engine(), "score").mockImplementation(() => {
      throw new Error("boom");
    });
    expect(await code(s.as.mutation(api.checks.complete, {}))).toBe("scoring_failed");
    expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 3, optionId: opt(3, 4), answeredAt: Date.now() }] }))).toBe("ok");
  });

  test("covers AC-8: the log stays quiet on a good finish, so no result content can leak into it", async () => {
    const t = makeBackend();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await finished(t);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  test("covers AC-8 and AC-9: mine and ensure take no arguments, so another student's check or result id can never be asked for", async () => {
    const t = makeBackend();
    const a = await finished(t);
    const b = await finished(t, () => 4);
    const otherCheck = await t.run(async (ctx) => (await ctx.db.query("checks").order("desc").first())!._id);
    const asked = { checkId: otherCheck, studentId: otherCheck, authUserId: b.userId } as never;
    expect(await code(a.as.query(api.results.mine, asked))).toMatch(/^error:/);
    expect(await code(a.as.mutation(api.results.ensure, asked))).toMatch(/^error:/);
    expect(await code(a.as.mutation(api.checks.complete, asked))).toMatch(/^error:/);
  });

  test("covers AC-9: a student whose check is unfinished never reads anyone else's result through mine", async () => {
    const t = makeBackend();
    await finished(t);
    const other = await student(t);
    await fill(other);
    expect(await other.as.query(api.results.mine, {})).toBeNull();
    expect(await code(other.as.mutation(api.results.ensure, {}))).toBe("not_completed");
  });

  test("covers AC-1: every flags row points at its own result and student", async () => {
    const t = makeBackend();
    await finished(t);
    await finished(t, () => 4);
    const rows = await t.run(async (ctx) => ({
      results: await ctx.db.query("results").collect(),
      flags: await ctx.db.query("resultFlags").collect(),
    }));
    expect(rows.results).toHaveLength(2);
    for (const f of rows.flags) {
      const r = rows.results.find((x) => x._id === f.resultId)!;
      expect(r.studentId).toBe(f.studentId);
    }
    expect(new Set(rows.flags.map((f) => f.resultId)).size).toBe(2);
  });
});
