// The live leaderboard (spec 0015 M3; spec 0018): ranking and its tie rule, the snapshot and the public row, the freeze at the deadline, the
// "you" card, a leave or erase after the freeze, and who may read the board. BACKEND.md scenarios 10 and 12 are in challenge.test.ts with the
// other ten. Each test names the criterion it covers.
//
// Referrals are put straight into the tables here (`earn`): how a friend becomes valid is already covered in challenge.test.ts, and ranking
// needs exact counts and times. Everything the board shows still goes through the real job (`challengeBoard.run`) and the real queries.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { boardName, compareEntries, rankEntries, recount } from "./challengeCore";
import { ENDS_AT_MS, LEADERBOARD_SIZE } from "./challengeRules";
import { makeBackend, opt, profileInput, signInAs, type Backend } from "../tests/convexTestUtils";

vi.setConfig({ testTimeout: 30_000 });

const AUTH_ENV = { BETTER_AUTH_URL: "https://example.test", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(Date.parse("2026-10-20T10:00:00+05:30"));
  Object.assign(process.env, AUTH_ENV);
  process.env.CHALLENGE_LIVE = "true";
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
  delete process.env.CHALLENGE_LIVE;
  delete process.env.LEADERBOARD_PICTURES_ENABLED;
});

const HOUR = 60 * 60 * 1000;

async function student(t: Backend, opts: { name?: string; age?: number; cls?: "Class 10" | "College" } = {}) {
  const s = await signInAs(t, { sessionDays: 900 });
  const age = opts.age ?? 20;
  await s.as.mutation(api.students.createProfile, await profileInput({ name: opts.name ?? "Asha Rao", age, class: opts.cls ?? "College", guardianPresent: age < 18 }));
  await s.as.mutation(api.checks.saveAnswers, { answers: Array.from({ length: 18 }, (_, i) => ({ q: i + 1, optionId: opt(i + 1, 2), answeredAt: Date.now() })) });
  await s.as.mutation(api.checks.complete, {});
  return s;
}
type Student = Awaited<ReturnType<typeof student>>;

