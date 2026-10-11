// The winner review commands (spec 0015 M4; spec 0019): the top 10 with evidence and warnings, the CSV, reject and restore, and the ranking
// after review. Each test names the criterion it covers. These are internal functions, run here the way `npx convex run` runs them.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { BURST_WINDOW_MS, CSV_COLUMNS, burstIds, csvCell, normalizeNote, sameTextIds, toCsv } from "./challengeAdminCore";
import { recount } from "./challengeCore";
import { ENDS_AT_MS } from "./challengeRules";
import { makeBackend, opt, profileInput, signInAs, type Backend } from "../tests/convexTestUtils";

vi.setConfig({ testTimeout: 30_000 });

const AUTH_ENV = { BETTER_AUTH_URL: "https://example.test", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOTE_A = "I liked how calm and clear this report felt to read.";
const NOTE_B = "The study blueprint really fits how I revise before exams.";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(Date.parse("2026-10-20T10:00:00+05:30"));
  Object.assign(process.env, AUTH_ENV);
  process.env.CHALLENGE_LIVE = "true";
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
  delete process.env.CHALLENGE_LIVE;
});

// A signed in student with a profile and a finished check. `gapMs` is the time between the first answer and finishing; `code` is the referral
// code sent with the form.
async function student(t: Backend, opts: { name?: string; code?: string; gapMs?: number } = {}) {
  const s = await signInAs(t, { sessionDays: 900 });
  await s.as.mutation(api.students.createProfile, await profileInput({ name: opts.name ?? "Asha Rao", ...(opts.code ? { referralCode: opts.code } : {}) }));
  await s.as.mutation(api.checks.saveAnswers, { answers: Array.from({ length: 18 }, (_, i) => ({ q: i + 1, optionId: opt(i + 1, 2), answeredAt: Date.now() })) });
  if (opts.gapMs) vi.setSystemTime(Date.now() + opts.gapMs);
  await s.as.mutation(api.checks.complete, {});
  return s;
}
type Student = Awaited<ReturnType<typeof student>>;

