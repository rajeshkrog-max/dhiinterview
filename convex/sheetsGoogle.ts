"use node";
// The small Google module (spec 0004): a token from the service account, then plain fetch calls to the Sheets API.
// Runs only inside the Node action sheetFlush.run. Every error thrown here is a short reason ("403 PERMISSION_DENIED")
// and never carries the key, a token, the Sheet id or any record content (AC-11). Cells are written as plain text
// (valueInputOption RAW), so nothing a student typed is read as a formula (AC-10).
import { GoogleAuth } from "google-auth-library";
import type { SheetsClient, TabSpec } from "./sheetFlushCore";
import { STATUS_TAB } from "./sheetRowsCore";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TIMEOUT_MS = 30_000;

/** A failure with a message safe to store and show. */
export class GoogleError extends Error {}

type TabInfo = { sheetId: number; rows: number };

const a1 = (tab: string, range: string) => `'${tab.replace(/'/g, "''")}'!${range}`;
const colLetter = (n: number) => String.fromCharCode(64 + n);

export function createSheetsClient(keyText: string, sheetId: string): SheetsClient {
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(keyText) as Record<string, unknown>;
  } catch {
    throw new GoogleError("the service account key is not valid JSON"); // never echo the text: JSON errors can quote it
  }
  const auth = new GoogleAuth({ credentials, scopes: [SCOPE] });
  const base = `${API}/${encodeURIComponent(sheetId)}`;

  async function token(): Promise<string> {
    try {
      const t = await auth.getAccessToken();
      if (!t) throw new Error("empty");
      return t;
    } catch {
      throw new GoogleError("could not sign in to Google with the service account key");
    }
  }

  async function call<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof GoogleError) throw e;
      throw new GoogleError("network error talking to Google");
    }
    if (!res.ok) {
      let reason = "";
      try {
        const j = (await res.json()) as { error?: { status?: string } };
        reason = j.error?.status ?? "";
      } catch {
        /* no body */
      }
      throw new GoogleError(`Google answered ${res.status}${reason ? " " + reason : ""}`);
    }
    return (await res.json()) as T;
  }

  async function tabs(): Promise<Map<string, TabInfo>> {
    const j = await call<{ sheets?: { properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number } } }[] }>(
      "GET",
      `${base}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`,
    );
    return new Map((j.sheets ?? []).map((s) => [s.properties.title, { sheetId: s.properties.sheetId, rows: s.properties.gridProperties?.rowCount ?? 1000 }]));
  }

  const write = (data: { range: string; values: readonly (readonly string[])[] }[]) =>
    call("POST", `${base}/values:batchUpdate`, { valueInputOption: "RAW", data });

  return {
    async ensureTabs(specs: readonly TabSpec[]): Promise<string[]> {
      const have = await tabs();
      const missing = specs.filter((s) => !have.has(s.name));
      if (missing.length) {
        await call("POST", `${base}:batchUpdate`, { requests: missing.map((s) => ({ addSheet: { properties: { title: s.name } } })) });
        const headers = missing.filter((s) => s.header.length > 0);
        if (headers.length) {
          await write(headers.map((s) => ({ range: a1(s.name, `A1:${colLetter(s.header.length)}1`), values: [s.header] })));
        }
      }
      return missing.map((s) => s.name);
    },

    async readKeys(tab: string): Promise<string[]> {
      const j = await call<{ values?: string[][] }>("GET", `${base}/values/${encodeURIComponent(a1(tab, "A2:A"))}?majorDimension=ROWS`);
      return (j.values ?? []).map((r) => (r[0] === undefined ? "" : String(r[0])));
    },

    async writeRows(tab, rows) {
      if (rows.length === 0) return;
      const info = (await tabs()).get(tab);
      if (!info) throw new GoogleError("a tab is missing");
      const lastRow = Math.max(...rows.map((r) => r.row));
      if (lastRow > info.rows) {
        await call("POST", `${base}:batchUpdate`, {
          requests: [{ appendDimension: { sheetId: info.sheetId, dimension: "ROWS", length: lastRow - info.rows + 100 } }],
        });
      }
      await write(rows.map((r) => ({ range: a1(tab, `A${r.row}:${colLetter(r.values.length)}${r.row}`), values: [r.values] })));
    },

    async deleteRows(tab, rows) {
      if (rows.length === 0) return;
      const info = (await tabs()).get(tab);
      if (!info) throw new GoogleError("a tab is missing");
      // At most 500 deletions per request. The caller sends the rows from the bottom up, so each one is still where it was read.
      for (let i = 0; i < rows.length; i += 500) {
        await call("POST", `${base}:batchUpdate`, {
          requests: rows.slice(i, i + 500).map((row) => ({ deleteDimension: { range: { sheetId: info.sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } })),
        });
      }
    },

    async writeStatus(cells) {
      await write([{ range: a1(STATUS_TAB, `A1:B${cells.length}`), values: cells }]);
    },
  };
}