async function joinedStudent(t: Backend, opts: { name?: string; age?: number; hide?: boolean; cls?: "Class 10" | "College" } = {}) {
  const s = await student(t, opts);
  const r = await s.as.mutation(api.challenge.join, { rulesAccepted: true, parentConsent: (opts.age ?? 20) < 18, hideName: opts.hide === true });
  if (!r.ok) throw new Error(`join refused: ${r.code}`);
  return s;
}
const idOf = (t: Backend, s: Student) => t.run(async (ctx) => (await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", s.email)).unique())!._id);
const runJob = (t: Backend) => t.mutation(internal.challengeBoard.run, {});
const board = (s: Student) => s.as.query(api.challenge.leaderboard, {});
const me = (s: Student) => s.as.query(api.challenge.me, {});

// Gives a referrer `n` valid referrals whose last one was reached at `lastAt` (the others a second apart before it), then recounts them the
// way the job and the team commands do.
async function earn(t: Backend, s: Student, n: number, lastAt: number) {
  const referrerId = await idOf(t, s);
  await t.run(async (ctx) => {
    for (let i = 0; i < n; i++) {
      await ctx.db.insert("referrals", { referrerId, friendId: referrerId, code: "TESTCODE", usedAt: lastAt - 100_000, status: "valid", validAt: lastAt - (n - 1 - i) * 1000 });
    }
    await recount(ctx, referrerId);
  });
}
const snapshot = (t: Backend) => t.run(async (ctx) => await ctx.db.query("leaderboardSnapshots").collect());
const entries = (t: Backend) => t.run(async (ctx) => await ctx.db.query("challengeEntries").collect());

describe("the tie rule and the order (0018 AC-1)", () => {
  test("covers scenario 10: two referrers with 7 valid each; A reached 7 at 14:00, B at 13:30: B ranks above A", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aarav Shah" });
    const b = await joinedStudent(t, { name: "Bhavna Iyer" });
    await earn(t, a, 7, Date.parse("2026-10-20T14:00:00+05:30"));
    await earn(t, b, 7, Date.parse("2026-10-20T13:30:00+05:30"));
    await runJob(t);
    const res = await board(a);
    expect(res.rows.map((r) => [r.rank, r.displayName, r.valid])).toEqual([[1, "Bhavna I.", 7], [2, "Aarav S.", 7]]);
    expect(await me(b)).toMatchObject({ rank: 1, toNext: 0, nextRank: null });
    expect(await me(a)).toMatchObject({ rank: 2, toNext: 1, nextRank: 1 });
  });

  test("covers 0018 AC-1: more valid referrals always beat an earlier finish", async () => {
    const t = makeBackend();
    const early = await joinedStudent(t, { name: "Early Bird" });
    const many = await joinedStudent(t, { name: "Many Friends" });
    await earn(t, early, 2, Date.parse("2026-10-01T09:00:00+05:30"));
    await earn(t, many, 3, Date.parse("2026-10-19T09:00:00+05:30"));
    await runJob(t);
    expect((await board(early)).rows.map((r) => r.displayName)).toEqual(["Many F.", "Early B."]);
  });

  test("covers 0018 AC-1: a tie of three on the count and the time goes to the earlier join, and nobody shares a place", async () => {
    const t = makeBackend();
    const at = Date.parse("2026-10-20T12:00:00+05:30");
    const first = await joinedStudent(t, { name: "First Joiner" });
    vi.setSystemTime(Date.now() + HOUR);
    const second = await joinedStudent(t, { name: "Second Joiner" });
    vi.setSystemTime(Date.now() + HOUR);
    const third = await joinedStudent(t, { name: "Third Joiner" });
    // earned in the opposite order, with the same count at the same moment
    for (const s of [third, second, first]) await earn(t, s, 4, at);
    await runJob(t);
    const rows = (await board(first)).rows;
    expect(rows.map((r) => [r.rank, r.displayName])).toEqual([[1, "First J."], [2, "Second J."], [3, "Third J."]]);
    expect(await me(third)).toMatchObject({ rank: 3, toNext: 1, nextRank: 2 });
  });

  test("covers 0018 AC-1: the order is total even when count, time and join time are all equal, and the same data always gives the same ranks", () => {
    const base = { validCount: 3, lastValidAt: 5, joinedAt: 7 };
    const e = (id: string, creation: number) => ({ _id: id as Id<"challengeEntries">, _creationTime: creation, ...base });
    const list = [e("c", 3), e("a", 1), e("b", 2), e("d", 2)];
    const once = rankEntries(list).map((r) => r.entry._id);
    expect(once).toEqual(["a", "b", "d", "c"]);
    expect(rankEntries([...list].reverse()).map((r) => r.entry._id)).toEqual(once);
    expect(rankEntries(list).map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(compareEntries(list[1], list[1])).toBe(0);
  });

  test("covers 0018 AC-1: a student with no lastValidAt sorts after one who has it; zero valid referrals are not ranked", () => {
    const e = (id: string, validCount: number, lastValidAt?: number) => ({ _id: id as Id<"challengeEntries">, _creationTime: 1, validCount, lastValidAt, joinedAt: 1 });
    const out = rankEntries([e("none", 2), e("zero", 0), e("late", 2, 99), e("early", 2, 10)]);
    expect(out.map((r) => r.entry._id)).toEqual(["early", "late", "none"]);
  });

  test("covers 0018 AC-7: toNext is the count of the place above minus mine plus 1; first place is 0 and null", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa" });
    const b = await joinedStudent(t, { name: "Bbb" });
    const c = await joinedStudent(t, { name: "Ccc" });
    const at = Date.parse("2026-10-20T12:00:00+05:30");
    await earn(t, a, 9, at);
    await earn(t, b, 4, at);
    await earn(t, c, 4, at + 1000);
    await runJob(t);
    expect(await me(a)).toMatchObject({ rank: 1, toNext: 0, nextRank: null });
    expect(await me(b)).toMatchObject({ rank: 2, toNext: 6, nextRank: 1 });
    expect(await me(c)).toMatchObject({ rank: 3, toNext: 1, nextRank: 2 }); // b reached 4 first, so c needs one more to pass b
  });
});

describe("the public row (0018 AC-2, scenario 12)", () => {
  test("covers scenario 12: a row has only rank, displayName, cls, style and valid; no email, phone, age, flag, student id or last name anywhere in the answer", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Ananya Sharma", age: 15, cls: "Class 10" });
    const b = await joinedStudent(t, { name: "Ravi Kumar" });
    await earn(t, a, 3, Date.now());
    await earn(t, b, 2, Date.now());
    await t.run(async (ctx) => {
      const r = (await ctx.db.query("leads").collect())[0];
      expect(r).toBeUndefined(); // no phone was ever given, so there is none to leak; the scan below still guards the shape
    });
    await runJob(t);
    const res = await board(b);
    expect(res.rows).toHaveLength(2);
    for (const row of res.rows) expect(Object.keys(row).sort()).toEqual(["cls", "displayName", "rank", "style", "valid"]);
    expect(res.rows[0]).toEqual({ rank: 1, displayName: "Ananya S.", cls: "Class 10", style: expect.stringMatching(/^(Builder|Achiever|Explorer)$/), valid: 3 });
    const text = JSON.stringify(res);
    expect(text).not.toMatch(/@|selfDoubt|lowMood|phone|email|age\b|studentId|authUser|Sharma|Kumar/);
    const ids = await Promise.all([idOf(t, a), idOf(t, b)]);
    for (const id of ids) expect(text).not.toContain(id);
    // the stored snapshot has the same shape
    expect(Object.keys(res).sort()).toEqual(["computedAt", "endsAt", "frozen", "myRank", "rows"]);
    for (const row of (await snapshot(t))[0].rows) expect(Object.keys(row).sort()).toEqual(["cls", "displayName", "rank", "style", "valid"]);
  });

  test("covers 0018 AC-2: the style is the label of the saved result, never the letter", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Ananya Rao" });
    await earn(t, a, 1, Date.now());
    await runJob(t);
    const style = (await board(a)).rows[0].style;
    const key = await t.run(async (ctx) => (await ctx.db.query("results").first())!.styleKey);
    expect(style).toBe({ k: "Builder", p: "Achiever", v: "Explorer" }[key]);
  });

  test("covers 0018 AC-2: a hidden name shows 'Anonymous <Style>' with no class", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Ananya Sharma", hide: true });
    await earn(t, a, 1, Date.now());
    await runJob(t);
    const row = (await board(a)).rows[0];
    expect(row.displayName).toBe(`Anonymous ${row.style}`);
    expect(row).not.toHaveProperty("cls");
    expect(row).not.toHaveProperty("avatar");
    expect(JSON.stringify(row)).not.toMatch(/Ananya|Sharma/);
  });

  test("covers 0017 AC-5: hiding a name, or showing it again, changes the board at once, keeps the count the board shows and the rank, and a run agrees", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Ananya Sharma" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    await earn(t, a, 3, Date.now());
    await earn(t, b, 1, Date.now());
    await runJob(t);
    expect((await board(a)).rows[0]).toMatchObject({ rank: 1, displayName: "Ananya S.", cls: "College", valid: 3 });
    await a.as.mutation(api.challenge.setHideName, { hideName: true });
    const hidden = (await board(a)).rows;
    expect(hidden[0]).toMatchObject({ rank: 1, valid: 3 });
    expect(hidden[0].displayName).toMatch(/^Anonymous (Builder|Achiever|Explorer)$/);
    expect(hidden[0]).not.toHaveProperty("cls");
    expect(JSON.stringify(await board(b))).not.toMatch(/Ananya|Sharma/);
    expect(hidden[1]).toMatchObject({ rank: 2, displayName: "Bbb B." }); // another student's row is untouched
    await a.as.mutation(api.challenge.setHideName, { hideName: false });
    expect((await board(a)).rows[0]).toMatchObject({ rank: 1, displayName: "Ananya S.", cls: "College", valid: 3 });
    await a.as.mutation(api.challenge.setHideName, { hideName: true });
    const live = (await board(a)).rows;
    await runJob(t);
    expect((await board(a)).rows).toEqual(live); // the next run builds the same board
  });

  test("covers 0017 AC-5: a student with no rank yet can hide their name and nothing on the board changes", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    await earn(t, b, 1, Date.now());
    await runJob(t);
    const before = await snapshot(t);
    await a.as.mutation(api.challenge.setHideName, { hideName: true });
    expect(await snapshot(t)).toEqual(before);
  });

  test("covers 0018 AC-2: first name and last initial, a one word name, a long name and a Hindi name", () => {
    expect(boardName("ananya DEVI rao", false, "Builder")).toBe("Ananya R.");
    expect(boardName("  Meera  ", false, "Builder")).toBe("Meera");
    expect(boardName("Priya Sharma", false, "Explorer")).toBe("Priya S.");
    expect(boardName("प्रिया शर्मा", false, "Explorer")).toBe("प्रिया श.");
    expect(boardName("प्रिया क्षत्रिय", false, "Explorer")).toBe("प्रिया क्ष.");
    expect(boardName("A".repeat(50) + " Z", false, "Builder")).toBe("A" + "a".repeat(29) + " Z.");
    expect(boardName("Anything Here", true, "Achiever")).toBe("Anonymous Achiever");
  });

  test("covers 0018 AC-9: a picture path is on a row only with LEADERBOARD_PICTURES_ENABLED on and the name not hidden", async () => {
    const t = makeBackend();
    const shown = await joinedStudent(t, { name: "Shown Face" });
    const hidden = await joinedStudent(t, { name: "Hidden Face", hide: true });
    for (const s of [shown, hidden]) {
      await earn(t, s, 1, Date.now());
      const studentId = await idOf(t, s);
      await t.run(async (ctx) => {
        const storageId = await ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])]));
        await ctx.db.insert("avatars", { studentId, key: `key${studentId}`.slice(0, 22).padEnd(22, "x"), storageId, sourceUrl: "https://lh3.googleusercontent.com/a", checkedAt: 1, updatedAt: 1 });
      });
    }
    await runJob(t);
    expect((await board(shown)).rows.every((r) => !("avatar" in r))).toBe(true); // off by default
    process.env.LEADERBOARD_PICTURES_ENABLED = "true";
    await runJob(t);
    const rows = (await board(shown)).rows;
    const shownRow = rows.find((r) => r.displayName === "Shown F.")!;
    expect(shownRow.avatar).toMatch(/^\/api\/avatar\/[A-Za-z0-9_-]{22}$/);
    expect(rows.find((r) => r.displayName.startsWith("Anonymous"))).not.toHaveProperty("avatar");
  });
});