async function referrer(t: Backend, name = "Raj Mehta") {
  const s = await student(t, { name, gapMs: 10 * MIN });
  const r = await s.as.mutation(api.challenge.join, { rulesAccepted: true });
  if (!r.ok) throw new Error(`join refused: ${r.code}`);
  return { s, code: r.code };
}
// A friend who signed up with the code and did every step with `note`, finishing `gapMs` after the first answer.
async function friend(t: Backend, code: string, opts: { note?: string; name?: string; gapMs?: number } = {}) {
  const f = await student(t, { name: opts.name ?? "Friend One", code, gapMs: opts.gapMs ?? 10 * MIN });
  await f.as.mutation(api.checks.markReportSeen, {});
  await f.as.mutation(api.feedback.submit, { rating: 5, text: opts.note ?? NOTE_A, canShare: false });
  return f;
}
const run = (t: Backend) => t.mutation(internal.challengeBoard.run, {});
const idOf = (t: Backend, s: Student) => t.run(async (ctx) => (await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", s.email)).unique())!._id);
const entryOf = async (t: Backend, s: Student) => {
  const studentId = await idOf(t, s);
  return await t.run(async (ctx) => (await ctx.db.query("challengeEntries").withIndex("by_studentId", (q) => q.eq("studentId", studentId)).first())!);
};
const referralOf = (t: Backend, f: Student) =>
  t.run(async (ctx) => {
    const id = (await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", f.email)).unique())!._id;
    return (await ctx.db.query("referrals").withIndex("by_friendId", (q) => q.eq("friendId", id)).first())!;
  });

// Straight into the tables: `n` valid referrals for a referrer, from bare student rows (no check), each counted at `validAt`.
async function seedValid(t: Backend, referrerId: Id<"students">, n: number, validAt: number, usedAt = validAt - 5 * HOUR) {
  await t.run(async (ctx) => {
    for (let i = 0; i < n; i++) {
      const friendId = await ctx.db.insert("students", { authUserId: `seed${Math.random()}`, email: `seed${Math.random().toString(36).slice(2)}@example.com`, name: "Seed Friend", age: 20, class: "College" });
      await ctx.db.insert("referrals", { referrerId, friendId, code: "TESTCODE", usedAt, status: "valid", validAt });
    }
    await recount(ctx, referrerId);
  });
}

const top10 = (t: Backend) => t.query(internal.challengeAdmin.top10, {});
const ranking = (t: Backend) => t.query(internal.challengeAdmin.ranking, {});
const reject = (t: Backend, args: { referralId?: Id<"referrals">; friendEmail?: string; reason?: string; note?: string }) =>
  t.mutation(internal.challengeAdmin.reject, { reason: "same feedback text", note: "matches three others", ...args });
const restore = (t: Backend, args: { referralId?: Id<"referrals">; friendEmail?: string; reason?: string; note?: string }) =>
  t.mutation(internal.challengeAdmin.restore, { reason: "checked by phone", note: "real student", ...args });

describe("the top 10 (0019 AC-1, AC-4)", () => {
  test("covers AC-1: referrers in the board's order by live counts, with each referral's steps, the note, the friend's email and the status", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    const b = await referrer(t, "Bhavna Iyer");
    const f1 = await friend(t, a.code, { name: "Ravi Kumar", note: NOTE_A });
    await friend(t, a.code, { name: "Mira Das", note: NOTE_B });
    await friend(t, b.code, { name: "Zed Zane", note: "Another real note about how the report felt." });
    await student(t, { name: "Still Going", code: a.code }); // signed up with the code, nothing more: pending
    await run(t);

    const rows = await top10(t);
    expect(rows.map((r) => [r.rank, r.name, r.validCount, r.pendingCount])).toEqual([[1, "Aarav S.", 2, 1], [2, "Bhavna I.", 1, 0]]);
    expect(rows[0]).toMatchObject({ email: a.s.email, class: "College", moreReferralsNotShown: false });
    const ravi = rows[0].referrals.find((x) => x.friendEmail === f1.email)!;
    expect(ravi).toMatchObject({
      status: "valid",
      rejectReason: null,
      reviewNote: null,
      check: "fresh",
      feedbackGenuine: true,
      feedbackText: NOTE_A,
    });
    for (const k of ["signedUpAt", "completedAt", "reportSeenAt", "feedbackAt"] as const) expect(ravi[k], k).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(rows[0].referrals.map((x) => x.status).sort()).toEqual(["pending", "valid", "valid"]);
    const pending = rows[0].referrals.find((x) => x.status === "pending")!;
    expect(pending).toMatchObject({ completedAt: expect.any(String), reportSeenAt: null, feedbackAt: null, feedbackText: null });
  });

  test("covers AC-1: only the top 10 are listed, even with 12 referrers, in total order", async () => {
    const t = makeBackend();
    const ids: Id<"students">[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await referrer(t, `Person${String.fromCharCode(65 + i)} Test`);
      await seedValid(t, await idOf(t, r.s), 12 - i, Date.parse("2026-10-20T12:00:00+05:30"));
      ids.push(await idOf(t, r.s));
    }
    const rows = await top10(t);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.validCount)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    expect((await ranking(t)).map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ids).toHaveLength(12);
  });

  test("covers AC-4: ranking is the short list from live data and follows the board's tie rule", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    const b = await referrer(t, "Bhavna Iyer");
    await seedValid(t, await idOf(t, a.s), 7, Date.parse("2026-10-20T14:00:00+05:30"));
    await seedValid(t, await idOf(t, b.s), 7, Date.parse("2026-10-20T13:30:00+05:30"));
    const out = await ranking(t);
    expect(out.map((r) => [r.rank, r.name, r.validCount])).toEqual([[1, "Bhavna I.", 7], [2, "Aarav S.", 7]]);
    expect(Object.keys(out[0]).sort()).toEqual(["class", "email", "lastValidAt", "name", "rank", "validCount"]);
  });

  test("covers AC-1: with no valid referral yet both commands answer with nothing", async () => {
    const t = makeBackend();
    await referrer(t);
    expect(await top10(t)).toEqual([]);
    expect(await ranking(t)).toEqual([]);
  });
});

