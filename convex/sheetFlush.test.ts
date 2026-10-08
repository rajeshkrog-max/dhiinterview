// The copy of leads to the Sheet (spec 0004), run against a pretend Google. Each test names the criterion it covers.
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { runFlush } from "./sheetFlushCore";
import { enqueueSheet } from "./sheetSync";
import { FakeSheets } from "../tests/fakeSheets";
import { finishedStudent, goodLeadConsent, makeBackend, type Backend } from "../tests/convexTestUtils";

const lead = async (phone = "9876543210", over: Record<string, unknown> = {}) => ({
  phone,
  wantsCommunity: true,
  guardianPresent: false,
  consent: await goodLeadConsent(),
  ...over,
});

// One copy run. convex-test gives the same calls an action context has.
const flush = (t: Backend, sheet: FakeSheets) => t.run(async (ctx) => await runFlush(ctx as unknown as ActionCtx, sheet));
const queueRows = (t: Backend) => t.run(async (ctx) => await ctx.db.query("sheetSync").collect());
// Pretend the wait is over, so a retry is due now.
const makeDue = (t: Backend) =>
  t.run(async (ctx) => {
    for (const r of await ctx.db.query("sheetSync").collect()) if (r.status === "pending") await ctx.db.patch(r._id, { nextAttemptAt: 0 });
  });

async function saved(t: Backend, over: Record<string, unknown> = {}, phone = "9876543210") {
  const s = await finishedStudent(t, over);
  expect(await s.as.mutation(api.leads.submit, await lead(phone))).toMatchObject({ ok: true });
  return s;
}

