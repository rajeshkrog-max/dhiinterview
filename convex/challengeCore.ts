// The rules and the shared database steps of the Founding Circle Challenge (spec 0015, children 0016 and 0017).
//  - Pure: `codeLetters`, `randomChars`, `decideReferral` (when is a referral valid, rejected or still pending).
//  - Database: `makeUniqueCode`, `recordPendingReferral` (called by students.createProfile), `recount` (the only writer of `validCount`).
// Nothing here logs: callers log counts only, never a name, an email or a code.
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { CODE_CHARS, CODE_RE, ENDS_AT_MS, hasEnded } from "./challengeRules";
import { fail } from "./helpers";

// ---------- codes (spec 0016, AC-1) ----------

// Three letters that would read badly on a public code. A starter list: add to it freely, a name that lands on one simply gets DHI.
const BLOCKED_LETTERS: ReadonlySet<string> = new Set(["ASS", "SEX", "FUK", "FUC", "TIT", "CUM", "KKK", "WTF", "GAY", "NIG", "RAP", "HIV", "POO", "DIK"]);

// The first three letters of a code: the first word of the name with accents removed (NFKD) and only A to Z kept, padded with X.
// A name with no Latin letters, or letters on the blocklist, gives DHI.
export function codeLetters(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  const letters = firstWord.normalize("NFKD").toUpperCase().replace(/[^A-Z]/g, "");
  if (letters === "") return "DHI";
  const head = (letters + "XXX").slice(0, 3);
  return BLOCKED_LETTERS.has(head) ? "DHI" : head;
}

// `n` characters from CODE_CHARS drawn with Web Crypto by rejection sampling: a byte at or above the largest multiple of the alphabet size
// is thrown away, so no character is likelier than another (no modulo bias). `bytes` is only for tests.
export function randomChars(n: number, bytes: (len: number) => Uint8Array = (len) => crypto.getRandomValues(new Uint8Array(len))): string {
  const size = CODE_CHARS.length;
  const limit = 256 - (256 % size);
  let out = "";
  while (out.length < n) {
    for (const b of bytes(Math.max(8, (n - out.length) * 2))) {
      if (b >= limit) continue;
      out += CODE_CHARS[b % size];
      if (out.length === n) break;
    }
  }
  return out;
}

const CODE_TRIES = 8;

// A code nobody holds. The lookup and the insert that follows are in the same transaction (the caller inserts it), so two joins cannot end
// with the same code: if they race, one of them is retried by Convex and sees the other's row.
export async function makeUniqueCode(ctx: MutationCtx, name: string): Promise<string> {
  const head = codeLetters(name);
  for (let i = 0; i < CODE_TRIES; i++) {
    const code = head + randomChars(4);
    const taken = await ctx.db.query("challengeEntries").withIndex("by_code", (q) => q.eq("code", code)).first();
    if (!taken) return code;
  }
  fail("try_again"); // 8 clashes in a row on one prefix means something is wrong; ask the student to try again
}

// ---------- a pending referral at profile creation (spec 0016, AC-3 and AC-4) ----------

// Called once, by `students.createProfile`, right after the new student row is made. A code that is the wrong shape, has no owner, belongs to
// the friend themselves, or arrives while the challenge is off or over leaves no referral and never raises an error: sign in is never harmed
// by a code. The friend can have only one referral, so a second call changes nothing.
export async function recordPendingReferral(ctx: MutationCtx, friendId: Id<"students">, rawCode: string | undefined, live: boolean, now: number): Promise<void> {
  if (!live || hasEnded(now) || !rawCode) return;
  const code = rawCode.trim().toUpperCase();
  if (!CODE_RE.test(code)) return;
  const entry = await ctx.db.query("challengeEntries").withIndex("by_code", (q) => q.eq("code", code)).first();
  if (!entry || entry.studentId === friendId) return;
  const already = await ctx.db.query("referrals").withIndex("by_friendId", (q) => q.eq("friendId", friendId)).first();
  if (already) return;
  await ctx.db.insert("referrals", { referrerId: entry.studentId, friendId, code, usedAt: now, status: "pending" });
}

