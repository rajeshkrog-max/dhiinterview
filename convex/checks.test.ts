// saveAnswers, complete, markReportSeen and importLocal (spec 0002). Each test names the criterion it covers.
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { makeBackend, opt, profileInput, signInAs } from "../tests/convexTestUtils";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `error:${String((e as Error).message).slice(0, 60)}`;
  }
};

async function student(t: ReturnType<typeof makeBackend>, over: Record<string, unknown> = {}) {
  const s = await signInAs(t);
  await s.as.mutation(api.students.createProfile, await profileInput(over));
  return s;
}
const answersOf = async (s: Awaited<ReturnType<typeof student>>) => {
  const me = await s.as.query(api.students.me, {});
  return me.state === "ready" ? me.check.answers : {};
};
const rowCount = (t: ReturnType<typeof makeBackend>) => t.run(async (ctx) => (await ctx.db.query("answers").collect()).length);
const now = () => Date.now();
const fillAll = (s: Awaited<ReturnType<typeof student>>, from = 1, to = 18) =>
  s.as.mutation(api.checks.saveAnswers, { answers: Array.from({ length: to - from + 1 }, (_, i) => ({ q: from + i, optionId: opt(from + i, 2), answeredAt: now() })) });

describe("checks.saveAnswers", () => {
  test("covers AC-5: a saved answer comes back through me, on any device", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 3, optionId: opt(3, 4), answeredAt: now() }] })).toEqual({ saved: 1 });
    expect(await answersOf(s)).toEqual({ q3: "q3o4" });
  });

  test("covers AC-6: a question number outside 1 to 18 is refused and nothing is written", async () => {
    const t = makeBackend();
    const s = await student(t);
    for (const q of [0, 19, -1, 1.5]) {
      expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q, optionId: opt(q), answeredAt: now() }] }))).toBe("invalid_input");
    }
    expect(await rowCount(t)).toBe(0);
  });

  test("covers AC-6: an option id that does not belong to that question, or is not 1 to 4, is refused", async () => {
    const t = makeBackend();
    const s = await student(t);
    for (const optionId of ["q4o1", "q3o5", "q3o0", "q3", "o1", "x3o1", ""]) {
      expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 3, optionId, answeredAt: now() }] }))).toBe("invalid_input");
    }
    expect(await rowCount(t)).toBe(0);
  });

  // Regression (found by /test, fixed by /debug): optionBelongsTo compared the number inside the id, so the padded id
  // "q03o1" was accepted for question 3 and stored as text the scoring and report cannot read. Ids are exactly `q<q>o<1 to 4>`.
  test("covers AC-6: a padded or otherwise non standard option id such as q03o1 is refused and nothing is stored", async () => {
    const t = makeBackend();
    const s = await student(t);
    for (const optionId of ["q03o1", "q003o1", "q3o01", " q3o1", "q3o1 ", "Q3O1", "q3o1\u000a"]) {
      expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 3, optionId, answeredAt: now() }] })), optionId).toBe("invalid_input");
    }
    expect(await rowCount(t)).toBe(0);
    expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 3, optionId: "q3o1", answeredAt: now() }] }))).toBe("ok"); // the exact id still works
  });

  test("covers AC-6: an empty batch, more than 18 answers, or the same question twice is refused", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [] }))).toBe("invalid_input");
    const nineteen = Array.from({ length: 19 }, (_, i) => ({ q: (i % 18) + 1, optionId: opt((i % 18) + 1), answeredAt: now() }));
    expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: nineteen }))).toBe("invalid_input");
    expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 3, optionId: opt(3, 1), answeredAt: now() }, { q: 3, optionId: opt(3, 2), answeredAt: now() }] }))).toBe("invalid_input");
    expect(await rowCount(t)).toBe(0);
  });

  test("covers AC-5 and AC-6: a batch is all or nothing, one bad answer saves none of them", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(
      await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 1, optionId: opt(1), answeredAt: now() }, { q: 2, optionId: "q9o1", answeredAt: now() }] })),
    ).toBe("invalid_input");
    expect(await answersOf(s)).toEqual({});
  });

  test("covers AC-5: the same option sent again is a no op, and a different option changes the answer in place (one row per question)", async () => {
    const t = makeBackend();
    const s = await student(t);
    const t1 = now() - 1000;
    await s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 5, optionId: opt(5, 1), answeredAt: t1 }] });
    await s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 5, optionId: opt(5, 1), answeredAt: t1 }] });
    expect(await rowCount(t)).toBe(1);
    await s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 5, optionId: opt(5, 3), answeredAt: now() }] });
    expect(await rowCount(t)).toBe(1);
    expect(await answersOf(s)).toEqual({ q5: "q5o3" });
  });

  test("covers AC-5: an older answer time never replaces a newer stored answer", async () => {
    const t = makeBackend();
    const s = await student(t);
    await s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 5, optionId: opt(5, 3), answeredAt: now() }] });
    await s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 5, optionId: opt(5, 1), answeredAt: now() - 60_000 }] });
    expect(await answersOf(s)).toEqual({ q5: "q5o3" });
  });

  test("covers AC-5: an answer time from the future (a device clock that is wrong) is cut down to the server time", async () => {
    const t = makeBackend();
    const s = await student(t);
    await s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 1, optionId: opt(1), answeredAt: now() + 365 * 86400000 }] });
    const after = now();
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("answers").collect())[0];
      expect(row.answeredAt).toBeLessThanOrEqual(after);
    });
  });

  test("covers AC-5: two simultaneous saves of one question end with one row", async () => {
    const t = makeBackend();
    const s = await student(t);
    await Promise.all([
      s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 7, optionId: opt(7, 1), answeredAt: now() }] }),
      s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 7, optionId: opt(7, 2), answeredAt: now() }] }),
    ]);
    expect(await rowCount(t)).toBe(1);
  });

  test("covers AC-9: answers land only on the signed in student's own check, and are never visible to another student", async () => {
    const t = makeBackend();
    const a = await student(t);
    const b = await student(t);
    await a.as.mutation(api.checks.saveAnswers, { answers: [{ q: 1, optionId: opt(1, 1), answeredAt: now() }] });
    await b.as.mutation(api.checks.saveAnswers, { answers: [{ q: 1, optionId: opt(1, 4), answeredAt: now() }] });
    expect(await answersOf(a)).toEqual({ q1: "q1o1" });
    expect(await answersOf(b)).toEqual({ q1: "q1o4" });
  });

  test("covers AC-9: a visitor with no session, or a signed in account with no profile, cannot save", async () => {
    const t = makeBackend();
    const input = { answers: [{ q: 1, optionId: opt(1), answeredAt: now() }] };
    expect(await code(t.mutation(api.checks.saveAnswers, input))).toBe("not_signed_in");
    const noProfile = await signInAs(t);
    expect(await code(noProfile.as.mutation(api.checks.saveAnswers, input))).toBe("no_profile");
  });

  test("covers AC-9: functions refuse extra arguments such as a student id", async () => {
    const t = makeBackend();
    const s = await student(t);
    const sneaky = { answers: [{ q: 1, optionId: opt(1), answeredAt: now() }], studentId: "abc" } as unknown as { answers: { q: number; optionId: string; answeredAt: number }[] };
    expect(await code(s.as.mutation(api.checks.saveAnswers, sneaky))).toMatch(/^error:/);
    expect(await rowCount(t)).toBe(0);
  });
});

