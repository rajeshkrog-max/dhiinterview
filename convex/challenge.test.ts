// The live challenge, first milestone (spec 0015 M1; specs 0016 and 0017): joining as a student, a pending referral at sign up, and the
// 5 minute job that settles a referral and recounts. Each test names the criterion it covers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { CODE_RE, ENDS_AT_MS } from "./challengeRules";
import { CHALLENGE_CONSENT_VERSION, CHALLENGE_CONSENT_LINES, CONSENT_TEXTS, consentHash } from "./consentText";
import { makeBackend, opt, profileInput, signInAs, type Backend } from "../tests/convexTestUtils";

// The first test loads the scoring engine, which can take longer than the 5 second default on a cold start.
vi.setConfig({ testTimeout: 30_000 });

const DAY = 24 * 60 * 60 * 1000;
const GOOD_NOTE = "I liked how calm and clear this report felt to read.";
const WEAK_NOTE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // long enough, but one character repeated

// Fake timers keep the jobs the mutations schedule from running by themselves, and let a test move the clock.
const AUTH_ENV = { BETTER_AUTH_URL: "https://example.test", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  Object.assign(process.env, AUTH_ENV);
  process.env.CHALLENGE_LIVE = "true";
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
  delete process.env.CHALLENGE_LIVE;
});

// A signed in student with a profile and (unless `finish` is false) a finished check. `code` is the referral code sent with the form.
async function student(t: Backend, opts: { name?: string; age?: number; finish?: boolean; code?: string } = {}) {
  const s = await signInAs(t, { sessionDays: 900 });
  const age = opts.age ?? 20;
  await s.as.mutation(api.students.createProfile, await profileInput({ name: opts.name ?? "Asha Rao", age, guardianPresent: age < 18, ...(opts.code !== undefined ? { referralCode: opts.code } : {}) }));
  if (opts.finish !== false) {
    await s.as.mutation(api.checks.saveAnswers, { answers: Array.from({ length: 18 }, (_, i) => ({ q: i + 1, optionId: opt(i + 1, 2), answeredAt: Date.now() })) });
    await s.as.mutation(api.checks.complete, {});
  }
  return s;
}
type Student = Awaited<ReturnType<typeof student>>;

const join = (s: Student, args: { rulesAccepted?: boolean; parentConsent?: boolean; hideName?: boolean } = {}) =>
  s.as.mutation(api.challenge.join, { rulesAccepted: true, ...args });
async function joined(s: Student, args: { hideName?: boolean } = {}) {
  const r = await join(s, args);
  if (!r.ok) throw new Error(`join refused: ${r.code}`);
  return r.code;
}
const seeReport = (s: Student) => s.as.mutation(api.checks.markReportSeen, {});
const leaveNote = (s: Student, text = GOOD_NOTE) => s.as.mutation(api.feedback.submit, { rating: 5, text, canShare: false });
// A friend who did every step.
async function completeFriend(s: Student, text = GOOD_NOTE) {
  await seeReport(s);
  await leaveNote(s, text);
}
const runJob = (t: Backend) => t.mutation(internal.challengeBoard.run, {});
const tables = (t: Backend) =>
  t.run(async (ctx) => ({
    entries: await ctx.db.query("challengeEntries").collect(),
    referrals: await ctx.db.query("referrals").collect(),
    challengeConsents: (await ctx.db.query("consents").collect()).filter((c) => c.kind === "challenge"),
  }));
const errorCode = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { data?: { code?: string } }).data?.code ?? `error:${String((e as Error).message).slice(0, 60)}`;
  }
};

