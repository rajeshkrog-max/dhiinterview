// The feedback copy, delete, retry, refill, CSV export and the daily check (spec 0004). Each test names the criterion it covers.
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { runFlush } from "./sheetFlushCore";
import { enqueueSheet } from "./sheetSync";
import { FakeSheets } from "../tests/fakeSheets";
import { finishedStudent, goodLeadConsent, makeBackend, type Backend } from "../tests/convexTestUtils";

const NOTE = "The study blueprint really fits how I revise before exams.";
const flush = (t: Backend, sheet: FakeSheets) => t.run(async (ctx) => await runFlush(ctx as unknown as ActionCtx, sheet));
const queueRows = (t: Backend) => t.run(async (ctx) => await ctx.db.query("sheetSync").collect());
const makeDue = (t: Backend) =>
  t.run(async (ctx) => {
    for (const r of await ctx.db.query("sheetSync").collect()) if (r.status === "pending") await ctx.db.patch(r._id, { nextAttemptAt: 0 });
  });

// A student with a saved lead, and optionally a saved feedback.
async function student(t: Backend, opts: { feedback?: boolean; phone?: string; name?: string } = {}) {
  const s = await finishedStudent(t, { name: opts.name ?? "Asha Rao" });
  await s.as.mutation(api.leads.submit, {
    phone: opts.phone ?? "9876543210",
    wantsCommunity: true,
    guardianPresent: false,
    consent: await goodLeadConsent(),
  });
  if (opts.feedback) {
    await s.as.mutation(api.checks.markReportSeen, {});
    expect(await s.as.mutation(api.feedback.submit, { rating: 4, text: NOTE, canShare: true })).toMatchObject({ ok: true });
  }
  return s;
}

describe("the feedback reaches the Sheet", () => {
  test("covers AC-1: a saved feedback is one row in the Feedback tab, with the phone from the lead", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t, { feedback: true });
    expect((await queueRows(t)).map((r) => r.kind).sort()).toEqual(["feedback", "lead"]);
    await flush(t, sheet);
    expect([...sheet.tabs.keys()].sort()).toEqual(["Feedback", "Leads", "Sync status"]);
    const rows = sheet.rows("Feedback");
    expect(rows).toHaveLength(1);
    const [ref, name, age, cls, phone, email, rating, note, share, genuine, time] = rows[0];
    const s = await t.run(async (ctx) => (await ctx.db.query("students").collect())[0]);
    expect(ref).toBe(s._id);
    expect([name, age, cls, phone, email, rating, note, share, genuine]).toEqual(["Asha Rao", "20", "College", "9876543210", s.email, "4", NOTE, "yes", "yes"]);
    expect(time).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d$/);
    expect(rows[0]).toHaveLength(11);
    expect(sheet.tabs.get("Feedback")![0][6]).toBe("Rating");
  });

  test("covers AC-10: a note that starts like a formula reaches the row exactly as typed", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    const s = await finishedStudent(t);
    await s.as.mutation(api.leads.submit, { phone: "9876543210", wantsCommunity: false, guardianPresent: false, consent: await goodLeadConsent() });
    await s.as.mutation(api.checks.markReportSeen, {});
    const formula = "=SUM(1)+HYPERLINK(\"x\") and more words to be long";
    await s.as.mutation(api.feedback.submit, { rating: 5, text: formula, canShare: false });
    await flush(t, sheet);
    expect(sheet.rows("Feedback")[0][7]).toBe(formula);
  });

  test("covers AC-11: the rows never carry the sensitive flags or any result", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t, { feedback: true });
    await flush(t, sheet);
    const all = JSON.stringify([...sheet.tabs.values()]).toLowerCase();
    for (const word of ["selfdoubt", "lowmood", "flags", "dhistart", "stylekey"]) expect(all).not.toContain(word);
    expect(sheet.rows("Leads")[0]).toHaveLength(14); // columns O to X stay empty
  });
});

