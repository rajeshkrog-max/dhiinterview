// The 5 minute challenge job (spec 0015, "The job"; spec 0016, AC-5 to AC-7; spec 0018, the leaderboard). Each run does four things:
//  (1) settle `pending` referrals from the friend's own step times (challengeCore.decideReferral),
//  (2) recount `validCount` and `lastValidAt` for every referrer whose referrals changed,
//  (3) rank every entry with a valid referral and write `rank`, `toNext` and `nextRank` where they changed, and
//  (4) write the top 50 into the one `leaderboardSnapshots` row, with `computedAt`.
// The first run after the deadline settles everything as of `ENDS_AT_MS` (it compares the stored step times with the deadline, so the moment it
// actually runs does not matter), writes the final snapshot with `frozen: true`, and every later run changes nothing. The public row is built
// in one place, `rowFor`, the way sharePayload.ts builds the public report; a test scans its keys.
// It reads time from the rows, not from counters, so running it twice in a row, or two runs overlapping, gives the same result. It works in
// pages of PAGE referrals and starts the next page itself, so one transaction never reads or writes too much; the last page ranks and
// writes the snapshot. A run that fails changes nothing (a mutation is one transaction), so the old snapshot stays. With CHALLENGE_LIVE off
// it does nothing. It logs counts only: no names, emails or codes.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalMutation, type MutationCtx } from "./_generated/server";
import { leaderboardPictureFor } from "./avatarState";
import { RANK_CAP, STYLE_LABEL, boardName, decideReferral, rankEntries, recount, stepTimesOf } from "./challengeCore";
import { LEADERBOARD_SIZE, hasEnded, isLive } from "./challengeRules";
import type { Reader } from "./helpers";

const PAGE = 100;

export type BoardRow = { rank: number; displayName: string; cls?: string; style: string; valid: number; avatar?: string };

// The ONE place that decides what a stranger sees of a student. Exactly `rank`, `displayName`, `cls`, `style`, `valid` and, if the picture
// switch is on and the name is not hidden, `avatar`. A hidden name carries no class and no picture. Null when the student's data is gone
// (an erase that has not reached the entry yet): the caller drops the entry instead of showing a gap.
export async function rowFor(ctx: Reader, entry: Doc<"challengeEntries">, rank: number): Promise<BoardRow | null> {
  const student = await ctx.db.get("students", entry.studentId);
  if (!student) return null;
  const result = await ctx.db.query("results").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).first();
  const style = result ? (STYLE_LABEL[result.styleKey] ?? "") : "";
  const picture = entry.hideName ? null : await leaderboardPictureFor(ctx, student._id);
  return {
    rank,
    displayName: boardName(student.name, entry.hideName, style),
    ...(entry.hideName ? {} : { cls: student.class }),
    style,
    valid: entry.validCount,
    ...(picture ? { avatar: picture } : {}),
  };
}

// Steps (3) and (4): rank, patch what changed, write the snapshot. An entry whose student is gone is deleted and the ranking starts again, so
// the board never has a gap. If more than RANK_CAP entries are ranked it writes nothing and says so (a count, never a name).
async function rankAndWrite(ctx: MutationCtx, frozen: boolean, now: number): Promise<number | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const entries = await ctx.db.query("challengeEntries").withIndex("by_validCount", (q) => q.gt("validCount", 0)).take(RANK_CAP + 1);
    if (entries.length > RANK_CAP) {
      console.log(`challengeBoard.run: more than ${RANK_CAP} ranked entries, the board was not changed`);
      return null;
    }
    const ranked = rankEntries(entries);
    const rows: BoardRow[] = [];
    let orphan: Id<"challengeEntries"> | null = null;
    for (const r of ranked.slice(0, LEADERBOARD_SIZE)) {
      const row = await rowFor(ctx, r.entry, r.rank);
      if (!row) {
        orphan = r.entry._id;
        break;
      }
      rows.push(row);
    }
    if (orphan) {
      await ctx.db.delete("challengeEntries", orphan);
      continue;
    }

    for (const r of ranked) {
      const nextRank = r.nextRank ?? undefined;
      if (r.entry.rank !== r.rank || r.entry.toNext !== r.toNext || r.entry.nextRank !== nextRank) {
        await ctx.db.patch("challengeEntries", r.entry._id, { rank: r.rank, toNext: r.toNext, nextRank });
      }
    }
    // A student whose count fell back to 0 (a referral rejected before the freeze) is no longer ranked.
    const held = await ctx.db.query("challengeEntries").withIndex("by_rank", (q) => q.gt("rank", 0)).take(RANK_CAP + 1);
    const ids = new Set(ranked.map((r) => r.entry._id));
    for (const e of held) if (!ids.has(e._id)) await ctx.db.patch("challengeEntries", e._id, { rank: undefined, toNext: undefined, nextRank: undefined });

    const doc = { rows, computedAt: now, frozen };
    const snap = await ctx.db.query("leaderboardSnapshots").first();
    if (snap) await ctx.db.replace("leaderboardSnapshots", snap._id, doc);
    else await ctx.db.insert("leaderboardSnapshots", doc);
    return ranked.length;
  }
  throw new Error("challengeBoard: entries kept disappearing while ranking"); // the run fails whole and the old snapshot stays
}

export const run = internalMutation({
  // `after` is the _creationTime of the last referral of the page before; the first page starts at the beginning.
  args: { after: v.optional(v.number()), valid: v.optional(v.number()), rejected: v.optional(v.number()), startedAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!isLive(env)) return null;
    const before = await ctx.db.query("leaderboardSnapshots").first();
    if (before?.frozen) return null; // the board is final; only a leave or an erase touches it (challengeCore.dropEntry)
    const now = Date.now();
    const startedAt = args.startedAt ?? now; // the first page's time: a chain that began before the deadline is not the final run, even if it ends after it
    const after = args.after ?? -1;
    const rows = await ctx.db
      .query("referrals")
      .withIndex("by_status", (q) => q.eq("status", "pending").gt("_creationTime", after))
      .take(PAGE);

    let valid = args.valid ?? 0;
    let rejected = args.rejected ?? 0;
    const touched = new Set<Id<"students">>();
    for (const row of rows) {
      if (!(await ctx.db.get("students", row.friendId))) {
        // The friend's data was erased (spec 0014): the referral goes and the referrer is counted again.
        await ctx.db.delete("referrals", row._id);
        touched.add(row.referrerId);
        continue;
      }
      const decision = decideReferral(await stepTimesOf(ctx, row.friendId), now);
      if (decision.kind === "valid") {
        await ctx.db.patch("referrals", row._id, { status: "valid", validAt: decision.validAt });
        touched.add(row.referrerId);
        valid += 1;
      } else if (decision.kind === "rejected") {
        await ctx.db.patch("referrals", row._id, { status: "rejected", rejectReason: decision.reason });
        rejected += 1;
      }
    }
    for (const referrerId of touched) await recount(ctx, referrerId);

    if (rows.length === PAGE) {
      await ctx.scheduler.runAfter(0, internal.challengeBoard.run, { after: rows[rows.length - 1]._creationTime, valid, rejected, startedAt });
      return null;
    }
    // The last page: rank and write the board. After the deadline this is the final run, so it freezes.
    const frozen = hasEnded(startedAt);
    const ranked = await rankAndWrite(ctx, frozen, now);
    if (valid > 0 || rejected > 0 || frozen) {
      console.log(`challengeBoard.run: ${valid} referral(s) became valid, ${rejected} rejected, ${ranked ?? "no"} ranked${frozen ? ", board frozen" : ""}`);
    }
    return null;
  },
});