describe("challenge.join", () => {
  test("covers 0017 AC-1, AC-3: an adult with a finished check joins, gets a code in the shared pattern, and a challenge consent row is added", async () => {
    const t = makeBackend();
    const s = await student(t, { name: "Ananya Rao" });
    const r = await join(s);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(r.code).toMatch(CODE_RE);
    expect(r.code.slice(0, 3)).toBe("ANA");
    const { entries, challengeConsents } = await tables(t);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ code: r.code, hideName: false, validCount: 0 });
    expect(challengeConsents).toHaveLength(1);
    expect(challengeConsents[0]).toMatchObject({ kind: "challenge", textVersion: CHALLENGE_CONSENT_VERSION, ageAtConsent: 20, guardianPresent: false });
    expect(entries[0].consentId).toBe(challengeConsents[0]._id);
  });

  test("covers 0017 AC-3: the exact words of challenge-v1 are stored once, with their fingerprint, and kept for the next student", async () => {
    const t = makeBackend();
    await joined(await student(t));
    await joined(await student(t, { name: "Ravi Kumar" }));
    const rows = await t.run(async (ctx) => await ctx.db.query("consentTexts").collect());
    const mine = rows.filter((r) => r.version === CHALLENGE_CONSENT_VERSION);
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toBe(CONSENT_TEXTS[CHALLENGE_CONSENT_VERSION]);
    expect(mine[0].text).toBe(CHALLENGE_CONSENT_LINES.join("\n\n"));
    expect(mine[0].hash).toBe(await consentHash(mine[0].text));
  });

  test("covers 0017 AC-1: a second join returns the same code and changes nothing", async () => {
    const t = makeBackend();
    const s = await student(t);
    const first = await joined(s);
    const again = await join(s);
    expect(again).toEqual({ ok: true, code: first });
    const { entries, challengeConsents } = await tables(t);
    expect(entries).toHaveLength(1);
    expect(challengeConsents).toHaveLength(1);
  });

  test("covers 0016 AC-1: students with the same first name get different codes, each starting with their letters", async () => {
    const t = makeBackend();
    const codes = new Set<string>();
    for (let i = 0; i < 12; i++) codes.add(await joined(await student(t, { name: "Asha Rao" })));
    expect(codes.size).toBe(12);
    for (const c of codes) expect(c).toMatch(/^ASH[A-HJ-NP-Z2-9]{4}$/);
  });

  test("covers 0016 AC-1: a name with no Latin letters gets DHI", async () => {
    const t = makeBackend();
    expect((await joined(await student(t, { name: "प्रिया शर्मा" }))).slice(0, 3)).toBe("DHI");
  });

  test("covers 0017 AC-4, 0015 AC-3: with CHALLENGE_LIVE off or unset, join answers not_open and creates nothing", async () => {
    const t = makeBackend();
    const s = await student(t);
    for (const off of [undefined, "", "false", "no"]) {
      if (off === undefined) delete process.env.CHALLENGE_LIVE;
      else process.env.CHALLENGE_LIVE = off;
      expect(await join(s)).toEqual({ ok: false, code: "not_open" });
    }
    const { entries, challengeConsents } = await tables(t);
    expect(entries).toHaveLength(0);
    expect(challengeConsents).toHaveLength(0);
  });

  test("covers 0017 AC-4: after the deadline join answers ended and creates nothing", async () => {
    const t = makeBackend();
    const s = await student(t);
    vi.setSystemTime(ENDS_AT_MS + 1000);
    expect(await join(s)).toEqual({ ok: false, code: "ended" });
    expect((await tables(t)).entries).toHaveLength(0);
  });

  test("covers 0017 AC-4: 23:59:00 exactly still joins; the switch is read on every call, so turning it on later opens joining", async () => {
    const t = makeBackend();
    const s = await student(t);
    delete process.env.CHALLENGE_LIVE;
    expect(await join(s)).toMatchObject({ ok: false, code: "not_open" });
    process.env.CHALLENGE_LIVE = "on";
    vi.setSystemTime(ENDS_AT_MS);
    expect(await join(s)).toMatchObject({ ok: true });
  });

  test("covers 0017 AC-2: without the rules tick it answers rules and creates nothing", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await join(s, { rulesAccepted: false })).toEqual({ ok: false, code: "rules" });
    expect((await tables(t)).entries).toHaveLength(0);
  });

  test("covers 0017 AC-2: a student under 18 needs the parent tick; the server reads the age, and the tick is stored as guardianPresent", async () => {
    const t = makeBackend();
    const s = await student(t, { age: 15 });
    expect(await join(s)).toEqual({ ok: false, code: "parentConsent" });
    expect(await join(s, { parentConsent: false })).toEqual({ ok: false, code: "parentConsent" });
    expect((await tables(t)).entries).toHaveLength(0);
    expect(await join(s, { parentConsent: true })).toMatchObject({ ok: true });
    const { challengeConsents } = await tables(t);
    expect(challengeConsents[0]).toMatchObject({ ageAtConsent: 15, guardianPresent: true });
  });

  test("covers 0017 AC-2: an adult does not need the parent tick, and a parent tick from an adult is not recorded as a guardian", async () => {
    const t = makeBackend();
    const s = await student(t, { age: 18 });
    expect(await join(s, { parentConsent: true })).toMatchObject({ ok: true });
    expect((await tables(t)).challengeConsents[0].guardianPresent).toBe(false);
  });

  test("covers 0017 AC-7: without a finished check it answers no_result", async () => {
    const t = makeBackend();
    const s = await student(t, { finish: false });
    expect(await join(s)).toEqual({ ok: false, code: "no_result" });
    expect((await tables(t)).entries).toHaveLength(0);
  });

  test("covers 0017 AC-8: 5 tries an hour for each student, then rate_limited; another student is not affected", async () => {
    const t = makeBackend();
    const s = await student(t);
    for (let i = 0; i < 5; i++) expect(await join(s, { rulesAccepted: false })).toEqual({ ok: false, code: "rules" });
    expect(await join(s, { rulesAccepted: false })).toEqual({ ok: false, code: "rate_limited" });
    expect(await join(s)).toEqual({ ok: false, code: "rate_limited" });
    expect(await join(await student(t))).toMatchObject({ ok: true });
  });

  test("covers 0015 AC-1: a visitor who is not signed in, or has no profile, is refused with a code", async () => {
    const t = makeBackend();
    expect(await errorCode(t.mutation(api.challenge.join, { rulesAccepted: true }))).toBe("not_signed_in");
    const { as } = await signInAs(t);
    expect(await errorCode(as.mutation(api.challenge.join, { rulesAccepted: true }))).toBe("no_profile");
  });

  test("covers 0017 AC-5: the hide my name choice at join is stored on the entry", async () => {
    const t = makeBackend();
    await joined(await student(t), { hideName: true });
    expect((await tables(t)).entries[0].hideName).toBe(true);
  });
});

