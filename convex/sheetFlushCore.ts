// The copy run (spec 0004, "How a copy runs"). Pure orchestration over a `SheetsClient`, so a fake client can stand in
// for Google in tests. sheetFlush.ts (a Node action) builds the real client and calls `runFlush`.
//
// One run: take the lease, claim due rows, read the tab's key column, update the rows already there, add the new ones at
// the end, delete what must go, report each result, rewrite the Sync status tab, give the lease back. Rows are always
// found by reference code in the key column, never by a remembered row number, so sorting or deleting rows in the Sheet
// cannot break a later update, and a retry after a lost reply finds the row already added and updates it.
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  FEEDBACK_HEADER,
  FEEDBACK_TAB,
  KIND_HEADER,
  KIND_TAB,
  LEADS_HEADER,
  LEADS_TAB,
  STATUS_TAB,
  kolkataTime,
  type SheetKind,
} from "./sheetRowsCore";
import type { QueueRow } from "./sheetSync";

export const BATCH_SIZE = 50;
export const MAX_BATCHES = 5;

export type TabSpec = { name: string; header: readonly string[] };

// Everything the copy needs from Google. Rows are numbered from 1; row 1 is the header, so records start at row 2.
export interface SheetsClient {
  /** Makes any missing tab with its header row. Returns the names of the tabs it had to create. */
  ensureTabs(tabs: readonly TabSpec[]): Promise<string[]>;
  /** Column A from row 2 down. The item at index i is row i + 2; an empty cell is "". */
  readKeys(tab: string): Promise<string[]>;
  /** Writes whole rows at explicit row numbers (columns A to the last managed one), growing the grid if needed. Plain text. */
  writeRows(tab: string, rows: readonly { row: number; values: readonly string[] }[]): Promise<void>;
  /** Deletes these rows (the client sends them in requests of at most 500). The caller passes them from the bottom up. */
  deleteRows(tab: string, rows: readonly number[]): Promise<void>;
  /** Writes the Sync status tab, A1 downward, two columns. */
  writeStatus(cells: readonly (readonly string[])[]): Promise<void>;
}

// The tabs the app keeps, besides the Sync status tab.
export const ACTIVE_KINDS: readonly SheetKind[] = ["lead", "feedback"];
export const tabSpecs = (kinds: readonly SheetKind[]): TabSpec[] => [
  ...kinds.map((k) => ({ name: KIND_TAB[k], header: KIND_HEADER[k] })),
  { name: STATUS_TAB, header: [] },
];
// Re exported so callers have one import for tab names.
export { FEEDBACK_HEADER, FEEDBACK_TAB, LEADS_HEADER, LEADS_TAB };

const shortError = (e: unknown): string => {
  const m = e instanceof Error ? e.message : "";
  return (m || "unknown error").slice(0, 200); // the Google module only ever throws short reasons (status and reason code)
};

type Outcome = { id: Id<"sheetSync">; ok: boolean; error?: string; rowHash?: string };

// Copies one group of claimed rows of one kind. Throws a short error when Google fails; the caller marks the group.
async function copyGroup(ctx: ActionCtx, client: SheetsClient, kind: SheetKind, rows: readonly QueueRow[]): Promise<Outcome[]> {
  const tab = KIND_TAB[kind];
  const keys = await client.readKeys(tab);
  const rowOf = new Map<string, number>();
  const allRowsOf = new Map<string, number[]>(); // every row with a key, for a delete (a copy made by hand goes too)
  keys.forEach((k, i) => {
    if (k === "") return;
    if (!rowOf.has(k)) rowOf.set(k, i + 2); // a key twice in a tab: the first one is the one updated
    allRowsOf.set(k, [...(allRowsOf.get(k) ?? []), i + 2]);
  });
  let nextRow = keys.length + 2;

  const upserts = rows.filter((r) => r.op === "upsert");
  const built = await ctx.runQuery(internal.sheetRows.build, { kind, refIds: upserts.map((r) => r.refId) });
  const byRef = new Map(built.map((b) => [b.refId, b]));

  const outcomes: Outcome[] = [];
  const writes: { row: number; values: string[] }[] = [];
  for (const r of upserts) {
    const b = byRef.get(r.refId);
    if (!b) {
      outcomes.push({ id: r.id, ok: true }); // the record is gone (erased): nothing to copy
      continue;
    }
    const present = rowOf.get(b.key);
    if (present !== undefined && r.rowHash === b.hash) {
      outcomes.push({ id: r.id, ok: true, rowHash: b.hash }); // unchanged and already in the Sheet
      continue;
    }
    if (present !== undefined) {
      writes.push({ row: present, values: b.values });
    } else {
      writes.push({ row: nextRow, values: b.values });
      rowOf.set(b.key, nextRow);
      nextRow += 1;
    }
    outcomes.push({ id: r.id, ok: true, rowHash: b.hash });
  }

  const gone = new Set<number>();
  for (const r of rows) {
    if (r.op !== "delete") continue;
    for (const at of allRowsOf.get(r.key) ?? []) gone.add(at); // a row that is already gone counts as done
    outcomes.push({ id: r.id, ok: true });
  }

  if (writes.length) await client.writeRows(tab, writes);
  if (gone.size) await client.deleteRows(tab, [...gone].sort((a, b) => b - a));
  return outcomes;
}

