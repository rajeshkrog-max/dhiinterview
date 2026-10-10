// Who has agreed to the profile picture, and what a screen may show (spec 0011). Shared by `students.me`, `avatars.ts` and, in later
// milestones, the report copy, the shared report and the team pages, so every place applies the same rule.
// Owns `isPictureAgreed` (AC-1), the feature switch (AC-16) and `pictureFor` (the path rule of "Where the picture is delivered").
// Nothing here returns the Google address, the storage id or the ETag (AC-10).
import type { Doc, Id } from "./_generated/dataModel";
import { env, type MutationCtx } from "./_generated/server";
import { PICTURE_CONSENT_VERSIONS } from "./consentText";
import { NOTICE_AGAIN_MS, immediateReason, newKey, picturePath, pictureAddress, recheckAt } from "./avatarCore";
import type { Reader } from "./helpers";

// Setting values are read trimmed and ignoring case, so `False`, ` false` and `TRUE` mean what they say (spec 0011, Configuration required).
const settingText = (raw: string | undefined): string => (raw ?? "").trim().toLowerCase();

/**
 * The whole feature is ON unless the server says it is off (owner decision, 2026-10-10: on by default; this replaces the spec's "off
 * unless `true`" of AC-16). `PROFILE_PICTURE_ENABLED` of `false`, `0`, `no` or `off` turns it off: no fetch, no picture, no notice, and
 * the image route answers 404. Unset, empty or anything else means on.
 */
export const pictureEnabled = (): boolean => !["false", "0", "no", "off"].includes(settingText(env.PROFILE_PICTURE_ENABLED));

/**
 * Owner decision, 2026-10-10: nobody is asked. When `PICTURE_CONSENT_REQUIRED` is unset or empty, every student counts as having agreed,
 * so the picture is fetched and shown with no notice (this replaces the spec's AC-1 and AC-2 for now). Any other value brings back the
 * spec's flow exactly: the picture waits for a v4 consent, and existing students get the one time notice. A typo such as `ture` also
 * counts as required: a mistake fails towards asking, never towards dropping consent.
 */
export const consentRequired = (): boolean => settingText(env.PICTURE_CONSENT_REQUIRED) !== "";

/**
 * `LEADERBOARD_PICTURES_ENABLED` lets live leaderboard rows carry pictures (scope row 12). Unlike the two switches above it is OFF by
 * default, and only an explicit `true`, `1`, `yes` or `on` turns it on: a typo fails towards hiding other students' pictures.
 */
export const leaderboardPicturesEnabled = (): boolean => ["true", "1", "yes", "on"].includes(settingText(env.LEADERBOARD_PICTURES_ENABLED));

/**
 * AC-1: a student has agreed when their newest `landing` consent (by `acceptedAt`) is a version that names the picture. Version
 * strings are never compared by order. A student has one check and so at most one phone consent, so a few rows cover them all.
 */
export async function isPictureAgreed(ctx: Reader, studentId: Id<"students">): Promise<boolean> {
  if (!consentRequired()) return true;
  const rows = await ctx.db.query("consents").withIndex("by_studentId", (q) => q.eq("studentId", studentId)).order("desc").take(20);
  const landing = rows.filter((r) => r.kind === "landing").sort((a, b) => b.acceptedAt - a.acceptedAt);
  return landing.length > 0 && PICTURE_CONSENT_VERSIONS.includes(landing[0].textVersion);
}

export async function avatarRow(ctx: Reader, studentId: Id<"students">): Promise<Doc<"avatars"> | null> {
  return await ctx.db.query("avatars").withIndex("by_studentId", (q) => q.eq("studentId", studentId)).unique();
}

/**
 * Gives the student's picture a new random address, so any copy of the old `/api/avatar/<key>` (held by someone who opened a shared report)
 * stops working. Called when a report link is stopped or switched off (review 2026-10-11). The student's own screens read the new path
 * from `students.me`; an image the edge already holds can still be served for up to 50 minutes. Nothing to do when there is no picture row.
 */
export async function rotatePictureKey(ctx: MutationCtx, studentId: Id<"students">): Promise<void> {
  const row = await avatarRow(ctx, studentId);
  if (row) await ctx.db.patch("avatars", row._id, { key: newKey() });
}

/** The path (`/api/avatar/<key>`) for a row a screen may draw, or null. Does not look at the switch or the consent. */
export const shownPath = (row: Doc<"avatars"> | null): string | null =>
  row && row.storageId && !row.removedAt && !row.blockedAt ? picturePath(row.key) : null;

/**
 * What `students.me` says about the picture for the signed in student. `due` and `recheckAt` tell the browser when to call
 * `avatars.ensure`; neither reads the clock (a query must not), so the weekly check is the browser comparing `recheckAt` with its own
 * time, and `ensure` decides again on the server. With the feature off, or before the student agrees, there is no picture and nothing is due.
 * `notice` is `ask` for a student who has not agreed and has not said Not now, `later` after a Not now (the browser compares `askAt`, the
 * 14 day mark, with its own clock), and `none` once agreed or with the feature off (AC-2, AC-16).
 */
export type PictureView = {
  picture: { url: string } | null;
  due: boolean;
  recheckAt: number | null;
  notice: "none" | "ask" | "later";
  askAt: number | null;
  /** The student took their picture off and the team has not blocked it: the report page offers "Use my Google picture" (AC-9). */
  removed: boolean;
};

export async function pictureView(ctx: Reader, student: Doc<"students">, image: string | null): Promise<PictureView> {
  const none: PictureView = { picture: null, due: false, recheckAt: null, notice: "none", askAt: null, removed: false };
  if (!pictureEnabled()) return none;
  if (!(await isPictureAgreed(ctx, student._id))) {
    const declined = student.pictureNoticeDeclinedAt;
    // `due` is true only when a file is still held from the time nobody was asked (a later switch to the asked mode): the bridge then
    // calls `ensure`, which drops it. Without this the browser would never call `ensure` for exactly these students.
    const held = (await avatarRow(ctx, student._id))?.storageId !== undefined;
    const view: PictureView = { ...none, due: held };
    return declined === undefined ? { ...view, notice: "ask" } : { ...view, notice: "later", askAt: declined + NOTICE_AGAIN_MS };
  }
  const row = await avatarRow(ctx, student._id);
  const path = shownPath(row);
  const picture = path ? { url: path } : null;
  if (row?.blockedAt) return { ...none, picture };
  if (row?.removedAt) return { ...none, picture, removed: true };
  const address = pictureAddress(image);
  return { ...none, picture, due: immediateReason(row, address) !== null, recheckAt: recheckAt(row, address) };
}

/**
 * The path a place OTHER than the student's own `me` may draw for this student (AC-4): the report PDF copy, the team list and viewer,
 * and later the shared report. The same rule as `students.me`, read for one student: the feature is on, the student has agreed
 * (every student, in the default mode), a stored picture exists, and it is neither removed nor blocked. Null otherwise.
 */
export async function pictureFor(ctx: Reader, studentId: Id<"students">): Promise<string | null> {
  if (!pictureEnabled()) return null;
  if (!(await isPictureAgreed(ctx, studentId))) return null;
  return shownPath(await avatarRow(ctx, studentId));
}

/** The `avatar` for a live leaderboard row (scope row 12, AC-4): `pictureFor`, and only while `LEADERBOARD_PICTURES_ENABLED` is on. */
export async function leaderboardPictureFor(ctx: Reader, studentId: Id<"students">): Promise<string | null> {
  return leaderboardPicturesEnabled() ? await pictureFor(ctx, studentId) : null;
}