describe("challenge.me", () => {
  test("covers 0016 AC-8: a student who has not joined sees no code and zero counts, with the dates", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await s.as.query(api.challenge.me, {})).toEqual({
      open: true, joined: false, code: null, hideName: false, valid: 0, pending: 0, rank: null, toNext: null, nextRank: null, endsAt: ENDS_AT_MS, frozen: false,
    });
  });

  test("covers 0015 AC-3: open follows the switch", async () => {
    const t = makeBackend();
    const s = await student(t);
    delete process.env.CHALLENGE_LIVE;
    expect((await s.as.query(api.challenge.me, {})).open).toBe(false);
  });

  test("covers 0016 AC-8: a referrer sees their code, valid from the entry and pending counted live; nothing about a friend", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    await student(t, { name: "Secret Friend", code });
    await student(t, { name: "Another Friend", code });
    const me = await a.as.query(api.challenge.me, {});
    expect(me).toMatchObject({ joined: true, code, valid: 0, pending: 2, hideName: false });
    expect(JSON.stringify(me)).not.toMatch(/Secret|Another|@/);
  });

  test("covers 0015 AC-1: a student cannot see another student's entry (no input names a student)", async () => {
    const t = makeBackend();
    const a = await student(t);
    await joined(a);
    const b = await student(t, { name: "Ravi" });
    expect(await b.as.query(api.challenge.me, {})).toMatchObject({ joined: false, code: null });
  });
});

describe("a pending referral at sign up", () => {
  test("covers 0016 AC-3: a new student who signs up with a joined student's code makes one pending referral", async () => {
    const t = makeBackend();
    const a = await student(t);
    const code = await joined(a);
    const friend = await student(t, { name: "Ravi Kumar", code });
    const { referrals, entries } = await tables(t);
    expect(referrals).toHaveLength(1);
    expect(referrals[0]).toMatchObject({ code, status: "pending", referrerId: entries[0].studentId });
    expect(referrals[0].friendId).not.toBe(referrals[0].referrerId);
    expect(referrals[0].validAt).toBeUndefined();
    expect(await friend.as.query(api.challenge.me, {})).toMatchObject({ joined: false });
  });

  test("covers 0016 AC-3: the code may be typed in lower case with spaces", async () => {
    const t = makeBackend();
    const code = await joined(await student(t));
    await student(t, { name: "Ravi", code: `  ${code.toLowerCase()} ` });
    expect((await tables(t)).referrals).toHaveLength(1);
  });

  test("covers 0016 AC-3, AC-10: a code with a wrong shape or no owner never blocks sign in and records nothing", async () => {
    const t = makeBackend();
    await joined(await student(t));
    for (const code of ["", "ABC", "ASHXXXX", "!!!!!!!", "ZZZZZZZ", "ASH0000", "TOOLONGCODE1"]) {
      const s = await student(t, { name: "Friend", code });
      expect(await s.as.query(api.students.me, {}), code).toMatchObject({ state: "ready" });
    }
    expect((await tables(t)).referrals).toHaveLength(0);
  });

  test("covers 0016 AC-3, 0015 AC-3: with the switch off, or after the deadline, no referral is made but sign in works", async () => {
    const t = makeBackend();
    const code = await joined(await student(t));
    delete process.env.CHALLENGE_LIVE;
    const off = await student(t, { name: "Off", code });
    expect(await off.as.query(api.students.me, {})).toMatchObject({ state: "ready" });
    process.env.CHALLENGE_LIVE = "true";
    vi.setSystemTime(ENDS_AT_MS + 1000);
    const late = await student(t, { name: "Late", code });
    expect(await late.as.query(api.students.me, {})).toMatchObject({ state: "ready" });
    expect((await tables(t)).referrals).toHaveLength(0);
  });

  test("covers 0016 AC-4: a student who already has a profile and comes back with a code creates no referral", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    const existing = await student(t, { name: "Old Hand" });
    // the same account submits the form again with the link's code: createProfile returns the student it already has
    await existing.as.mutation(api.students.createProfile, await profileInput({ name: "Old Hand", referralCode: code }));
    expect((await tables(t)).referrals).toHaveLength(0);
  });

  test("covers 0016 AC-3: a student cannot refer themselves (their own code on their own sign up finds nobody else)", async () => {
    const t = makeBackend();
    // The only way to use your own code is to already have one, which needs a profile first; so the owner row cannot equal the friend row.
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    await a.as.mutation(api.students.createProfile, await profileInput({ referralCode: code }));
    expect((await tables(t)).referrals).toHaveLength(0);
  });

  test("covers 0016 AC-3: one friend, one referral; the first code wins", async () => {
    const t = makeBackend();
    const codeA = await joined(await student(t, { name: "Ananya" }));
    const codeB = await joined(await student(t, { name: "Bina" }));
    const friend = await student(t, { name: "Ravi", code: codeA });
    await friend.as.mutation(api.students.createProfile, await profileInput({ name: "Ravi", referralCode: codeB }));
    const { referrals } = await tables(t);
    expect(referrals).toHaveLength(1);
    expect(referrals[0].code).toBe(codeA);
  });
});

describe("feedback.genuineAt", () => {
  test("covers 0016 AC-9: a genuine note gets genuineAt at the time it was saved; a weak note has none", async () => {
    const t = makeBackend();
    const good = await student(t, { name: "Good" });
    const weak = await student(t, { name: "Weak" });
    await seeReport(good);
    await seeReport(weak);
    vi.setSystemTime(Date.now() + 5000);
    const at = Date.now();
    await leaveNote(good);
    await leaveNote(weak, WEAK_NOTE);
    const rows = await t.run(async (ctx) => await ctx.db.query("feedback").collect());
    const g = rows.find((r) => r.genuine)!;
    const w = rows.find((r) => !r.genuine)!;
    expect(g.genuineAt).toBe(at);
    expect(w.genuineAt).toBeUndefined();
  });
});

