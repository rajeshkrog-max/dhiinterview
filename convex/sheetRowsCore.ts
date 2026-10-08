// What the Sheet looks like, as pure code (spec 0004, Feature design). No database, no network: the row builders turn
// already loaded records into the cells of one row, and the fingerprint tells whether a row changed.
// Columns A to X of each tab are managed by the app (it writes only there); the team's own columns start at Y.
// Every cell is plain text (the Sheets API `RAW` mode), so nothing a student typed is ever read as a formula.
// The sensitive flags and results are never part of a row (AC-11).

export const LEADS_TAB = "Leads";
export const FEEDBACK_TAB = "Feedback";
export const STATUS_TAB = "Sync status";

export type SheetKind = "lead" | "feedback";

export const LEADS_HEADER: readonly string[] = [
  "Reference code",
  "Name",
  "Age",
  "Class",
  "Phone",
  "Google email",
  "WhatsApp choice",
  "WhatsApp status",
  "WhatsApp opt in time",
  "Lead time",
  "Same phone as another student",
  "Consent text version",
  "Guardian agreed",
  "Report PDF link",
];

export const FEEDBACK_HEADER: readonly string[] = [
  "Reference code",
  "Name",
  "Age",
  "Class",
  "Phone",
  "Google email",
  "Rating",
  "Note",
  "Share choice",
  "Genuine",
  "Feedback time",
];

// The managed block: the app never reads or writes to the right of this column.
export const LAST_MANAGED_COLUMN = "X";

export const KIND_TAB: Record<SheetKind, string> = { lead: LEADS_TAB, feedback: FEEDBACK_TAB };
export const KIND_HEADER: Record<SheetKind, readonly string[]> = { lead: LEADS_HEADER, feedback: FEEDBACK_HEADER };

// A column letter from a 1 based number (A to Z is enough: the managed block ends at X).
export const columnLetter = (n: number): string => String.fromCharCode(64 + n);

export const yesNo = (b: boolean): string => (b ? "yes" : "no");

const pad = (n: number) => String(n).padStart(2, "0");

// "yyyy-mm-dd hh:mm" in Asia/Kolkata (UTC+05:30, no daylight saving), from a server time in milliseconds.
export function kolkataTime(ms: number): string {
  const d = new Date(ms + 330 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export type StudentFields = { _id: string; name: string; age: number; class: string; email: string };
export type LeadFields = {
  _creationTime: number;
  phone: string;
  wantsCommunity: boolean;
  whatsappStatus?: string;
  whatsappOptInAt?: number;
  phoneSeenBefore: boolean;
};
export type ConsentFields = { textVersion: string; guardianPresent: boolean };
export type FeedbackFields = { _creationTime: number; rating: number; text: string; canShare: boolean; genuine: boolean };

// The Leads row: columns A to N. O to X are held for results (scope row 6), not written here.
export function leadRow(student: StudentFields, lead: LeadFields, consent: ConsentFields): string[] {
  return [
    student._id,
    student.name,
    String(student.age),
    student.class,
    lead.phone,
    student.email,
    yesNo(lead.wantsCommunity),
    lead.whatsappStatus ?? "",
    lead.whatsappOptInAt === undefined ? "" : kolkataTime(lead.whatsappOptInAt),
    kolkataTime(lead._creationTime),
    lead.phoneSeenBefore ? "yes" : "",
    consent.textVersion,
    yesNo(consent.guardianPresent),
    "", // the report PDF link stays empty until a team only link exists (scope rows 6 and 14)
  ];
}

// The Feedback row: columns A to K. The phone is the one the student gave on the phone step (empty when there is none).
export function feedbackRow(student: StudentFields, phone: string | undefined, feedback: FeedbackFields): string[] {
  return [
    student._id,
    student.name,
    String(student.age),
    student.class,
    phone ?? "",
    student.email,
    String(feedback.rating),
    feedback.text,
    yesNo(feedback.canShare),
    yesNo(feedback.genuine),
    kolkataTime(feedback._creationTime),
  ];
}

// SHA 256 of the row, as lowercase hex: the fingerprint kept as `rowHash`.
export async function rowFingerprint(values: readonly string[]): Promise<string> {
  const bytes = new TextEncoder().encode(values.join("\u001f"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// A fallback CSV line for the export command. A cell that a spreadsheet could read as a formula gets a leading quote.
export function csvLine(values: readonly string[]): string {
  return values
    .map((raw) => {
      const cell = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
      return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
    })
    .join(",");
}

// Waits between tries: 1, 2, 4, 8 minutes and so on, capped at 6 hours. `attempts` is the number of tries so far (1 or more).
export const MAX_ATTEMPTS = 10;
export function retryDelayMs(attempts: number): number {
  return Math.min(6 * 60 * 60 * 1000, 60 * 1000 * 2 ** Math.max(0, attempts - 1));
}