export function statusCells(s: { waiting: number; failed: number; lastSuccessAt: number | null; lastError: string | null; pruneNote?: string | null }): string[][] {
  const cap = (n: number) => (n > 500 ? "500+" : String(n));
  return [
    ["Last copy time", s.lastSuccessAt === null ? "never" : kolkataTime(s.lastSuccessAt)],
    ["Rows waiting", cap(s.waiting)],
    ["Rows failed", cap(s.failed)],
    ["Last error", s.lastError ?? ""],
    ["Last prune", s.pruneNote ?? ""],
    ["Columns A to X of Leads and Feedback are rewritten by the app. Your own columns start at Y. Do not rename or delete the three tabs (if a tab is ever lost, run sheetAdmin:refill).", ""],
  ];
}

export type FlushResult = { ran: boolean; sent: number; error: string | null };

export async function runFlush(ctx: ActionCtx, client: SheetsClient): Promise<FlushResult> {
  if (!(await ctx.runMutation(internal.sheetSync.acquire, { now: Date.now() }))) return { ran: false, sent: 0, error: null };

  let error: string | null = null;
  let sent = 0;
  let fullBatches = 0;
  let tabsReady = false;
  // Makes any missing tab once per run. A tab made just now is empty, so every record of that kind is queued again to fill it.
  const prepareTabs = async () => {
    if (tabsReady) return;
    const created = await client.ensureTabs(tabSpecs(ACTIVE_KINDS));
    tabsReady = true;
    for (const name of created) {
      const k = ACTIVE_KINDS.find((x) => KIND_TAB[x] === name);
      if (k) await ctx.runMutation(internal.sheetAdmin.queueAll, { kind: k });
    }
  };
  try {
    for (let batch = 0; batch < MAX_BATCHES && error === null; batch++) {
      const claimed = await ctx.runMutation(internal.sheetSync.claim, { now: Date.now(), limit: BATCH_SIZE });
      if (claimed.length === 0) break;
      if (claimed.length >= BATCH_SIZE) fullBatches += 1;

      const kinds = [...new Set(claimed.map((r) => r.kind))];
      for (const kind of kinds) {
        const group = claimed.filter((r) => r.kind === kind);
        let results: Outcome[];
        try {
          await prepareTabs();
          results = await copyGroup(ctx, client, kind, group);
          sent += results.filter((r) => r.ok).length;
        } catch (e) {
          error = shortError(e);
          results = group.map((r) => ({ id: r.id, ok: false, error }) as Outcome);
        }
        await ctx.runMutation(internal.sheetSync.markResult, { results });
      }
    }

    const now = Date.now();
    const summary = await ctx.runQuery(internal.sheetSync.summary, {});
    try {
      await prepareTabs();
      await client.writeStatus(
        statusCells({
          waiting: summary.waiting,
          failed: summary.failed,
          lastSuccessAt: error ? summary.lastSuccessAt : now,
          lastError: error,
          pruneNote: summary.pruneNote,
        }),
      );
    } catch (e) {
      error = error ?? shortError(e);
    }
    await ctx.runMutation(internal.sheetSync.finishRun, { now, ok: error === null, ...(error ? { error } : {}) });
  } catch (e) {
    error = shortError(e);
    await ctx.runMutation(internal.sheetSync.finishRun, { now: Date.now(), ok: false, error });
  }

  // Due rows may still be waiting after the batches: go again at once instead of waiting for the cron.
  if (error === null && fullBatches >= MAX_BATCHES) await ctx.scheduler.runAfter(0, internal.sheetFlush.run, {});
  return { ran: true, sent, error };
}

// ---------------------------------------------------------------------------------------------------------------
// Prune (spec 0004, AC-5 and AC-16): remove the rows that do not belong, and never move a row's content.

export const PRUNE_MAX_MS = 2 * 60 * 1000; // stop before deleting if more than this has passed since the lease was taken

export type PruneOptions = { dryRun?: boolean; force?: boolean; maxMs?: number };
export type PruneResult = { busy: boolean; note: string; deleted: number };