describe("delete, retry and refill", () => {
  test("covers AC-9: a delete removes the row, and a row already gone counts as done", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t, { phone: "9876543210", name: "Asha Rao" });
    await student(t, { phone: "9876543211", name: "Bina Shah" });
    await flush(t, sheet);
    expect(sheet.rows("Leads").map((r) => r[1])).toEqual(["Asha Rao", "Bina Shah"]);

    const [first] = await t.run(async (ctx) => await ctx.db.query("leads").order("asc").collect());
    await t.run(async (ctx) => {
      await enqueueSheet(ctx, "lead", first._id, first.studentId, "delete");
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads").map((r) => r[1])).toEqual(["Bina Shah"]);
    let row = (await queueRows(t)).find((r) => r.refId === first._id)!;
    expect([row.status, row.op, row.lastError]).toEqual(["sent", "delete", undefined]);

    await t.run(async (ctx) => {
      await enqueueSheet(ctx, "lead", first._id, first.studentId, "delete");
    });
    expect(await flush(t, sheet)).toMatchObject({ error: null });
    row = (await queueRows(t)).find((r) => r.refId === first._id)!;
    expect(row.status).toBe("sent");
    expect(sheet.rows("Leads")).toHaveLength(1);
  });

  test("covers AC-9: a delete removes every row with the code, so a copy made by hand does not keep an erased student's data", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t, { name: "Asha Rao" });
    await student(t, { phone: "9876543211", name: "Bina Shah" });
    await flush(t, sheet);
    const rows = sheet.tabs.get("Leads")!;
    rows.push([...rows[1]]); // Asha's row copied and pasted by hand at the bottom
    const first = (await t.run(async (ctx) => await ctx.db.query("leads").order("asc").collect()))[0];
    await t.run(async (ctx) => {
      await enqueueSheet(ctx, "lead", first._id, first.studentId, "delete");
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads").map((r) => r[1])).toEqual(["Bina Shah"]);
  });

  test("covers AC-9: a delete still works after the source record is gone (the key is kept on the queue row)", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t);
    await flush(t, sheet);
    const lead = (await t.run(async (ctx) => await ctx.db.query("leads").collect()))[0];
    await t.run(async (ctx) => {
      await ctx.db.delete(lead._id);
      await enqueueSheet(ctx, "lead", lead._id, lead.studentId, "delete");
    });
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(0);
  });

  test("covers AC-4: retryFailed puts failed rows back in the queue with fresh tries, and they then go through", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t);
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
    expect((await queueRows(t))[0].status).toBe("failed");
    expect(await t.mutation(internal.sheetAdmin.retryFailed, {})).toEqual({ requeued: 1, more: false });
    const row = (await queueRows(t))[0];
    expect([row.status, row.attempts, row.lastError]).toEqual(["pending", 0, undefined]);
    expect(await flush(t, sheet)).toMatchObject({ error: null });
    expect((await queueRows(t))[0].status).toBe("sent");
    expect(sheet.rows("Leads")).toHaveLength(1);
  });

  test("covers AC-5: refill sends every lead and feedback again, from an empty Sheet and over a full one", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t, { feedback: true, phone: "9876543210", name: "Asha Rao" });
    await student(t, { phone: "9876543211", name: "Bina Shah" });
    await flush(t, sheet);

    // a Sheet that lost its rows: refill brings them back, even though nothing changed in the database
    sheet.tabs.set("Leads", [sheet.tabs.get("Leads")![0]]);
    sheet.tabs.set("Feedback", [sheet.tabs.get("Feedback")![0]]);
    for (const kind of ["lead", "feedback"] as const) await t.mutation(internal.sheetAdmin.queueAll, { kind });
    await flush(t, sheet);
    expect(sheet.rows("Leads").map((r) => r[1])).toEqual(["Asha Rao", "Bina Shah"]);
    expect(sheet.rows("Feedback")).toHaveLength(1);

    // and over rows that are already there: updated in place, none added
    for (const kind of ["lead", "feedback"] as const) await t.mutation(internal.sheetAdmin.queueAll, { kind });
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(2);
    expect(sheet.rows("Feedback")).toHaveLength(1);
    expect(await queueRows(t)).toHaveLength(3);
  });

  test("covers AC-5: refill, refill with prune and a dry run are mutations the team can run, and they start the work", async () => {
    const t = makeBackend();
    await student(t);
    expect(await t.mutation(internal.sheetAdmin.refill, {})).toEqual({ started: true, mode: "refill" });
    expect(await t.mutation(internal.sheetAdmin.refill, { prune: true })).toEqual({ started: true, mode: "prune" });
    expect(await t.mutation(internal.sheetAdmin.refill, { dryRun: true })).toEqual({ started: true, mode: "dryRun" });
  });
});