describe("the 5 minute job", () => {
  test("covers 0016 AC-5, AC-7, 0017 AC-1: join, a friend signs up with the code, finishes, sees the report and leaves a genuine note, and the referrer's valid count goes up after the job", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    const friend = await student(t, { name: "Ravi Kumar", code });
    expect(await a.as.query(api.challenge.me, {})).toMatchObject({ valid: 0, pending: 1 });

    await completeFriend(friend);
    // the count follows the job, not the friend's last step
    expect(await a.as.query(api.challenge.me, {})).toMatchObject({ valid: 0, pending: 1 });
    await runJob(t);

    const { referrals, entries } = await tables(t);
    expect(referrals[0]).toMatchObject({ status: "valid" });
    expect(referrals[0].validAt).toBe(Date.now());
    expect(entries[0]).toMatchObject({ validCount: 1, lastValidAt: referrals[0].validAt });
    expect(await a.as.query(api.challenge.me, {})).toMatchObject({ valid: 1, pending: 0 });
  });

  test("covers 0016 AC-5: the job needs all three steps; each missing one leaves the referral pending", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    const noReport = await student(t, { name: "NoReport", code });
    const noNote = await student(t, { name: "NoNote", code });
    const unfinished = await student(t, { name: "Unfinished", code, finish: false });
    await seeReport(noNote);
    expect(unfinished).toBeTruthy();
    expect(noReport).toBeTruthy();
    await runJob(t);
    const { referrals, entries } = await tables(t);
    expect(referrals.map((r) => r.status)).toEqual(["pending", "pending", "pending"]);
    expect(entries[0].validCount).toBe(0);
  });

  test("covers 0016 AC-5, AC-9: a note that is not genuine leaves the referral pending", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    await completeFriend(await student(t, { name: "Ravi", code }), WEAK_NOTE);
    await runJob(t);
    expect((await tables(t)).referrals[0].status).toBe("pending");
  });

  test("covers 0016 AC-5, AC-6: an imported check never counts, even with the report and a genuine note", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    const friend = await student(t, { name: "Ravi", code, finish: false });
    await friend.as.mutation(api.checks.importLocal, { answers: Object.fromEntries(Array.from({ length: 18 }, (_, i) => [`q${i + 1}`, opt(i + 1, 2)])) });
    await friend.as.mutation(api.checks.complete, {});
    await completeFriend(friend);
    await runJob(t);
    expect((await tables(t)).referrals[0].status).toBe("pending");
    vi.setSystemTime(ENDS_AT_MS + 1000);
    await runJob(t);
    const { referrals, entries } = await tables(t);
    expect(referrals[0]).toMatchObject({ status: "rejected", rejectReason: "deadline" });
    expect(entries[0].validCount).toBe(0);
  });

  test("covers 0016 AC-6: a step after the deadline rejects the referral and it never counts", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    const friend = await student(t, { name: "Ravi", code });
    await seeReport(friend);
    vi.setSystemTime(ENDS_AT_MS + 60_000); // the note comes at 23:59:30 or later
    await leaveNote(friend);
    await runJob(t);
    const { referrals, entries } = await tables(t);
    expect(referrals[0]).toMatchObject({ status: "rejected", rejectReason: "deadline" });
    expect(referrals[0].validAt).toBeUndefined();
    expect(entries[0].validCount).toBe(0);
  });

  test("covers 0016 AC-6: a friend with every step done by the deadline counts even when the job first runs after it", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    const friend = await student(t, { name: "Ravi", code });
    vi.setSystemTime(ENDS_AT_MS - 10_000);
    await completeFriend(friend);
    vi.setSystemTime(ENDS_AT_MS + 3 * DAY);
    await runJob(t);
    const { referrals, entries } = await tables(t);
    expect(referrals[0]).toMatchObject({ status: "valid", validAt: ENDS_AT_MS - 10_000 });
    expect(entries[0].validCount).toBe(1);
  });

  test("covers 0016 AC-6: a step still missing once the deadline has passed rejects it", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    const friend = await student(t, { name: "Ravi", code });
    await seeReport(friend); // no note
    vi.setSystemTime(ENDS_AT_MS + 1000);
    await runJob(t);
    expect((await tables(t)).referrals[0]).toMatchObject({ status: "rejected", rejectReason: "deadline" });
  });

  test("covers 0016 AC-7: validCount is recounted from the rows and lastValidAt is the latest validAt", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    const first = await student(t, { name: "First", code });
    await completeFriend(first);
    vi.setSystemTime(Date.now() + 60_000);
    const second = await student(t, { name: "Second", code });
    await completeFriend(second);
    const lastAt = Date.now();
    await student(t, { name: "Third", code }); // still pending
    await runJob(t);
    const { entries } = await tables(t);
    expect(entries[0]).toMatchObject({ validCount: 2, lastValidAt: lastAt });
    expect(await a.as.query(api.challenge.me, {})).toMatchObject({ valid: 2, pending: 1 });
  });

  test("covers 0016 AC-10: the job is safe to run twice in a row, and the second run changes nothing", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    await completeFriend(await student(t, { name: "Ravi", code }));
    await runJob(t);
    const once = await tables(t);
    await runJob(t);
    expect(await tables(t)).toEqual(once);
    expect(once.entries[0].validCount).toBe(1);
  });

  test("covers 0015 AC-3: with the switch off the job does nothing", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    await completeFriend(await student(t, { name: "Ravi", code }));
    delete process.env.CHALLENGE_LIVE;
    await runJob(t);
    const { referrals, entries } = await tables(t);
    expect(referrals[0].status).toBe("pending");
    expect(entries[0].validCount).toBe(0);
  });

  test("covers 0015 AC-6: a friend whose data is gone loses the referral and the referrer is counted again", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    const keep = await student(t, { name: "Keep", code });
    await completeFriend(keep);
    await runJob(t);
    expect(await a.as.query(api.challenge.me, {})).toMatchObject({ valid: 1 });
    const gone = await student(t, { name: "Gone", code });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("students").collect()).find((s) => s.name === "Gone")!;
      await ctx.db.delete("students", row._id);
    });
    expect(gone).toBeTruthy();
    await runJob(t);
    const { referrals } = await tables(t);
    expect(referrals).toHaveLength(1);
    expect(referrals[0].status).toBe("valid");
  });

  test("covers 0016 AC-7: a referrer with many pending referrals is settled in pages, all of them", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    // 130 fake friends with no student row behind them (a friend whose data is gone is deleted by the job), so each page visibly shrinks the table
    const times = await t.run(async (ctx) => {
      const entry = (await ctx.db.query("challengeEntries").first())!;
      const friend = (await ctx.db.query("students").first())!;
      const out: number[] = [];
      for (let i = 0; i < 130; i++) {
        const gone = await ctx.db.insert("students", { authUserId: `x${i}`, email: `x${i}@example.com`, name: "X", age: 20, class: "College" });
        const id = await ctx.db.insert("referrals", { referrerId: entry.studentId, friendId: gone, code, usedAt: Date.now(), status: "pending" });
        out.push((await ctx.db.get("referrals", id))!._creationTime);
        await ctx.db.delete("students", gone);
      }
      expect(friend).toBeTruthy();
      return out;
    });
    await runJob(t);
    // the first page is 100 rows, and a full page starts the next one itself, from the last row it saw
    expect((await tables(t)).referrals).toHaveLength(30);
    const next = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(next.filter((f) => f.name.includes("challengeBoard") && (f.args[0] as { after?: number }).after === times[99])).toHaveLength(1);
    await t.mutation(internal.challengeBoard.run, { after: times[99] });
    expect((await tables(t)).referrals).toHaveLength(0);
  });
});

