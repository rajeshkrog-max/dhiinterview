// The profile picture on the server (spec 0011, milestone M1): agreement, the fetch lease and limits, the safe store, the image
// route and what `students.me` may say. Google is a stubbed `fetch`; the host rule is never widened for tests (AC-7).
// Each test names the acceptance criterion it covers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { KEY_RE, NOTICE_AGAIN_MS, RECHECK_MS, newKey, pictureAddress } from "./avatarCore";
import { leaderboardPictureFor, pictureFor } from "./avatarState";
import { CONSENT_TEXTS, CONSENT_VERSION, CONSENT_VERSION_V3, consentHash } from "./consentText";
import { makeBackend, profileInput, signInAs } from "../tests/convexTestUtils";

const IMG = "https://lh3.googleusercontent.com/a/ACg8ocPhoto1=s96-c";
const IMG2 = "https://lh3.googleusercontent.com/a/ACg8ocPhoto2=s96-c";
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, 2, 3, 4, 5, 6, 7, 8]);

type Backend = ReturnType<typeof makeBackend>;
let google: ReturnType<typeof vi.fn>;

// Fake timers keep scheduled jobs from running by themselves, and let a test move the clock past the 10 minute and 7 day marks.
// The router also registers the sign in routes, which refuse to start without these three settings.
const AUTH_ENV = { BETTER_AUTH_URL: "https://example.test", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  Object.assign(process.env, AUTH_ENV);
  process.env.PROFILE_PICTURE_ENABLED = "true";
  process.env.PICTURE_CONSENT_REQUIRED = "true"; // the spec's asked flow; the default (nobody asked) has its own tests at the end
  google = vi.fn(async () => new Response(jpeg(1), { status: 200, headers: { etag: '"e1"' } }));
  vi.stubGlobal("fetch", google);
});
afterEach(() => {
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
  delete process.env.PROFILE_PICTURE_ENABLED;
  delete process.env.PICTURE_CONSENT_REQUIRED;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const makeStudent = async (t: Backend, image: string | null = IMG) => {
  const s = await signInAs(t, { ...(image ? { image } : {}), sessionDays: 60 }); // long enough to test the weekly check without the session ending
  await s.as.mutation(api.students.createProfile, await profileInput());
  const studentId = await t.run(async (ctx) => (await ctx.db.query("students").first())!._id);
  return { ...s, studentId };
};
const rowOf = (t: Backend) => t.run(async (ctx) => await ctx.db.query("avatars").first());
const files = (t: Backend) => t.run(async (ctx) => (await ctx.db.system.query("_storage").collect()).length);
const jobs = (t: Backend) => t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length);

// Ensure, then run the fetch the scheduler queued, by hand, with exactly the arguments `ensure` gave it.
async function ensureAndSync(t: Backend, s: Awaited<ReturnType<typeof makeStudent>>, _address = IMG) {
  const before = await jobs(t);
  const out = await s.as.mutation(api.avatars.ensure, {});
  if (out.scheduled) {
    const args = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).at(-1)!.args[0]);
    expect(await jobs(t)).toBe(before + 1);
    await t.action(internal.avatars.sync, args);
  }
  return out;
}
// What a Google sign in does with overrideUserInfoOnSignIn: the account's picture address changes (or goes).
const setImage = (t: Backend, userId: string, image: string | null) =>
  t.run(async (ctx) => {
    await ctx.runMutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: userId }], update: { image } } });
  });
const meOf = async (s: Awaited<ReturnType<typeof makeStudent>>) => {
  const me = await s.as.query(api.students.me, {});
  if (me.state !== "ready") throw new Error("not ready");
  return me;
};

describe("agreement (AC-1)", () => {
  test("covers AC-1: a student who agreed under v4 gets a fetch; the picture is stored once and shown from our own path", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect((await meOf(s)).pictureDue).toBe(true);
    expect(await ensureAndSync(t, s)).toEqual({ ok: true, scheduled: true });
    const row = await rowOf(t);
    expect(row?.key).toMatch(KEY_RE);
    expect(row?.contentType).toBe("image/jpeg");
    expect(row?.storageId).toBeTruthy();
    expect(row?.checkedAt).toBeGreaterThan(0);
    expect(google).toHaveBeenCalledTimes(1);
    const me = await meOf(s);
    expect(me.picture).toEqual({ url: `/api/avatar/${row!.key}` });
    expect(me.pictureDue).toBe(false);
    expect(await files(t)).toBe(1);
  });

  test("covers AC-1: before the student agrees (newest landing consent is v3), nothing is fetched, stored, or shown", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await t.run(async (ctx) => {
      const c = (await ctx.db.query("consents").first())!;
      await ctx.db.patch("consents", c._id, { textVersion: "v3" });
    });
    const me = await meOf(s);
    expect(me.picture).toBeNull();
    expect(me.pictureDue).toBe(false);
    expect(me.pictureRecheckAt).toBeNull();
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(google).not.toHaveBeenCalled();
    expect(await rowOf(t)).toBeNull();
  });

  test("covers AC-1: agreement is the NEWEST landing consent by acceptedAt, not the newest row and not a version compare", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await t.run(async (ctx) => {
      const c = (await ctx.db.query("consents").first())!;
      // an older v4 consent and a newer v3 consent (a made up order) → not agreed; a phone consent that is newest changes nothing
      await ctx.db.patch("consents", c._id, { textVersion: "v4", acceptedAt: 1000 });
      await ctx.db.insert("consents", { studentId: c.studentId, kind: "landing", textVersion: "v3", ageAtConsent: 20, guardianPresent: false, acceptedAt: 2000 });
      await ctx.db.insert("consents", { studentId: c.studentId, kind: "lead", textVersion: "lead-v1", ageAtConsent: 20, guardianPresent: false, acceptedAt: 3000 });
    });
    expect((await meOf(s)).pictureDue).toBe(false);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("consents").collect();
      const v3 = rows.find((r) => r.textVersion === "v3")!;
      await ctx.db.patch("consents", v3._id, { acceptedAt: 500 });
    });
    expect((await meOf(s)).pictureDue).toBe(true);
  });
});