describe("the job writes the board (0018 AC-3)", () => {
  test("covers 0018 AC-3: it ranks entries with a valid referral, writes one snapshot with computedAt, and a second run keeps it one row", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    const none = await joinedStudent(t, { name: "Nobody Yet" });
    await earn(t, a, 2, Date.now());
    await earn(t, b, 1, Date.now());
    const before = Date.now();
    await runJob(t);
    vi.setSystemTime(before + 5 * 60 * 1000);
    await runJob(t);
    const snaps = await snapshot(t);
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ frozen: false, computedAt: before + 5 * 60 * 1000 });
    expect(snaps[0].rows.map((r) => r.displayName)).toEqual(["Aaa A.", "Bbb B."]);
    expect(await me(none)).toMatchObject({ valid: 0, rank: null, toNext: null, nextRank: null });
  });

  test("covers 0018 AC-3: with no valid referral yet the board is empty, and a fresh read has computedAt null", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t);
    expect(await board(a)).toEqual({ rows: [], computedAt: null, frozen: false, endsAt: ENDS_AT_MS, myRank: null });
    await runJob(t);
    expect((await board(a)).rows).toEqual([]);
    expect((await board(a)).computedAt).not.toBeNull();
  });

  test("covers 0015 AC-3: with the switch off the job writes no board", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t);
    await earn(t, a, 1, Date.now());
    delete process.env.CHALLENGE_LIVE;
    await runJob(t);
    expect(await snapshot(t)).toHaveLength(0);
  });

  test("covers 0018 AC-3: the job is safe to run twice in a row; nothing changes", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    await earn(t, a, 2, Date.now());
    await earn(t, b, 1, Date.now());
    await runJob(t);
    const once = { s: await snapshot(t), e: await entries(t) };
    await runJob(t);
    expect({ s: await snapshot(t), e: await entries(t) }).toEqual(once);
  });

  test("covers 0018 AC-1, AC-3: only the top 50 are on the board; a student below keeps their own rank on the 'you' card and myRank is null", async () => {
    const t = makeBackend();
    const lowly = await joinedStudent(t, { name: "Lowly Student" });
    await earn(t, lowly, 1, Date.now());
    // 51 more ranked entries with more referrals, made straight in the tables (each needs a student row and a consent row)
    await t.run(async (ctx) => {
      for (let i = 0; i < 51; i++) {
        const studentId = await ctx.db.insert("students", { authUserId: `fake${i}`, email: `fake${i}@example.com`, name: `Fake${i} Person`, age: 20, class: "College" });
        const consentId = await ctx.db.insert("consents", { studentId, kind: "challenge", textVersion: "challenge-v1", ageAtConsent: 20, guardianPresent: false, acceptedAt: Date.now() });
        await ctx.db.insert("challengeEntries", { studentId, code: `FAK${String(i).padStart(4, "A")}`, joinedAt: Date.now(), consentId, hideName: false, validCount: 100 - i, lastValidAt: Date.now() });
      }
    });
    await runJob(t);
    const res = await board(lowly);
    expect(res.rows).toHaveLength(LEADERBOARD_SIZE);
    expect(res.rows.map((r) => r.rank)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(res.rows[0].displayName).toBe("Fake0 P.");
    expect(res.myRank).toBeNull();
    expect(await me(lowly)).toMatchObject({ rank: 52, nextRank: 51, toNext: 50 - 1 + 1 });
  });

  test("covers 0018 AC-1: the student's own row is marked by myRank only when they are on the board", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    await earn(t, a, 2, Date.now());
    await earn(t, b, 1, Date.now());
    await runJob(t);
    expect((await board(a)).myRank).toBe(1);
    expect((await board(b)).myRank).toBe(2);
  });

  test("covers 0018 AC-1: a referral rejected before the deadline drops off at the next run, and a student back at 0 leaves the board", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    await earn(t, a, 2, Date.now());
    await earn(t, b, 1, Date.now());
    await runJob(t);
    expect((await board(b)).rows.map((r) => r.displayName)).toEqual(["Aaa A.", "Bbb B."]);
    await t.run(async (ctx) => {
      const aId = (await ctx.db.query("challengeEntries").withIndex("by_rank", (q) => q.eq("rank", 1)).unique())!.studentId;
      for (const r of await ctx.db.query("referrals").withIndex("by_referrerId_and_status", (q) => q.eq("referrerId", aId).eq("status", "valid")).collect()) {
        await ctx.db.patch("referrals", r._id, { status: "rejected", rejectReason: "review" });
      }
      await recount(ctx, aId);
    });
    await runJob(t);
    expect((await board(b)).rows.map((r) => [r.rank, r.displayName])).toEqual([[1, "Bbb B."]]);
    expect(await me(a)).toMatchObject({ valid: 0, rank: null, toNext: null, nextRank: null });
    expect(await me(b)).toMatchObject({ rank: 1, toNext: 0 });
  });

  test("covers 0018 AC-3: an entry whose student is gone is dropped, so the board has no gap", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    await earn(t, a, 3, Date.now());
    await earn(t, b, 2, Date.now());
    const aId = await idOf(t, a);
    await t.run(async (ctx) => await ctx.db.delete("students", aId));
    await runJob(t);
    expect((await snapshot(t))[0].rows.map((r) => [r.rank, r.displayName])).toEqual([[1, "Bbb B."]]);
    expect(await me(b)).toMatchObject({ rank: 1 });
  });

  test("covers 0018 AC-3, AC-5: a student who leaves before the deadline is off the board at once, the ranks close up, and the next run agrees", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    const c = await joinedStudent(t, { name: "Ccc Ccc" });
    await earn(t, a, 3, Date.now());
    await earn(t, b, 2, Date.now());
    await earn(t, c, 1, Date.now());
    await runJob(t);
    await a.as.mutation(api.challenge.leave, {});
    expect((await board(b)).rows.map((r) => [r.rank, r.displayName])).toEqual([[1, "Bbb B."], [2, "Ccc C."]]);
    expect(await me(b)).toMatchObject({ rank: 1, toNext: 0, nextRank: null });
    expect(await me(c)).toMatchObject({ rank: 2, toNext: 2, nextRank: 1 });
    expect((await board(c)).myRank).toBe(2);
    const closed = (await board(b)).rows;
    await runJob(t);
    expect((await board(b)).rows).toEqual(closed);
    expect(await me(c)).toMatchObject({ rank: 2, toNext: 2, nextRank: 1 });
  });
});