describe("what a student can never learn", () => {
  test("covers 0015 AC-2: nothing the join or me returns carries an email, a phone, an age, a flag or a student id", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const r = await join(a);
    const me = await a.as.query(api.challenge.me, {});
    const text = JSON.stringify([r, me]);
    expect(text).not.toMatch(/@|selfDoubt|lowMood|age|phone|studentId/i);
  });
});

// ---------- milestone 2: hide my name, leave, the public code check, the weak note replacement, the BACKEND.md scenarios ----------

const setHide = (s: Student, hideName: boolean) => s.as.mutation(api.challenge.setHideName, { hideName });
const leave = (s: Student) => s.as.mutation(api.challenge.leave, {});
const VISITOR = "0123456789abcdef0123456789abcdef";
const OTHER_VISITOR = "fedcba9876543210fedcba9876543210";
async function codeCheck(t: Backend, code: string, visitor: string | null = VISITOR) {
  const res = await t.fetch(`/api/referral/validate?code=${encodeURIComponent(code)}`, { headers: visitor ? { "x-visitor": visitor } : {} });
  return { status: res.status, body: await res.json(), res };
}
const allConsents = (t: Backend) => t.run(async (ctx) => (await ctx.db.query("consents").collect()).filter((c) => c.kind === "challenge"));
const feedbackRows = (t: Backend) => t.run(async (ctx) => await ctx.db.query("feedback").collect());
const sheetRows = (t: Backend) => t.run(async (ctx) => await ctx.db.query("sheetSync").collect());

describe("challenge.setHideName", () => {
  test("covers 0017 AC-5: it changes the choice both ways, and me shows it", async () => {
    const t = makeBackend();
    const s = await student(t);
    await joined(s);
    expect(await setHide(s, true)).toEqual({ ok: true });
    expect(await s.as.query(api.challenge.me, {})).toMatchObject({ hideName: true });
    expect(await setHide(s, false)).toEqual({ ok: true });
    expect(await s.as.query(api.challenge.me, {})).toMatchObject({ hideName: false });
  });

  test("covers 0017 AC-5: a student who has not joined gets not_joined, and after the deadline ended", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await setHide(s, true)).toEqual({ ok: false, code: "not_joined" });
    await joined(s);
    vi.setSystemTime(ENDS_AT_MS + 1000);
    expect(await setHide(s, true)).toEqual({ ok: false, code: "ended" });
    expect((await tables(t)).entries[0].hideName).toBe(false);
  });

  test("covers 0015 AC-1: it changes only the caller's own entry", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const b = await student(t, { name: "Bina" });
    await joined(a);
    await joined(b);
    await setHide(a, true);
    const rows = (await tables(t)).entries;
    expect(rows.filter((r) => r.hideName)).toHaveLength(1);
  });
});

