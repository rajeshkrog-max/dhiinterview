// The saved report PDF copy on the server (spec 0006): asking for it, the one at a time job, retries, replacing, the two
// HTTP routes and the clean up. Browser Run is a pretend `fetch`. Each test names the criterion it covers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { rateLimiter } from "./limits";
import { signRenderToken } from "./reportCore";
import { runOneJob, type MakeConfig } from "./reportMakeCore";
import { REPORT_VERSION } from "./reportVersion";
import { finishedStudent, makeBackend, profileInput, signInAs, type Backend } from "../tests/convexTestUtils";

// Fake timers keep the scheduled job (request schedules `reportMake.runDue` straight away) from running by itself.
beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] }));
// The router registers the sign in routes too, and they refuse to start without these three settings.
const AUTH_ENV = { BETTER_AUTH_URL: "https://example.test", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
beforeEach(() => Object.assign(process.env, AUTH_ENV));
afterEach(() => {
  vi.useRealTimers();
  delete process.env.REPORT_RENDER_SECRET;
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
});

const SECRET = "a-long-random-test-secret";
const CONFIG: MakeConfig = { accountId: "acct", apiToken: "tok", secret: SECRET, baseUrl: "https://example.test" };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const pdfBody = (extra = "") => new TextEncoder().encode("%PDF-1.7 fake report" + extra).buffer;
const rows = (t: Backend) => t.run(async (ctx) => await ctx.db.query("reportFiles").collect());
const onlyRow = async (t: Backend) => {
  const all = await rows(t);
  expect(all).toHaveLength(1);
  return all[0];
};
const patchRow = (t: Backend, fields: Record<string, unknown>) =>
  t.run(async (ctx) => {
    const r = (await ctx.db.query("reportFiles").collect())[0];
    await ctx.db.patch(r._id, fields);
  });
const storedCount = (t: Backend) => t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);
const store = (t: Backend) => t.run(async (ctx) => await ctx.storage.store(new Blob(["%PDF-1.7 x"], { type: "application/pdf" })));

// One job, with a pretend Browser Run.
const runJob = (t: Backend, fake: typeof fetch, config: MakeConfig = CONFIG) =>
  t.run(async (ctx) => await runOneJob(ctx as unknown as ActionCtx, { config, fetch: fake, now: Date.now }));
const okFetch = (body: ArrayBuffer = pdfBody()): typeof fetch => (async () => new Response(body, { status: 200, headers: { "content-type": "application/pdf" } })) as typeof fetch;
const statusFetch = (status: number, headers: Record<string, string> = {}, body = "{}"): typeof fetch => (async () => new Response(body, { status, headers })) as typeof fetch;

async function asked(t: Backend, over: Record<string, unknown> = {}) {
  const s = await finishedStudent(t, over);
  expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "queued" });
  return s;
}

