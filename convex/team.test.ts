// The team link to the saved report (spec 0008): the team check, the list, opening a PDF, the hourly limit, the audit rows and
// the rules about the `reportViews` table. Each test names the criterion it covers. The routes are called the way the browser
// calls them (with a signed in session), so the team check, the internal functions and the answers are tested together.
/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel";
import { REPORT_VERSION } from "./reportVersion";
import { TEAM_OPEN_PER_HOUR, cleanCursor, cleanRef, mayEnterTeam, parseTeamEmails, retryMessage } from "./teamCore";
import { finishedStudent, makeBackend, signInAs, type Backend } from "../tests/convexTestUtils";

// Fake timers keep scheduled jobs from running by themselves and let a test move the clock past the hour window.
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }));
// The router registers the sign in routes too, and they refuse to start without these three settings.
const AUTH_ENV = { BETTER_AUTH_URL: "https://example.test", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
const TEAM = "team@example.com";
beforeEach(() => Object.assign(process.env, AUTH_ENV, { TEAM_EMAILS: ` ${TEAM.toUpperCase()} , other.team@example.com,, ${TEAM}` }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.TEAM_EMAILS;
  delete process.env.TEST_SIGNIN_ENABLED;
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
});

const HOUR = 3_600_000;
const PDF = "%PDF-1.7 saved copy of the report";

const teamMember = (t: Backend, email = TEAM, emailVerified = true) => signInAs(t, { email, emailVerified });
const listPath = (query = "") => "/api/team/list" + query;
const reportPath = (s: string) => "/api/team/report?s=" + encodeURIComponent(s);
const views = (t: Backend) => t.run(async (ctx) => await ctx.db.query("reportViews").collect());

type Made = Awaited<ReturnType<typeof finishedStudent>> & { studentId: Id<"students">; checkId: Id<"checks">; resultId: Id<"results"> };

// A student with a finished check, found by id.
async function student(t: Backend, over: Record<string, unknown> = {}): Promise<Made> {
  const s = await finishedStudent(t, over);
  const ids = await t.run(async (ctx) => {
    const row = (await ctx.db.query("students").withIndex("by_authUserId", (q) => q.eq("authUserId", s.userId)).unique())!;
    const check = (await ctx.db.query("checks").withIndex("by_studentId", (q) => q.eq("studentId", row._id)).unique())!;
    const result = (await ctx.db.query("results").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique())!;
    return { studentId: row._id, checkId: check._id, resultId: result._id };
  });
  return { ...s, ...ids };
}

// Gives a student a stored copy, ready at `readyAt` (the way reportCopy.attach leaves the row).
async function giveCopy(t: Backend, ids: { studentId: Id<"students">; checkId: Id<"checks">; resultId: Id<"results"> }, over: { readyAt?: number; body?: string; state?: "ready" | "queued" } = {}) {
  const readyAt = over.readyAt ?? Date.now();
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([over.body ?? PDF], { type: "application/pdf" }));
    const fileId = await ctx.db.insert("reportFiles", {
      studentId: ids.studentId,
      checkId: ids.checkId,
      resultId: ids.resultId,
      state: over.state ?? "ready",
      wantedVersion: REPORT_VERSION,
      storageId,
      size: (over.body ?? PDF).length,
      sha256: "sha-" + readyAt,
      reportVersion: REPORT_VERSION,
      attempts: 0,
      createdAt: readyAt,
      readyAt,
    });
    return { fileId, storageId };
  });
}

async function readyStudent(t: Backend, over: Record<string, unknown> = {}, copy: { readyAt?: number; body?: string; state?: "ready" | "queued" } = {}) {
  const s = await student(t, over);
  const file = await giveCopy(t, s, copy);
  return { ...s, ...file };
}

