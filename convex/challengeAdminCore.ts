// The pure rules of the winner review (spec 0019): the three warnings and the CSV text. No database, no clock, nothing logged.
// `challengeAdmin.ts` reads the rows and calls these. The warnings are signals for a person to look at, never a decision: nothing here
// rejects a referral.

// More than this many referrals inside one hour (a sliding window) is a burst.
export const BURST_LIMIT = 5;
export const BURST_WINDOW_MS = 60 * 60 * 1000;
// A friend who goes from the first answer to the finish in under this is flagged (18 questions are not read in 3 minutes).
export const FAST_FINISH_MS = 3 * 60 * 1000;

export type Warning = "burst" | "same_text" | "fast_finish";

// The ids of every referral that sits in some one hour window holding more than BURST_LIMIT referrals of one referrer. `at` is when the
// friend signed up with the code. Order does not matter.
export function burstIds(items: { id: string; at: number }[]): Set<string> {
  const sorted = [...items].sort((a, b) => a.at - b.at);
  const out = new Set<string>();
  let end = 0;
  for (let start = 0; start < sorted.length; start++) {
    if (end < start) end = start;
    while (end < sorted.length && sorted[end].at - sorted[start].at <= BURST_WINDOW_MS) end++;
    if (end - start > BURST_LIMIT) for (let k = start; k < end; k++) out.add(sorted[k].id);
  }
  return out;
}

// Text compared for sameness: case, spacing and the ends do not matter. Nothing is "the same" as empty text.
export const normalizeNote = (text: string | null): string => (text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// The ids that share a note with at least one other referral in the set.
export function sameTextIds(items: { id: string; text: string | null }[]): Set<string> {
  const seen = new Map<string, string[]>();
  for (const it of items) {
    const key = normalizeNote(it.text);
    if (key === "") continue;
    seen.set(key, [...(seen.get(key) ?? []), it.id]);
  }
  const out = new Set<string>();
  for (const ids of seen.values()) if (ids.length > 1) for (const id of ids) out.add(id);
  return out;
}

export const isFastFinish = (firstAnswerAt: number | null, completedAt: number | null): boolean =>
  firstAnswerAt !== null && completedAt !== null && completedAt - firstAnswerAt < FAST_FINISH_MS;

// ---------- the CSV ----------

// One CSV cell. Quotes, commas and line breaks are quoted the usual way. A cell that starts with = + - @ or a tab or return would be run as a
// formula by a spreadsheet, and feedback text is typed by a stranger, so such a cell gets a leading apostrophe.
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const CSV_COLUMNS = [
  "rank",
  "referrer",
  "referrerEmail",
  "class",
  "validCount",
  "referralId",
  "status",
  "rejectReason",
  "reviewNote",
  "signedUpAt",
  "check",
  "completedAt",
  "reportSeenAt",
  "feedbackAt",
  "feedbackGenuine",
  "feedbackText",
  "friendEmail",
  "warnings",
] as const;
