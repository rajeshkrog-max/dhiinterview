// The profile picture (spec 0011): `ensure` (the student's own call, from the browser bridge), `sync` (the one place that asks Google),
// `apply` (swaps the stored picture only if the lease, the consent and the switches still hold), `byKey` (what the image route reads),
// the student's own `remove` and `restore`, and the team's `adminBlock` and `adminUnblock` (run with `npx convex run`, never from a browser).
// Needs: the `avatars` table, the limits in limits.ts, PROFILE_PICTURE_ENABLED. Nothing a browser can call takes a student id, an email
// or an address: the student is found from the session, and the internal functions are reached only by `ensure`/`restore` or the team (AC-10).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { LEASE_MS, fetchPicture, newKey, pictureAddress, reasonNow, KEY_RE, type Reason } from "./avatarCore";
import { avatarRow, isPictureAgreed, pictureEnabled } from "./avatarState";
import { getSignedInUser, requireStudent } from "./helpers";
import { rateLimiter } from "./limits";

const outcomeValidator = v.union(
  v.object({
    kind: v.literal("stored"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    size: v.number(),
    sha256: v.string(),
    key: v.string(),
    etag: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("unchanged"), etag: v.optional(v.string()) }),
  v.object({ kind: v.literal("failed"), code: v.string(), permanent: v.boolean() }),
);

const NOTHING = { ok: true as const, scheduled: false };
const ensureReturns = v.object({ ok: v.literal(true), scheduled: v.boolean() });

// A row that has no picture yet needs some key. It is never served (the route needs a stored file) and is replaced by the real,
// action made key when the first picture lands, so it only has to be unique.
function placeholderKey(): string {
  return newKey();
}

/**
 * Called once per page load by the browser bridge, and only when `students.me` says a fetch may be due. Reads the picture address
 * from the signed in account (never from the request), decides again on the server, and schedules at most one fetch. It takes the
 * per student limit, then the lease, then the daily token, and only when a fetch is really due, so a no-op costs nothing. It never
 * throws after taking a token: every refusal is a plain answer (a throw would also roll the count back).
 */
export const ensure = mutation({
  args: {},
  returns: ensureReturns,
  handler: async (ctx) => {
    if (!pictureEnabled()) return NOTHING; // AC-16
    const { student } = await requireStudent(ctx);
    const user = await getSignedInUser(ctx);
    if (!user) return NOTHING;
    const row = await avatarRow(ctx, student._id);
    if (!(await isPictureAgreed(ctx, student._id))) {
      // AC-1: nothing is fetched before the student agrees. A file held from the time nobody was asked (a later switch to the asked
      // mode) is dropped here, and the row goes back to "never landed" so a later agreement fetches it afresh.
      if (row?.storageId) {
        await ctx.storage.delete(row.storageId);
        await ctx.db.patch("avatars", row._id, {
          storageId: undefined,
          contentType: undefined,
          size: undefined,
          sha256: undefined,
          etag: undefined,
          checkedAt: 0,
          updatedAt: Date.now(),
          lastError: undefined,
        });
      }
      return NOTHING;
    }
    if (row?.removedAt || row?.blockedAt) return NOTHING;

    const address = pictureAddress(user.image);
    const now = Date.now();
    const reason = reasonNow(row, address, now);
    if (!reason) return NOTHING;

    // The account has no photo now (or only Google's placeholder): drop any picture we hold. No fetch, no token.
    if (reason === "clear" && row) {
      if (row.storageId) await ctx.storage.delete(row.storageId);
      // `NO_FILE` also drops the lease, so a fetch for the old address that is still away cannot land afterwards. `sourceUrl` goes
      // back to "" so the same photo returning later counts as a changed address and is fetched at once, not after a week.
      await ctx.db.patch("avatars", row._id, { ...NO_FILE, sourceUrl: "", checkedAt: now, updatedAt: now, lastError: undefined });
      return NOTHING;
    }
    if (!address) return NOTHING;

    return { ok: true as const, scheduled: await startFetch(ctx, student._id, row, address, reason, now, "avatarCheck") };
  },
});

/**
 * Takes the limits, then the lease, and schedules one `sync`. Shared by `ensure` and `restore`. Never throws: every refusal is
 * `false` (a throw would roll the counts back). The per student limit comes first, then the lease, then the daily pools, and a
 * token is taken only here, when a fetch is really about to be scheduled.
 */
async function startFetch(
  ctx: MutationCtx,
  studentId: Id<"students">,
  row: Doc<"avatars"> | null,
  address: string,
  reason: Reason,
  now: number,
  studentLimit: "avatarCheck" | "avatarRestore",
): Promise<boolean> {
  if (row?.leaseUntil && row.leaseUntil > now) return false; // another tab or device already has a fetch running (checked first: it costs the student's token nothing)
  const own = await rateLimiter.limit(ctx, studentLimit, { key: studentId });
  if (!own.ok) return false;
  // Weekly re-checks live inside a smaller daily pool than first fetches, so a busy day never starves a new student's first picture.
  if (reason === "recheck") {
    const pool = await rateLimiter.limit(ctx, "avatarRecheckDay", { key: "all" });
    if (!pool.ok) return false;
  }
  const day = await rateLimiter.limit(ctx, "avatarDay", { key: "all" });
  if (!day.ok) return false;

  const leaseToken = crypto.randomUUID();
  if (row) {
    await ctx.db.patch("avatars", row._id, { leaseUntil: now + LEASE_MS, leaseToken });
  } else {
    await ctx.db.insert("avatars", {
      studentId,
      key: placeholderKey(),
      sourceUrl: address,
      checkedAt: 0,
      updatedAt: now,
      leaseUntil: now + LEASE_MS,
      leaseToken,
    });
  }
  await ctx.scheduler.runAfter(0, internal.avatars.sync, {
    studentId,
    address,
    leaseToken,
    // A conditional request only makes sense for the address the ETag came from.
    ...(row && reason === "recheck" && row.etag ? { etag: row.etag } : {}),
    ...(row?.sha256 ? { knownSha: row.sha256 } : {}),
  });
  return true;
}

// What a row holds once its picture is gone (Remove, a team block, or a Restore about to fetch again).
const NO_FILE = { storageId: undefined, contentType: undefined, size: undefined, sha256: undefined, etag: undefined, leaseUntil: undefined, leaseToken: undefined } as const;

const okReturns = v.object({ ok: v.literal(true) });

/**
 * The student takes their picture back (AC-9). Deletes the stored file and sets `removedAt` in the same step, drops the lease so a
 * fetch that is still away cannot land (`apply` also checks `removedAt`), and from then on nothing is fetched or shown until the
 * student's own Restore. Not a consent row. It works whatever the switches say: taking a picture away is always allowed.
 */
export const remove = mutation({
  args: {},
  returns: okReturns,
  handler: async (ctx) => {
    const { student } = await requireStudent(ctx);
    const row = await avatarRow(ctx, student._id);
    if (!row || row.removedAt) return { ok: true as const };
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.patch("avatars", row._id, { ...NO_FILE, removedAt: Date.now(), lastError: undefined });
    return { ok: true as const };
  },
});

/**
 * The student's own "Use my Google picture" (AC-9). Clears `removedAt` (only this does), makes a new key and fetches again, so a
 * cached 404 on the old key can never hide the new picture. Needs the student to have agreed (every student, in the default mode) and
 * the team not to have blocked it; a team block is never cleared here. `scheduled` is false when the fetch was held back by a limit
 * or the account has no photo: the picture is then due, and the next page load asks again.
 */
export const restore = mutation({
  args: {},
  returns: v.union(
    v.object({ ok: v.literal(true), scheduled: v.boolean() }),
    v.object({ ok: v.literal(false), code: v.union(v.literal("needs_consent"), v.literal("blocked"), v.literal("off")) }),
  ),
  handler: async (ctx) => {
    if (!pictureEnabled()) return { ok: false as const, code: "off" as const }; // AC-16
    const { student } = await requireStudent(ctx);
    if (!(await isPictureAgreed(ctx, student._id))) return { ok: false as const, code: "needs_consent" as const };
    const row = await avatarRow(ctx, student._id);
    if (row?.blockedAt) return { ok: false as const, code: "blocked" as const };
    if (!row || !row.removedAt) return { ok: true as const, scheduled: false }; // nothing was removed

    const user = await getSignedInUser(ctx);
    const address = pictureAddress(user?.image);
    const now = Date.now();
    if (row.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.patch("avatars", row._id, {
      ...NO_FILE,
      removedAt: undefined,
      key: newKey(), // never the key of the removed picture
      sourceUrl: address ?? row.sourceUrl,
      checkedAt: 0, // nothing has landed yet, so a picture is due until one does
      updatedAt: now,
      lastError: undefined,
    });
    if (!address) return { ok: true as const, scheduled: false };
    const fresh = (await avatarRow(ctx, student._id))!;
    return { ok: true as const, scheduled: await startFetch(ctx, student._id, fresh, address, "first", now, "avatarRestore") };
  },
});

const studentByEmail = async (ctx: MutationCtx, email: string) =>
  await ctx.db.query("students").withIndex("by_email", (q) => q.eq("email", email.trim().toLowerCase())).first();

/**
 * For the team, from a terminal: `npx convex run avatars:adminBlock '{"email":"student@example.com"}'` (add `--prod` for production).
 * Takes a picture off every screen after a complaint: the stored file is deleted, its address answers 404, and nothing is fetched
 * again. `ok` is false only when no student has that email. Blocking twice changes nothing. A student's own Restore never clears this.
 */
export const adminBlock = internalMutation({
  args: { email: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const student = await studentByEmail(ctx, args.email);
    if (!student) return { ok: false };
    const row = await avatarRow(ctx, student._id);
    const now = Date.now();
    if (!row) {
      // No picture has been fetched yet: a row that only says "blocked" keeps `ensure` from ever fetching one.
      await ctx.db.insert("avatars", { studentId: student._id, key: newKey(), sourceUrl: "", checkedAt: 0, updatedAt: now, blockedAt: now });
      return { ok: true };
    }
    if (row.blockedAt) return { ok: true };
    if (row.storageId) await ctx.storage.delete(row.storageId);
    // checkedAt 0 so that, if the team later unblocks, the picture is fetched afresh (with a new key) unless the student removed it.
    await ctx.db.patch("avatars", row._id, { ...NO_FILE, blockedAt: now, checkedAt: 0, updatedAt: now, lastError: undefined });
    return { ok: true };
  },
});

/**
 * `npx convex run avatars:adminUnblock '{"email":"student@example.com"}'`. Clears the team block and nothing else: a picture the
 * student removed stays removed (only their own Restore brings it back), otherwise the next page load fetches it again.
 */
export const adminUnblock = internalMutation({
  args: { email: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const student = await studentByEmail(ctx, args.email);
    if (!student) return { ok: false };
    const row = await avatarRow(ctx, student._id);
    if (row?.blockedAt) await ctx.db.patch("avatars", row._id, { blockedAt: undefined, updatedAt: Date.now() });
    return { ok: true };
  },
});

/** The only function that asks Google for a picture. Fetches, checks and stores the file, then hands the result to `apply`. */
export const sync = internalAction({
  args: {
    studentId: v.id("students"),
    address: v.string(),
    leaseToken: v.string(),
    etag: v.optional(v.string()),
    knownSha: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const got = await fetchPicture(args.address, { etag: args.etag, knownSha: args.knownSha });
    let storedId: Id<"_storage"> | null = null;
    let outcome: typeof outcomeValidator.type;
    if (got.kind === "stored") {
      try {
        storedId = await ctx.storage.store(new Blob([got.bytes as unknown as ArrayBuffer], { type: got.contentType }));
        outcome = { kind: "stored", storageId: storedId, contentType: got.contentType, size: got.bytes.length, sha256: got.sha256, key: got.key, etag: got.etag };
      } catch {
        outcome = { kind: "failed", code: "storage", permanent: false };
      }
    } else {
      outcome = got;
    }
    let applied = false;
    try {
      applied = await ctx.runMutation(internal.avatars.apply, {
        studentId: args.studentId,
        leaseToken: args.leaseToken,
        address: args.address,
        outcome,
      });
    } catch (error) {
      // `apply` itself failed (a conflict retry limit, a deploy): no row points at the new file, so it must not stay in storage.
      if (storedId) await ctx.storage.delete(storedId);
      throw error;
    }
    // The swap was refused (a Remove, a block or the lease moved on while we fetched): the new file must not stay.
    if (!applied && storedId) await ctx.storage.delete(storedId);
    return null;
  },
});

/**
 * Lands a fetch. Re-checks the lease token, the consent, the switch, `removedAt` and `blockedAt` at this moment, so a Remove that
 * arrives mid fetch wins. Returns false when the new file must be thrown away.
 */
export const apply = internalMutation({
  args: { studentId: v.id("students"), leaseToken: v.string(), address: v.string(), outcome: outcomeValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await avatarRow(ctx, args.studentId);
    if (!row || row.leaseToken !== args.leaseToken) return false; // not our fetch any more
    const free = { leaseUntil: undefined, leaseToken: undefined };
    const allowed = pictureEnabled() && !row.removedAt && !row.blockedAt && (await isPictureAgreed(ctx, args.studentId));
    if (!allowed) {
      await ctx.db.patch("avatars", row._id, free);
      return false;
    }
    const now = Date.now();
    const o = args.outcome;
    if (o.kind === "stored") {
      if (row.storageId) await ctx.storage.delete(row.storageId);
      await ctx.db.patch("avatars", row._id, {
        ...free,
        key: o.key, // a new image always has a new key, so the old address stops working
        storageId: o.storageId,
        contentType: o.contentType,
        size: o.size,
        sha256: o.sha256,
        etag: o.etag,
        sourceUrl: args.address,
        checkedAt: now,
        updatedAt: now,
        lastError: undefined,
      });
      return true;
    }
    if (o.kind === "unchanged") {
      await ctx.db.patch("avatars", row._id, { ...free, sourceUrl: args.address, etag: o.etag ?? row.etag, checkedAt: now, lastError: undefined });
      return false;
    }
    // A failure keeps whatever picture we hold. A permanent one (a bad file, a redirect, a 4xx) is not asked again until the next
    // check is due; a short lived one (a timeout, a 5xx) leaves the check due, so the next page load tries again.
    await ctx.db.patch("avatars", row._id, {
      ...free,
      lastError: o.code,
      ...(o.permanent ? { sourceUrl: args.address, checkedAt: now } : {}),
    });
    return false;
  },
});

/** For the image route: the stored file behind a key, or null (unknown, removed, blocked, erased, or the feature is off: all the same). */
export const byKey = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.object({ storageId: v.id("_storage"), contentType: v.string() }), v.null()),
  handler: async (ctx, args) => {
    if (!pictureEnabled() || !KEY_RE.test(args.key)) return null;
    const row = await ctx.db.query("avatars").withIndex("by_key", (q) => q.eq("key", args.key)).unique();
    if (!row || !row.storageId || !row.contentType || row.removedAt || row.blockedAt) return null;
    // AC-8: in the asked mode the key of a student who has not agreed answers 404, so a later switch to that mode hides every such picture at once.
    if (!(await isPictureAgreed(ctx, row.studentId))) return null;
    return { storageId: row.storageId, contentType: row.contentType };
  },
});