describe("reportCopy.request and status", () => {
  test("covers AC-1: opening the report of a finished check queues one copy, and status says so", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    expect(await s.as.query(api.reportCopy.status, {})).toEqual({ state: "none", ready: false });
    expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "queued" });
    const row = await onlyRow(t);
    expect(row).toMatchObject({ state: "queued", wantedVersion: REPORT_VERSION, attempts: 0 });
    expect(await s.as.query(api.reportCopy.status, {})).toEqual({ state: "queued", ready: false });
  });

  test("covers AC-1: refusals come back as a result, not a throw (signed out, no profile, unfinished check)", async () => {
    const t = makeBackend();
    expect(await t.mutation(api.reportCopy.request, {})).toEqual({ ok: false, code: "not_signed_in" });
    expect(await t.query(api.reportCopy.status, {})).toEqual({ state: "none", ready: false });
    const bare = await signInAs(t);
    expect(await bare.as.mutation(api.reportCopy.request, {})).toEqual({ ok: false, code: "no_profile" });
    const partway = await signInAs(t);
    await partway.as.mutation(api.students.createProfile, await profileInput());
    expect(await partway.as.mutation(api.reportCopy.request, {})).toEqual({ ok: false, code: "not_completed" });
    expect(await rows(t)).toHaveLength(0);
  });

  test("covers AC-1: a finished check with no saved result gets no_result and no row", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    await t.run(async (ctx) => {
      // a check finished before results existed: remove the result (the test setup may; app code never does)
      for (const r of await ctx.db.query("resultFlags").collect()) await ctx.db.delete(r._id);
      for (const r of await ctx.db.query("results").collect()) await ctx.db.delete(r._id);
    });
    expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: false, code: "no_result" });
    expect(await rows(t)).toHaveLength(0);
  });

  test("covers AC-2: asking again, or from two devices at once, never makes a second row", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    const results = await Promise.all([1, 2, 3, 4].map(() => s.as.mutation(api.reportCopy.request, {})));
    for (const r of results) expect(r).toMatchObject({ ok: true });
    for (let i = 0; i < 5; i++) await s.as.mutation(api.reportCopy.request, {});
    expect(await rows(t)).toHaveLength(1);
  });

  test("covers AC-2: a ready copy of the current version is not asked for again", async () => {
    const t = makeBackend();
    const s = await asked(t);
    await runJob(t, okFetch());
    expect(await s.as.query(api.reportCopy.status, {})).toEqual({ state: "ready", ready: true });
    expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "ready" });
    expect((await onlyRow(t)).state).toBe("ready");
  });

  test("covers AC-10: reopening costs nothing; the hourly allowance is used only when a job is really queued", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    await s.as.mutation(api.reportCopy.request, {});
    for (let i = 0; i < 30; i++) expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "queued" }); // far past 10
    // now use the allowance for real: each round that ended `failed` over an hour ago starts a new queued job
    let queued = 1; // the first request above used one
    for (; queued < 10; queued++) {
      await patchRow(t, { state: "failed", failedAt: Date.now() - 2 * HOUR });
      expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "queued" });
    }
    await patchRow(t, { state: "failed", failedAt: Date.now() - 2 * HOUR });
    expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: false, code: "rate_limited" }); // the 11th
    expect((await onlyRow(t)).state).toBe("failed"); // nothing was queued
  });

  test("covers AC-7: opening the report within an hour of a failed round does not start a new one; after an hour it does", async () => {
    const t = makeBackend();
    const s = await asked(t);
    await patchRow(t, { state: "failed", attempts: 5, failedAt: Date.now() - 10 * 60_000, lastError: "not_a_pdf" });
    expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "failed" });
    expect(await s.as.query(api.reportCopy.status, {})).toEqual({ state: "failed", ready: false });
    await patchRow(t, { failedAt: Date.now() - HOUR - 1000 });
    expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "queued" });
    const again = await onlyRow(t);
    expect(again).toMatchObject({ state: "queued", attempts: 0 });
    expect(again.failedAt).toBeUndefined();
  });

  test("covers AC-8: status shows only the student's own row", async () => {
    const t = makeBackend();
    await asked(t);
    const other = await finishedStudent(t);
    expect(await other.as.query(api.reportCopy.status, {})).toEqual({ state: "none", ready: false });
  });
});

describe("the job: claim, one at a time, leases and the day's budget", () => {
  test("covers AC-10: only one job runs at a time across students; the next waits its turn and is never lost", async () => {
    const t = makeBackend();
    await asked(t);
    await asked(t);
    const first = await t.mutation(internal.reportCopy.claim, {});
    expect(first).not.toBeNull();
    expect(await t.mutation(internal.reportCopy.claim, {})).toBeNull(); // the second waits
    await t.mutation(internal.reportCopy.finishFailed, { id: first!.id, kind: "counted", code: "x" });
    const all = await rows(t);
    expect(all.map((r) => r.state).sort()).toEqual(["queued", "queued"]); // still both there
  });

  test("covers AC-10: the day's budget stops further jobs, and the queued row stays queued", async () => {
    const t = makeBackend();
    await asked(t);
    await t.run(async (ctx) => {
      await rateLimiter.limit(ctx, "reportCopyDay", { key: "all", count: 1500 });
    });
    expect(await t.mutation(internal.reportCopy.claim, {})).toBeNull();
    expect((await onlyRow(t)).state).toBe("queued");
  });

  test("covers AC-7: a job whose process died is picked up after its 90 second lease, as one counted try", async () => {
    const t = makeBackend();
    await asked(t);
    const job = await t.mutation(internal.reportCopy.claim, {});
    expect(job).not.toBeNull();
    const held = await onlyRow(t);
    expect(held.state).toBe("making");
    expect(held.leaseUntil! - held.lastAttemptAt!).toBe(90_000);
    vi.setSystemTime(Date.now() + 91_000);
    expect(await t.mutation(internal.reportCopy.claim, {})).toBeNull(); // the stale row is counted as a failed try first, so it now waits its 30 seconds
    const after = await onlyRow(t);
    expect(after).toMatchObject({ attempts: 1, lastError: "lease_expired" });
  });

  test("covers AC-7: nothing is claimed before its retry time", async () => {
    const t = makeBackend();
    await asked(t);
    const job = await t.mutation(internal.reportCopy.claim, {});
    await t.mutation(internal.reportCopy.finishFailed, { id: job!.id, kind: "counted", code: "not_a_pdf" });
    expect(await t.mutation(internal.reportCopy.claim, {})).toBeNull();
    vi.setSystemTime(Date.now() + 31_000);
    expect(await t.mutation(internal.reportCopy.claim, {})).not.toBeNull();
  });
});

