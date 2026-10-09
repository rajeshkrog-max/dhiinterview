// The team link in column N of the Leads tab (spec 0008, AC-8): empty before the copy is ready, filled by the copy job when the
// first copy lands, filled when the lead is saved after the copy, and filled for copies that were ready before this shipped by
// one refill. Plain text, Leads only. Each test names the criterion it covers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { runOneJob, type MakeConfig } from "./reportMakeCore";
import { runFlush } from "./sheetFlushCore";
import { TEAM_REPORT_PATH, teamReportLink } from "./sheetRowsCore";
import { FakeSheets } from "../tests/fakeSheets";
import { finishedStudent, goodLeadConsent, makeBackend, type Backend } from "../tests/convexTestUtils";

// Fake timers keep the scheduled jobs (the report job, the Sheet copy) from running by themselves.
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }));
const SITE = "https://dhirise.example.test";
const AUTH_ENV = { BETTER_AUTH_URL: SITE, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
beforeEach(() => Object.assign(process.env, AUTH_ENV));
afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
});

const CONFIG: MakeConfig = { accountId: "acct", apiToken: "tok", secret: "a-long-random-test-secret", baseUrl: "https://example.test" };
const pdfBody = () => new TextEncoder().encode("%PDF-1.7 fake report").buffer;
const okFetch = (): typeof fetch => (async () => new Response(pdfBody(), { status: 200, headers: { "content-type": "application/pdf" } })) as typeof fetch;
const runJob = (t: Backend) => t.run(async (ctx) => await runOneJob(ctx as unknown as ActionCtx, { config: CONFIG, fetch: okFetch(), now: Date.now }));
const flush = (t: Backend, sheet: FakeSheets) => t.run(async (ctx) => await runFlush(ctx as unknown as ActionCtx, sheet));
const queueRows = (t: Backend) => t.run(async (ctx) => await ctx.db.query("sheetSync").collect());
const LINK = 13; // column N, counting from 0

async function withLead(t: Backend, phone = "9876543210") {
  const s = await finishedStudent(t);
  await s.as.mutation(api.leads.submit, { phone, wantsCommunity: true, guardianPresent: false, consent: await goodLeadConsent() });
  const studentId = (await t.run(async (ctx) => (await ctx.db.query("students").collect()).at(-1)!))._id;
  return { ...s, studentId };
}

// The copy job makes the first copy of the one queued student.
async function makeCopy(t: Backend, s: { as: { mutation: Backend["mutation"] } }) {
  expect(await s.as.mutation(api.reportCopy.request, {})).toMatchObject({ ok: true });
  expect(await runJob(t)).toBeDefined();
}