const trimCode = (k: string) => k.trim();

// Every reference code in the database for one kind, a page at a time.
async function recordCodes(ctx: ActionCtx, kind: SheetKind): Promise<Set<string>> {
  const codes = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const page: { keys: string[]; cursor: string | null; isDone: boolean } = await ctx.runQuery(internal.sheetAdmin.recordKeys, { kind, cursor });
    for (const k of page.keys) codes.add(k);
    if (page.isDone) break;
    cursor = page.cursor;
  }
  return codes;
}

// The order is the spec's (step 5): lease, database codes, the tab's key column, a second read of column A right before
// deleting, then the delete. A blank column A, a row that belongs (also with spaces around its code) and the header are
// never deleted, and nothing is ever emptied.
export async function runPrune(ctx: ActionCtx, client: SheetsClient, opts: PruneOptions = {}): Promise<PruneResult> {
  const startedAt = Date.now();
  if (!(await ctx.runMutation(internal.sheetSync.acquire, { now: startedAt }))) return { busy: true, note: "prune did not start: busy", deleted: 0 };

  const parts: string[] = [];
  let deleted = 0;
  let stopped: string | null = null;
  let touched = false;
  try {
    for (const kind of ACTIVE_KINDS) {
      const tab = KIND_TAB[kind];
      const label = tab;
      const codes = await recordCodes(ctx, kind);
      if (codes.size === 0 && !opts.force) {
        parts.push(`${label} left alone (no records in the database)`);
        continue;
      }
      const keys = await client.readKeys(tab);
      const plan: { row: number; code: string }[] = [];
      let near = 0;
      const seen = new Map<string, number>();
      keys.forEach((raw, i) => {
        const code = trimCode(raw);
        if (code === "") return;
        if (codes.has(code)) {
          if (raw !== code) near += 1;
          seen.set(code, (seen.get(code) ?? 0) + 1);
        } else {
          plan.push({ row: i + 2, code: raw });
        }
      });
      const duplicates = [...seen.values()].filter((n) => n > 1).length;
      const extra = [near ? `${near} near ${near === 1 ? "match" : "matches"} kept` : "", duplicates ? `${duplicates} duplicate ${duplicates === 1 ? "code" : "codes"}` : ""].filter(Boolean);

      if (opts.dryRun) {
        parts.push(`would remove ${plan.length} ${label} ${plan.length === 1 ? "row" : "rows"}` + (extra.length ? ` (${extra.join(", ")})` : ""));
        continue;
      }
      if (plan.length === 0) {
        parts.push(`pruned 0 ${label} rows` + (extra.length ? ` (${extra.join(", ")})` : ""));
        touched = true;
        continue;
      }
      if (Date.now() - startedAt > (opts.maxMs ?? PRUNE_MAX_MS)) {
        stopped = "prune stopped without deleting: too slow, run it again";
        break;
      }
      // Read column A again: a sort or a hand deletion since the first read moves rows, and a row number must never
      // point at a different student.
      const again = await client.readKeys(tab);
      if (plan.some((p) => (again[p.row - 2] ?? "") !== p.code)) {
        stopped = "prune stopped without deleting: the Sheet changed while pruning, run it again";
        break;
      }
      await client.deleteRows(tab, plan.map((p) => p.row).sort((a, b) => b - a));
      deleted += plan.length;
      touched = true;
      parts.push(`pruned ${plan.length} ${label} ${plan.length === 1 ? "row" : "rows"}` + (extra.length ? ` (${extra.join(", ")})` : ""));
    }
  } catch (e) {
    stopped = `prune stopped: ${shortError(e)}`;
  }

  const stamp = kolkataTime(Date.now());
  const body = [...parts, ...(stopped ? [stopped] : [])].join("; ");
  const note = `${stamp} ${opts.dryRun && !stopped ? "dry run, nothing changed: " : ""}${body}`;
  await ctx.runMutation(internal.sheetSync.notePrune, { note });
  await ctx.runMutation(internal.sheetSync.releaseLease, {});
  try {
    const s = await ctx.runQuery(internal.sheetSync.summary, {});
    await client.writeStatus(statusCells({ waiting: s.waiting, failed: s.failed, lastSuccessAt: s.lastSuccessAt, lastError: s.lastError, pruneNote: s.pruneNote }));
  } catch {
    /* the note is stored; the tab is rewritten by the next copy run */
  }
  // Rewrite every record in place (forgetting what was last sent), so the rows that stay are updated and any missing one is added.
  if (!stopped && !opts.dryRun && touched) {
    for (const kind of ACTIVE_KINDS) await ctx.runMutation(internal.sheetAdmin.queueAll, { kind });
  }
  return { busy: false, note, deleted };
}