describe("the switch and who may call (AC-16, AC-10)", () => {
  test("covers AC-16: with PROFILE_PICTURE_ENABLED=false, no picture, nothing due, ensure does nothing, and the key lookup answers null", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const key = (await rowOf(t))!.key;
    process.env.PROFILE_PICTURE_ENABLED = "false";
    const me = await meOf(s);
    expect(me.picture).toBeNull();
    expect(me.pictureDue).toBe(false);
    expect(me.pictureNotice).toBe("none");
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(await t.query(internal.avatars.byKey, { key })).toBeNull();
    expect((await t.fetch(`/api/avatar/${key}`)).status).toBe(404);
  });

  test("covers AC-10: ensure needs a signed in student with a profile", async () => {
    const t = makeBackend();
    await expect(t.mutation(api.avatars.ensure, {})).rejects.toThrow();
    const { as } = await signInAs(t, { image: IMG });
    await expect(as.mutation(api.avatars.ensure, {})).rejects.toThrow(); // signed in, but no profile yet
  });

  test("covers AC-10 and AC-11: nothing a browser can call returns the Google address, the storage id or the ETag", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const row = (await rowOf(t))!;
    const seen = JSON.stringify([await meOf(s), await s.as.mutation(api.avatars.ensure, {})]);
    expect(seen).not.toContain("googleusercontent");
    expect(seen).not.toContain(String(row.storageId));
    expect(seen).not.toContain('"e1"'); // the ETag Google sent, quotes included (a bare e1 can appear in a random seed)
    expect(seen).not.toContain(row.sha256 as string);
    expect(seen).not.toMatch(/sourceUrl|storageId|etag|sha256|leaseToken/);
  });

  test("covers AC-10: a test account with no image shows initials: nothing due, nothing fetched", async () => {
    const t = makeBackend();
    const s = await makeStudent(t, null);
    const me = await meOf(s);
    expect(me.picture).toBeNull();
    expect(me.pictureDue).toBe(false);
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(google).not.toHaveBeenCalled();
  });

  test("covers AC-7: an account address on another host, a look alike host or plain http is never scheduled", async () => {
    for (const bad of ["https://example.com/a=s96-c", "https://lh3.googleusercontent.com.evil.com/a", "http://lh3.googleusercontent.com/a", "https://lh3.googleusercontent.com/a/default-user=s96-c"]) {
      const t = makeBackend();
      const s = await makeStudent(t, bad);
      expect((await meOf(s)).pictureDue, bad).toBe(false);
      expect(await s.as.mutation(api.avatars.ensure, {}), bad).toEqual({ ok: true, scheduled: false });
      expect(await rowOf(t), bad).toBeNull();
    }
    expect(google).not.toHaveBeenCalled();
  });
});

// An existing student: agreed under v3 (no picture line), so they are asked once (AC-2).
const existingStudent = async (t: Backend, over: Record<string, unknown> = {}, image: string | null = IMG) => {
  const s = await signInAs(t, { ...(image ? { image } : {}), sessionDays: 60 });
  await s.as.mutation(api.students.createProfile, await profileInput(over));
  const studentId = await t.run(async (ctx) => {
    const c = (await ctx.db.query("consents").first())!;
    await ctx.db.patch("consents", c._id, { textVersion: CONSENT_VERSION_V3 });
    return c.studentId;
  });
  return { ...s, studentId };
};
const noticeArg = async () => ({ version: CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[CONSENT_VERSION]) });
const landingRows = (t: Backend) => t.run(async (ctx) => (await ctx.db.query("consents").collect()).filter((c) => c.kind === "landing"));

describe("the one time notice for existing students (AC-2)", () => {
  test("covers AC-2: a student who agreed to v3 is asked (ask), a new student under v4 is not (none), and with the switch off nobody is", async () => {
    const t = makeBackend();
    const old = await existingStudent(t);
    const me = await meOf(old);
    expect(me.pictureNotice).toBe("ask");
    expect(me.pictureAskAt).toBeNull();
    expect(me.picture).toBeNull();
    const t2 = makeBackend();
    expect((await meOf(await makeStudent(t2))).pictureNotice).toBe("none");
    process.env.PROFILE_PICTURE_ENABLED = "false";
    expect((await meOf(old)).pictureNotice).toBe("none");
  });

  test("covers AC-2: accepting records exactly one new landing consent for v4 with the student's age and the tick, and starts the picture", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).toEqual({ ok: true });
    const rows = await landingRows(t);
    expect(rows).toHaveLength(2);
    const added = rows.find((r) => r.textVersion === CONSENT_VERSION)!;
    expect(added).toMatchObject({ kind: "landing", ageAtConsent: 20, guardianPresent: false });
    const me = await meOf(s);
    expect(me.pictureNotice).toBe("none");
    expect(me.pictureDue).toBe(true);
    expect((await ensureAndSync(t, s)).scheduled).toBe(true);
    expect((await meOf(s)).picture).not.toBeNull();
  });

  test("covers AC-2: a repeat tap, or a second device, records no second row", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    const a = await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() });
    const b = await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() });
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(await landingRows(t)).toHaveLength(2);
  });

  test("covers AC-2: under 18 needs the guardian tick (a result, no row), and with it the row says the guardian was there", async () => {
    const t = makeBackend();
    const s = await existingStudent(t, { age: 15, guardianPresent: true });
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).toEqual({ ok: false, code: "needs_guardian" });
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg(), guardianTick: false })).toEqual({ ok: false, code: "needs_guardian" });
    expect(await landingRows(t)).toHaveLength(1);
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg(), guardianTick: true })).toEqual({ ok: true });
    const added = (await landingRows(t)).find((r) => r.textVersion === CONSENT_VERSION)!;
    expect(added).toMatchObject({ ageAtConsent: 15, guardianPresent: true });
  });

  test("covers AC-2: an old text (v3), a wrong fingerprint and an unknown version are consent_text_changed, with no row", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    const stale = { version: CONSENT_VERSION_V3, hash: await consentHash(CONSENT_TEXTS[CONSENT_VERSION_V3]) };
    for (const notice of [stale, { version: CONSENT_VERSION, hash: "0".repeat(64) }, { version: "v9", hash: "x" }, { version: "lead-v1", hash: await consentHash(CONSENT_TEXTS["lead-v1"]) }]) {
      expect(await s.as.mutation(api.students.acceptPicture, { notice })).toEqual({ ok: false, code: "consent_text_changed" });
    }
    expect(await landingRows(t)).toHaveLength(1);
  });

  test("covers AC-2: Not now carries on with initials, writes no consent, and asks again only after 14 days", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await existingStudent(t);
    expect(await s.as.mutation(api.students.declinePicture, {})).toEqual({ ok: true });
    const me = await meOf(s);
    expect(me.pictureNotice).toBe("later");
    expect(me.pictureAskAt).toBe(Date.now() + NOTICE_AGAIN_MS);
    expect(me.picture).toBeNull();
    expect(me.pictureDue).toBe(false);
    expect(await landingRows(t)).toHaveLength(1);
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(google).not.toHaveBeenCalled();
    // the student can still say yes later
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).toEqual({ ok: true });
    expect((await meOf(s)).pictureNotice).toBe("none");
  });

  test("covers AC-16: with the switch off, accepting is refused (off) and nothing is written", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    process.env.PROFILE_PICTURE_ENABLED = "false";
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).toEqual({ ok: false, code: "off" });
    expect(await s.as.mutation(api.students.declinePicture, {})).toEqual({ ok: true });
    expect(await landingRows(t)).toHaveLength(1);
    expect((await t.run(async (ctx) => await ctx.db.query("students").first()))!.pictureNoticeDeclinedAt).toBeUndefined();
  });

  test("covers AC-10: both need a signed in student with a profile, and take no id", async () => {
    const t = makeBackend();
    await expect(t.mutation(api.students.acceptPicture, { notice: await noticeArg() })).rejects.toThrow();
    await expect(t.mutation(api.students.declinePicture, {})).rejects.toThrow();
    const { as } = await signInAs(t, { image: IMG });
    await expect(as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).rejects.toThrow(); // no profile yet
  });
});

