// The pure rules of the team link to the saved report (spec 0008). No database and no network here, so a test can run
// every rule directly: who may enter, which codes are worth looking up, and the words for the retry time.

export const TEAM_OPEN_PER_HOUR = 200; // PDFs one team member may open in a fixed hour window (AC-6)
export const LIST_PAGE = 50; // students on one page of the list (AC-1)
export const MAX_REF = 64; // a reference code longer than this is never looked up
export const MAX_CURSOR = 4000; // a list cursor longer than this is refused as bad_request

// The `TEAM_EMAILS` setting as a list: split on commas, trimmed, lowercase, empty and duplicate entries dropped.
// Unset or empty gives an empty list, and an empty list lets nobody in.
export function parseTeamEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (email && !out.includes(email)) out.push(email);
  }
  return out;
}

export type TeamAccount = { email: string; emailVerified: boolean };

// The fake test sign in makes accounts whose email Google never verified. Only addresses at this domain (the browser tests use
// team.e2e@example.com) may skip the verified check on a deployment that has the test sign in on, so a real looking address on the
// list still has to be verified by Google, even on dev, where the test sign in is open to anyone who reaches the site.
export const TEST_EMAIL_DOMAIN = "@example.com";

// May this signed in account use the team routes? The email must be on the list AND (Google verified it, OR the fake test sign in
// is switched on, which is dev and preview only, AND the address is a fake test address). `email` is compared lowercase.
export function mayEnterTeam(account: TeamAccount, teamEmails: string | undefined, testSignIn: string | undefined): boolean {
  const email = account.email.trim().toLowerCase();
  if (!email || !parseTeamEmails(teamEmails).includes(email)) return false;
  if (account.emailVerified) return true;
  return testSignIn === "true" && email.endsWith(TEST_EMAIL_DOMAIN);
}

// The text a person typed in the reference code box: spaces around a pasted code are ignored. Null when it can never be a code.
export function cleanRef(raw: string | null | undefined): string | null {
  const ref = (raw ?? "").trim();
  return ref.length >= 1 && ref.length <= MAX_REF && /^[A-Za-z0-9]+$/.test(ref) ? ref : null;
}

// A cursor from the list's own `next`, or null when it is not worth passing to the database.
export function cleanCursor(raw: string | null | undefined): string | null | "bad" {
  if (raw === null || raw === undefined || raw === "") return null;
  return raw.length <= MAX_CURSOR ? raw : "bad";
}

// "Try again after 3:45 pm (India time)." from the limiter's retry time in milliseconds.
export function retryMessage(retryAt: number): string {
  const d = new Date(retryAt + 330 * 60 * 1000); // Asia/Kolkata is UTC+05:30 all year
  const h = d.getUTCHours();
  const when = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
  return `You have opened the most reports allowed in one hour. Please try again after ${when} (India time).`;
}