describe("the lead reaches the Sheet", () => {
  test("covers AC-1: a saved lead is one row in the Leads tab with every column right", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t, { name: "Asha Rao", age: 20, class: "College" });
    expect((await queueRows(t)).map((r) => [r.kind, r.status])).toEqual([["lead", "pending"]]);
    expect(await flush(t, sheet)).toMatchObject({ ran: true, error: null });

    const rows = sheet.rows("Leads");
    expect(rows).toHaveLength(1);
    const [ref, name, age, cls, phone, email, wa, waStatus, optIn, leadTime, same, consentVersion, guardian, pdf] = rows[0];
    const student = await t.run(async (ctx) => (await ctx.db.query("students").collect())[0]);
    expect(ref).toBe(student._id);
    expect([name, age, cls, phone, email]).toEqual(["Asha Rao", "20", "College", "9876543210", student.email]);
    expect([wa, waStatus, same, consentVersion, guardian, pdf]).toEqual(["yes", "new", "", "lead-v1", "no", ""]);
    expect(optIn).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(leadTime).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(rows[0]).toHaveLength(14);
    expect((await queueRows(t))[0].status).toBe("sent");
    expect(sheet.tabs.get("Leads")![0][0]).toBe("Reference code"); // the header row
  });

  test("covers AC-10: a name that starts like a formula, and a leading zero, reach the row as plain text exactly as typed", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t, { name: "=SUM(1)" });
    await flush(t, sheet);
    expect(sheet.rows("Leads")[0][1]).toBe("=SUM(1)");
    expect(sheet.rows("Leads")[0].every((c) => typeof c === "string")).toBe(true);
  });

  test("covers AC-2: copying the same lead again and again never adds a second row", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t);
    await flush(t, sheet);
    for (let i = 0; i < 3; i++) {
      await t.run(async (ctx) => {
        const l = (await ctx.db.query("leads").collect())[0];
        await enqueueSheet(ctx, "lead", l._id, l.studentId, "upsert", { resetHash: i % 2 === 0 });
      });
      await flush(t, sheet);
    }
    expect(sheet.rows("Leads")).toHaveLength(1);
    expect(await queueRows(t)).toHaveLength(1); // one queue row per record
  });

  test("covers AC-2: a row whose content has not changed is not written again", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t);
    await flush(t, sheet);
    const writes = sheet.writes;
    await t.run(async (ctx) => {
      const l = (await ctx.db.query("leads").collect())[0];
      await enqueueSheet(ctx, "lead", l._id, l.studentId, "upsert"); // keeps rowHash
    });
    await flush(t, sheet);
    expect(sheet.writes).toBe(writes);
    expect((await queueRows(t))[0].status).toBe("sent");
  });

  test("covers AC-3, AC-4: a failing copy is retried with growing waits, ends sent when Google recovers, and the status tab shows it", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t);
    await flush(t, sheet); // the tabs now exist
    sheet.tabs.set("Leads", [sheet.tabs.get("Leads")![0]]); // an empty tab again, so the lead has to be written
    await t.run(async (ctx) => {
      const l = (await ctx.db.query("leads").collect())[0];
      await enqueueSheet(ctx, "lead", l._id, l.studentId, "upsert", { resetHash: true });
    });

    const before = Date.now();
    sheet.failures = ["Google answered 503 UNAVAILABLE"];
    const first = await flush(t, sheet);
    expect(first.error).toBe("Google answered 503 UNAVAILABLE");
    let row = (await queueRows(t))[0];
    expect([row.status, row.attempts, row.lastError]).toEqual(["pending", 1, "Google answered 503 UNAVAILABLE"]);
    expect(row.nextAttemptAt - before).toBeGreaterThanOrEqual(60_000 - 1000); // 1 minute
    expect(row.nextAttemptAt - before).toBeLessThan(2 * 60_000);

    expect((await flush(t, sheet)).sent).toBe(0); // not due yet: nothing is sent
    await makeDue(t);
    sheet.failures = ["Google answered 503 UNAVAILABLE"];
    await flush(t, sheet); // fails again
    row = (await queueRows(t))[0];
    expect(row.attempts).toBe(2);
    expect(row.nextAttemptAt - Date.now()).toBeGreaterThan(90_000); // 2 minutes

    await makeDue(t);
    expect(await flush(t, sheet)).toMatchObject({ error: null });
    row = (await queueRows(t))[0];
    expect([row.status, row.attempts, row.lastError]).toEqual(["sent", 0, undefined]);
    expect(sheet.rows("Leads")).toHaveLength(1);
    const status = sheet.tabs.get("Sync status")!;
    expect(status[0][0]).toBe("Last copy time");
    expect(status[1]).toEqual(["Rows waiting", "0"]);
    expect(status[2]).toEqual(["Rows failed", "0"]);
  });

  test("covers AC-3, AC-4: after the 10th failed try the row is failed, and the status shows the count and the last error", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t);
    await flush(t, sheet);
    await t.run(async (ctx) => {
      const l = (await ctx.db.query("leads").collect())[0];
      await enqueueSheet(ctx, "lead", l._id, l.studentId, "upsert", { resetHash: true });
    });
    for (let i = 0; i < 10; i++) {
      sheet.failures = ["Google answered 500 INTERNAL"];
      await makeDue(t);
      await flush(t, sheet);
    }
    const row = (await queueRows(t))[0];
    expect([row.status, row.attempts]).toEqual(["failed", 10]);
    const summary = await t.query(internal.sheetSync.summary, {});
    expect(summary).toMatchObject({ failed: 1, waiting: 0, lastError: "Google answered 500 INTERNAL" });
    expect(sheet.tabs.get("Sync status")![2]).toEqual(["Rows failed", "1"]);
    // the student's save was never touched
    expect((await t.run(async (ctx) => (await ctx.db.query("leads").collect()).length))).toBe(1);
  });

  test("covers AC-7: sorting and deleting rows in the Sheet, and a team column, do not break a later update", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const a = await saved(t, { name: "Asha Rao" }, "9876543210");
    await saved(t, { name: "Bina Shah" }, "9876543211");
    await saved(t, { name: "Chitra Nair" }, "9876543212");
    await flush(t, sheet);
    expect(sheet.rows("Leads").map((r) => r[1])).toEqual(["Asha Rao", "Bina Shah", "Chitra Nair"]);

    const rows = sheet.tabs.get("Leads")!;
    rows[1][24] = "called, call back Monday"; // the team's own note in column Y, on Asha's row
    const [header, r1, r2, r3] = rows;
    sheet.tabs.set("Leads", [header, r3, r1, r2]); // sorted: Chitra, Asha, Bina
    sheet.tabs.set("Leads", [header, r3, r1]); // and Bina's row deleted by hand

    await t.run(async (ctx) => {
      const l = (await ctx.db.query("leads").collect())[0];
      await ctx.db.patch(l._id, { whatsappStatus: "added" }); // changed by hand in the dashboard
      await enqueueSheet(ctx, "lead", l._id, l.studentId, "upsert");
    });
    await flush(t, sheet);
    const after = sheet.rows("Leads");
    expect(after.map((r) => r[1])).toEqual(["Chitra Nair", "Asha Rao"]);
    expect(after[1][7]).toBe("added");
    expect(after[1][24]).toBe("called, call back Monday"); // column Y intact
    expect(a).toBeDefined();
  });

  test("covers AC-7: a record not in the Sheet any more is added at the end, with no row number remembered", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t, { name: "Asha Rao" }, "9876543210");
    await saved(t, { name: "Bina Shah" }, "9876543211");
    await flush(t, sheet);
    const [header, r1] = sheet.tabs.get("Leads")!;
    sheet.tabs.set("Leads", [header, r1]); // Bina's row deleted by hand
    await t.run(async (ctx) => {
      const l = (await ctx.db.query("leads").collect())[1];
      await enqueueSheet(ctx, "lead", l._id, l.studentId, "upsert", { resetHash: true });
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads").map((r) => r[1])).toEqual(["Asha Rao", "Bina Shah"]);
  });

  test("covers AC-14: only one run holds the lease; a second run that starts meanwhile does nothing", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t);
    expect(await t.mutation(internal.sheetSync.acquire, { now: Date.now() })).toBe(true);
    expect(await flush(t, sheet)).toMatchObject({ ran: false });
    expect(sheet.rows("Leads")).toHaveLength(0);
    // the lease always expires: 4 minutes later the next run goes ahead
    await t.run(async (ctx) => {
      const s = (await ctx.db.query("sheetStatus").first())!;
      await ctx.db.patch(s._id, { leaseUntil: Date.now() - 1 });
    });
    expect(await flush(t, sheet)).toMatchObject({ ran: true, error: null });
    expect(sheet.rows("Leads")).toHaveLength(1);
  });

  test("covers AC-14: a row left sending by a run that died goes back to pending once the lease has run out", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t);
    await t.mutation(internal.sheetSync.acquire, { now: Date.now() });
    await t.mutation(internal.sheetSync.claim, { now: Date.now(), limit: 50 }); // the run claims it, then dies
    expect((await queueRows(t))[0].status).toBe("sending");
    await t.run(async (ctx) => {
      const s = (await ctx.db.query("sheetStatus").first())!;
      await ctx.db.patch(s._id, { leaseUntil: Date.now() - 1 });
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(1);
    expect((await queueRows(t))[0].status).toBe("sent");
  });

  test("covers AC-12: with no Sheet set up, saves work, rows wait, and the status says not set up", async () => {
    const t = makeBackend();
    await saved(t);
    await t.mutation(internal.sheetSync.runIfDue, {});
    const summary = await t.query(internal.sheetSync.summary, {});
    expect(summary).toMatchObject({ configured: false, waiting: 1, lastError: "not set up" });
    expect((await queueRows(t))[0].status).toBe("pending");
  });

  test("covers AC-11: nothing stored in the queue or the status holds a phone, an email or a name", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t, { name: "Asha Rao" });
    sheet.failures = ["Google answered 403 PERMISSION_DENIED"];
    await flush(t, sheet);
    const stored = JSON.stringify(await t.run(async (ctx) => ({ q: await ctx.db.query("sheetSync").collect(), s: await ctx.db.query("sheetStatus").collect() })));
    expect(stored).not.toContain("9876543210");
    expect(stored).not.toContain("Asha");
    expect(stored).not.toContain("@");
  });

  test("covers AC-1: a tab that did not exist is made with its header, and the leads already saved fill it", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await saved(t, {}, "9876543210");
    await saved(t, {}, "9876543211");
    await flush(t, sheet);
    sheet.tabs.delete("Leads"); // the tab was deleted by hand
    await makeDue(t);
    await flush(t, sheet); // makes the tab again and queues every lead again
    await flush(t, sheet);
    expect(sheet.tabs.get("Leads")![0][0]).toBe("Reference code");
    expect(sheet.rows("Leads")).toHaveLength(2);
  });
});
