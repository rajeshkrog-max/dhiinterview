// The winner review (spec 0015 M4; spec 0019, scope row 13). Five commands for the team, run from a terminal with `npx convex run`
// (production needs `--prod` and the owner's yes). Every one is INTERNAL: no browser can call any of them, and nothing here is reachable from
// a page. The output holds personal data (referrer and friend emails, feedback text), so it is read in a terminal, never in an AI session,
// and a CSV is kept private and deleted after the announcement (tools/WINNER-REVIEW.md).
//  - `top10`: the 10 best referrers by LIVE counts, each with every referral's steps, note and warnings.
//  - `exportCsv`: the same, as CSV text, one row per referral.
//  - `ranking`: the top 10 again, short, after review.
//  - `reject` / `restore`: change one referral and count its referrer again through `recount`, the only writer of the counts.
// The public board is never changed here: after the freeze it is final, and the winner is the top valid referrer of `ranking`.
// A command never touches a student's own data (answers, results, notes), only the `referrals` row it is asked about, and it logs no
// email, name or text.
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { RANK_CAP, boardName, decideReferral, rankEntries, recount, stepTimesOf } from "./challengeCore";
import { CSV_COLUMNS, burstIds, isFastFinish, sameTextIds, toCsv, type Warning } from "./challengeAdminCore";
import type { Reader } from "./helpers";

const TOP = 10;
const REFERRALS_PER_REFERRER = 100; // far above what a real referrer has; a longer list is cut and says so
const MAX_NOTE = 500;

const iso = (ms: number | undefined | null): string | null => (ms === undefined || ms === null ? null : new Date(ms).toISOString());
const statusValidator = v.union(v.literal("pending"), v.literal("valid"), v.literal("rejected"));

const referralView = v.object({
  referralId: v.id("referrals"),
  status: statusValidator,
  rejectReason: v.union(v.literal("deadline"), v.literal("review"), v.null()),
  reviewNote: v.union(v.string(), v.null()),
  reviewedAt: v.union(v.string(), v.null()),
  signedUpAt: v.string(),
  check: v.union(v.literal("fresh"), v.literal("imported"), v.null()), // an imported check never counts
  completedAt: v.union(v.string(), v.null()),
  reportSeenAt: v.union(v.string(), v.null()),
  feedbackAt: v.union(v.string(), v.null()), // when the note became genuine
  feedbackGenuine: v.union(v.boolean(), v.null()),
  feedbackText: v.union(v.string(), v.null()),
  friendEmail: v.string(), // "(erased)" when the friend's data is gone
  warnings: v.array(v.string()),
});
const referrerView = v.object({
  rank: v.number(),
  name: v.string(), // first name and last initial, the way the board shows it (the reviewer sees it even for a hidden name)
  email: v.string(),
  class: v.string(),
  validCount: v.number(),
  lastValidAt: v.union(v.string(), v.null()),
  pendingCount: v.number(),
  moreReferralsNotShown: v.boolean(),
  referrals: v.array(referralView),
});
type ReferralView = Infer<typeof referralView>;
type ReferrerView = Infer<typeof referrerView>;