describe("making the copy (a pretend Browser Run)", () => {
  test("covers AC-1: a real PDF is stored, attached, and the row says ready with its size and fingerprint", async () => {
    const t = makeBackend();
    await asked(t);
    expect(await runJob(t, okFetch())).toBe("attached");
    const row = await onlyRow(t);
    expect(row).toMatchObject({ state: "ready", reportVersion: REPORT_VERSION, attempts: 0 });
    expect(row.storageId).toBeDefined();
    expect(row.size).toBe(pdfBody().byteLength);
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(await storedCount(t)).toBe(1);
  });

  test("covers AC-4: Browser Run is asked to open our own page with a signed token, and nothing from a browser goes in", async () => {
    const t = makeBackend();
    await asked(t);
    const calls: { url: string; init: RequestInit }[] = [];
    const spy = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(pdfBody(), { status: 200 });
    }) as unknown as typeof fetch;
    await runJob(t, spy);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/accounts/acct/browser-run/pdf");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.url).toMatch(/^https:\/\/example\.test\/dhiinterviews\/report-render\.html#t=[\w.-]+$/);
    expect(body.waitForSelector.selector).toBe('#report[data-ready="1"]');
    expect(body.gotoOptions.waitUntil).toBe("networkidle0");
    expect(body.pdfOptions).toMatchObject({ format: "a4", printBackground: true });
  });

  test("covers AC-11: a reply that is not a PDF, or is over 5 MB, counts as a failed try and nothing is stored", async () => {
    const t = makeBackend();
    await asked(t);
    expect(await runJob(t, okFetch(new TextEncoder().encode("<html>blocked by a bot rule</html>").buffer))).toBe("retry");
    expect(await onlyRow(t)).toMatchObject({ state: "queued", attempts: 1, lastError: "not_a_pdf" });
    expect(await storedCount(t)).toBe(0);
    vi.setSystemTime(Date.now() + 31_000);
    expect(await runJob(t, okFetch(pdfBody("x".repeat(5 * 1024 * 1024))))).toBe("retry");
    expect(await onlyRow(t)).toMatchObject({ attempts: 2, lastError: "pdf_too_big" });
    expect(await storedCount(t)).toBe(0);
  });

  test("covers AC-7: a Browser Run 429 or 5xx does not use up a try, and waits as long as Browser Run asks", async () => {
    const t = makeBackend();
    await asked(t);
    const before = Date.now();
    expect(await runJob(t, statusFetch(429, { "retry-after": "120" }))).toBe("retry");
    let row = await onlyRow(t);
    expect(row).toMatchObject({ state: "queued", attempts: 0, lastError: "browser_429" });
    expect(row.nextAttemptAt! - before).toBe(120_000);
    vi.setSystemTime(Date.now() + 121_000);
    expect(await runJob(t, statusFetch(503))).toBe("retry");
    row = await onlyRow(t);
    expect(row).toMatchObject({ attempts: 0, lastError: "browser_503" });
    expect(row.nextAttemptAt! - Date.now()).toBe(60_000); // no Retry-After: 1 minute
  });

  test("covers AC-7: when the free plan's browser time for the day is used up, the copy waits for the next UTC day and uses no try", async () => {
    const t = makeBackend();
    await asked(t);
    const body = "Error processing the request: Unable to create new browser: code: 429: message: Browser time limit exceeded for today";
    expect(await runJob(t, statusFetch(429, {}, body))).toBe("retry");
    const row = await onlyRow(t);
    expect(row).toMatchObject({ state: "queued", attempts: 0, lastError: "browser_day_limit" });
    const wait = row.nextAttemptAt! - Date.now();
    expect(wait).toBeGreaterThan(60_000);
    expect(wait).toBeLessThanOrEqual(24 * 3600_000 + 60_000);
    vi.setSystemTime(Date.now() + 60_000);
    expect(await runJob(t, okFetch())).toBe("idle"); // not tried again the next minute
  });

  test("covers AC-7: five counted failures end the round as failed, with the code and no student data", async () => {
    const t = makeBackend();
    await asked(t);
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(Date.now() + HOUR + 1000);
      expect(await runJob(t, statusFetch(422))).toBe("retry");
    }
    const row = await onlyRow(t);
    expect(row).toMatchObject({ state: "failed", attempts: 5, lastError: "browser_422" });
    expect(row.failedAt).toBeDefined();
    expect(await runJob(t, okFetch())).toBe("idle"); // a failed row is not tried again by the job
  });

  test("covers AC-7: a network failure counts as one failed try and shows no detail", async () => {
    const t = makeBackend();
    await asked(t);
    const boom = (async () => {
      throw new Error("connect ECONNRESET https://example.test/dhiinterviews/report-render.html#t=SECRET");
    }) as unknown as typeof fetch;
    expect(await runJob(t, boom)).toBe("retry");
    const row = await onlyRow(t);
    expect(row).toMatchObject({ attempts: 1, lastError: "job_error" });
    expect(JSON.stringify(row)).not.toContain("SECRET");
  });

  test("covers AC-12: missing settings end the round failed with render_not_configured, and the report is untouched", async () => {
    for (const missing of ["accountId", "apiToken", "secret", "baseUrl"] as const) {
      const t = makeBackend();
      const s = await asked(t);
      let called = false;
      const spy = (async () => ((called = true), new Response(pdfBody()))) as unknown as typeof fetch;
      expect(await runJob(t, spy, { ...CONFIG, [missing]: undefined })).toBe("failed");
      expect(called).toBe(false);
      expect(await onlyRow(t)).toMatchObject({ state: "failed", lastError: "render_not_configured" });
      expect(await s.as.query(api.reportCopy.status, {})).toEqual({ state: "failed", ready: false });
      expect(await s.as.query(api.results.mine, {})).not.toBeNull();
    }
  });
});