describe("challenge.leave", () => {
  test("covers 0017 AC-6: it deletes the entry, keeps the consent and the referral rows, and the code answers unknown", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    await student(t, { name: "Ravi", code });
    expect(await leave(a)).toEqual({ ok: true });
    const { entries, referrals } = await tables(t);
    expect(entries).toHaveLength(0);
    expect(referrals).toHaveLength(1);
    expect(await allConsents(t)).toHaveLength(1);
    expect((await codeCheck(t, code)).body).toEqual({ ok: false, reason: "unknown" });
    expect(await a.as.query(api.challenge.me, {})).toMatchObject({ joined: false, code: null });
  });

  test("covers 0017 AC-6: a student who has not joined gets not_joined; leaving twice is safe", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await leave(s)).toEqual({ ok: false, code: "not_joined" });
    await joined(s);
    expect(await leave(s)).toEqual({ ok: true });
    expect(await leave(s)).toEqual({ ok: false, code: "not_joined" });
  });

  test("covers 0017 AC-6: a left code makes no new referral at sign up", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    await leave(a);
    const friend = await student(t, { name: "Ravi", code });
    expect(await friend.as.query(api.students.me, {})).toMatchObject({ state: "ready" });
    expect((await tables(t)).referrals).toHaveLength(0);
  });

  test("covers 0017 AC-6: joining again before the deadline gives a new code and a second consent row; valid referrals already earned are counted again", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const first = await joined(a);
    await completeFriend(await student(t, { name: "Ravi", code: first }));
    await runJob(t);
    expect((await tables(t)).entries[0].validCount).toBe(1);
    await leave(a);
    const second = await joined(a);
    expect(second).not.toBe(first);
    expect(await allConsents(t)).toHaveLength(2);
    expect(await a.as.query(api.challenge.me, {})).toMatchObject({ joined: true, code: second, valid: 1 });
  });

  test("covers 0017 AC-6: leaving works after the deadline too, and joining then does not", async () => {
    const t = makeBackend();
    const s = await student(t);
    await joined(s);
    vi.setSystemTime(ENDS_AT_MS + 1000);
    expect(await leave(s)).toEqual({ ok: true });
    expect(await join(s)).toEqual({ ok: false, code: "ended" });
  });

  test("covers 0016 AC-7: the job does not fail for a referrer who left", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    const friend = await student(t, { name: "Ravi", code });
    await leave(a);
    await completeFriend(friend);
    await runJob(t);
    expect((await tables(t)).referrals[0].status).toBe("valid"); // keeps its own status; it counts for nobody while the referrer is out
  });
});

describe("the public code check: GET /api/referral/validate", () => {
  test("covers 0016 AC-2: a real code gives the owner's first name and nothing else", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "ananya SHARMA rao" }));
    const r = await codeCheck(t, code);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, referrerFirstName: "Ananya" });
    expect(JSON.stringify(r.body)).not.toMatch(/Sharma|@|age|class/i);
    expect(r.res.headers.get("cache-control")).toBe("no-store");
  });

  test("covers 0016 AC-2: the code may be lower case; the answer is the same", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    expect((await codeCheck(t, code.toLowerCase())).body).toEqual({ ok: true, referrerFirstName: "Ananya" });
  });

  test("covers 0016 AC-2, AC-10: a hidden owner shows as a friend", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }), { hideName: true });
    expect((await codeCheck(t, code)).body).toEqual({ ok: true, referrerFirstName: "a friend" });
  });

  test("covers 0016 AC-2: a wrong shape answers format, an unknown code unknown, and both are 200 without any student data", async () => {
    const t = makeBackend();
    await joined(await student(t));
    for (const bad of ["", "ABC", "ASH0000", "!!!!!!!", "TOOLONGCODEXYZ"]) {
      const r = await codeCheck(t, bad);
      expect(r.status, bad).toBe(200);
      expect(r.body, bad).toEqual({ ok: false, reason: "format" });
    }
    const r = await codeCheck(t, "ZZZZZZZ");
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: false, reason: "unknown" });
  });

  test("covers 0016 AC-2: after the deadline it answers ended; with the switch off it gives no hint", async () => {
    const t = makeBackend();
    const code = await joined(await student(t));
    delete process.env.CHALLENGE_LIVE;
    expect((await codeCheck(t, code)).body).toEqual({ ok: false, reason: "unknown" });
    process.env.CHALLENGE_LIVE = "true";
    vi.setSystemTime(ENDS_AT_MS + 1000);
    expect((await codeCheck(t, code)).body).toEqual({ ok: false, reason: "ended" });
  });

  test("covers 0016 AC-2: there is no self answer, whoever asks", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Ananya" });
    const code = await joined(a);
    const res = await a.as.fetch(`/api/referral/validate?code=${code}`, { headers: { "x-visitor": VISITOR } });
    expect(await res.json()).toEqual({ ok: true, referrerFirstName: "Ananya" });
  });

  test("covers 0016 AC-2: over the limit it answers 429 slow_down, never a 500, and another visitor is not affected", async () => {
    const t = makeBackend();
    const code = await joined(await student(t));
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) statuses.push((await codeCheck(t, code, VISITOR)).status);
    expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(15);
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(28);
    expect(statuses.every((s) => s === 200 || s === 429)).toBe(true);
    expect(statuses[statuses.length - 1]).toBe(429);
    expect((await codeCheck(t, code, VISITOR)).body).toEqual({ code: "slow_down" });
    expect((await codeCheck(t, code, OTHER_VISITOR)).status).toBe(200);
  });

  test("covers 0016 AC-2: a bad shape never uses a limit token, and a caller with no visitor key still works in one shared bucket", async () => {
    const t = makeBackend();
    const code = await joined(await student(t));
    for (let i = 0; i < 60; i++) expect((await codeCheck(t, "ABC", VISITOR)).status).toBe(200);
    expect((await codeCheck(t, code, VISITOR)).body).toMatchObject({ ok: true });
    expect((await codeCheck(t, code, null)).body).toMatchObject({ ok: true });
    expect((await codeCheck(t, code, "not-a-hash")).body).toMatchObject({ ok: true });
  });
});