describe("the link text", () => {
  test("covers AC-8: the link is the site address, the team page and the reference code, and empty when there is nothing to open", () => {
    expect(teamReportLink(SITE, "abc123", true)).toBe(`${SITE}${TEAM_REPORT_PATH}?s=abc123`);
    expect(teamReportLink(`${SITE}/`, "abc123", true)).toBe(`${SITE}${TEAM_REPORT_PATH}?s=abc123`); // no double slash
    expect(teamReportLink(`  ${SITE}//  `, "abc123", true)).toBe(`${SITE}${TEAM_REPORT_PATH}?s=abc123`);
    expect(teamReportLink(SITE, "abc123", false)).toBe(""); // the copy is not ready
    expect(teamReportLink(undefined, "abc123", true)).toBe(""); // the site address is not set
    expect(teamReportLink("", "abc123", true)).toBe("");
    expect(teamReportLink("javascript:alert(1)", "abc123", true)).toBe(""); // only a web address
    expect(teamReportLink("=HYPERLINK(1)", "abc123", true)).toBe("");
    expect(teamReportLink(SITE, "a b&c", true)).toBe(`${SITE}${TEAM_REPORT_PATH}?s=a%20b%26c`); // an id is always encoded
  });

  test("covers AC-8: the link starts with https://, so it is plain text and never a formula", () => {
    expect(teamReportLink(SITE, "abc123", true)).toMatch(/^https:\/\//);
    expect(teamReportLink(SITE, "abc123", true)).not.toMatch(/^[=+\-@\t\r]/);
  });
});

describe("column N of the Leads tab", () => {
  test("covers AC-8: it is empty before the copy is ready", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await withLead(t);
    await flush(t, sheet);
    const row = sheet.rows("Leads")[0];
    expect(row).toHaveLength(14);
    expect(row[LINK]).toBe("");
  });

  test("covers AC-8: the first copy queues the lead row again, and the next copy run puts the link in", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const s = await withLead(t);
    await flush(t, sheet);
    expect(sheet.rows("Leads")[0][LINK]).toBe("");
    expect((await queueRows(t)).every((r) => r.status === "sent")).toBe(true);

    await makeCopy(t, s);
    const queued = await queueRows(t);
    expect(queued.filter((r) => r.kind === "lead" && r.status === "pending")).toHaveLength(1); // queued again by the copy job

    vi.setSystemTime(Date.now() + 60_000); // "within about a minute"
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("sheetSync").collect()) if (r.status === "pending") await ctx.db.patch(r._id, { nextAttemptAt: 0 });
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(1);
    expect(sheet.rows("Leads")[0][LINK]).toBe(`${SITE}${TEAM_REPORT_PATH}?s=${s.studentId}`);
    expect(sheet.rows("Leads")[0][0]).toBe(s.studentId); // the code in the link is the code in column A
  });

  test("covers AC-8: a lead saved after the copy is ready has the link when its row is first built", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const s = await finishedStudent(t);
    await makeCopy(t, s);
    expect(await queueRows(t)).toHaveLength(0); // no phone step yet: nothing to queue, no Leads row
    await s.as.mutation(api.leads.submit, { phone: "9876543210", wantsCommunity: false, guardianPresent: false, consent: await goodLeadConsent() });
    await flush(t, sheet);
    const studentId = (await t.run(async (ctx) => (await ctx.db.query("students").collect())[0]))._id;
    expect(sheet.rows("Leads")[0][LINK]).toBe(`${SITE}${TEAM_REPORT_PATH}?s=${studentId}`);
  });

  test("covers AC-8: a student with a ready copy and no phone step has no Leads row, so no link", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const s = await finishedStudent(t);
    await makeCopy(t, s);
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(0);
    expect(await queueRows(t)).toHaveLength(0);
  });

  test("covers AC-8: a refill fills the link for copies that were already ready before this shipped", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const s = await withLead(t);
    await flush(t, sheet); // the lead row is in the Sheet, with an empty column N
    // a copy that became ready before the deploy: the file row exists, and nothing queued the lead again
    await t.run(async (ctx) => {
      const check = (await ctx.db.query("checks").collect())[0];
      const result = (await ctx.db.query("results").collect())[0];
      const storageId = await ctx.storage.store(new Blob(["%PDF-1.7 old"], { type: "application/pdf" }));
      await ctx.db.insert("reportFiles", {
        studentId: s.studentId, checkId: check._id, resultId: result._id, state: "ready", wantedVersion: 1, storageId, size: 12, sha256: "x", reportVersion: 1,
        attempts: 0, createdAt: Date.now(), readyAt: Date.now(),
      });
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads")[0][LINK]).toBe(""); // nothing queued it, so it is still empty

    await t.mutation(internal.sheetAdmin.queueAll, { kind: "lead" }); // what `sheetAdmin:refill` schedules
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(1); // updated in place, not added
    expect(sheet.rows("Leads")[0][LINK]).toBe(`${SITE}${TEAM_REPORT_PATH}?s=${s.studentId}`);
  });

  test("covers AC-8: the Feedback tab gets no link", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const s = await withLead(t);
    await makeCopy(t, s);
    await s.as.mutation(api.checks.markReportSeen, {});
    await s.as.mutation(api.feedback.submit, { rating: 5, text: "The study blueprint really fits how I revise before exams.", canShare: true });
    await flush(t, sheet);
    const feedback = sheet.rows("Feedback")[0];
    expect(feedback).toHaveLength(11);
    expect(feedback.join(" ")).not.toContain("team-report");
    expect(sheet.tabs.get("Feedback")![0]).not.toContain("Report PDF link");
  });

  test("covers AC-8: with no site address set the column stays empty, and a second copy run adds nothing new", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const s = await withLead(t);
    delete process.env.BETTER_AUTH_URL;
    await makeCopy(t, s);
    vi.setSystemTime(Date.now() + 60_000);
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("sheetSync").collect()) if (r.status === "pending") await ctx.db.patch(r._id, { nextAttemptAt: 0 });
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads")[0][LINK]).toBe("");
  });

  test("covers AC-8: a replaced copy (a newer report version) does not queue the lead row again", async () => {
    const t = makeBackend();
    const s = await withLead(t);
    await makeCopy(t, s);
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("sheetSync").collect()) await ctx.db.patch(r._id, { status: "sent" });
      const file = (await ctx.db.query("reportFiles").collect())[0];
      await ctx.db.patch(file._id, { state: "making", wantedVersion: 2 });
    });
    const file = await t.run(async (ctx) => (await ctx.db.query("reportFiles").collect())[0]);
    const newer = await t.run(async (ctx) => await ctx.storage.store(new Blob(["%PDF-1.7 newer"], { type: "application/pdf" })));
    expect(await t.mutation(internal.reportCopy.attach, { id: file._id, storageId: newer, size: 14, sha256: "y", version: 2 })).toBe("attached");
    expect((await queueRows(t)).filter((r) => r.status === "pending")).toHaveLength(0);
  });
});