describe("the pure rules", () => {
  test("covers AC-4: TEAM_EMAILS is split, trimmed, lowercased, and empty and repeated entries are dropped", () => {
    expect(parseTeamEmails(" A@x.com , ,b@X.com,a@x.com")).toEqual(["a@x.com", "b@x.com"]);
    expect(parseTeamEmails(undefined)).toEqual([]);
    expect(parseTeamEmails("")).toEqual([]);
    expect(parseTeamEmails(" , ")).toEqual([]);
  });

  test("covers AC-4: the list, the verified rule and the dev exception decide who may enter", () => {
    const a = { email: "a@x.com", emailVerified: true };
    expect(mayEnterTeam(a, "a@x.com", undefined)).toBe(true);
    expect(mayEnterTeam({ ...a, email: "A@X.com" }, "a@x.com", undefined)).toBe(true);
    expect(mayEnterTeam(a, "b@x.com", undefined)).toBe(false);
    expect(mayEnterTeam(a, undefined, undefined)).toBe(false);
    expect(mayEnterTeam(a, "", "true")).toBe(false);
    expect(mayEnterTeam({ ...a, emailVerified: false }, "a@x.com", undefined)).toBe(false);
    expect(mayEnterTeam({ ...a, emailVerified: false }, "a@x.com", "false")).toBe(false);
    const fake = { email: "team.e2e@example.com", emailVerified: false };
    expect(mayEnterTeam(fake, "team.e2e@example.com", "true")).toBe(true); // a fake test address, test sign in on (dev)
    expect(mayEnterTeam(fake, "team.e2e@example.com", undefined)).toBe(false); // test sign in off (production)
    expect(mayEnterTeam({ ...a, emailVerified: false }, "a@x.com", "true")).toBe(false); // a real looking address must still be verified, even on dev
    expect(mayEnterTeam({ email: "me@gmail.com", emailVerified: false }, "me@gmail.com", "true")).toBe(false);
    expect(mayEnterTeam({ email: "me@gmail.com", emailVerified: true }, "me@gmail.com", "true")).toBe(true);
    expect(mayEnterTeam({ email: "me@notexample.com", emailVerified: false }, "me@notexample.com", "true")).toBe(false); // only the @example.com domain
    expect(mayEnterTeam({ email: "x@example.com", emailVerified: false }, "y@example.com", "true")).toBe(false); // the exception never skips the list
  });

  test("covers AC-2: spaces around a code are ignored, and an empty, long or odd code is not a code", () => {
    expect(cleanRef("  abc123 ")).toBe("abc123");
    expect(cleanRef("")).toBeNull();
    expect(cleanRef("   ")).toBeNull();
    expect(cleanRef("ab cd")).toBeNull();
    expect(cleanRef("a".repeat(65))).toBeNull();
    expect(cleanRef("<img>")).toBeNull();
    expect(cleanRef(null)).toBeNull();
  });

  test("covers AC-1: a cursor is passed on, an empty one starts the list, and an oversized one is refused", () => {
    expect(cleanCursor("abc")).toBe("abc");
    expect(cleanCursor("")).toBeNull();
    expect(cleanCursor(null)).toBeNull();
    expect(cleanCursor("a".repeat(4001))).toBe("bad");
  });

  test("covers AC-6: the try again time is written in India time", () => {
    // 2026-10-09 10:15 UTC is 15:45 in India
    expect(retryMessage(Date.UTC(2026, 9, 9, 10, 15))).toContain("3:45 pm (India time)");
    expect(retryMessage(Date.UTC(2026, 9, 9, 18, 30))).toContain("12:00 am (India time)");
    expect(retryMessage(Date.UTC(2026, 9, 9, 6, 30))).toContain("12:00 pm (India time)");
  });
});