describe("replacing a copy when the report version moves", () => {
  async function readyAt(t: Backend, version: number) {
    const s = await asked(t);
    const job = await t.mutation(internal.reportCopy.claim, {});
    const storageId = await store(t);
    expect(await t.mutation(internal.reportCopy.attach, { id: job!.id, storageId, size: 10, sha256: "a".repeat(64), version })).toBe("attached");
    return { s, first: storageId };
  }

  test("covers AC-3: a newer version attaches the new file first, then deletes the old one and sets replacedAt", async () => {
    const t = makeBackend();
    const { first } = await readyAt(t, REPORT_VERSION);
    await patchRow(t, { state: "making", wantedVersion: REPORT_VERSION + 1, leaseUntil: Date.now() + 90_000 });
    const second = await store(t);
    expect(await t.mutation(internal.reportCopy.attach, { id: (await onlyRow(t))._id, storageId: second, size: 10, sha256: "b".repeat(64), version: REPORT_VERSION + 1 })).toBe("attached");
    const row = await onlyRow(t);
    expect(row).toMatchObject({ state: "ready", storageId: second, reportVersion: REPORT_VERSION + 1 });
    expect(row.replacedAt).toBeDefined();
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(first))).toBeNull(); // the old file is gone
    expect(await storedCount(t)).toBe(1);
  });

  test("covers AC-3: the same or an older version never replaces the held copy, and the new file is thrown away", async () => {
    const t = makeBackend();
    const { first } = await readyAt(t, REPORT_VERSION + 1);
    for (const version of [REPORT_VERSION + 1, REPORT_VERSION]) {
      await patchRow(t, { state: "making", wantedVersion: version, leaseUntil: Date.now() + 90_000 });
      const extra = await store(t);
      expect(await t.mutation(internal.reportCopy.attach, { id: (await onlyRow(t))._id, storageId: extra, size: 10, sha256: "c".repeat(64), version })).toBe("discarded");
      expect((await onlyRow(t)).storageId).toBe(first);
      expect(await storedCount(t)).toBe(1);
    }
    expect((await onlyRow(t)).replacedAt).toBeUndefined();
  });

  test("covers AC-3 and AC-13: a copy stamped with a version the row no longer wants is discarded and asked for again", async () => {
    const t = makeBackend();
    await asked(t);
    const job = await t.mutation(internal.reportCopy.claim, {});
    await patchRow(t, { wantedVersion: REPORT_VERSION + 1 }); // the report moved while the job was drawing
    const storageId = await store(t);
    expect(await t.mutation(internal.reportCopy.attach, { id: job!.id, storageId, size: 10, sha256: "d".repeat(64), version: REPORT_VERSION })).toBe("again");
    const row = await onlyRow(t);
    expect(row.state).toBe("queued");
    expect(row.storageId).toBeUndefined();
    expect(await storedCount(t)).toBe(0);
  });

  test("covers AC-3: a ready copy of an older version is asked for again while it keeps serving the held file", async () => {
    const t = makeBackend();
    const { s, first } = await readyAt(t, REPORT_VERSION);
    await patchRow(t, { reportVersion: REPORT_VERSION - 1 }); // the held copy is from before the report changed
    expect(await s.as.mutation(api.reportCopy.request, {})).toEqual({ ok: true, state: "queued" });
    expect(await onlyRow(t)).toMatchObject({ state: "queued", storageId: first, wantedVersion: REPORT_VERSION });
    expect(await s.as.query(api.reportCopy.status, {})).toEqual({ state: "queued", ready: true }); // still downloadable
  });

  test("covers AC-3: a late result for a row that is not being made is thrown away", async () => {
    const t = makeBackend();
    await asked(t);
    const storageId = await store(t);
    expect(await t.mutation(internal.reportCopy.attach, { id: (await onlyRow(t))._id, storageId, size: 10, sha256: "e".repeat(64), version: REPORT_VERSION })).toBe("discarded");
    expect(await storedCount(t)).toBe(0);
  });
});