describe("the lease and the limits (AC-6)", () => {
  test("covers AC-6: a repeat call (a second tab) makes one fetch: the per student limit and the lease both hold", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: true });
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(await jobs(t)).toBe(1);
  });

  test("covers AC-6: a lost lease is free after a minute, but the per student limit still allows one check every 10 minutes only", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(true);
    vi.setSystemTime(new Date("2026-10-10T10:02:00Z")); // lease over, limit not yet
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(false);
    vi.setSystemTime(new Date("2026-10-10T10:11:00Z"));
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(true);
  });

  test("covers AC-6: a no-op takes no token: after many no-op calls a changed address is still fetched at once", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    // a picture that landed long ago by some other path: seeded, so the student limit has never been touched
    await t.run(async (ctx) => {
      const storageId = await ctx.storage.store(new Blob([jpeg(1)], { type: "image/jpeg" }));
      await ctx.db.insert("avatars", { studentId: s.studentId, key: newKey(), storageId, contentType: "image/jpeg", size: 12, sourceUrl: pictureAddress(IMG)!, checkedAt: Date.now(), updatedAt: Date.now() });
    });
    for (let i = 0; i < 5; i++) expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    await setImage(t, s.userId, IMG2);
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: true });
    expect(await jobs(t)).toBe(1);
  });

  test("covers AC-6: the quiet check falls due after 7 days, from the browser's side (pictureRecheckAt) and on the server", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const checkedAt = (await rowOf(t))!.checkedAt;
    const me = await meOf(s);
    expect(me.pictureDue).toBe(false);
    expect(me.pictureRecheckAt).toBe(checkedAt + RECHECK_MS);
    vi.setSystemTime(checkedAt + RECHECK_MS - 60000);
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(false);
    vi.setSystemTime(checkedAt + RECHECK_MS + 60000);
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(true);
  });

  test("covers AC-6: the same image after a weekly check only moves checkedAt: no new key, no new file", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const before = (await rowOf(t))!;
    vi.setSystemTime(before.checkedAt + RECHECK_MS + 60000);
    await ensureAndSync(t, s);
    const after = (await rowOf(t))!;
    expect(after.key).toBe(before.key);
    expect(after.storageId).toBe(before.storageId);
    expect(after.checkedAt).toBeGreaterThan(before.checkedAt);
    expect(await files(t)).toBe(1);
    expect(google).toHaveBeenCalledTimes(2);
  });

  test("covers AC-6: a changed image after a weekly check gets a new key, the old file is deleted, and the old key answers 404", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const before = (await rowOf(t))!;
    google.mockImplementation(async () => new Response(jpeg(9), { status: 200 }));
    vi.setSystemTime(before.checkedAt + RECHECK_MS + 60000);
    await ensureAndSync(t, s);
    const after = (await rowOf(t))!;
    expect(after.key).not.toBe(before.key);
    expect(after.storageId).not.toBe(before.storageId);
    expect(await files(t)).toBe(1);
    expect((await t.fetch(`/api/avatar/${before.key}`)).status).toBe(404);
    expect((await t.fetch(`/api/avatar/${after.key}`)).status).toBe(200);
  });

  test("covers AC-6: a new address at sign in is fetched at once, without waiting for the week (and without the old etag)", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    await setImage(t, s.userId, IMG2);
    vi.setSystemTime(new Date("2026-10-10T10:11:00Z")); // past the 10 minute student limit
    expect((await meOf(s)).pictureDue).toBe(true);
    google.mockImplementation(async () => new Response(jpeg(7), { status: 200 }));
    await ensureAndSync(t, s, IMG2);
    const calls = google.mock.calls as unknown as [string, RequestInit][];
    expect(calls.at(-1)![0]).toBe("https://lh3.googleusercontent.com/a/ACg8ocPhoto2=s192-c");
    expect(JSON.stringify(calls.at(-1)![1].headers)).not.toContain("if-none-match");
    expect((await rowOf(t))!.sourceUrl).toBe("https://lh3.googleusercontent.com/a/ACg8ocPhoto2=s96-c");
  });

  test("covers AC-6: when the account loses its photo, the held picture is deleted at once and nothing is fetched", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    await setImage(t, s.userId, null);
    expect((await meOf(s)).pictureDue).toBe(true);
    const calls = google.mock.calls.length;
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(google.mock.calls.length).toBe(calls);
    expect(await files(t)).toBe(0);
    expect((await meOf(s)).picture).toBeNull();
  });

  test("covers AC-6: when the account loses its photo and later has the same photo again, it is fetched at once, not after a week", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    await setImage(t, s.userId, null);
    await s.as.mutation(api.avatars.ensure, {});
    expect(await files(t)).toBe(0);
    await setImage(t, s.userId, IMG); // the very same address as before
    vi.setSystemTime(new Date("2026-10-10T10:11:00Z"));
    expect((await meOf(s)).pictureDue).toBe(true);
    expect((await ensureAndSync(t, s)).scheduled).toBe(true);
    expect(await files(t)).toBe(1);
    expect((await meOf(s)).picture).not.toBeNull();
  });

  test("covers AC-6: losing the photo drops the lease, so a fetch for the old address that is still away cannot land", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s); // a picture is held
    await setImage(t, s.userId, IMG2);
    vi.setSystemTime(new Date("2026-10-10T10:11:00Z"));
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(true); // a fetch for the new address is queued but has not run yet
    const args = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).at(-1)!.args[0]);
    await setImage(t, s.userId, null);
    vi.setSystemTime(new Date("2026-10-10T10:22:00Z"));
    await s.as.mutation(api.avatars.ensure, {}); // the account has no photo now
    const row = (await rowOf(t))!;
    expect(row.leaseToken).toBeUndefined();
    expect(row.leaseUntil).toBeUndefined();
    await t.action(internal.avatars.sync, args); // the old fetch arrives late
    expect(await files(t)).toBe(0); // its file was thrown away
    expect((await meOf(s)).picture).toBeNull();
  });

  test("covers AC-10: when the swap itself fails, the file that was just stored is deleted, not left behind with nothing pointing at it", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(true);
    const args = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).at(-1)!.args[0]);
    // A second row for the same student makes `apply` throw (it reads the row with `unique()`), the way a conflict limit or a deploy would.
    await t.run(async (ctx) => {
      await ctx.db.insert("avatars", { studentId: s.studentId, key: newKey(), sourceUrl: "", checkedAt: 0, updatedAt: Date.now() });
    });
    await expect(t.action(internal.avatars.sync, args)).rejects.toThrow();
    expect(await files(t)).toBe(0);
  });
});

