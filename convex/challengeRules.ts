// The rules of the Founding Circle Challenge that more than one file needs (spec 0015). Plain values and pure functions, no database.
// Shared with the pages: `public/dhiinterviews/js/challenge-config.js` repeats the deadline and `js/api.js` repeats `CODE_RE`, and
// `convex/challenge.test.ts` fails if either differs from this file.

// 23:59 India time on 30 October 2026, so a step at 23:59:30 is late. Queries cannot read the clock; the job (challengeBoard.ts) decides.
export const ENDS_AT_ISO = "2026-10-30T23:59:00+05:30";
export const ENDS_AT_MS = Date.parse(ENDS_AT_ISO); // 2026-10-30T18:29:00Z

// A code is 3 capital letters (from the student's first name, or DHI) then 4 characters from CODE_CHARS (no O, 0, I or 1).
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-Z]{3}[A-HJ-NP-Z2-9]{4}$/;

export const LEADERBOARD_SIZE = 50;
export const JOB_EVERY_MS = 5 * 60 * 1000;

// `CHALLENGE_LIVE` is the server switch (true, 1, yes or on, any case; unset means off). With it off nobody can join, no referral is
// recorded and the job does nothing, so the site behaves as it did before the challenge went live.
export function isLive(e: { CHALLENGE_LIVE?: string }): boolean {
  return ["true", "1", "yes", "on"].includes((e.CHALLENGE_LIVE ?? "").trim().toLowerCase());
}

export function hasEnded(now: number): boolean {
  return now > ENDS_AT_MS;
}