describe("the render payload and the two HTTP routes", () => {
  const tokenFor = async (t: Backend) => {
    const row = await onlyRow(t);
    return await signRenderToken(SECRET, row.studentId, row.checkId, Date.now());
  };

  test("covers AC-5: the payload has the first name and class but no flag, email or phone, even for a student with flags set", async () => {
    const t = makeBackend();
    const s = await asked(t, { name: "Asha Rao" });
    await t.run(async (ctx) => {
      for (const f of await ctx.db.query("resultFlags").collect()) await ctx.db.patch(f._id, { selfDoubt: true, lowMood: true, sleepStrain: true });
    });
    await s.as.mutation(api.leads.submit, { phone: "9876543210", wantsCommunity: true, guardianPresent: false, consent: await (await import("../tests/convexTestUtils")).goodLeadConsent() });
    const row = await onlyRow(t);
    const data = await t.query(internal.reportCopy.payload, { studentId: row.studentId, checkId: row.checkId });
    expect(data).not.toBeNull();
    expect(data!.profile).toEqual({ name: "Asha", class: "College" });
    expect(data!.wantedVersion).toBe(REPORT_VERSION);
    expect(data!.result.flags).toEqual({
      keepsFeelingsInside: false,
      lowCareerClarity: false,
      heavyExpectations: false,
      selfDoubt: false,
      sleepStrain: false,
      lowMood: false,
      lowConsistency: false,
    });
    const text = JSON.stringify(data);
    expect(text).not.toContain("@");
    expect(text).not.toContain("9876543210");
    expect(text).not.toMatch(/email|phone/i);
    expect(data!.completedAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
  });

  test("covers AC-5: the payload is refused for another student's check, an unfinished check, or an invented id", async () => {
    const t = makeBackend();
    await asked(t);
    const other = await finishedStudent(t);
    const row = await onlyRow(t);
    const otherCheck = await t.run(async (ctx) => (await ctx.db.query("checks").collect()).find((c) => c._id !== row.checkId)!._id);
    expect(await t.query(internal.reportCopy.payload, { studentId: row.studentId, checkId: otherCheck })).toBeNull();
    expect(await t.query(internal.reportCopy.payload, { studentId: "nope", checkId: row.checkId })).toBeNull();
    expect(await t.query(internal.reportCopy.payload, { studentId: row.studentId, checkId: "nope" })).toBeNull();
    void other;
  });

  test("covers AC-9: the payload route answers 200 for a valid token and 401 for a missing, wrong or expired one", async () => {
    process.env.REPORT_RENDER_SECRET = SECRET;
    const t = makeBackend();
    await asked(t);
    const good = await tokenFor(t);
    const ok = await t.fetch("/api/render/payload", { headers: { "x-render-token": good } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("private, no-store");
    expect(ok.headers.get("x-robots-tag")).toBe("noindex");
    expect((await ok.json()).wantedVersion).toBe(REPORT_VERSION);
    for (const token of [undefined, "garbage", good.slice(0, -3) + "AAA", await signRenderToken("another-secret", "a", "b", Date.now())]) {
      const res = await t.fetch("/api/render/payload", { headers: token ? { "x-render-token": token } : {} });
      expect(res.status).toBe(401);
    }
    vi.setSystemTime(Date.now() + 121_000);
    expect((await t.fetch("/api/render/payload", { headers: { "x-render-token": good } })).status).toBe(401);
  });

  test("covers AC-9: with no signing secret set, no token is accepted", async () => {
    const t = makeBackend();
    await asked(t);
    const res = await t.fetch("/api/render/payload", { headers: { "x-render-token": await tokenFor(t) } });
    expect(res.status).toBe(401);
  });

  test("covers AC-8: the file route gives the owner the PDF as a download only, and everyone else 401 or 404", async () => {
    const t = makeBackend();
    const s = await asked(t, { name: "Asha Rao" });
    await runJob(t, okFetch());

    expect((await t.fetch("/api/files/report")).status).toBe(401); // signed out
    const res = await s.as.fetch("/api/files/report");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="DhiRise-report-Asha.pdf"');
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
    expect(new TextDecoder().decode(await res.arrayBuffer())).toMatch(/^%PDF-/);

    const other = await finishedStudent(t); // another student has no copy: they cannot reach this one, there is no id to name
    expect((await other.as.fetch("/api/files/report")).status).toBe(404);
    const noCopy = await signInAs(t);
    expect((await noCopy.as.fetch("/api/files/report")).status).toBe(404);
  });

  test("covers AC-8: no function or route returns a storage address or accepts an id", async () => {
    const t = makeBackend();
    const s = await asked(t);
    await runJob(t, okFetch());
    const status = await s.as.query(api.reportCopy.status, {});
    expect(Object.keys(status).sort()).toEqual(["ready", "state"]);
    const req = await s.as.mutation(api.reportCopy.request, {});
    expect(JSON.stringify(req)).not.toMatch(/storage|kg|http/i);
  });
});

describe("the daily sweep", () => {
  test("covers AC-11: a stored file with no row for more than a day is deleted; a held or a recent one is kept", async () => {
    const t = makeBackend();
    await asked(t);
    await runJob(t, okFetch());
    const held = (await onlyRow(t)).storageId!;
    const orphan = await store(t);
    await t.mutation(internal.reportCopy.sweep, {});
    expect(await storedCount(t)).toBe(2); // the orphan is still new: kept
    vi.setSystemTime(Date.now() + DAY + 1000);
    const fresh = await store(t); // made just now, after the clock moved
    await t.mutation(internal.reportCopy.sweep, {});
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(orphan))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(held))).not.toBeNull();
    expect(await t.run(async (ctx) => await ctx.storage.getUrl(fresh))).not.toBeNull();
  });
});