// ---------- when is a referral valid (spec 0016, AC-5 and AC-6) ----------

export type StepTimes = {
  source: "fresh" | "imported" | null; // null: the friend has no check row
  completedAt: number | null; // checks.completedAt
  reportSeenAt: number | null; // checks.reportSeenAt
  genuineAt: number | null; // feedback.genuineAt, only for a genuine note
};

export type Decision = { kind: "valid"; validAt: number } | { kind: "rejected"; reason: "deadline" } | { kind: "pending" };

// The one place that says whether a referral counts. All three steps must be there, on a check made here (an imported check never counts),
// and the latest of the three times (`validAt`) must be at or before the deadline. A step that came after the deadline, or one still missing
// once the deadline has passed, rejects the referral. Otherwise it waits. `now` is passed in so a test can pick any moment.
export function decideReferral(steps: StepTimes, now: number): Decision {
  const { completedAt, reportSeenAt, genuineAt } = steps;
  const all = steps.source === "fresh" && completedAt !== null && reportSeenAt !== null && genuineAt !== null;
  if (all) {
    const validAt = Math.max(completedAt, reportSeenAt, genuineAt);
    return validAt <= ENDS_AT_MS ? { kind: "valid", validAt } : { kind: "rejected", reason: "deadline" };
  }
  return hasEnded(now) ? { kind: "rejected", reason: "deadline" } : { kind: "pending" };
}

// The three times for one friend, read from the rows the other functions already keep.
export async function stepTimesOf(ctx: MutationCtx, friendId: Id<"students">): Promise<StepTimes> {
  const check = await ctx.db.query("checks").withIndex("by_studentId", (q) => q.eq("studentId", friendId)).unique();
  if (!check) return { source: null, completedAt: null, reportSeenAt: null, genuineAt: null };
  const note = await ctx.db.query("feedback").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique();
  return {
    source: check.source,
    completedAt: check.completedAt ?? null,
    reportSeenAt: check.reportSeenAt ?? null,
    genuineAt: note && note.genuine ? (note.genuineAt ?? null) : null,
  };
}

// ---------- the counter (spec 0016, AC-7) ----------

// A referrer with more valid referrals than this is counted up to the cap only. No student gets near it (the best case is dozens); the cap
// keeps one transaction from reading without limit.
export const RECOUNT_CAP = 5000;

// The only function that writes `validCount` and `lastValidAt`. It counts the referrer's `valid` referrals and takes the latest `validAt`,
// so the counter follows the rows and cannot drift. A student with no entry has nothing to write.
export async function recount(ctx: MutationCtx, referrerId: Id<"students">): Promise<Doc<"challengeEntries"> | null> {
  const entry = await ctx.db.query("challengeEntries").withIndex("by_studentId", (q) => q.eq("studentId", referrerId)).first();
  if (!entry) return null;
  let count = 0;
  let last: number | undefined;
  const valid = ctx.db.query("referrals").withIndex("by_referrerId_and_status", (q) => q.eq("referrerId", referrerId).eq("status", "valid"));
  for await (const r of valid) {
    count += 1;
    if (r.validAt !== undefined && (last === undefined || r.validAt > last)) last = r.validAt;
    if (count >= RECOUNT_CAP) break;
  }
  if (entry.validCount !== count || entry.lastValidAt !== last) await ctx.db.patch("challengeEntries", entry._id, { validCount: count, lastValidAt: last });
  return entry;
}

// ---------- ranking (spec 0018, AC-1) ----------

export type Rankable = Pick<Doc<"challengeEntries">, "_id" | "_creationTime" | "validCount" | "lastValidAt" | "joinedAt">;

// More valid referrals first; equal counts go to whoever reached that count first (earlier `lastValidAt`), then the earlier join. The last two
// keys make the order total, so the same data always gives the same ranks and nobody shares a place.
export function compareEntries(a: Rankable, b: Rankable): number {
  const last = (e: Rankable) => e.lastValidAt ?? Number.MAX_SAFE_INTEGER;
  return b.validCount - a.validCount || last(a) - last(b) || a.joinedAt - b.joinedAt || a._creationTime - b._creationTime || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);
}