describe("a genuine note replaces a weak one", () => {
  test("covers 0016 AC-9: a weak note is replaced by a genuine one before the deadline; genuineAt is set and the Sheet row is queued again", async () => {
    const t = makeBackend();
    const s = await student(t);
    await seeReport(s);
    expect(await leaveNote(s, WEAK_NOTE)).toEqual({ ok: true, alreadySaved: false, genuine: false });
    const queued = (await sheetRows(t)).filter((r) => r.kind === "feedback");
    expect(queued).toHaveLength(1);
    await t.run(async (ctx) => await ctx.db.patch("sheetSync", queued[0]._id, { status: "sent", sentAt: Date.now(), rowHash: "abc" }));
    vi.setSystemTime(Date.now() + 60_000);
    const res = await s.as.mutation(api.feedback.submit, { rating: 4, text: GOOD_NOTE, canShare: true });
    expect(res).toEqual({ ok: true, alreadySaved: false, genuine: true });
    const rows = await feedbackRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rating: 4, text: GOOD_NOTE, genuine: true, genuineAt: Date.now(), canShare: true, chars: GOOD_NOTE.length });
    const again = (await sheetRows(t)).filter((r) => r.kind === "feedback");
    expect(again).toHaveLength(1); // the same queue row, sent again
    expect(again[0]).toMatchObject({ status: "pending", op: "upsert" });
  });

  test("covers 0016 AC-9: a genuine note is never replaced", async () => {
    const t = makeBackend();
    const s = await student(t);
    await seeReport(s);
    await leaveNote(s);
    const before = (await feedbackRows(t))[0];
    expect(await leaveNote(s, "A completely different and also very genuine second note about this report.")).toEqual({ ok: true, alreadySaved: true, genuine: true });
    expect((await feedbackRows(t))[0]).toEqual(before);
  });

  test("covers 0016 AC-9: a later weak note, or one too short, changes nothing", async () => {
    const t = makeBackend();
    const s = await student(t);
    await seeReport(s);
    await leaveNote(s, WEAK_NOTE);
    const before = (await feedbackRows(t))[0];
    expect(await leaveNote(s, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")).toEqual({ ok: true, alreadySaved: true, genuine: false });
    expect(await leaveNote(s, "short")).toEqual({ ok: true, alreadySaved: true, genuine: false });
    expect(await s.as.mutation(api.feedback.submit, { rating: 9, text: GOOD_NOTE, canShare: false })).toEqual({ ok: true, alreadySaved: true, genuine: false });
    expect((await feedbackRows(t))[0]).toEqual(before);
  });

  test("covers 0016 AC-9: after the deadline a weak note is not replaced", async () => {
    const t = makeBackend();
    const s = await student(t);
    await seeReport(s);
    await leaveNote(s, WEAK_NOTE);
    vi.setSystemTime(ENDS_AT_MS + 1000);
    expect(await leaveNote(s)).toEqual({ ok: true, alreadySaved: true, genuine: false });
    expect((await feedbackRows(t))[0].genuine).toBe(false);
  });

  test("covers 0016 AC-5, AC-9: the replacement is what makes the referral valid, with validAt at the replacement time", async () => {
    const t = makeBackend();
    const code = await joined(await student(t, { name: "Ananya" }));
    const friend = await student(t, { name: "Ravi", code });
    await completeFriend(friend, WEAK_NOTE);
    await runJob(t);
    expect((await tables(t)).referrals[0].status).toBe("pending");
    vi.setSystemTime(Date.now() + 120_000);
    await leaveNote(friend);
    const at = Date.now();
    await runJob(t);
    expect((await tables(t)).referrals[0]).toMatchObject({ status: "valid", validAt: at });
  });
});

