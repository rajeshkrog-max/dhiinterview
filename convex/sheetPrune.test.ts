// Prune (spec 0004 AC-5, AC-9, AC-14, AC-16): remove the rows that do not belong, and never move a note. Each test names its criterion.
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { runFlush, runPrune, type PruneOptions } from "./sheetFlushCore";
import { FakeSheets } from "../tests/fakeSheets";
import { finishedStudent, goodLeadConsent, makeBackend, type Backend } from "../tests/convexTestUtils";

const flush = (t: Backend, sheet: FakeSheets) => t.run(async (ctx) => await runFlush(ctx as unknown as ActionCtx, sheet));
const prune = (t: Backend, sheet: FakeSheets, opts: PruneOptions = {}) => t.run(async (ctx) => await runPrune(ctx as unknown as ActionCtx, sheet, opts));

async function student(t: Backend, name: string, phone: string) {
  const s = await finishedStudent(t, { name });
  await s.as.mutation(api.leads.submit, { phone, wantsCommunity: true, guardianPresent: false, consent: await goodLeadConsent() });
  return s;
}
const notes = (sheet: FakeSheets) => sheet.rows("Leads").map((r) => [r[1], r[24] ?? ""]);
const status = (t: Backend) => t.query(internal.sheetSync.summary, {});

// Three students with notes in column Y, copied to the Sheet.
async function setup() {
  const t = makeBackend();
  const sheet = new FakeSheets();
  await student(t, "Asha Rao", "9876543210");
  await student(t, "Bina Shah", "9876543211");
  await student(t, "Chitra Nair", "9876543212");
  await flush(t, sheet);
  const rows = sheet.tabs.get("Leads")!;
  rows[1][24] = "note for Asha";
  rows[2][24] = "note for Bina";
  rows[3][24] = "note for Chitra";
  return { t, sheet };
}