export type Ranked<T extends Rankable> = { entry: T; rank: number; toNext: number; nextRank: number | null };

// Ranks 1, 2, 3 ... for entries with at least one valid referral. `nextRank` is the place directly above and `toNext` the referrals needed to
// pass that student: their count minus mine plus 1 (a student who reached the same count first stays above until I pass them). First place: 0 and null.
export function rankEntries<T extends Rankable>(entries: T[]): Ranked<T>[] {
  const sorted = entries.filter((e) => e.validCount > 0).sort(compareEntries);
  return sorted.map((entry, i) => ({
    entry,
    rank: i + 1,
    toNext: i === 0 ? 0 : sorted[i - 1].validCount - entry.validCount + 1,
    nextRank: i === 0 ? null : i,
  }));
}

// A ranked entry list longer than this is not ranked at all (the run logs and leaves the old board). Far above any real number of referrers.
export const RANK_CAP = 5000;

// What the board calls a style: the saved result's `styleKey` mapped k, p, v. The letters themselves never leave the server.
export const STYLE_LABEL: Record<string, string> = { k: "Builder", p: "Achiever", v: "Explorer" };

const SEGMENTS = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const MAX_SHOWN_NAME = 30;
const graphemes = (s: string): string[] => Array.from(SEGMENTS.segment(s), (g) => g.segment);

// A name as the board shows it: the first word (one capital then lower case, cut to 30 letters) and the last word's first letter, so
// "ananya DEVI rao" is "Ananya R.". Letters are taken whole with Intl.Segmenter, so a Hindi name is never cut inside a letter. A one word name
// is shown as is. A hidden name is "Anonymous <Style>" and carries nothing of the student.
export function boardName(fullName: string, hide: boolean, style: string): string {
  if (hide) return `Anonymous ${style}`.trim();
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  const head = graphemes(words[0] ?? "").slice(0, MAX_SHOWN_NAME);
  const first = head.length ? head[0].toUpperCase() + head.slice(1).join("").toLowerCase() : "Student";
  if (words.length < 2) return first;
  return `${first} ${graphemes(words[words.length - 1])[0].toUpperCase()}.`;
}

// ---------- removing an entry (spec 0018, AC-5; used by `challenge.leave`, and by the erase request of spec 0014) ----------

// Deletes the student's entry and takes their row off the board AT ONCE, before or after the freeze: someone who leaves (or asks to be erased)
// does not stay on a public list for up to 5 minutes. The board is not ranked again from live counts here (after the freeze a referral the
// team rejects in review must not change it). This takes the one row out of the snapshot and moves everyone below up a place, on the snapshot
// and on each entry, so their own "you" card matches; before the freeze the next run ranks everything again anyway. The place directly above
// the next student changes, so only that student's `toNext` is worked out again. The row of the 51st is not pulled in.
export async function dropEntry(ctx: MutationCtx, entry: Doc<"challengeEntries">): Promise<void> {
  const snap = await ctx.db.query("leaderboardSnapshots").first();
  const gone = entry.rank;
  await ctx.db.delete("challengeEntries", entry._id);
  if (!snap || gone === undefined) return;

  const rows = snap.rows.filter((r) => r.rank !== gone).map((r) => (r.rank > gone ? { ...r, rank: r.rank - 1 } : r));
  if (rows.length !== snap.rows.length || rows.some((r, i) => r !== snap.rows[i])) await ctx.db.patch("leaderboardSnapshots", snap._id, { rows });

  const ranked = await ctx.db.query("challengeEntries").withIndex("by_rank", (q) => q.gt("rank", 0)).take(RANK_CAP);
  const above = ranked.find((e) => e.rank === gone - 1);
  for (const e of ranked) {
    if (e.rank === undefined || e.rank <= gone) continue;
    const rank = e.rank - 1;
    let toNext = e.toNext;
    if (rank === 1) toNext = 0;
    else if (e.rank === gone + 1 && above) toNext = above.validCount - e.validCount + 1;
    await ctx.db.patch("challengeEntries", e._id, { rank, toNext, nextRank: rank === 1 ? undefined : rank - 1 });
  }
}