describe("the team check", () => {
  test("covers AC-4: a signed out visitor gets 401 from both routes, with nothing else in the answer", async () => {
    const t = makeBackend();
    const { studentId } = await readyStudent(t);
    for (const path of [listPath(), reportPath(studentId)]) {
      const res = await t.fetch(path);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ code: "not_signed_in" });
      expect(res.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(await views(t)).toHaveLength(0);
  });

  test("covers AC-4: a student, and any other Google account, gets 403 with no student data", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t, { name: "Asha Rao" });
    const stranger = await signInAs(t, { email: "someone.else@example.com" });
    for (const who of [ready, stranger]) {
      for (const path of [listPath(), listPath("?ref=" + ready.studentId), reportPath(ready.studentId)]) {
        const res = await who.as.fetch(path);
        expect(res.status).toBe(403);
        const text = await res.text();
        expect(JSON.parse(text)).toEqual({ code: "not_team" });
        expect(text).not.toContain("Asha");
      }
    }
    expect(await views(t)).toHaveLength(0);
  });

  test("covers AC-4: with TEAM_EMAILS unset or empty, everyone is refused", async () => {
    const t = makeBackend();
    const { studentId } = await readyStudent(t);
    const member = await teamMember(t);
    for (const value of [undefined, "", " , "]) {
      if (value === undefined) delete process.env.TEAM_EMAILS;
      else process.env.TEAM_EMAILS = value;
      expect((await member.as.fetch(listPath())).status).toBe(403);
      expect((await member.as.fetch(reportPath(studentId))).status).toBe(403);
    }
    expect(await views(t)).toHaveLength(0);
  });

  test("covers AC-4: the email is matched in any letter case, and the list entries are trimmed", async () => {
    const t = makeBackend();
    const upper = await teamMember(t, "TEAM@Example.com");
    const second = await teamMember(t, "other.team@example.com");
    expect((await upper.as.fetch(listPath())).status).toBe(200);
    expect((await second.as.fetch(listPath())).status).toBe(200);
  });

  test("covers AC-9: removing an email refuses that person on their very next request, with the same session", async () => {
    const t = makeBackend();
    const { studentId } = await readyStudent(t);
    const member = await teamMember(t);
    expect((await member.as.fetch(reportPath(studentId))).status).toBe(200);
    process.env.TEAM_EMAILS = "other.team@example.com";
    expect((await member.as.fetch(listPath())).status).toBe(403);
    expect((await member.as.fetch(reportPath(studentId))).status).toBe(403);
    expect(await views(t)).toHaveLength(1);
  });

  test("covers AC-4: an email Google has not verified is refused, unless the fake test sign in is switched on (dev)", async () => {
    const t = makeBackend();
    const { studentId } = await readyStudent(t);
    const unverified = await teamMember(t, TEAM, false);
    expect((await unverified.as.fetch(listPath())).status).toBe(403);
    expect((await unverified.as.fetch(reportPath(studentId))).status).toBe(403);
    process.env.TEST_SIGNIN_ENABLED = "true";
    expect((await unverified.as.fetch(listPath())).status).toBe(200);
    expect((await unverified.as.fetch(reportPath(studentId))).status).toBe(200);
    const notListed = await signInAs(t, { email: "stranger@example.com", emailVerified: false });
    expect((await notListed.as.fetch(listPath())).status).toBe(403); // the dev exception never skips the list
  });

  test("covers AC-4: on dev a real looking address on the list still has to be verified by Google, so the open test sign in cannot reach reports", async () => {
    const t = makeBackend();
    const { studentId } = await readyStudent(t);
    process.env.TEST_SIGNIN_ENABLED = "true";
    process.env.TEAM_EMAILS = "real.person@gmail.com, other.real@gmail.com";
    const unverified = await teamMember(t, "real.person@gmail.com", false);
    expect((await unverified.as.fetch(listPath())).status).toBe(403);
    expect((await unverified.as.fetch(reportPath(studentId))).status).toBe(403);
    const verified = await teamMember(t, "other.real@gmail.com", true);
    expect((await verified.as.fetch(listPath())).status).toBe(200);
    expect(await views(t)).toHaveLength(0);
  });

  test("covers AC-9: the team routes answer private, no-store, in every case", async () => {
    const t = makeBackend();
    const { studentId } = await readyStudent(t);
    const member = await teamMember(t);
    const student = await signInAs(t);
    for (const res of [
      await t.fetch(listPath()),
      await student.as.fetch(listPath()),
      await member.as.fetch(listPath()),
      await member.as.fetch(reportPath(studentId)),
      await member.as.fetch(reportPath("nope")),
    ]) {
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    }
  });
});