describe("the safe store (AC-7) and the lease token", () => {
  test("covers AC-7: a bad file, a redirect and a 404 leave no picture, record a short code (never a URL), and a permanent one is not asked again", async () => {
    for (const [reply, code] of [
      [() => new Response("<html>no</html>", { status: 200 }), "bad_type"],
      [() => new Response(null, { status: 302, headers: { location: "https://evil.example/x" } }), "redirect"],
      [() => new Response("gone", { status: 404 }), "http_404"],
    ] as const) {
      google.mockImplementation(async () => reply());
      const t = makeBackend();
      const s = await makeStudent(t);
      await ensureAndSync(t, s);
      const row = (await rowOf(t))!;
      expect(row.storageId, code).toBeUndefined();
      expect(row.lastError, code).toBe(code);
      expect(row.lastError).not.toMatch(/googleusercontent|https?:|@|\//); // a short code, never an address
      expect(row.checkedAt, code).toBeGreaterThan(0); // permanent: no longer "first"
      expect((await meOf(s)).picture).toBeNull();
      expect((await meOf(s)).pictureDue).toBe(false);
      expect(await files(t)).toBe(0);
    }
  });

  test("covers AC-7: a short lived failure (a timeout or a 503) leaves the check due, so the next page load tries again", async () => {
    google.mockImplementation(async () => new Response("busy", { status: 503 }));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const row = (await rowOf(t))!;
    expect(row.lastError).toBe("http_503");
    expect(row.checkedAt).toBe(0);
    expect(row.leaseToken).toBeUndefined();
    expect((await meOf(s)).pictureDue).toBe(true);
  });

  test("covers AC-7: a failure keeps the picture we already hold", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const before = (await rowOf(t))!;
    google.mockImplementation(async () => new Response("<html>", { status: 200 }));
    vi.setSystemTime(before.checkedAt + RECHECK_MS + 60000);
    await ensureAndSync(t, s);
    const after = (await rowOf(t))!;
    expect(after.storageId).toBe(before.storageId);
    expect(after.key).toBe(before.key);
    expect(after.lastError).toBe("bad_type");
    expect((await meOf(s)).picture).toEqual({ url: `/api/avatar/${before.key}` });
  });

  test("covers AC-9 and AC-7: a Remove that lands mid fetch wins: the swap is refused and the new file is deleted", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    const out = await s.as.mutation(api.avatars.ensure, {});
    expect(out.scheduled).toBe(true);
    const row = (await rowOf(t))!;
    await t.run(async (ctx) => ctx.db.patch("avatars", row._id, { removedAt: Date.now() })); // the student removed it while the fetch was away
    await t.action(internal.avatars.sync, { studentId: s.studentId, address: IMG, leaseToken: row.leaseToken! });
    const after = (await rowOf(t))!;
    expect(after.storageId).toBeUndefined();
    expect(after.leaseToken).toBeUndefined();
    expect(await files(t)).toBe(0);
    expect((await meOf(s)).picture).toBeNull();
  });

  test("covers AC-9: a block that lands mid fetch also refuses the swap", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await s.as.mutation(api.avatars.ensure, {});
    const row = (await rowOf(t))!;
    await t.run(async (ctx) => ctx.db.patch("avatars", row._id, { blockedAt: Date.now() }));
    await t.action(internal.avatars.sync, { studentId: s.studentId, address: IMG, leaseToken: row.leaseToken! });
    expect(await files(t)).toBe(0);
    expect((await rowOf(t))!.storageId).toBeUndefined();
  });

  test("covers AC-1: a consent that is gone when the fetch lands also refuses the swap (nothing is kept without agreement)", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await s.as.mutation(api.avatars.ensure, {});
    const row = (await rowOf(t))!;
    await t.run(async (ctx) => {
      const c = (await ctx.db.query("consents").first())!;
      await ctx.db.patch("consents", c._id, { textVersion: "v3" });
    });
    await t.action(internal.avatars.sync, { studentId: s.studentId, address: IMG, leaseToken: row.leaseToken! });
    expect(await files(t)).toBe(0);
  });

  test("covers AC-6: a fetch with a stale lease token changes nothing and its new file is deleted", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await s.as.mutation(api.avatars.ensure, {});
    await t.action(internal.avatars.sync, { studentId: s.studentId, address: IMG, leaseToken: "not-the-token" });
    expect(await files(t)).toBe(0);
    expect((await rowOf(t))!.storageId).toBeUndefined();
  });

  test("covers AC-6: the scheduled job itself lands the picture (the real path through the scheduler)", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(true);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await rowOf(t))!.storageId).toBeTruthy();
    expect(google).toHaveBeenCalledTimes(1);
  });
});

