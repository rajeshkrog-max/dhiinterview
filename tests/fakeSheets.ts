// A pretend Google Sheet for the copy tests (spec 0004). Same behaviour the real one has where it matters: rows are
// numbered from 1 (row 1 is the header), a cell beyond the app's columns is left alone when a row is written, and
// deleting a row removes the whole row including the team's own columns. Not application code.
import type { SheetsClient, TabSpec } from "../convex/sheetFlushCore";

export class FakeSheets implements SheetsClient {
  /** tab name → rows, each row an array of cells. Index 0 is row 1 (the header). */
  tabs = new Map<string, string[][]>();
  /** Errors to throw from the next calls, one per call, oldest first. */
  failures: string[] = [];
  writes = 0;

  private maybeFail() {
    const next = this.failures.shift();
    if (next) throw new Error(next);
  }

  async ensureTabs(specs: readonly TabSpec[]): Promise<string[]> {
    this.maybeFail();
    const created: string[] = [];
    for (const s of specs) {
      if (this.tabs.has(s.name)) continue;
      this.tabs.set(s.name, s.header.length ? [[...s.header]] : []);
      created.push(s.name);
    }
    return created;
  }

  /** A hook run before each key read, with how many reads this tab has had: lets a test change the Sheet between two reads. */
  beforeRead: ((tab: string, nth: number) => void) | null = null;
  private reads = new Map<string, number>();

  async readKeys(tab: string): Promise<string[]> {
    this.maybeFail();
    const nth = (this.reads.get(tab) ?? 0) + 1;
    this.reads.set(tab, nth);
    this.beforeRead?.(tab, nth);
    return (this.tabs.get(tab) ?? []).slice(1).map((r) => r[0] ?? "");
  }

  async writeRows(tab: string, rows: readonly { row: number; values: readonly string[] }[]): Promise<void> {
    this.maybeFail();
    const t = this.tabs.get(tab);
    if (!t) throw new Error("a tab is missing");
    for (const { row, values } of rows) {
      while (t.length < row) t.push([]);
      const old = t[row - 1];
      t[row - 1] = [...values, ...old.slice(values.length)]; // cells to the right of the written block stay as they were
      this.writes += 1;
    }
  }

  async deleteRows(tab: string, rows: readonly number[]): Promise<void> {
    this.maybeFail();
    const t = this.tabs.get(tab);
    if (!t) throw new Error("a tab is missing");
    for (const row of rows) t.splice(row - 1, 1);
  }

  async writeStatus(cells: readonly (readonly string[])[]): Promise<void> {
    this.maybeFail();
    this.tabs.set("Sync status", cells.map((c) => [...c]));
  }

  /** The data rows of a tab (header left out). */
  rows(tab: string): string[][] {
    return (this.tabs.get(tab) ?? []).slice(1);
  }
}