// The ranked top N from live counts (the same order as the board: challengeCore.rankEntries), with the evidence for each referral. The
// warnings are worked out here from the rows: a burst per referrer, a note shared with ANY other referral in this set (also across two
// referrers), and a finish within 3 minutes of the first answer.
async function loadTop(ctx: Reader, n: number): Promise<ReferrerView[]> {
  const entries = await ctx.db.query("challengeEntries").withIndex("by_validCount", (q) => q.gt("validCount", 0)).take(RANK_CAP);
  const top = rankEntries(entries).slice(0, n);

  type Row = { referrer: (typeof top)[number]; ref: Doc<"referrals">; view: Omit<ReferralView, "warnings">; text: string | null; fast: boolean };
  const perReferrer = new Map<number, { rows: Row[]; more: boolean; pending: number; burst: Set<string> }>();
  const all: Row[] = [];

  for (const r of top) {
    const refs = await ctx.db.query("referrals").withIndex("by_referrerId_and_status", (q) => q.eq("referrerId", r.entry.studentId)).take(REFERRALS_PER_REFERRER + 1);
    const more = refs.length > REFERRALS_PER_REFERRER;
    const rows: Row[] = [];
    for (const ref of refs.slice(0, REFERRALS_PER_REFERRER)) {
      const friend = await ctx.db.get("students", ref.friendId);
      const check = friend ? await ctx.db.query("checks").withIndex("by_studentId", (q) => q.eq("studentId", ref.friendId)).unique() : null;
      const note = check ? await ctx.db.query("feedback").withIndex("by_checkId", (q) => q.eq("checkId", check._id)).unique() : null;
      const answers = check ? await ctx.db.query("answers").withIndex("by_checkId_and_q", (q) => q.eq("checkId", check._id)).take(18) : [];
      const firstAnswerAt = answers.length ? Math.min(...answers.map((a) => a.answeredAt)) : null;
      rows.push({
        referrer: r,
        ref,
        text: note ? note.text : null,
        fast: isFastFinish(firstAnswerAt, check?.completedAt ?? null),
        view: {
          referralId: ref._id,
          status: ref.status,
          rejectReason: ref.rejectReason ?? null,
          reviewNote: ref.reviewNote ?? null,
          reviewedAt: iso(ref.reviewedAt),
          signedUpAt: new Date(ref.usedAt).toISOString(),
          check: check?.source ?? null,
          completedAt: iso(check?.completedAt),
          reportSeenAt: iso(check?.reportSeenAt),
          feedbackAt: iso(note?.genuineAt),
          feedbackGenuine: note ? note.genuine : null,
          feedbackText: note ? note.text : null,
          friendEmail: friend ? friend.email : "(erased)",
        },
      });
    }
    perReferrer.set(r.rank, {
      rows,
      more,
      pending: rows.filter((x) => x.ref.status === "pending").length,
      burst: burstIds(rows.map((x) => ({ id: x.ref._id, at: x.ref.usedAt }))),
    });
    all.push(...rows);
  }
  const same = sameTextIds(all.map((x) => ({ id: x.ref._id, text: x.text })));

  const out: ReferrerView[] = [];
  for (const r of top) {
    const student = await ctx.db.get("students", r.entry.studentId);
    const group = perReferrer.get(r.rank)!;
    out.push({
      rank: r.rank,
      name: student ? boardName(student.name, false, "") : "(erased)",
      email: student ? student.email : "(erased)",
      class: student ? student.class : "",
      validCount: r.entry.validCount,
      lastValidAt: iso(r.entry.lastValidAt),
      pendingCount: group.pending,
      moreReferralsNotShown: group.more,
      referrals: group.rows.map((x) => {
        const warnings: Warning[] = [];
        if (group.burst.has(x.ref._id)) warnings.push("burst");
        if (same.has(x.ref._id)) warnings.push("same_text");
        if (x.fast) warnings.push("fast_finish");
        return { ...x.view, warnings };
      }),
    });
  }
  return out;
}

export const top10 = internalQuery({
  args: {},
  returns: v.array(referrerView),
  handler: async (ctx) => await loadTop(ctx, TOP),
});

export const exportCsv = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const rows: (string | number | boolean | null)[][] = [[...CSV_COLUMNS]];
    for (const r of await loadTop(ctx, TOP)) {
      const head = [r.rank, r.name, r.email, r.class, r.validCount];
      // a referrer with no referral rows still gets a line, so nobody drops out of the file
      if (r.referrals.length === 0) rows.push([...head, ...new Array<null>(CSV_COLUMNS.length - head.length).fill(null)]);
      for (const f of r.referrals) {
        rows.push([...head, f.referralId, f.status, f.rejectReason, f.reviewNote, f.signedUpAt, f.check, f.completedAt, f.reportSeenAt, f.feedbackAt, f.feedbackGenuine, f.feedbackText, f.friendEmail, f.warnings.join(";")]);
      }
    }
    return toCsv(rows);
  },
});

// The ranking after review, short: the same live order as `top10` (more valid referrals first, then the earlier last valid time, then the
// earlier join). The winner is the first line. The public board is not changed.
export const ranking = internalQuery({
  args: {},
  returns: v.array(v.object({ rank: v.number(), name: v.string(), email: v.string(), class: v.string(), validCount: v.number(), lastValidAt: v.union(v.string(), v.null()) })),
  handler: async (ctx) => {
    const entries = await ctx.db.query("challengeEntries").withIndex("by_validCount", (q) => q.gt("validCount", 0)).take(RANK_CAP);
    const out = [];
    for (const r of rankEntries(entries).slice(0, TOP)) {
      const student = await ctx.db.get("students", r.entry.studentId);
      out.push({
        rank: r.rank,
        name: student ? boardName(student.name, false, "") : "(erased)",
        email: student ? student.email : "(erased)",
        class: student ? student.class : "",
        validCount: r.entry.validCount,
        lastValidAt: iso(r.entry.lastValidAt),
      });
    }
    return out;
  },
});

// ---------- reject and restore ----------

const reviewArgs = {
  referralId: v.optional(v.id("referrals")),
  friendEmail: v.optional(v.string()),
  reason: v.string(), // a short label, for example "same feedback text"
  note: v.string(), // what the reviewer saw; may be empty
};
const reviewResult = v.union(
  v.object({ ok: v.literal(true), status: statusValidator, referrerValid: v.number() }),
  v.object({ ok: v.literal(false), code: v.union(v.literal("no_match"), v.literal("give_one"), v.literal("no_reason"), v.literal("bad_state")) }),
);