describe("the freeze at the deadline (0018 AC-4, AC-5)", () => {
  test("covers 0018 AC-4: the first run after the deadline writes the final board and freezes it; later runs change nothing", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const b = await joinedStudent(t, { name: "Bbb Bbb" });
    await earn(t, a, 2, ENDS_AT_MS - 5 * HOUR);
    await earn(t, b, 1, ENDS_AT_MS - 4 * HOUR);
    vi.setSystemTime(ENDS_AT_MS - 60_000);
    await runJob(t);
    expect((await board(a)).frozen).toBe(false);
    vi.setSystemTime(ENDS_AT_MS + 2 * 60_000);
    await runJob(t);
    const frozen = await board(a);
    expect(frozen).toMatchObject({ frozen: true, endsAt: ENDS_AT_MS });
    expect(frozen.rows.map((r) => r.displayName)).toEqual(["Aaa A.", "Bbb B."]);
    expect((await me(a)).frozen).toBe(true);
    const before = { s: await snapshot(t), e: await entries(t) };
    // more referrals, a new joiner and later runs: nothing moves
    await earn(t, b, 5, ENDS_AT_MS - HOUR);
    vi.setSystemTime(ENDS_AT_MS + 3 * HOUR);
    await runJob(t);
    await runJob(t);
    const after = await board(a);
    expect(after.rows).toEqual(frozen.rows);
    expect(after.computedAt).toBe(frozen.computedAt);
    expect((await snapshot(t))[0]).toEqual(before.s[0]);
  });

  test("covers 0018 AC-4: the final board counts a referral finished at 23:58:50 even when the run is days late, and not one finished at 23:59:30", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    const code = await t.run(async (ctx) => (await ctx.db.query("challengeEntries").first())!.code);
    const friendOk = await student(t, { name: "Friend Ok" });
    const friendLate = await student(t, { name: "Friend Late" });
    // friends who signed up with the code, finishing around the deadline
    const [okId, lateId] = await Promise.all([idOf(t, friendOk), idOf(t, friendLate)]);
    const referrerId = await idOf(t, a);
    await t.run(async (ctx) => {
      for (const friendId of [okId, lateId]) await ctx.db.insert("referrals", { referrerId, friendId, code, usedAt: Date.now(), status: "pending" });
    });
    vi.setSystemTime(ENDS_AT_MS - 10_000);
    for (const f of [friendOk]) {
      await f.as.mutation(api.checks.markReportSeen, {});
      await f.as.mutation(api.feedback.submit, { rating: 5, text: "I liked how calm and clear this report felt to read.", canShare: false });
    }
    vi.setSystemTime(ENDS_AT_MS + 30_000);
    await friendLate.as.mutation(api.checks.markReportSeen, {});
    await friendLate.as.mutation(api.feedback.submit, { rating: 5, text: "I liked how calm and clear this report felt to read.", canShare: false });
    vi.setSystemTime(ENDS_AT_MS + 3 * 24 * HOUR);
    await runJob(t);
    expect((await board(a)).rows).toEqual([expect.objectContaining({ rank: 1, valid: 1 })]);
    expect((await board(a)).frozen).toBe(true);
  });

  test("covers 0018 AC-4: a run that began before the deadline is not the final run, even if its last page comes after it", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    await earn(t, a, 1, ENDS_AT_MS - HOUR);
    vi.setSystemTime(ENDS_AT_MS + 1000);
    await t.mutation(internal.challengeBoard.run, { startedAt: ENDS_AT_MS - 1000 });
    expect((await board(a)).frozen).toBe(false);
    await runJob(t);
    expect((await board(a)).frozen).toBe(true);
  });

  test("covers 0018 AC-4: a signed in student sees the final board and the ended state with the deadline", async () => {
    const t = makeBackend();
    const a = await joinedStudent(t, { name: "Aaa Aaa" });
    await earn(t, a, 1, ENDS_AT_MS - HOUR);
    vi.setSystemTime(ENDS_AT_MS + HOUR);
    await runJob(t);
    expect(await board(a)).toMatchObject({ frozen: true, endsAt: ENDS_AT_MS, myRank: 1 });
    expect(await me(a)).toMatchObject({ frozen: true, endsAt: ENDS_AT_MS, rank: 1 });
  });

  async function frozenFour(t: Backend) {
    const s = [] as Student[];
    for (const [i, name] of ["Aaa One", "Bbb Two", "Ccc Three", "Ddd Four"].entries()) {
      const st = await joinedStudent(t, { name });
      await earn(t, st, 8 - 2 * i, ENDS_AT_MS - 10 * HOUR + i * HOUR); // 8, 6, 4, 2
      s.push(st);
    }
    vi.setSystemTime(ENDS_AT_MS + HOUR);
    await runJob(t);
    return s;
  }

  test("covers 0018 AC-5: a student who leaves after the freeze is taken off the final board and the ranks close up, for the page and for each 'you' card", async () => {
    const t = makeBackend();
    const [one, two, three, four] = await frozenFour(t);
    expect(await me(three)).toMatchObject({ rank: 3, toNext: 3, nextRank: 2 });
    await two.as.mutation(api.challenge.leave, {});
    const res = await board(one);
    expect(res.frozen).toBe(true);
    expect(res.rows.map((r) => [r.rank, r.displayName, r.valid])).toEqual([[1, "Aaa O.", 8], [2, "Ccc T.", 4], [3, "Ddd F.", 2]]);
    expect(await me(one)).toMatchObject({ rank: 1, toNext: 0, nextRank: null });
    expect(await me(three)).toMatchObject({ rank: 2, nextRank: 1, toNext: 8 - 4 + 1 }); // the place above is now the first one
    expect(await me(four)).toMatchObject({ rank: 3, nextRank: 2, toNext: 4 - 2 + 1 }); // unchanged above
    expect((await board(three)).myRank).toBe(2);
  });

  test("covers 0018 AC-5: the leader leaving moves second place to first", async () => {
    const t = makeBackend();
    const [one, two] = await frozenFour(t);
    await one.as.mutation(api.challenge.leave, {});
    expect((await board(two)).rows[0]).toMatchObject({ rank: 1, displayName: "Bbb T.", valid: 6 });
    expect(await me(two)).toMatchObject({ rank: 1, toNext: 0, nextRank: null });
  });

  test("covers 0018 AC-5: a leave after the freeze never re-ranks from live counts (a referral the team rejects does not change the public board)", async () => {
    const t = makeBackend();
    const [one, two, three, four] = await frozenFour(t);
    // the team rejects all of Ccc's referrals in review: live count 0, but the frozen board is the board
    const id = await idOf(t, three);
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("referrals").withIndex("by_referrerId_and_status", (q) => q.eq("referrerId", id).eq("status", "valid")).collect()) {
        await ctx.db.patch("referrals", r._id, { status: "rejected", rejectReason: "review" });
      }
      await recount(ctx, id);
    });
    await four.as.mutation(api.challenge.leave, {});
    const rows = (await board(one)).rows;
    expect(rows.map((r) => [r.rank, r.displayName, r.valid])).toEqual([[1, "Aaa O.", 8], [2, "Bbb T.", 6], [3, "Ccc T.", 4]]);
    expect(two).toBeTruthy();
    expect((await me(three)).rank).toBe(3);
  });

  test("covers 0018 AC-5: a student who is not on the board leaving after the freeze changes no row", async () => {
    const t = makeBackend();
    const [one] = await frozenFour(t);
    const idle = await joinedStudent(t, { name: "Idle Person" }).catch(() => null);
    expect(idle).toBeNull(); // joining after the deadline is refused, so there is no new entry
    const before = (await snapshot(t))[0];
    expect((await board(one)).rows).toEqual(before.rows);
  });
});