describe("the warnings (0019 AC-1, AC-7)", () => {
  test("covers AC-7: six referrals inside one hour are a burst, five are not, and six spread over two hours are not", () => {
    const at = (min: number) => min * MIN;
    const six = [0, 5, 10, 20, 40, 60].map((m, i) => ({ id: `a${i}`, at: at(m) }));
    expect([...burstIds(six)].sort()).toEqual(["a0", "a1", "a2", "a3", "a4", "a5"]);
    expect(burstIds(six.slice(0, 5)).size).toBe(0);
    expect(burstIds([0, 20, 40, 61, 80, 100].map((m, i) => ({ id: `b${i}`, at: at(m) }))).size).toBe(0);
    // a burst inside a longer spread marks only the referrals in it
    const mixed = [...[0, 1, 2, 3, 4, 5].map((m, i) => ({ id: `m${i}`, at: at(m) })), { id: "far", at: at(500) }];
    expect(burstIds(mixed).has("far")).toBe(false);
    expect(burstIds(mixed).size).toBe(6);
    expect(BURST_WINDOW_MS).toBe(HOUR);
  });

  test("covers AC-7: notes are the same when only case and spacing differ; empty notes are never the same", () => {
    expect(normalizeNote("  Hello   There\n")).toBe("hello there");
    const ids = sameTextIds([{ id: "1", text: "Great  report" }, { id: "2", text: "great report " }, { id: "3", text: "different" }, { id: "4", text: "" }, { id: "5", text: "" }, { id: "6", text: null }]);
    expect([...ids].sort()).toEqual(["1", "2"]);
  });

  test("covers AC-1, AC-7: a referrer with six friends in one hour shows 'burst' on those six", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    const referrerId = await idOf(t, a.s);
    await seedValid(t, referrerId, 6, Date.now(), Date.now() - 10 * MIN); // all six signed up in one hour
    const [row] = await top10(t);
    expect(row.referrals).toHaveLength(6);
    for (const r of row.referrals) expect(r.warnings).toContain("burst");
    // a fifth-and-below referrer is clean
    const b = await referrer(t, "Bhavna Iyer");
    await seedValid(t, await idOf(t, b.s), 5, Date.now(), Date.now() - 10 * MIN);
    const rows = await top10(t);
    const clean = rows.find((r) => r.name === "Bhavna I.")!;
    for (const r of clean.referrals) expect(r.warnings).not.toContain("burst");
  });

  test("covers AC-1, AC-7: the same note on two referrals is flagged on both, also across two referrers, and different notes are not", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    const b = await referrer(t, "Bhavna Iyer");
    const same1 = await friend(t, a.code, { name: "One Same", note: NOTE_A });
    await friend(t, a.code, { name: "Two Other", note: NOTE_B });
    const same2 = await friend(t, b.code, { name: "Three Same", note: `  ${NOTE_A.toUpperCase()} ` });
    await run(t);
    const rows = await top10(t);
    const byEmail = new Map(rows.flatMap((r) => r.referrals).map((x) => [x.friendEmail, x.warnings]));
    expect(byEmail.get(same1.email)).toContain("same_text");
    expect(byEmail.get(same2.email)).toContain("same_text");
    expect(rows.flatMap((r) => r.referrals).filter((x) => x.warnings.includes("same_text"))).toHaveLength(2);
  });

  test("covers AC-1, AC-7: a friend who finishes within 3 minutes of the first answer is flagged; 3 minutes or more is not", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    const quick = await friend(t, a.code, { name: "Quick Q", note: NOTE_A, gapMs: 2 * MIN + 59_000 });
    const slow = await friend(t, a.code, { name: "Slow S", note: NOTE_B, gapMs: 3 * MIN });
    await run(t);
    const [row] = await top10(t);
    const warn = (e: string) => row.referrals.find((x) => x.friendEmail === e)!.warnings;
    expect(warn(quick.email)).toEqual(["fast_finish"]);
    expect(warn(slow.email)).toEqual([]);
  });

  test("covers AC-1: an erased friend shows '(erased)' and a referrer's list longer than 100 says so", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    const f = await friend(t, a.code, { name: "Soon Gone" });
    await run(t);
    const fId = await idOf(t, f);
    await t.run(async (ctx) => await ctx.db.delete("students", fId));
    const [row] = await top10(t);
    expect(row.referrals[0].friendEmail).toBe("(erased)");
    expect(row.referrals[0]).toMatchObject({ feedbackText: null });
    await seedValid(t, await idOf(t, a.s), 100, Date.now());
    expect((await top10(t))[0]).toMatchObject({ moreReferralsNotShown: true });
    expect((await top10(t))[0].referrals).toHaveLength(100);
  });
});