describe("checks.complete", () => {
  test("covers AC-7: finishing with 17 answers is refused, with 18 it works", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fillAll(s, 1, 17);
    expect(await code(s.as.mutation(api.checks.complete, {}))).toBe("answers_missing");
    await fillAll(s, 18, 18);
    expect(await code(s.as.mutation(api.checks.complete, {}))).toBe("ok");
  });

  test("covers AC-7: finishing sets the time once and calling it again returns the same time", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fillAll(s);
    const first = await s.as.mutation(api.checks.complete, {});
    const second = await s.as.mutation(api.checks.complete, {});
    expect(second).toEqual(first);
    const me = await s.as.query(api.students.me, {});
    if (me.state === "ready") expect(me.check.completedAt).toBe(first.completedAt);
  });

  test("covers AC-7: after finishing, answers cannot be changed and nothing is written", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fillAll(s);
    await s.as.mutation(api.checks.complete, {});
    const before = await answersOf(s);
    expect(await code(s.as.mutation(api.checks.saveAnswers, { answers: [{ q: 3, optionId: opt(3, 4), answeredAt: now() }] }))).toBe("check_completed");
    expect(await answersOf(s)).toEqual(before);
  });

  test("covers AC-9: another student's answers do not count towards my finish", async () => {
    const t = makeBackend();
    const a = await student(t);
    const b = await student(t);
    await fillAll(a);
    expect(await code(b.as.mutation(api.checks.complete, {}))).toBe("answers_missing");
  });
});