describe("prune", () => {
  test("covers AC-5, AC-16: rows that do not belong go, rows that belong stay on their own row with their notes", async () => {
    const { t, sheet } = await setup();
    const rows = sheet.tabs.get("Leads")!;
    rows.splice(2, 0, ["OLD-CODE-1", "old junk", ...Array(12).fill("x")], ["OLD-CODE-2", "more junk", ...Array(12).fill("x"), ...Array(10).fill(""), "junk note"]);
    const result = await prune(t, sheet);
    expect(result).toMatchObject({ busy: false, deleted: 2 });
    expect(notes(sheet)).toEqual([["Asha Rao", "note for Asha"], ["Bina Shah", "note for Bina"], ["Chitra Nair", "note for Chitra"]]);
    expect((await status(t)).pruneNote).toContain("pruned 2 Leads rows");
  });

  test("covers AC-16: a sort and a hand deletion, then refill and refill with prune, never separate a note from its student", async () => {
    const { t, sheet } = await setup();
    const [header, a, b, c] = sheet.tabs.get("Leads")!;
    sheet.tabs.set("Leads", [header, c, a]); // sorted, and Bina's row deleted by hand
    for (const kind of ["lead", "feedback"] as const) await t.mutation(internal.sheetAdmin.queueAll, { kind });
    await flush(t, sheet);
    expect(notes(sheet).filter((n) => n[0] !== "Bina Shah")).toEqual([["Chitra Nair", "note for Chitra"], ["Asha Rao", "note for Asha"]]);
    expect(sheet.rows("Leads").map((r) => r[1])).toContain("Bina Shah"); // added back at the end, with no note
    await prune(t, sheet);
    for (const kind of ["lead", "feedback"] as const) await t.mutation(internal.sheetAdmin.queueAll, { kind });
    await flush(t, sheet);
    const after = Object.fromEntries(notes(sheet));
    expect(after["Chitra Nair"]).toBe("note for Chitra");
    expect(after["Asha Rao"]).toBe("note for Asha");
    expect(after["Bina Shah"]).toBe("");
    expect(b).toBeDefined();
  });

  test("covers AC-16: a row with a blank column A (the team's own line) is never touched", async () => {
    const { t, sheet } = await setup();
    const rows = sheet.tabs.get("Leads")!;
    rows.splice(2, 0, [...Array(24).fill(""), "team's own line"], ["   ", ...Array(23).fill(""), "spaces only"]);
    await prune(t, sheet);
    expect(sheet.rows("Leads").map((r) => r[24] ?? "")).toEqual(["note for Asha", "team's own line", "spaces only", "note for Bina", "note for Chitra"]);
  });

  test("covers AC-5: a code with spaces around it is kept, and counted as a near match", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")![1][0] = "  " + sheet.tabs.get("Leads")![1][0] + " ";
    const result = await prune(t, sheet);
    expect(result.deleted).toBe(0);
    expect(sheet.rows("Leads")).toHaveLength(3);
    expect((await status(t)).pruneNote).toContain("1 near match kept");
  });

  test("covers AC-5: a code that appears twice is reported and both rows stay", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push([...sheet.tabs.get("Leads")![1]]);
    const result = await prune(t, sheet);
    expect(result.deleted).toBe(0);
    expect(sheet.rows("Leads")).toHaveLength(4);
    expect((await status(t)).pruneNote).toContain("1 duplicate code");
  });

  test("covers AC-5: with no record in the database a prune refuses and the tab is unchanged, and force goes ahead", async () => {
    const t = makeBackend();
    const sheet = new FakeSheets();
    await sheet.ensureTabs([{ name: "Leads", header: ["Reference code"] }, { name: "Feedback", header: ["Reference code"] }, { name: "Sync status", header: [] }]);
    sheet.tabs.get("Leads")!.push(["OLD-1", "junk"], ["OLD-2", "junk"]);
    const refused = await prune(t, sheet);
    expect(refused.deleted).toBe(0);
    expect(sheet.rows("Leads")).toHaveLength(2);
    expect((await status(t)).pruneNote).toContain("left alone (no records in the database)");
    const forced = await prune(t, sheet, { force: true });
    expect(forced.deleted).toBe(2);
    expect(sheet.rows("Leads")).toHaveLength(0);
  });

  test("covers AC-5: a dry run changes nothing and says what it would remove", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push(["OLD-1", "junk"]);
    const before = JSON.stringify([...sheet.tabs.entries()].filter(([k]) => k !== "Sync status"));
    await prune(t, sheet, { dryRun: true });
    expect(JSON.stringify([...sheet.tabs.entries()].filter(([k]) => k !== "Sync status"))).toBe(before);
    const note = (await status(t)).pruneNote!;
    expect(note).toContain("dry run, nothing changed");
    expect(note).toContain("would remove 1 Leads row");
  });

  test("covers AC-5, AC-16: if a row moves between the plan and the delete, nothing is deleted and the team is told to run it again", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push(["OLD-1", "junk"]); // row 5
    let reads = 0; // reads of the Leads tab since the prune started: the second one is the check right before the delete
    sheet.beforeRead = (tab) => {
      if (tab === "Leads" && ++reads === 2) {
        const rows = sheet.tabs.get("Leads")!;
        const [header, a, ...rest] = rows;
        sheet.tabs.set("Leads", [header, ...rest, a]); // someone sorted the tab in the middle
      }
    };
    const result = await prune(t, sheet);
    expect(result.deleted).toBe(0);
    expect(sheet.rows("Leads")).toHaveLength(4);
    expect(sheet.rows("Leads").map((r) => r[0])).toContain("OLD-1");
    expect((await status(t)).pruneNote).toContain("the Sheet changed while pruning, run it again");
  });

  test("covers AC-5: if the run is too slow before the delete, nothing is deleted", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push(["OLD-1", "junk"]);
    const result = await prune(t, sheet, { maxMs: -1 });
    expect(result.deleted).toBe(0);
    expect(sheet.rows("Leads")).toHaveLength(4);
    expect((await status(t)).pruneNote).toContain("too slow, run it again");
  });

  test("covers AC-14: a prune that cannot get the lease says it did not start, and it deletes nothing", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push(["OLD-1", "junk"]);
    await t.mutation(internal.sheetSync.acquire, { now: Date.now() });
    const result = await prune(t, sheet);
    expect(result).toMatchObject({ busy: true, note: "prune did not start: busy" });
    expect(sheet.rows("Leads")).toHaveLength(4);
  });

  test("covers AC-5: a prune gives the lease back, shows its line on the Sync status tab, and a copy run can go on", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push(["OLD-1", "junk"]);
    await prune(t, sheet);
    const cells = sheet.tabs.get("Sync status")!;
    expect(cells[4][0]).toBe("Last prune");
    expect(cells[4][1]).toContain("pruned 1 Leads row");
    expect(await flush(t, sheet)).toMatchObject({ ran: true });
  });

  test("covers AC-11: the prune line holds counts only, never a code, a name or a phone", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push(["SECRET-CODE-123", "Secret Name"]);
    await prune(t, sheet);
    const note = (await status(t)).pruneNote!;
    expect(note).not.toContain("SECRET");
    expect(note).not.toContain("Asha");
    expect(note).not.toMatch(/\d{10}/);
  });

  test("covers AC-5: after a prune every record is queued again and the rows are rewritten in place", async () => {
    const { t, sheet } = await setup();
    sheet.tabs.get("Leads")!.push(["OLD-1", "junk"]);
    await prune(t, sheet);
    const rows = await t.run(async (ctx) => await ctx.db.query("sheetSync").collect());
    expect(rows.every((r) => r.status === "pending" && r.rowHash === undefined)).toBe(true);
    await flush(t, sheet);
    expect(notes(sheet)).toEqual([["Asha Rao", "note for Asha"], ["Bina Shah", "note for Bina"], ["Chitra Nair", "note for Chitra"]]);
  });
});