// The twelve scenarios of BACKEND.md section 15, named by their number. 10 and 12 belong to the leaderboard and are in challengeBoard.test.ts
// ("covers scenario 10" and "covers scenario 12"), next to the ranking they need; `pnpm exec vitest run --project convex -t "covers scenario"` runs all twelve.
describe("BACKEND.md section 15 scenarios", () => {
  async function pair(t: Backend, opts: { friendFinish?: boolean } = {}) {
    const raj = await student(t, { name: "Raj Mehta" });
    const code = await joined(raj);
    const friend = await student(t, { name: "Friend", code, finish: opts.friendFinish });
    return { raj, code, friend };
  }
  const count = (s: Student) => s.as.query(api.challenge.me, {});

  test("covers scenario 1: a friend signs in with the code, answers 10 questions and stops: pending, Raj's count unchanged", async () => {
    const t = makeBackend();
    const { raj, friend } = await pair(t, { friendFinish: false });
    await friend.as.mutation(api.checks.saveAnswers, { answers: Array.from({ length: 10 }, (_, i) => ({ q: i + 1, optionId: opt(i + 1, 1), answeredAt: Date.now() })) });
    await runJob(t);
    expect((await tables(t)).referrals[0].status).toBe("pending");
    expect(await count(raj)).toMatchObject({ valid: 0, pending: 1 });
  });

  test("covers scenario 2: finished and at the report, but no feedback: pending", async () => {
    const t = makeBackend();
    const { raj, friend } = await pair(t);
    await seeReport(friend);
    await runJob(t);
    expect(await count(raj)).toMatchObject({ valid: 0, pending: 1 });
  });

  test("covers scenario 3: feedback of 4 characters is refused; a weak note of enough length is saved as not genuine; the referral stays pending", async () => {
    const t = makeBackend();
    const { raj, friend } = await pair(t);
    await seeReport(friend);
    expect(await friend.as.mutation(api.feedback.submit, { rating: 4, text: "good", canShare: false })).toEqual({ ok: false, code: "invalid_input" });
    expect(await feedbackRows(t)).toHaveLength(0);
    await leaveNote(friend, WEAK_NOTE);
    expect((await feedbackRows(t))[0].genuine).toBe(false);
    await runJob(t);
    expect(await count(raj)).toMatchObject({ valid: 0, pending: 1 });
  });

  test("covers scenario 4: a note of one repeated character, or of fewer than 5 different letters, is not genuine", async () => {
    const t = makeBackend();
    for (const junk of ["a".repeat(33), "asdasdasdasdasdasdasdasdasdasdasd"]) {
      const s = await student(t, { name: "Friend" });
      await seeReport(s);
      expect(await leaveNote(s, junk)).toMatchObject({ ok: true, genuine: false });
    }
  });

  test("covers scenario 5: every step with real feedback: valid, validAt set, Raj's count +1 after the job", async () => {
    const t = makeBackend();
    const { raj, friend } = await pair(t);
    await completeFriend(friend);
    await runJob(t);
    expect(await count(raj)).toMatchObject({ valid: 1, pending: 0 });
    expect((await tables(t)).referrals[0].validAt).toBeGreaterThan(0);
  });

  test("covers scenario 6: Raj uses his own code on his own sign in: nothing is recorded, and the code check has no self answer", async () => {
    const t = makeBackend();
    const raj = await student(t, { name: "Raj Mehta" });
    const code = await joined(raj);
    await raj.as.mutation(api.students.createProfile, await profileInput({ name: "Raj Mehta", referralCode: code }));
    expect((await tables(t)).referrals).toHaveLength(0);
    expect((await codeCheck(t, code)).body).not.toHaveProperty("reason");
  });

  test("covers scenario 7: an existing student opens a ?ref= link and signs in: no referral, Raj's count unchanged", async () => {
    const t = makeBackend();
    const raj = await student(t, { name: "Raj Mehta" });
    const code = await joined(raj);
    const old = await student(t, { name: "Old Hand" });
    await old.as.mutation(api.students.createProfile, await profileInput({ name: "Old Hand", referralCode: code }));
    await completeFriend(old);
    await runJob(t);
    expect((await tables(t)).referrals).toHaveLength(0);
    expect(await count(raj)).toMatchObject({ valid: 0, pending: 0 });
  });

  test("covers scenario 8: a friend who used code A and later opens code B's link: the first code wins, B gets nothing", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Anil" });
    const b = await student(t, { name: "Bela" });
    const codeA = await joined(a);
    const codeB = await joined(b);
    const friend = await student(t, { name: "Friend", code: codeA });
    await friend.as.mutation(api.students.createProfile, await profileInput({ name: "Friend", referralCode: codeB }));
    await completeFriend(friend);
    await runJob(t);
    expect(await count(a)).toMatchObject({ valid: 1 });
    expect(await count(b)).toMatchObject({ valid: 0, pending: 0 });
  });

  test("covers scenario 9: signing up at 23:50 IST on 30 Oct and leaving feedback at 00:05 IST on 31 Oct: rejected for the deadline; joining then answers ended", async () => {
    const t = makeBackend();
    const raj = await student(t, { name: "Raj Mehta" });
    const code = await joined(raj);
    vi.setSystemTime(Date.parse("2026-10-30T23:50:00+05:30"));
    const friend = await student(t, { name: "Friend", code });
    await seeReport(friend);
    vi.setSystemTime(Date.parse("2026-10-31T00:05:00+05:30"));
    await leaveNote(friend);
    await runJob(t);
    expect((await tables(t)).referrals[0]).toMatchObject({ status: "rejected", rejectReason: "deadline" });
    expect(await count(raj)).toMatchObject({ valid: 0, pending: 0 });
    expect(await join(await student(t, { name: "Late" }))).toEqual({ ok: false, code: "ended" });
  });

  test("covers scenario 11: a 15 year old without the parent tick is refused; with it the tick is stored with the consent", async () => {
    const t = makeBackend();
    const kid = await student(t, { name: "Kiran", age: 15 });
    expect(await join(kid)).toEqual({ ok: false, code: "parentConsent" });
    expect(await join(kid, { parentConsent: true })).toMatchObject({ ok: true });
    expect((await allConsents(t))[0]).toMatchObject({ guardianPresent: true, ageAtConsent: 15, textVersion: CHALLENGE_CONSENT_VERSION });
  });
});