describe("the list", () => {
  test("covers AC-1: ready students newest first, with a name, class and date and nothing else", async () => {
    const t = makeBackend();
    const old = await readyStudent(t, { name: "Old Copy", class: "Class 9" }, { readyAt: Date.now() - 5 * HOUR });
    const fresh = await readyStudent(t, { name: "Fresh Copy", class: "College" }, { readyAt: Date.now() - HOUR });
    const waiting = await student(t, { name: "No Copy Yet" }); // finished, but nothing stored
    const member = await teamMember(t);

    const res = await member.as.fetch(listPath());
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.next).toBeNull();
    expect(body.rows).toEqual([
      { studentId: fresh.studentId, name: "Fresh Copy", class: "College", madeAt: expect.any(Number) },
      { studentId: old.studentId, name: "Old Copy", class: "Class 9", madeAt: expect.any(Number) },
    ]);
    expect(body.rows[0].madeAt).toBeGreaterThan(body.rows[1].madeAt);
    expect(text).not.toContain(waiting.studentId);
    // no phone, email, score or flag anywhere in the answer
    expect(Object.keys(body.rows[0]).sort()).toEqual(["class", "madeAt", "name", "studentId"]);
    expect(text).not.toMatch(/@|phone|email|score|dhiStart|styleKey|selfDoubt|lowMood|sha256|storageId/i);
  });

  test("covers AC-1: 50 at a time, then the rest from the cursor, and next is null on the last page", async () => {
    const t = makeBackend();
    const base = await student(t);
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 52; i++) {
        const studentId = await ctx.db.insert("students", { authUserId: "fake-" + i, email: `s${i}@example.com`, name: `Student ${i}`, age: 20, class: "College" });
        const storageId = await ctx.storage.store(new Blob([PDF]));
        await ctx.db.insert("reportFiles", {
          studentId, checkId: base.checkId, resultId: base.resultId, state: "ready", wantedVersion: REPORT_VERSION, storageId, size: 5, sha256: "s", reportVersion: REPORT_VERSION,
          attempts: 0, createdAt: now, readyAt: now - i * 1000, // Student 0 is the newest
        });
      }
    });
    const member = await teamMember(t);
    const first = await (await member.as.fetch(listPath())).json();
    expect(first.rows).toHaveLength(50);
    expect(first.rows[0].name).toBe("Student 0");
    expect(first.rows[49].name).toBe("Student 49");
    expect(typeof first.next).toBe("string");
    const second = await (await member.as.fetch(listPath("?cursor=" + encodeURIComponent(first.next)))).json();
    expect(second.rows.map((r: { name: string }) => r.name)).toEqual(["Student 50", "Student 51"]);
    expect(second.next).toBeNull();
  });

  test("covers AC-7: a copy waiting to be replaced is still listed, and a student who no longer exists is not", async () => {
    const t = makeBackend();
    const waiting = await readyStudent(t, { name: "Waiting Copy" }, { state: "queued" });
    const gone = await readyStudent(t, { name: "Erased Student" });
    await t.run(async (ctx) => {
      await ctx.db.delete(gone.studentId);
    });
    const member = await teamMember(t);
    const body = await (await member.as.fetch(listPath())).json();
    expect(body.rows.map((r: { name: string }) => r.name)).toEqual(["Waiting Copy"]);
    void waiting;
  });

  test("covers AC-2: a reference code finds one student, spaces around it are ignored", async () => {
    const t = makeBackend();
    const a = await readyStudent(t, { name: "Asha Rao" });
    await readyStudent(t, { name: "Someone Else" });
    const member = await teamMember(t);
    for (const typed of [a.studentId, `  ${a.studentId}  `, `\t${a.studentId}\n`]) {
      const body = await (await member.as.fetch(listPath("?ref=" + encodeURIComponent(typed)))).json();
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0]).toMatchObject({ studentId: a.studentId, name: "Asha Rao" });
      expect(body.next).toBeNull();
    }
  });

  test("covers AC-2 and AC-7: an empty, unknown, invalid, wrong table or no copy code is just 'no rows', never an error", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t);
    const noCopy = await student(t);
    const member = await teamMember(t);
    const candidates = ["", "   ", "nope", "<img src=x>", "a".repeat(200), ready.checkId, ready.fileId, noCopy.studentId];
    for (const typed of candidates) {
      const res = await member.as.fetch(listPath("?ref=" + encodeURIComponent(typed)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ rows: [], next: null });
    }
  });

  test("covers AC-1: a cursor that is not valid is a 400 bad_request, not a server error", async () => {
    const t = makeBackend();
    await readyStudent(t);
    const member = await teamMember(t);
    for (const cursor of ["garbage", "a".repeat(5000)]) {
      const res = await member.as.fetch(listPath("?cursor=" + encodeURIComponent(cursor)));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ code: "bad_request" });
    }
  });

  test("covers AC-10: a name that looks like HTML comes back as plain data, unchanged", async () => {
    const t = makeBackend();
    const evil = "<img src=x onerror=alert(1)>";
    await readyStudent(t, { name: evil });
    const member = await teamMember(t);
    const res = await member.as.fetch(listPath());
    expect(res.headers.get("content-type")).toBe("application/json");
    expect((await res.json()).rows[0].name).toBe(evil);
  });
});