describe("who may read the board (0018 AC-6)", () => {
  test("covers 0018 AC-6: a signed out visitor is refused with not_signed_in", async () => {
    const t = makeBackend();
    await expect(t.query(api.challenge.leaderboard, {})).rejects.toMatchObject({ data: { code: "not_signed_in" } });
  });

  test("covers 0018 AC-6: a signed in account with no profile is refused; a student without the challenge can read the board", async () => {
    const t = makeBackend();
    const bare = await signInAs(t, { sessionDays: 900 });
    await expect(bare.as.query(api.challenge.leaderboard, {})).rejects.toMatchObject({ data: { code: "no_profile" } });
    const watcher = await student(t, { name: "Just Watching" });
    expect(await watcher.as.query(api.challenge.leaderboard, {})).toMatchObject({ rows: [], myRank: null });
  });

  test("covers 0015 AC-1: nothing in the job file is callable from a browser; the only public board function is the read", () => {
    const text = readFileSync(new URL("./challengeBoard.ts", import.meta.url), "utf8");
    expect(text).toMatch(/export const run = internalMutation\(/);
    expect(text).not.toMatch(/(mutation|query|action)\(\{/);
    const challenge = readFileSync(new URL("./challenge.ts", import.meta.url), "utf8");
    expect(challenge).toMatch(/export const leaderboard = query\(/);
  });
});