describe("the CSV (0019 AC-2)", () => {
  test("covers AC-7: the header has the agreed columns and each referral is one row, with the referrer's columns repeated", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    await friend(t, a.code, { name: "One", note: NOTE_A });
    await friend(t, a.code, { name: "Two", note: NOTE_B });
    await run(t);
    const csv = await t.query(internal.challengeAdmin.exportCsv, {});
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(CSV_COLUMNS.join(","));
    expect(CSV_COLUMNS).toEqual(expect.arrayContaining(["rank", "referralId", "status", "completedAt", "reportSeenAt", "feedbackAt", "feedbackGenuine", "feedbackText", "friendEmail", "warnings", "reviewNote"]));
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(`1,Aarav S.,${a.s.email},College,2,`);
    expect(lines[1]).toContain(NOTE_A.includes(",") ? `"${NOTE_A}"` : NOTE_A);
  });

  test("covers AC-2: commas, quotes and line breaks are quoted, and a cell that would run as a formula is made safe", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    for (const bad of ["=HYPERLINK(\"http://x\")", "+1", "-1+2", "@SUM(A1)", "\t=1"]) expect(csvCell(bad).replace(/^"/, "").startsWith("'"), bad).toBe(true);
    expect(csvCell(null)).toBe("");
    expect(csvCell(false)).toBe("false");
    expect(toCsv([["a", "b,c"], [1, null]])).toBe('a,"b,c"\r\n1,\r\n');
  });

  test("covers AC-2: a note typed as a formula, with a comma and a line break, comes out safe in the file", async () => {
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    await friend(t, a.code, { note: '=1+1, "quoted"\nand a second line of real words' });
    await run(t);
    const csv = await t.query(internal.challengeAdmin.exportCsv, {});
    expect(csv).toContain(`"'=1+1, ""quoted""\nand a second line of real words"`);
  });
});