describe("the image route (AC-8)", () => {
  const landed = async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    return { t, s, row: (await rowOf(t))! };
  };

  test("covers AC-8: a valid key gives the image bytes, the type from the file, an ETag and the safe headers, with no sign in", async () => {
    const { t, row } = await landed();
    const res = await t.fetch(`/api/avatar/${row.key}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("etag")).toBe(`"${row.key}"`);
    expect(Array.from(new Uint8Array(await res.arrayBuffer()))).toEqual(Array.from(jpeg(1)));
  });

  test("covers AC-8: If-None-Match with the ETag is a 304 with no body", async () => {
    const { t, row } = await landed();
    const res = await t.fetch(`/api/avatar/${row.key}`, { headers: { "if-none-match": `"${row.key}"` } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  test("covers AC-8: unknown, badly shaped, removed, blocked and erased keys all give the same 404 (same body, same headers)", async () => {
    const { t, row } = await landed();
    const answers: string[] = [];
    const same = async (path: string) => {
      const res = await t.fetch(path);
      answers.push(`${res.status}|${await res.text()}|${res.headers.get("cache-control")}|${res.headers.get("x-content-type-options")}|${res.headers.get("content-security-policy")}`);
    };
    await same("/api/avatar/AAAAAAAAAAAAAAAAAAAAAA"); // well shaped, unknown
    await same("/api/avatar/short");
    await same("/api/avatar/");
    await same(`/api/avatar/${row.key}/extra`);
    await same("/api/avatar/..%2F..%2Fx");
    await t.run(async (ctx) => ctx.db.patch("avatars", row._id, { removedAt: Date.now() }));
    await same(`/api/avatar/${row.key}`);
    await t.run(async (ctx) => ctx.db.patch("avatars", row._id, { removedAt: undefined, blockedAt: Date.now() }));
    await same(`/api/avatar/${row.key}`);
    await t.run(async (ctx) => {
      await ctx.db.patch("avatars", row._id, { blockedAt: undefined });
      await ctx.db.delete("avatars", row._id);
    });
    await same(`/api/avatar/${row.key}`);
    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toBe("404|Not found|no-store|nosniff|default-src 'none'; sandbox");
  });

  test("covers AC-8: only GET is routed", async () => {
    const { t, row } = await landed();
    expect((await t.fetch(`/api/avatar/${row.key}`, { method: "POST" })).status).toBe(404);
  });

  test("covers AC-8: a row with no stored file (Google had no photo) never serves", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await s.as.mutation(api.avatars.ensure, {});
    const row = (await rowOf(t))!; // the placeholder key of a fetch that has not landed
    expect((await t.fetch(`/api/avatar/${row.key}`)).status).toBe(404);
  });
});

describe("what the code can and cannot do", () => {
  test("covers AC-10: no function in avatars.ts that a browser can call takes an id, an email or an address as input", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("./avatars.ts", import.meta.url), "utf8");
    const publicBlocks = [...text.matchAll(/export const (\w+) = (mutation|query|action)\(\{\s*args:\s*\{([^}]*)\}/g)];
    expect(publicBlocks.map((m) => m[1])).toEqual(["ensure", "remove", "restore"]); // the team two are internal (adminBlock, adminUnblock)
    for (const m of publicBlocks) expect(m[3].trim(), m[1]).toBe("");
  });

  test("covers AC-11: the one outgoing request to Google is made by avatarCore.fetchPicture, called only from the sync action", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const dir = new URL("./", import.meta.url);
    const sources = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && f !== "sheetsGoogle.ts");
    const touching = sources.filter((f) => /googleusercontent/.test(readFileSync(new URL(f, dir), "utf8")) && f !== "avatarCore.ts");
    expect(touching).toEqual([]); // only avatarCore names the Google picture host in code
    const callers = sources.filter((f) => /fetchPicture\(/.test(readFileSync(new URL(f, dir), "utf8")) && f !== "avatarCore.ts");
    expect(callers).toEqual(["avatars.ts"]);
  });

  test("covers AC-4 (partly): ids of removed or blocked students stay out of the shown path", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const row = (await rowOf(t))! as { _id: Id<"avatars">; key: string };
    expect((await meOf(s)).picture).toEqual({ url: `/api/avatar/${row.key}` });
    await t.run(async (ctx) => ctx.db.patch("avatars", row._id, { blockedAt: 1 }));
    expect((await meOf(s)).picture).toBeNull();
    expect((await meOf(s)).pictureDue).toBe(false);
  });
});

describe("on by default, nobody asked (owner decision, 2026-10-10)", () => {
  beforeEach(() => {
    delete process.env.PROFILE_PICTURE_ENABLED; // unset: on
    delete process.env.PICTURE_CONSENT_REQUIRED; // unset: nobody is asked
  });

  test("with nothing set, a student who agreed only to v3 is not asked and gets their picture", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    const me = await meOf(s);
    expect(me.pictureNotice).toBe("none");
    expect(me.pictureAskAt).toBeNull();
    expect(me.pictureDue).toBe(true);
    expect((await ensureAndSync(t, s)).scheduled).toBe(true);
    expect((await meOf(s)).picture).toEqual({ url: `/api/avatar/${(await rowOf(t))!.key}` });
    expect(google).toHaveBeenCalledTimes(1);
  });

  test("a new student gets their picture with no extra step, and no consent row beyond the sign up one is made", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    expect((await meOf(s)).picture).not.toBeNull();
    expect(await landingRows(t)).toHaveLength(1);
  });

  test("accepting is a harmless no-op: ok, and no consent row is written", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).toEqual({ ok: true });
    expect(await landingRows(t)).toHaveLength(1);
  });

  test("a student who removed their picture or was blocked still gets none, whatever the setting", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    await ensureAndSync(t, s);
    const row = (await rowOf(t))!;
    await t.run(async (ctx) => ctx.db.patch("avatars", row._id, { removedAt: Date.now() }));
    expect((await meOf(s)).picture).toBeNull();
    expect((await meOf(s)).pictureDue).toBe(false);
    expect((await t.fetch(`/api/avatar/${row.key}`)).status).toBe(404);
  });

  test("setting PICTURE_CONSENT_REQUIRED=true brings the asked flow back, for the same student", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    process.env.PICTURE_CONSENT_REQUIRED = "true";
    expect((await meOf(s)).pictureNotice).toBe("ask");
    expect((await meOf(s)).pictureDue).toBe(false);
  });

  test("setting values are read trimmed and ignoring case; a typo in PICTURE_CONSENT_REQUIRED counts as required, an empty value as not", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    for (const v of [" TRUE ", "True", "1", "yes", "on", "ture", "enabled"]) {
      process.env.PICTURE_CONSENT_REQUIRED = v;
      expect((await meOf(s)).pictureNotice, v).toBe("ask");
    }
    for (const v of ["", "   "]) {
      process.env.PICTURE_CONSENT_REQUIRED = v;
      expect((await meOf(s)).pictureNotice, JSON.stringify(v)).toBe("none");
    }
    // the same for the feature switch: off for false, 0, no, off in any case with spaces; anything else (or nothing) is on
    for (const v of ["false", " False ", "0", "NO", "off"]) {
      process.env.PROFILE_PICTURE_ENABLED = v;
      expect((await meOf(s)).pictureDue, v).toBe(false);
    }
    for (const v of ["", "true", "yes", "enabled"]) {
      process.env.PROFILE_PICTURE_ENABLED = v;
      expect((await meOf(s)).pictureDue, JSON.stringify(v)).toBe(true);
    }
  });

  test("a later switch to the asked mode hides a held picture at once (404), and ensure drops the file; agreeing later fetches it afresh", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await existingStudent(t); // agreed to v3 only
    await ensureAndSync(t, s);
    const before = (await rowOf(t))!;
    expect((await t.fetch(`/api/avatar/${before.key}`)).status).toBe(200);
    expect(await files(t)).toBe(1);

    process.env.PICTURE_CONSENT_REQUIRED = "true"; // the lawyer says ask
    expect((await t.fetch(`/api/avatar/${before.key}`)).status).toBe(404); // hidden at once, before anything cleans up
    expect((await meOf(s)).picture).toBeNull();

    // The browser calls `ensure` only when `me` says a fetch is due, so `me` must say so for a student who holds a file without agreeing.
    const asked = await meOf(s);
    expect(asked.pictureNotice).toBe("ask");
    expect(asked.pictureDue).toBe(true);
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(await files(t)).toBe(0); // the held file is gone
    expect((await meOf(s)).pictureDue).toBe(false); // and nothing is due any more, so the browser stops asking
    const cleared = (await rowOf(t))!;
    expect(cleared.storageId).toBeUndefined();
    expect(cleared.checkedAt).toBe(0);

    vi.setSystemTime(new Date("2026-10-10T10:11:00Z")); // past the 10 minute limit of the first fetch
    // the student agrees in the notice: the picture is fetched afresh, with a new key
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).toEqual({ ok: true });
    expect((await meOf(s)).pictureDue).toBe(true);
    expect((await ensureAndSync(t, s)).scheduled).toBe(true);
    const again = (await rowOf(t))!;
    expect(again.key).not.toBe(before.key);
    expect((await t.fetch(`/api/avatar/${again.key}`)).status).toBe(200);
  });

  // Review re check, Minor 1: students who never come back must be cleaned up too, by the team's one off command.
  test("dropUnagreed deletes the held file of a student who has not agreed, without that student coming back; a second run does nothing", async () => {
    const t = makeBackend();
    const s = await existingStudent(t); // agreed to v3 only
    delete process.env.PICTURE_CONSENT_REQUIRED;
    await ensureAndSync(t, s); // nobody was asked, so the picture was copied
    expect(await files(t)).toBe(1);
    process.env.PICTURE_CONSENT_REQUIRED = "true";
    expect(await t.mutation(internal.avatars.dropUnagreed, {})).toEqual({ dropped: 1, done: true });
    expect(await files(t)).toBe(0);
    const row = (await rowOf(t))!;
    expect(row.storageId).toBeUndefined();
    expect(row.checkedAt).toBe(0);
    expect(await t.mutation(internal.avatars.dropUnagreed, {})).toEqual({ dropped: 0, done: true });
  });

  test("dropUnagreed keeps the file of a student who has agreed, and does nothing in the default mode", async () => {
    const t = makeBackend();
    const s = await makeStudent(t); // agreed to v4
    await ensureAndSync(t, s);
    expect(await t.mutation(internal.avatars.dropUnagreed, {})).toEqual({ dropped: 0, done: true });
    expect(await files(t)).toBe(1);
    const t2 = makeBackend();
    const old = await existingStudent(t2);
    delete process.env.PICTURE_CONSENT_REQUIRED;
    await ensureAndSync(t2, old);
    expect(await t2.mutation(internal.avatars.dropUnagreed, {})).toEqual({ dropped: 0, done: true });
    expect(await files(t2)).toBe(1);
  });
});

describe("a student cannot set their own picture address (AC-10, AC-11)", () => {
  test("Better Auth's update-user route is off: it answers 404, while an enabled route on the same prefix does not", async () => {
    const t = makeBackend();
    await makeStudent(t);
    const headers = { "content-type": "application/json", origin: AUTH_ENV.BETTER_AUTH_URL };
    const body = JSON.stringify({ image: "https://lh3.googleusercontent.com/a/attacker=s96-c" });
    expect((await t.fetch("/api/auth/update-user", { method: "POST", headers, body })).status).toBe(404);
    expect((await t.fetch("/api/auth/get-session", { method: "GET", headers })).status).not.toBe(404); // the route table is reachable
  });
});

describe("Remove and Restore (AC-9)", () => {
  const consentCount = (t: Backend) => t.run(async (ctx) => (await ctx.db.query("consents").collect()).length);

  test("covers AC-9: Remove deletes the file and sets removedAt in one step; the key answers 404, initials show everywhere, and no consent row is written", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const before = (await rowOf(t))!;
    const consents = await consentCount(t);
    expect((await t.fetch(`/api/avatar/${before.key}`)).status).toBe(200);

    expect(await s.as.mutation(api.avatars.remove, {})).toEqual({ ok: true });
    const after = (await rowOf(t))!;
    expect(after.removedAt).toBeGreaterThan(0);
    expect(after.storageId).toBeUndefined();
    expect(after.sha256).toBeUndefined();
    expect(await files(t)).toBe(0);
    expect((await t.fetch(`/api/avatar/${before.key}`)).status).toBe(404);
    const me = await meOf(s);
    expect(me.picture).toBeNull();
    expect(me.pictureRemoved).toBe(true);
    expect(me.pictureDue).toBe(false);
    expect(await consentCount(t)).toBe(consents); // a control over the picture, not a consent
  });

  test("covers AC-9: Remove twice, or with no picture yet, is fine and changes nothing; it needs a signed in student", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect(await s.as.mutation(api.avatars.remove, {})).toEqual({ ok: true }); // no row yet
    expect(await rowOf(t)).toBeNull();
    await ensureAndSync(t, s);
    await s.as.mutation(api.avatars.remove, {});
    const first = (await rowOf(t))!.removedAt;
    vi.setSystemTime(Date.now() + 60_000);
    await s.as.mutation(api.avatars.remove, {});
    expect((await rowOf(t))!.removedAt).toBe(first);
    await expect(t.mutation(api.avatars.remove, {})).rejects.toThrow();
  });

  test("covers AC-9 and AC-16: Remove still works when the feature switch is off (taking a picture away is always allowed)", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    process.env.PROFILE_PICTURE_ENABLED = "false";
    expect(await s.as.mutation(api.avatars.remove, {})).toEqual({ ok: true });
    expect(await files(t)).toBe(0);
  });

  test("covers AC-9: a Remove that arrives while a fetch is away wins: the lease is dropped and the new file is deleted", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect((await s.as.mutation(api.avatars.ensure, {})).scheduled).toBe(true);
    const lease = (await rowOf(t))!.leaseToken!;
    await s.as.mutation(api.avatars.remove, {});
    expect((await rowOf(t))!.leaseToken).toBeUndefined();
    await t.action(internal.avatars.sync, { studentId: s.studentId, address: IMG, leaseToken: lease });
    expect(await files(t)).toBe(0);
    expect((await rowOf(t))!.storageId).toBeUndefined();
    expect((await meOf(s)).picture).toBeNull();
  });

  test("covers AC-9: removedAt is authoritative: a week later, a new sign in address, or agreeing in the notice never bring the picture back", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await existingStudent(t); // asked mode: agreed to v3 only, so the notice is still to come
    await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() });
    await ensureAndSync(t, s);
    await s.as.mutation(api.avatars.remove, {});
    vi.setSystemTime(new Date("2026-10-20T10:00:00Z"));
    await setImage(t, s.userId, IMG2);
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(google).toHaveBeenCalledTimes(1);
    expect(await s.as.mutation(api.students.acceptPicture, { notice: await noticeArg() })).toEqual({ ok: true }); // a repeat: no row, no change
    const me = await meOf(s);
    expect(me.picture).toBeNull();
    expect(me.pictureDue).toBe(false);
    expect(me.pictureRemoved).toBe(true);
  });

  test("covers AC-9: Restore clears the removal, makes a NEW key and fetches again; the old key stays 404", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const old = (await rowOf(t))!;
    await s.as.mutation(api.avatars.remove, {});
    expect((await t.fetch(`/api/avatar/${old.key}`)).status).toBe(404);

    // Google answers with the very same image bytes: the key must still be new
    const out = await s.as.mutation(api.avatars.restore, {});
    expect(out).toEqual({ ok: true, scheduled: true });
    const mid = (await rowOf(t))!;
    expect(mid.removedAt).toBeUndefined();
    expect(mid.key).not.toBe(old.key); // new before anything lands
    expect((await meOf(s)).pictureRemoved).toBe(false);

    const args = await t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).at(-1)!.args[0]);
    expect(args.etag).toBeUndefined(); // no conditional request: it always fetches again
    expect(args.knownSha).toBeUndefined();
    await t.action(internal.avatars.sync, args);
    expect(google).toHaveBeenCalledTimes(2);
    const now = (await rowOf(t))!;
    expect(now.storageId).toBeTruthy();
    expect(now.key).not.toBe(old.key);
    expect((await t.fetch(`/api/avatar/${old.key}`)).status).toBe(404);
    expect((await t.fetch(`/api/avatar/${now.key}`)).status).toBe(200);
    expect((await meOf(s)).picture).toEqual({ url: `/api/avatar/${now.key}` });
  });

  test("covers AC-9: Restore right after a first fetch still fetches (it has its own limit, not the 10 minute check); a loop of them is bounded", async () => {
    vi.setSystemTime(new Date("2026-10-10T10:00:00Z"));
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const seen: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      await s.as.mutation(api.avatars.remove, {});
      const out = await s.as.mutation(api.avatars.restore, {});
      expect(out.ok).toBe(true);
      seen.push(out.ok && out.scheduled);
      await t.run(async (ctx) => {
        const row = (await ctx.db.query("avatars").first())!;
        await ctx.db.patch("avatars", row._id, { leaseUntil: undefined, leaseToken: undefined }); // pretend that fetch finished
      });
    }
    expect(seen).toEqual([true, true, true, false, false]); // 3 an hour for each student
    expect((await meOf(s)).pictureDue).toBe(true); // the held back one is still due: the next page load asks again
  });

  test("covers AC-9: Restore with nothing removed, or before any picture, changes nothing", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect(await s.as.mutation(api.avatars.restore, {})).toEqual({ ok: true, scheduled: false });
    expect(await rowOf(t)).toBeNull();
    await ensureAndSync(t, s);
    const row = (await rowOf(t))!;
    expect(await s.as.mutation(api.avatars.restore, {})).toEqual({ ok: true, scheduled: false });
    expect((await rowOf(t))!.key).toBe(row.key);
    expect(await files(t)).toBe(1);
  });

  test("covers AC-9: Restore needs agreement (asked mode) and answers needs_consent; in the default mode every student has agreed", async () => {
    const t = makeBackend();
    const s = await existingStudent(t);
    expect(await s.as.mutation(api.avatars.restore, {})).toEqual({ ok: false, code: "needs_consent" });
    delete process.env.PICTURE_CONSENT_REQUIRED;
    expect((await s.as.mutation(api.avatars.restore, {})).ok).toBe(true);
  });

  test("covers AC-9 and AC-16: with the feature off, Restore answers off and writes nothing", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    await s.as.mutation(api.avatars.remove, {});
    process.env.PROFILE_PICTURE_ENABLED = "false";
    expect(await s.as.mutation(api.avatars.restore, {})).toEqual({ ok: false, code: "off" });
    expect((await rowOf(t))!.removedAt).toBeGreaterThan(0);
  });

  test("covers AC-9: Restore for an account that has lost its photo clears the removal and fetches nothing", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    await s.as.mutation(api.avatars.remove, {});
    await setImage(t, s.userId, null);
    expect(await s.as.mutation(api.avatars.restore, {})).toEqual({ ok: true, scheduled: false });
    expect(google).toHaveBeenCalledTimes(1);
    const me = await meOf(s);
    expect(me.pictureRemoved).toBe(false);
    expect(me.picture).toBeNull();
    expect(me.pictureDue).toBe(false); // no photo, so nothing to fetch
  });
});

describe("the team block (AC-9)", () => {
  const emailOf = (t: Backend) => t.run(async (ctx) => (await ctx.db.query("students").first())!.email);

  test("covers AC-9: adminBlock deletes the file, the key answers 404, nothing is shown or fetched, and the student's controls go quiet", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const row = (await rowOf(t))!;
    expect(await t.mutation(internal.avatars.adminBlock, { email: `  ${(await emailOf(t)).toUpperCase()} ` })).toEqual({ ok: true }); // case and spaces do not matter
    expect(await files(t)).toBe(0);
    expect((await rowOf(t))!.blockedAt).toBeGreaterThan(0);
    expect((await t.fetch(`/api/avatar/${row.key}`)).status).toBe(404);
    const me = await meOf(s);
    expect(me.picture).toBeNull();
    expect(me.pictureDue).toBe(false);
    expect(me.pictureRemoved).toBe(false);
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
  });

  test("covers AC-9: the student's Restore does not clear a team block; their Remove still works", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    await s.as.mutation(api.avatars.remove, {});
    await t.mutation(internal.avatars.adminBlock, { email: await emailOf(t) });
    expect(await s.as.mutation(api.avatars.restore, {})).toEqual({ ok: false, code: "blocked" });
    expect((await rowOf(t))!.blockedAt).toBeGreaterThan(0);
    expect((await rowOf(t))!.removedAt).toBeGreaterThan(0);
    expect((await meOf(s)).pictureRemoved).toBe(false); // blocked: no "Use my Google picture" is offered
    expect(await s.as.mutation(api.avatars.remove, {})).toEqual({ ok: true });
  });

  test("covers AC-9: a block before any picture was fetched keeps ensure from ever fetching one", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect(await t.mutation(internal.avatars.adminBlock, { email: await emailOf(t) })).toEqual({ ok: true });
    expect(await s.as.mutation(api.avatars.ensure, {})).toEqual({ ok: true, scheduled: false });
    expect(google).not.toHaveBeenCalled();
    expect((await meOf(s)).pictureDue).toBe(false);
  });

  test("covers AC-9: a block mid fetch refuses the swap; blocking twice changes nothing", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await s.as.mutation(api.avatars.ensure, {});
    const lease = (await rowOf(t))!.leaseToken!;
    await t.mutation(internal.avatars.adminBlock, { email: await emailOf(t) });
    const blockedAt = (await rowOf(t))!.blockedAt;
    await t.mutation(internal.avatars.adminBlock, { email: await emailOf(t) });
    expect((await rowOf(t))!.blockedAt).toBe(blockedAt);
    await t.action(internal.avatars.sync, { studentId: s.studentId, address: IMG, leaseToken: lease });
    expect(await files(t)).toBe(0);
  });

  test("covers AC-9: adminUnblock clears only the block: the picture is fetched again with a new key, unless the student had removed it", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    const old = (await rowOf(t))!;
    await t.mutation(internal.avatars.adminBlock, { email: await emailOf(t) });
    vi.setSystemTime(Date.now() + 11 * 60_000);
    expect(await t.mutation(internal.avatars.adminUnblock, { email: await emailOf(t) })).toEqual({ ok: true });
    expect((await rowOf(t))!.blockedAt).toBeUndefined();
    expect((await meOf(s)).pictureDue).toBe(true);
    expect((await ensureAndSync(t, s)).scheduled).toBe(true);
    expect((await rowOf(t))!.key).not.toBe(old.key);
    expect((await meOf(s)).picture).not.toBeNull();

    // a student who removed it, and was blocked, stays removed after the unblock
    await s.as.mutation(api.avatars.remove, {});
    await t.mutation(internal.avatars.adminBlock, { email: await emailOf(t) });
    await t.mutation(internal.avatars.adminUnblock, { email: await emailOf(t) });
    const me = await meOf(s);
    expect(me.picture).toBeNull();
    expect(me.pictureRemoved).toBe(true);
    expect(me.pictureDue).toBe(false);
  });

  test("covers AC-9: an email no student has answers ok false and writes nothing; the team functions are internal", async () => {
    const t = makeBackend();
    await makeStudent(t);
    expect(await t.mutation(internal.avatars.adminBlock, { email: "nobody@example.com" })).toEqual({ ok: false });
    expect(await t.mutation(internal.avatars.adminUnblock, { email: "nobody@example.com" })).toEqual({ ok: false });
    expect(await rowOf(t)).toBeNull();
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("./avatars.ts", import.meta.url), "utf8");
    for (const name of ["adminBlock", "adminUnblock"]) expect(text, name).toMatch(new RegExp(`export const ${name} = internalMutation\\(`));
  });
});

describe("the picture in other places (AC-4)", () => {
  const pathOf = (t: Backend, studentId: Id<"students">) => t.run(async (ctx) => await pictureFor(ctx, studentId));
  const boardPathOf = (t: Backend, studentId: Id<"students">) => t.run(async (ctx) => await leaderboardPictureFor(ctx, studentId));
  const landed = async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    await ensureAndSync(t, s);
    return { t, s, row: (await rowOf(t))! };
  };

  test("covers AC-4: a landed picture gives the same origin path, and nothing about Google, the storage id or the ETag", async () => {
    const { t, s, row } = await landed();
    const path = await pathOf(t, s.studentId);
    expect(path).toBe(`/api/avatar/${row.key}`);
    expect(path).toMatch(/^\/api\/avatar\/[A-Za-z0-9_-]{22}$/);
  });

  test("covers AC-4: no row, a row with no file, a removed picture and a blocked picture all give null", async () => {
    const t = makeBackend();
    const s = await makeStudent(t);
    expect(await pathOf(t, s.studentId)).toBeNull(); // nothing fetched yet
    await s.as.mutation(api.avatars.ensure, {});
    const lease = (await rowOf(t))!.leaseToken!;
    expect(await pathOf(t, s.studentId)).toBeNull(); // the row exists but the fetch has not landed
    await t.action(internal.avatars.sync, { studentId: s.studentId, address: IMG, leaseToken: lease });
    expect(await pathOf(t, s.studentId)).not.toBeNull();
    await s.as.mutation(api.avatars.remove, {});
    expect(await pathOf(t, s.studentId)).toBeNull();
    await t.run(async (ctx) => ctx.db.patch("avatars", (await ctx.db.query("avatars").first())!._id, { removedAt: undefined })); // pretend a Restore landed
    expect(await pathOf(t, s.studentId)).toBeNull(); // no file now: a Restore fetches again
    await t.mutation(internal.avatars.adminBlock, { email: (await t.run(async (ctx) => (await ctx.db.query("students").first())!.email)) });
    expect(await pathOf(t, s.studentId)).toBeNull();
  });

  test("covers AC-4 and AC-1: in the asked mode a student who has not agreed gives null, with the file still held; the default mode agrees for everyone", async () => {
    const t = makeBackend();
    const s = await existingStudent(t); // agreed to v3 only
    delete process.env.PICTURE_CONSENT_REQUIRED;
    await ensureAndSync(t, s);
    expect(await pathOf(t, s.studentId)).not.toBeNull();
    process.env.PICTURE_CONSENT_REQUIRED = "true";
    expect(await pathOf(t, s.studentId)).toBeNull();
  });

  test("covers AC-4 and AC-16: with the feature switched off every place gets null", async () => {
    const { t, s } = await landed();
    process.env.PROFILE_PICTURE_ENABLED = "false";
    expect(await pathOf(t, s.studentId)).toBeNull();
    process.env.LEADERBOARD_PICTURES_ENABLED = "true";
    expect(await boardPathOf(t, s.studentId)).toBeNull();
    delete process.env.LEADERBOARD_PICTURES_ENABLED;
  });

  test("covers AC-4: leaderboard rows are off by default, and only an explicit yes turns them on (a typo stays off)", async () => {
    const { t, s } = await landed();
    try {
      for (const off of [undefined, "", "false", "ture", "enabled", "0"]) {
        if (off === undefined) delete process.env.LEADERBOARD_PICTURES_ENABLED;
        else process.env.LEADERBOARD_PICTURES_ENABLED = off;
        expect(await boardPathOf(t, s.studentId), String(off)).toBeNull();
      }
      for (const on of ["true", " TRUE ", "1", "yes", "on"]) {
        process.env.LEADERBOARD_PICTURES_ENABLED = on;
        expect(await boardPathOf(t, s.studentId), on).toBe(await pathOf(t, s.studentId));
      }
      await s.as.mutation(api.avatars.remove, {});
      expect(await boardPathOf(t, s.studentId)).toBeNull(); // on, but the student took it away
    } finally {
      delete process.env.LEADERBOARD_PICTURES_ENABLED;
    }
  });

  test("covers AC-4 and AC-10: the other places take the path only from pictureFor, never from the avatars table or a Google address", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["reportCopy.ts", "team.ts"]) {
      const text = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(text, file).toContain("pictureFor(ctx,");
      expect(text, file).not.toMatch(/["']avatars["']|sourceUrl|storageId.*avatar|googleusercontent/);
    }
  });
});