// The one referral named by an id or by the friend's email. Exactly one of the two must be given. "no_match" when there is no such referral
// (also when the friend's data is gone: there is nothing left to match).
async function findReferral(ctx: Reader, args: { referralId?: Id<"referrals">; friendEmail?: string }): Promise<Doc<"referrals"> | "give_one" | null> {
  if ((args.referralId === undefined) === (args.friendEmail === undefined)) return "give_one";
  if (args.referralId !== undefined) return await ctx.db.get("referrals", args.referralId);
  const email = (args.friendEmail ?? "").trim().toLowerCase();
  const friend = await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", email)).unique();
  if (!friend) return null;
  return await ctx.db.query("referrals").withIndex("by_friendId", (q) => q.eq("friendId", friend._id)).first();
}

// Counts the referrer's valid referrals again (the shared `recount`) and returns the new count; 0 for a referrer who has left (no entry).
async function recountedValid(ctx: MutationCtx, referrerId: Id<"students">): Promise<number> {
  const entry = await recount(ctx, referrerId);
  return entry ? ((await ctx.db.get("challengeEntries", entry._id))?.validCount ?? 0) : 0;
}

const noteOf = (reason: string, note: string): string => `${reason.trim()}${note.trim() ? `: ${note.trim()}` : ""}`.slice(0, MAX_NOTE);

// Rejects a pending or valid referral: status `rejected`, reason `review`, the reviewer's words and the time are kept on the row, `validAt`
// stays as it was, and the referrer is counted again. Anything else (already rejected, no match, no reason) changes nothing.
export const reject = internalMutation({
  args: reviewArgs,
  returns: reviewResult,
  handler: async (ctx, args) => {
    if (args.reason.trim() === "") return { ok: false as const, code: "no_reason" as const };
    const ref = await findReferral(ctx, args);
    if (ref === "give_one") return { ok: false as const, code: "give_one" as const };
    if (!ref) return { ok: false as const, code: "no_match" as const };
    if (ref.status === "rejected") return { ok: false as const, code: "bad_state" as const };
    await ctx.db.patch("referrals", ref._id, { status: "rejected", rejectReason: "review", reviewNote: noteOf(args.reason, args.note), reviewedAt: Date.now() });
    return { ok: true as const, status: "rejected" as const, referrerValid: await recountedValid(ctx, ref.referrerId) };
  },
});

// Puts a referral that the team rejected back, and settles it at once with the same rule as the job (`decideReferral`, from the friend's own
// step times): valid if it qualifies, rejected for the deadline if a step came after it, pending if still open. It settles here rather than
// waiting for the job because the job does nothing once the board is frozen, which is when a restore is needed. The earlier note is kept and
// the new words are added to it. Only a referral rejected by review can be restored.
export const restore = internalMutation({
  args: reviewArgs,
  returns: reviewResult,
  handler: async (ctx, args) => {
    if (args.reason.trim() === "") return { ok: false as const, code: "no_reason" as const };
    const ref = await findReferral(ctx, args);
    if (ref === "give_one") return { ok: false as const, code: "give_one" as const };
    if (!ref) return { ok: false as const, code: "no_match" as const };
    if (ref.status !== "rejected" || ref.rejectReason !== "review") return { ok: false as const, code: "bad_state" as const };
    const now = Date.now();
    const note = `${ref.reviewNote ?? ""} | restored: ${noteOf(args.reason, args.note)}`.replace(/^ \| /, "").slice(0, MAX_NOTE * 2);
    const friend = await ctx.db.get("students", ref.friendId);
    const decision = friend ? decideReferral(await stepTimesOf(ctx, ref.friendId), now) : ({ kind: "pending" } as const);
    if (decision.kind === "valid") {
      await ctx.db.patch("referrals", ref._id, { status: "valid", validAt: decision.validAt, rejectReason: undefined, reviewNote: note, reviewedAt: now });
    } else if (decision.kind === "rejected") {
      await ctx.db.patch("referrals", ref._id, { status: "rejected", rejectReason: decision.reason, reviewNote: note, reviewedAt: now });
    } else {
      await ctx.db.patch("referrals", ref._id, { status: "pending", rejectReason: undefined, reviewNote: note, reviewedAt: now });
    }
    const status = decision.kind === "valid" ? ("valid" as const) : decision.kind === "rejected" ? ("rejected" as const) : ("pending" as const);
    return { ok: true as const, status, referrerValid: await recountedValid(ctx, ref.referrerId) };
  },
});