describe("reject and restore (0019 AC-3, AC-5)", () => {
  async function twoReferrers(t: Backend) {
    const a = await referrer(t, "Aarav Shah");
    const b = await referrer(t, "Bhavna Iyer");
    const f1 = await friend(t, a.code, { name: "One", note: NOTE_A });
    vi.setSystemTime(Date.now() + 30 * MIN);
    const f2 = await friend(t, a.code, { name: "Two", note: NOTE_B });
    const g1 = await friend(t, b.code, { name: "Three", note: "A different real note about the report, from Bhavna's friend." });
    await run(t);
    return { a, b, f1, f2, g1 };
  }

  test("covers AC-3, AC-7: rejecting a valid referral keeps validAt, records the reviewer's words and the time, and counts the referrer again; the ranking order changes", async () => {
    const t = makeBackend();
    const { a, b, f1, f2 } = await twoReferrers(t);
    expect((await ranking(t)).map((r) => r.name)).toEqual(["Aarav S.", "Bhavna I."]);
    const before = await referralOf(t, f1);
    const out = await reject(t, { referralId: before._id });
    expect(out).toEqual({ ok: true, status: "rejected", referrerValid: 1 });
    const after = await referralOf(t, f1);
    expect(after).toMatchObject({ status: "rejected", rejectReason: "review", reviewNote: "same feedback text: matches three others", validAt: before.validAt });
    expect(after.reviewedAt).toBe(Date.now());
    expect(await entryOf(t, a.s)).toMatchObject({ validCount: 1, lastValidAt: (await referralOf(t, f2)).validAt });
    await reject(t, { friendEmail: f2.email });
    const emptied = await entryOf(t, a.s);
    expect(emptied.validCount).toBe(0);
    expect(emptied.lastValidAt).toBeUndefined();
    expect((await ranking(t)).map((r) => [r.rank, r.name])).toEqual([[1, "Bhavna I."]]);
    expect(await entryOf(t, b.s)).toMatchObject({ validCount: 1 });
  });

  test("covers AC-3: a pending referral can be rejected too, and the job then leaves it alone", async () => {
    const t = makeBackend();
    const a = await referrer(t);
    const f = await student(t, { name: "Open One", code: a.code });
    const ref = await referralOf(t, f);
    expect(ref.status).toBe("pending");
    expect(await reject(t, { referralId: ref._id })).toMatchObject({ ok: true, status: "rejected", referrerValid: 0 });
    await f.as.mutation(api.checks.markReportSeen, {});
    await f.as.mutation(api.feedback.submit, { rating: 5, text: NOTE_A, canShare: false });
    await run(t);
    expect(await referralOf(t, f)).toMatchObject({ status: "rejected", rejectReason: "review" });
    expect(await entryOf(t, a.s)).toMatchObject({ validCount: 0 });
  });

  test("covers AC-3, AC-7: restore puts a rejected referral back and it counts again; the order returns", async () => {
    const t = makeBackend();
    const { a, b, f1, f2 } = await twoReferrers(t);
    await reject(t, { friendEmail: f1.email });
    await reject(t, { friendEmail: f2.email });
    expect((await ranking(t)).map((r) => r.name)).toEqual(["Bhavna I."]);
    const out = await restore(t, { friendEmail: f1.email, reason: "checked by phone", note: "real student" });
    expect(out).toEqual({ ok: true, status: "valid", referrerValid: 1 });
    await restore(t, { friendEmail: f2.email });
    expect((await ranking(t)).map((r) => r.name)).toEqual(["Aarav S.", "Bhavna I."]);
    const again = await referralOf(t, f1);
    expect(again).toMatchObject({ status: "valid" });
    expect(again.rejectReason).toBeUndefined();
    // the earlier words are kept and the restore is added to them
    expect(again.reviewNote).toBe("same feedback text: matches three others | restored: checked by phone: real student");
    expect(await entryOf(t, a.s)).toMatchObject({ validCount: 2 });
    expect(await entryOf(t, b.s)).toMatchObject({ validCount: 1 });
  });

  test("covers AC-3: a restored referral whose last step came after the deadline goes back to rejected (deadline), not valid", async () => {
    const t = makeBackend();
    const a = await referrer(t);
    const f = await student(t, { name: "Late One", code: a.code, gapMs: 10 * MIN });
    await f.as.mutation(api.checks.markReportSeen, {});
    vi.setSystemTime(ENDS_AT_MS + MIN); // the note comes after 23:59
    await f.as.mutation(api.feedback.submit, { rating: 5, text: NOTE_A, canShare: false });
    const ref = await referralOf(t, f);
    expect(await reject(t, { referralId: ref._id })).toMatchObject({ ok: true });
    expect(await restore(t, { referralId: ref._id })).toEqual({ ok: true, status: "rejected", referrerValid: 0 });
    expect(await referralOf(t, f)).toMatchObject({ status: "rejected", rejectReason: "deadline" });
  });

  test("covers AC-3: restore still works after the board is frozen (the job does nothing then), and the public board is not changed", async () => {
    const t = makeBackend();
    const { a, f1, f2 } = await twoReferrers(t);
    vi.setSystemTime(ENDS_AT_MS + HOUR);
    await run(t);
    const lookAt = (s: Student) => s.as.query(api.challenge.leaderboard, {});
    const frozen = await lookAt(a.s);
    expect(frozen).toMatchObject({ frozen: true });
    await reject(t, { friendEmail: f1.email });
    await reject(t, { friendEmail: f2.email });
    expect((await ranking(t)).map((r) => r.name)).toEqual(["Bhavna I."]); // live, after review
    expect((await lookAt(a.s)).rows).toEqual(frozen.rows); // the public board is as it was
    expect((await a.s.as.query(api.challenge.me, {})).rank).toBe(1);
    expect(await restore(t, { friendEmail: f1.email })).toMatchObject({ ok: true, status: "valid", referrerValid: 1 });
    expect((await ranking(t)).map((r) => [r.name, r.validCount])).toEqual([["Aarav S.", 1], ["Bhavna I.", 1]]); // equal counts: Aarav's one was reached first
  });

  test("covers AC-3: restore of something the team did not reject (valid, pending or rejected for the deadline) changes nothing", async () => {
    const t = makeBackend();
    const { f1 } = await twoReferrers(t);
    const ref = await referralOf(t, f1);
    expect(await restore(t, { referralId: ref._id })).toEqual({ ok: false, code: "bad_state" });
    await t.run(async (ctx) => await ctx.db.patch("referrals", ref._id, { status: "rejected", rejectReason: "deadline" }));
    expect(await restore(t, { referralId: ref._id })).toEqual({ ok: false, code: "bad_state" });
    const left = await referralOf(t, f1);
    expect(left).toMatchObject({ status: "rejected", rejectReason: "deadline" });
    expect(left.reviewNote).toBeUndefined();
  });

  test("covers AC-7: rejecting an unknown referral or email changes nothing; so does a missing reason, both identifiers, or none", async () => {
    const t = makeBackend();
    await twoReferrers(t);
    const snapshot = async () => t.run(async (ctx) => ({ r: await ctx.db.query("referrals").collect(), e: await ctx.db.query("challengeEntries").collect() }));
    const before = await snapshot();
    const gone = (await before.r[0])._id;
    expect(await reject(t, { friendEmail: "nobody@example.com" })).toEqual({ ok: false, code: "no_match" });
    expect(await restore(t, { friendEmail: "nobody@example.com" })).toEqual({ ok: false, code: "no_match" });
    // a real student who never signed up with a code
    const loner = await student(t, { name: "No Code" });
    expect(await reject(t, { friendEmail: loner.email })).toEqual({ ok: false, code: "no_match" });
    expect(await reject(t, { referralId: gone, friendEmail: "x@example.com" })).toEqual({ ok: false, code: "give_one" });
    expect(await reject(t, {})).toEqual({ ok: false, code: "give_one" });
    expect(await reject(t, { referralId: gone, reason: "   " })).toEqual({ ok: false, code: "no_reason" });
    expect(await snapshot()).toEqual(before);
    // a referral id that was deleted
    await t.run(async (ctx) => await ctx.db.delete("referrals", gone));
    expect(await reject(t, { referralId: gone })).toEqual({ ok: false, code: "no_match" });
  });

  test("covers AC-3: rejecting twice is refused the second time and the first note stays", async () => {
    const t = makeBackend();
    const { f1 } = await twoReferrers(t);
    await reject(t, { friendEmail: f1.email, reason: "first reason", note: "" });
    expect(await reject(t, { friendEmail: f1.email, reason: "second reason", note: "later" })).toEqual({ ok: false, code: "bad_state" });
    expect((await referralOf(t, f1)).reviewNote).toBe("first reason");
  });

  test("covers AC-7: a reject never touches another referrer, another referral or any student's own data", async () => {
    const t = makeBackend();
    const { b, f1, g1 } = await twoReferrers(t);
    const otherId = (await referralOf(t, g1))._id;
    const rows = () =>
      t.run(async (ctx) => ({
        students: await ctx.db.query("students").collect(),
        checks: await ctx.db.query("checks").collect(),
        answers: await ctx.db.query("answers").collect(),
        results: await ctx.db.query("results").collect(),
        feedback: await ctx.db.query("feedback").collect(),
        consents: await ctx.db.query("consents").collect(),
        otherReferral: await ctx.db.get("referrals", otherId),
      }));
    const before = await rows();
    const entryB = await entryOf(t, b.s);
    await reject(t, { friendEmail: f1.email });
    await restore(t, { friendEmail: f1.email });
    expect(await rows()).toEqual(before);
    expect(await entryOf(t, b.s)).toEqual(entryB);
  });

  test("covers AC-7: recount takes the maximum validAt, so the last valid time follows a reject and a restore of the latest referral", async () => {
    const t = makeBackend();
    const { a, f1, f2 } = await twoReferrers(t);
    const first = (await referralOf(t, f1)).validAt!;
    const second = (await referralOf(t, f2)).validAt!;
    expect(second).toBeGreaterThan(first);
    expect((await entryOf(t, a.s)).lastValidAt).toBe(second);
    await reject(t, { friendEmail: f2.email });
    expect((await entryOf(t, a.s)).lastValidAt).toBe(first);
    await restore(t, { friendEmail: f2.email });
    expect((await entryOf(t, a.s)).lastValidAt).toBe(second);
  });

  test("covers AC-5: nothing is deleted by a review; the row keeps every field and a reviewed time", async () => {
    const t = makeBackend();
    const { f1 } = await twoReferrers(t);
    const count = () => t.run(async (ctx) => (await ctx.db.query("referrals").collect()).length);
    const before = await count();
    await reject(t, { friendEmail: f1.email });
    await restore(t, { friendEmail: f1.email });
    expect(await count()).toBe(before);
    expect((await referralOf(t, f1)).reviewedAt).toBe(Date.now());
  });

  test("covers AC-5: a referrer who left the challenge can still have a referral reviewed, with no count to change", async () => {
    const t = makeBackend();
    const { a, f1 } = await twoReferrers(t);
    await a.s.as.mutation(api.challenge.leave, {});
    expect(await reject(t, { friendEmail: f1.email })).toEqual({ ok: true, status: "rejected", referrerValid: 0 });
  });
});

