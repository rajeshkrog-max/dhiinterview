// feedback.submit and the note rules (spec 0003). Each test names the criterion it covers.
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { isGenuine } from "./feedbackRules";
import { finishedStudent, makeBackend, profileInput, signInAs } from "../tests/convexTestUtils";

type Backend = ReturnType<typeof makeBackend>;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `error:${String((e as Error).message).slice(0, 60)}`;
  }
};
const NOTE = "The study blueprint really fits how I revise before exams.";
const body = (over: Record<string, unknown> = {}) => ({ rating: 4, text: NOTE, canShare: false, ...over });
const count = (t: Backend) => t.run(async (ctx) => (await ctx.db.query("feedback").collect()).length);
const seen = async (t: Backend, over: Record<string, unknown> = {}) => {
  const s = await finishedStudent(t, over);
  await s.as.mutation(api.checks.markReportSeen, {});
  return s;
};

describe("feedbackRules.isGenuine", () => {
  test("covers AC-9: length, distinct letters and repeated characters", () => {
    expect(isGenuine(NOTE)).toBe(true);
    expect(isGenuine("a".repeat(40))).toBe(false); // one letter repeated
    expect(isGenuine("abab abab abab abab abab abab abab")).toBe(false); // 2 distinct letters
    expect(isGenuine("abcd abcd abcd abcd abcd abcd abcd")).toBe(false); // 4 distinct letters
    expect(isGenuine("abcde abcde abcde abcde abcde ab")).toBe(true); // 5 distinct letters
    expect(isGenuine("this report was great!!!!! really")).toBe(false); // five ! in a row
    expect(isGenuine("x".repeat(29))).toBe(false); // under 30
    expect(isGenuine("यह रिपोर्ट मेरे बारे में बहुत सही बताती है")).toBe(true); // Devanagari counts
  });
});

describe("feedback.submit", () => {
  test("covers AC-8, AC-9: a finished check whose report was opened saves rating, note and share choice, and the server decides genuine", async () => {
    const t = makeBackend();
    const s = await seen(t);
    expect(await s.as.mutation(api.feedback.submit, body({ canShare: true }))).toEqual({ ok: true, alreadySaved: false, genuine: true });
    const row = await t.run(async (ctx) => (await ctx.db.query("feedback").collect())[0]);
    expect([row.rating, row.text, row.chars, row.genuine, row.canShare]).toEqual([4, NOTE, NOTE.length, true, true]);
    const me = await s.as.query(api.students.me, {});
    expect(me.state === "ready" && typeof me.check.feedbackSavedAt).toBe("number");
    expect(JSON.stringify(me)).not.toContain("blueprint");
  });

  test("covers AC-9: a long junk note is saved with genuine false, a normal one with true", async () => {
    const t = makeBackend();
    const junk = await seen(t);
    expect(await junk.as.mutation(api.feedback.submit, body({ text: "a".repeat(40) }))).toEqual({ ok: true, alreadySaved: false, genuine: false });
    const four = await seen(t);
    expect(await four.as.mutation(api.feedback.submit, body({ text: "abcd ".repeat(8) }))).toMatchObject({ ok: true, genuine: false });
  });

  test("covers AC-9: a note under 30 or over 1000 characters, and a rating outside 1 to 5, are refused and nothing is written", async () => {
    const t = makeBackend();
    const s = await seen(t);
    for (const over of [{ text: "x".repeat(29) }, { text: " ".repeat(10) + "short note " + " ".repeat(40) }, { text: NOTE.repeat(20) }, { rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: NaN }]) {
      expect(await s.as.mutation(api.feedback.submit, body(over))).toEqual({ ok: false, code: "invalid_input" });
    }
    expect(await count(t)).toBe(0);
  });

  test("covers AC-8: an unfinished check is not_completed, and a report not opened is report_not_seen", async () => {
    const t = makeBackend();
    const open = await signInAs(t);
    await open.as.mutation(api.students.createProfile, await profileInput());
    expect(await open.as.mutation(api.feedback.submit, body())).toEqual({ ok: false, code: "not_completed" });
    const fresh = await finishedStudent(t);
    expect(await fresh.as.mutation(api.feedback.submit, body())).toEqual({ ok: false, code: "report_not_seen" });
    expect(await count(t)).toBe(0);
  });

  test("covers AC-10: a second submit changes nothing and says it was already saved", async () => {
    const t = makeBackend();
    const s = await seen(t);
    await s.as.mutation(api.feedback.submit, body());
    expect(await s.as.mutation(api.feedback.submit, body({ rating: 1, text: "A completely different note that is long enough." }))).toEqual({ ok: true, alreadySaved: true, genuine: true });
    expect(await count(t)).toBe(1);
    const row = await t.run(async (ctx) => (await ctx.db.query("feedback").collect())[0]);
    expect([row.rating, row.text]).toEqual([4, NOTE]);
  });

  test("covers AC-10: two submits at once leave one row", async () => {
    const t = makeBackend();
    const s = await seen(t);
    const results = await Promise.all([s.as.mutation(api.feedback.submit, body()), s.as.mutation(api.feedback.submit, body())]);
    expect(results.filter((r) => r.ok && !r.alreadySaved)).toHaveLength(1);
    expect(await count(t)).toBe(1);
  });

  test("covers AC-11: the 11th call in an hour is refused with rate_limited, and refused attempts used tokens", async () => {
    const t = makeBackend();
    const s = await seen(t);
    for (let i = 0; i < 10; i++) expect(await s.as.mutation(api.feedback.submit, body({ rating: 0 }))).toEqual({ ok: false, code: "invalid_input" });
    expect(await s.as.mutation(api.feedback.submit, body())).toEqual({ ok: false, code: "rate_limited" });
    expect(await count(t)).toBe(0);
  });

  test("covers AC-11: the limit is per student, not shared", async () => {
    const t = makeBackend();
    const a = await seen(t);
    const b = await seen(t);
    for (let i = 0; i < 10; i++) await a.as.mutation(api.feedback.submit, body({ rating: 0 }));
    expect(await a.as.mutation(api.feedback.submit, body())).toMatchObject({ code: "rate_limited" });
    expect(await b.as.mutation(api.feedback.submit, body())).toMatchObject({ ok: true });
  });

  test("covers AC-12: no session cannot call it, and it takes no student id", async () => {
    const t = makeBackend();
    expect(await code(t.mutation(api.feedback.submit, body()))).toBe("not_signed_in");
    const bare = await signInAs(t);
    expect(await code(bare.as.mutation(api.feedback.submit, body()))).toBe("no_profile");
    const s = await seen(t);
    // an extra argument naming someone else is not accepted by the validators
    expect(await code(s.as.mutation(api.feedback.submit, { ...body(), studentId: "x" } as never))).not.toBe("ok");
  });
});