describe("opening a report", () => {
  test("covers AC-3 and AC-5: the stored file comes back exactly, inline, and one reportViews row records the open", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t, { name: "Asha Rao" }, { body: PDF + " with more bytes" });
    const member = await teamMember(t);

    const res = await member.as.fetch(reportPath(ready.studentId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="DhiRise-report-Asha.pdf"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new TextDecoder().decode(await res.arrayBuffer())).toBe(PDF + " with more bytes");

    const rows = await views(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      studentId: ready.studentId,
      reportFileId: ready.fileId,
      sha256: expect.stringMatching(/^sha-/),
      reportVersion: REPORT_VERSION,
      teamEmail: TEAM,
      viewedAt: expect.any(Number),
    });
    // ids, a fingerprint and an email only: no student field
    expect(Object.keys(rows[0]).sort()).toEqual(["_creationTime", "_id", "reportFileId", "reportVersion", "sha256", "studentId", "teamEmail", "viewedAt"]);
  });

  test("covers AC-5: every PDF served adds one row, and a reload is another open", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t);
    const member = await teamMember(t);
    for (let i = 0; i < 3; i++) expect((await member.as.fetch(reportPath(ready.studentId))).status).toBe(200);
    expect(await views(t)).toHaveLength(3);
  });

  test("covers AC-7: a copy waiting to be replaced can still be opened", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t, {}, { state: "queued" });
    const member = await teamMember(t);
    expect((await member.as.fetch(reportPath(ready.studentId))).status).toBe(200);
  });

  test("covers AC-7: no stored file, a missing or invalid code, a wrong table id and an erased student all answer 404 not_ready and add no row", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t);
    const noCopy = await student(t);
    const erased = await readyStudent(t);
    await t.run(async (ctx) => {
      await ctx.db.delete(erased.studentId);
    });
    const member = await teamMember(t);
    for (const s of [noCopy.studentId, "", "   ", "nope", "<script>", ready.checkId, ready.fileId, erased.studentId, "a".repeat(300)]) {
      const res = await member.as.fetch(reportPath(s));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ code: "not_ready" });
    }
    expect((await member.as.fetch("/api/team/report")).status).toBe(404); // no `s` at all
    expect(await views(t)).toHaveLength(0);
  });

  test("covers AC-5: a row without its stored file is not served and not recorded", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t);
    await t.run(async (ctx) => {
      await ctx.storage.delete(ready.storageId); // the file went, the row still points at it
    });
    const member = await teamMember(t);
    expect((await member.as.fetch(reportPath(ready.studentId))).status).toBe(404);
    expect(await views(t)).toHaveLength(0);
  });

  test("covers AC-6: the 201st open in an hour is refused with rate_limited and a plain time, and adds no row; failed opens cost nothing", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t);
    const noCopy = await student(t);
    const member = await teamMember(t);
    // not-ready opens and list calls cost nothing
    for (let i = 0; i < 5; i++) expect((await member.as.fetch(reportPath(noCopy.studentId))).status).toBe(404);
    for (let i = 0; i < 5; i++) expect((await member.as.fetch(listPath())).status).toBe(200);
    for (let i = 0; i < TEAM_OPEN_PER_HOUR; i++) expect((await member.as.fetch(reportPath(ready.studentId))).status).toBe(200);
    expect(await views(t)).toHaveLength(TEAM_OPEN_PER_HOUR);

    const refused = await member.as.fetch(reportPath(ready.studentId));
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.code).toBe("rate_limited");
    expect(body.retryAt).toBeGreaterThan(Date.now());
    expect(body.message).toMatch(/try again after \d{1,2}:\d{2} (am|pm) \(India time\)/);
    expect(await views(t)).toHaveLength(TEAM_OPEN_PER_HOUR);
    expect((await member.as.fetch(listPath())).status).toBe(200); // the list still works

    // another team member has their own allowance
    const other = await teamMember(t, "other.team@example.com");
    expect((await other.as.fetch(reportPath(ready.studentId))).status).toBe(200);

    // an hour later the allowance is back
    vi.setSystemTime(Date.now() + HOUR + 1000);
    expect((await member.as.fetch(reportPath(ready.studentId))).status).toBe(200);
  });
});