describe("who can run these commands (0015 AC-1; 0019 AC-2, AC-5)", () => {
  const source = readFileSync(new URL("./challengeAdmin.ts", import.meta.url), "utf8");

  test("covers AC-2, AC-5: every exported command is internal; nothing in the file is a public query, mutation or action", () => {
    const exported = [...source.matchAll(/export const (\w+) = (\w+)\(/g)].map((m) => [m[1], m[2]]);
    expect(exported.map((e) => e[0]).sort()).toEqual(["exportCsv", "ranking", "reject", "restore", "top10"]);
    for (const [, kind] of exported) expect(["internalQuery", "internalMutation"]).toContain(kind);
    expect(source).not.toMatch(/\b(?:query|mutation|action|httpAction)\(\{/);
  });

  test("covers AC-5: the file does not log, so no email, name or note can reach a log", () => {
    expect(source.replace(/\/\/.*$/gm, "")).not.toMatch(/console\./);
  });

  test("covers 0015 AC-1: no page, no forwarder and no HTTP route mentions the review commands", () => {
    for (const f of ["http.ts", "referralHttp.ts"]) expect(readFileSync(new URL(`./${f}`, import.meta.url), "utf8")).not.toMatch(/challengeAdmin/);
    expect(readFileSync(new URL("../src/lib/session.ts", import.meta.url), "utf8")).not.toMatch(/challengeAdmin/);
  });

  test("covers AC-1: running the commands writes nothing to the log", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const t = makeBackend();
    const a = await referrer(t, "Aarav Shah");
    const f = await friend(t, a.code);
    await run(t);
    log.mockClear();
    await top10(t);
    await ranking(t);
    await t.query(internal.challengeAdmin.exportCsv, {});
    await reject(t, { friendEmail: f.email });
    await restore(t, { friendEmail: f.email });
    expect(log).not.toHaveBeenCalled();
  });
});