describe("checks.markReportSeen", () => {
  test("covers AC-4: refused before the check is finished, then set once and returned unchanged on repeat", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await code(s.as.mutation(api.checks.markReportSeen, {}))).toBe("not_completed");
    await fillAll(s);
    await s.as.mutation(api.checks.complete, {});
    const first = await s.as.mutation(api.checks.markReportSeen, {});
    const second = await s.as.mutation(api.checks.markReportSeen, {});
    expect(second).toEqual(first);
    const me = await s.as.query(api.students.me, {});
    if (me.state === "ready") expect(me.check.reportSeenAt).toBe(first.reportSeenAt);
  });
});

describe("checks.importLocal", () => {
  test("covers AC-11: imports well formed answers once and marks the check imported", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await s.as.mutation(api.checks.importLocal, { answers: { q1: "q1o2", q2: "q2o3" } })).toEqual({ imported: 2 });
    expect(await answersOf(s)).toEqual({ q1: "q1o2", q2: "q2o3" });
    await t.run(async (ctx) => {
      expect((await ctx.db.query("checks").collect())[0].source).toBe("imported");
    });
  });

  test("covers AC-11: a second import is refused, and so is an import over existing answers", async () => {
    const t = makeBackend();
    const s = await student(t);
    await s.as.mutation(api.checks.importLocal, { answers: { q1: "q1o2" } });
    expect(await code(s.as.mutation(api.checks.importLocal, { answers: { q5: "q5o1" } }))).toBe("already_has_answers");
    const other = await student(t);
    await other.as.mutation(api.checks.saveAnswers, { answers: [{ q: 1, optionId: opt(1), answeredAt: now() }] });
    expect(await code(other.as.mutation(api.checks.importLocal, { answers: { q5: "q5o1" } }))).toBe("already_has_answers");
  });

  test("covers AC-6 and AC-11: badly formed imports are refused and nothing is stored", async () => {
    const t = makeBackend();
    const s = await student(t);
    const badImports: Record<string, string>[] = [{}, { q0: "q0o1" }, { q19: "q19o1" }, { q1: "q2o1" }, { q1: "q1o9" }, { x: "q1o1" }, { q01: "q1o1" }, { q01: "q01o1" }, { q1: "q01o1" }];
    for (const answers of badImports) {
      expect(await code(s.as.mutation(api.checks.importLocal, { answers }))).toBe("invalid_input");
    }
    expect(await rowCount(t)).toBe(0);
    await t.run(async (ctx) => {
      expect((await ctx.db.query("checks").collect())[0].source).toBe("fresh");
    });
  });

  test("covers AC-11: a full set of 18 imports but the check stays unfinished (it goes to the finish step)", async () => {
    const t = makeBackend();
    const s = await student(t);
    const all = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, opt(i + 1, 1)]));
    expect(await s.as.mutation(api.checks.importLocal, { answers: all })).toEqual({ imported: 18 });
    const me = await s.as.query(api.students.me, {});
    if (me.state === "ready") expect(me.check.completedAt).toBeNull();
  });

  test("covers AC-7: an import into a finished check is refused", async () => {
    const t = makeBackend();
    const s = await student(t);
    await fillAll(s);
    await s.as.mutation(api.checks.complete, {});
    expect(await code(s.as.mutation(api.checks.importLocal, { answers: { q1: "q1o1" } }))).toBe("check_completed");
  });
});