describe("the CSV fallback", () => {
  test("covers AC-6: exportCsv prints the leads and the feedback with the same columns as the Sheet", async () => {
    const t = makeBackend();
    await student(t, { feedback: true, name: "Asha, \"Ace\" Rao" });
    const leads = await t.query(internal.sheetAdmin.exportCsv, { kind: "lead" });
    expect(leads.isDone).toBe(true);
    const lines = leads.csv.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Reference code,Name,Age,Class,Phone,Google email,WhatsApp choice,WhatsApp status,WhatsApp opt in time,Lead time,Same phone as another student,Consent text version,Guardian agreed,Report PDF link");
    expect(lines[1]).toContain('"Asha, ""Ace"" Rao"');
    expect(lines[1]).toContain("9876543210");

    const feedback = await t.query(internal.sheetAdmin.exportCsv, { kind: "feedback" });
    const fl = feedback.csv.trim().split("\n");
    expect(fl).toHaveLength(2);
    expect(fl[0].split(",")).toHaveLength(11);
    expect(fl[1]).toContain("blueprint");
  });

  test("covers AC-10: a cell that a spreadsheet could read as a formula gets a leading quote in the CSV", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t, { name: "=SUM(1)" });
    await s.as.mutation(api.leads.submit, { phone: "9876543210", wantsCommunity: true, guardianPresent: false, consent: await goodLeadConsent() });
    const out = await t.query(internal.sheetAdmin.exportCsv, { kind: "lead" });
    expect(out.csv).toContain(",'=SUM(1),");
  });
});

describe("the daily check", () => {
  test("covers AC-8: a WhatsApp status changed in Convex reaches the Sheet", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t);
    await flush(t, sheet);
    expect(sheet.rows("Leads")[0][7]).toBe("new");

    // nothing changed: the check queues nothing
    await t.mutation(internal.sheetSync.dailyCheck, { kind: "lead" });
    expect((await queueRows(t)).every((r) => r.status === "sent")).toBe(true);

    await t.run(async (ctx) => {
      const l = (await ctx.db.query("leads").collect())[0];
      await ctx.db.patch(l._id, { whatsappStatus: "added" }); // edited by hand in the dashboard
    });
    await t.mutation(internal.sheetSync.dailyCheck, { kind: "lead" });
    expect((await queueRows(t))[0].status).toBe("pending");
    await flush(t, sheet);
    expect(sheet.rows("Leads")[0][7]).toBe("added");
    expect(sheet.rows("Leads")).toHaveLength(1);
  });

  test("covers AC-8: a record that was never queued is picked up, and a record being sent or failed is left alone", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t, { feedback: true });
    await flush(t, sheet);
    await t.run(async (ctx) => {
      for (const q of await ctx.db.query("sheetSync").collect()) await ctx.db.delete(q._id); // as if the queue row was lost
    });
    await t.mutation(internal.sheetSync.dailyCheck, { kind: "lead" });
    await t.mutation(internal.sheetSync.dailyCheck, { kind: "feedback" });
    expect((await queueRows(t)).map((r) => r.status)).toEqual(["pending", "pending"]);
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(1); // updated in place
    expect(sheet.rows("Feedback")).toHaveLength(1);
  });

  test("covers AC-9: a record queued for deletion is not brought back by the daily check", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await student(t);
    await flush(t, sheet);
    const lead = (await t.run(async (ctx) => await ctx.db.query("leads").collect()))[0];
    await t.run(async (ctx) => {
      await enqueueSheet(ctx, "lead", lead._id, lead.studentId, "delete");
    });
    await flush(t, sheet);
    await t.run(async (ctx) => {
      await ctx.db.delete(lead._id); // erased
    });
    await t.mutation(internal.sheetSync.dailyCheck, { kind: "lead" });
    await flush(t, sheet);
    expect(sheet.rows("Leads")).toHaveLength(0);
  });
});