describe("what the code can and cannot do", () => {
  const sources = Object.entries(import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>).filter(
    ([name]) => !name.endsWith(".test.ts"),
  );

  test("covers AC-4: there is no upload route, and the only code that stores a file is the job that has Browser Run's reply", () => {
    const storing = sources.filter(([, text]) => /storage\.store\(|generateUploadUrl|storage\.generate/.test(text)).map(([name]) => name);
    expect(storing).toEqual(["./reportMakeCore.ts"]);
    const http = sources.find(([name]) => name === "./http.ts")![1];
    const routes = [...http.matchAll(/path:\s*"([^"]+)",\s*method:\s*"([A-Z]+)"/g)].map((m) => `${m[2]} ${m[1]}`);
    // every route is a GET; the two /api/team routes are the team link to the saved report (spec 0008), which stores and uploads nothing
    expect(routes).toEqual(["GET /health", "GET /api/files/report", "GET /api/render/payload", "GET /api/team/list", "GET /api/team/report"]);
  });

  test("covers AC-5: the render payload never reads the flags table or the email and phone fields", () => {
    const copy = sources.find(([name]) => name === "./reportCopy.ts")![1];
    const payloadFn = copy.slice(copy.indexOf("export const payload"), copy.indexOf("// ---------- the job's side"));
    expect(payloadFn).not.toMatch(/resultFlags|\.email|\.phone|leads/);
  });

  test("covers AC-8: no public report copy function takes an id as input", () => {
    const copy = sources.find(([name]) => name === "./reportCopy.ts")![1];
    for (const name of ["request", "status"]) {
      const start = copy.indexOf(`export const ${name} = `);
      const head = copy.slice(start, copy.indexOf("returns:", start));
      expect(head).toMatch(/args:\s*\{\}/);
    }
  });
});