describe("what is logged", () => {
  test("covers AC-5 and AC-10: a refusal writes one line with a reason, and no student field, phone or student email", async () => {
    const t = makeBackend();
    const ready = await readyStudent(t, { name: "Asha Rao" });
    const noCopy = await student(t);
    const member = await teamMember(t);
    const logged: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void logged.push(args.map(String).join(" ")));

    await t.fetch(reportPath(ready.studentId)); // signed out
    await ready.as.fetch(reportPath(ready.studentId)); // a student (not on the list)
    await member.as.fetch(reportPath(noCopy.studentId)); // not ready
    for (let i = 0; i < TEAM_OPEN_PER_HOUR; i++) await member.as.fetch(reportPath(ready.studentId));
    await member.as.fetch(reportPath(ready.studentId)); // rate limited

    const team = logged.filter((l) => l.startsWith("team:"));
    expect(team).toEqual([
      "team: refused not_signed_in",
      "team: refused not_team",
      `team: ${TEAM} refused not_ready`,
      `team: ${TEAM} refused rate_limited`,
    ]);
    const all = logged.join("\n");
    expect(all).not.toContain("Asha");
    expect(all).not.toContain(ready.studentId);
    expect(all).not.toMatch(/student[a-z0-9]*@example\.com/i); // the student's own email is never logged
  });
});

describe("what the code may do with reportViews", () => {
  const sources = Object.entries(import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>)
    .filter(([name]) => !name.endsWith(".test.ts") && !name.startsWith("./_generated"));
  const using = (re: RegExp) => sources.filter(([, text]) => re.test(text)).map(([name]) => name).sort();

  test("covers AC-5: no function updates, replaces or deletes a reportViews row (only the erasure of a student, scope row 15, may delete them)", () => {
    expect(using(/db\.(patch|replace|delete)\(\s*["']reportViews["']/)).toEqual([]);
  });

  test("covers AC-5: rows are inserted only by team.openFile, and the table is touched only by the schema and team.ts", () => {
    expect(using(/db\.insert\(\s*["']reportViews["']/)).toEqual(["./team.ts"]);
    expect(using(/reportViews/)).toEqual(["./schema.ts", "./team.ts"]);
  });

  test("covers AC-10: the team functions are all internal, and no team source reads a phone, an email of a student or a flag", () => {
    const team = sources.filter(([name]) => /^\.\/team(Http|Core)?\.ts$/.test(name));
    expect(team).toHaveLength(3);
    for (const [, text] of team) {
      expect(text).not.toMatch(/\b(query|mutation|action)\(\{/); // only internalQuery / internalMutation / httpAction
      expect(text).not.toMatch(/\.phone\b|student\.email|resultFlags|selfDoubt|lowMood|dhiStart/);
    }
  });
});
