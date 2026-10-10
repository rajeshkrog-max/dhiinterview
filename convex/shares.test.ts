// The private link to a report on the server (spec 0010, milestone 1): making and keeping the link, the public payload route, what a
// stranger can and cannot see, and the limits. Each test names the criterion it covers.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { newKey } from "./avatarCore";
import { rateLimiter } from "./limits";
import { CONSENT_TEXTS, LEAD_CONSENT_VERSION, SHARE_CONSENT_VERSION, consentHash } from "./consentText";
import { sharedPayload } from "./shareHttp";
import { SHARE_DAYS, makeShareCode, verifyShareCode } from "./shareCore";
import { makeBackend, opt, profileInput, signInAs, type Backend } from "../tests/convexTestUtils";

const SECRET = "a-long-random-test-secret";
const DAY = 24 * 60 * 60 * 1000;
const UNAVAILABLE = JSON.stringify({ code: "unavailable" });

// Fake timers keep the jobs the checks schedule from running by themselves, and let a test move the clock.
// The router also registers the sign in routes, which refuse to start without these three settings.
const AUTH_ENV = { BETTER_AUTH_URL: "https://example.test", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  Object.assign(process.env, AUTH_ENV);
  process.env.SHARE_LINK_SECRET = SECRET;
  process.env.PUBLIC_SHARE_ENABLED = "true";
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of Object.keys(AUTH_ENV)) delete process.env[k];
  delete process.env.SHARE_LINK_SECRET;
  delete process.env.PUBLIC_SHARE_ENABLED;
  delete process.env.PICTURE_CONSENT_REQUIRED;
});

// A student with a profile, and (unless `finish` is false) a finished check. The session lasts long enough to move the clock months ahead.
async function student(t: Backend, opts: { finish?: boolean; name?: string; age?: number } = {}) {
  const s = await signInAs(t, { sessionDays: 900 });
  const age = opts.age ?? 20;
  await s.as.mutation(api.students.createProfile, await profileInput({ name: opts.name ?? "Asha Rao", age, guardianPresent: age < 18 }));
  if (opts.finish !== false) {
    await s.as.mutation(api.checks.saveAnswers, {
      answers: Array.from({ length: 18 }, (_, i) => ({ q: i + 1, optionId: opt(i + 1, 2), answeredAt: Date.now() })),
    });
    await s.as.mutation(api.checks.complete, {});
  }
  return s;
}
type Student = Awaited<ReturnType<typeof student>>;

// The notice the page sends right after the student agreed to it: the version and the fingerprint of its exact words.
const notice = async (version = SHARE_CONSENT_VERSION) => ({ version, hash: await consentHash(CONSENT_TEXTS[version]) });
type EnableArgs = { notice?: { version: string; hash: string }; guardianTick?: boolean };
const enable = async (s: Student, args: EnableArgs = {}) => await s.as.mutation(api.shares.enable, args);
// Makes (or keeps) the link the way the page does: with the notice, so the first call records the consent and later calls reuse it.
async function link(s: Student) {
  const r = await enable(s, { notice: await notice() });
  if (!r.ok) throw new Error(`enable refused: ${r.code}`);
  return r;
}
const shares = (t: Backend) => t.run(async (ctx) => await ctx.db.query("reportShares").collect());
const only = async (t: Backend) => {
  const all = await shares(t);
  expect(all).toHaveLength(1);
  return all[0];
};
const patch = (t: Backend, id: Id<"reportShares">, fields: Record<string, unknown>) => t.run(async (ctx) => await ctx.db.patch(id, fields));
const read = (t: Backend, code?: string) => t.fetch("/api/shared/payload", { headers: code === undefined ? {} : { "x-share-token": code } });
const body = async (res: Response) => await res.text();

describe("shares.enable", () => {
  test("covers AC-6, AC-14: the first Share tap makes one row for the signed in student, a signed code and an end 90 days away", async () => {
    const t = makeBackend();
    const s = await student(t);
    const r = await link(s);
    const row = await only(t);
    expect(row).toMatchObject({ generation: 1, checkId: expect.any(String) });
    expect(row.offAt).toBeUndefined();
    expect(r.expiresAt).toBe(Date.now() + SHARE_DAYS * DAY);
    expect(row.expiresAt).toBe(r.expiresAt);
    expect(await verifyShareCode(SECRET, r.code)).toEqual({ shareId: row._id, generation: 1 });
  });

  test("covers AC-7: a Convex id holds no dot, so the three part code always splits cleanly", async () => {
    const t = makeBackend();
    await link(await student(t));
    expect((await only(t))._id).toMatch(/^[A-Za-z0-9]+$/);
  });

  test("covers AC-6: tapping Share again while the link is on keeps the same link and moves the end to 90 days from that tap", async () => {
    const t = makeBackend();
    const s = await student(t);
    const first = await link(s);
    vi.setSystemTime(Date.now() + 10 * DAY);
    const again = await link(s);
    expect(again.code).toBe(first.code);
    expect(again.expiresAt).toBe(Date.now() + SHARE_DAYS * DAY);
    expect(await shares(t)).toHaveLength(1);
  });

  test("covers AC-6: the end never goes past 365 days from when the link was made", async () => {
    const t = makeBackend();
    const s = await student(t);
    const first = await link(s);
    const row = await only(t);
    await patch(t, row._id, { createdAt: Date.now() - 360 * DAY, expiresAt: Date.now() + 1 * DAY });
    const again = await link(s);
    expect(again.code).toBe(first.code); // still the same generation
    expect(again.expiresAt).toBe(Date.now() + 5 * DAY); // made 360 days ago, so 365 days from then is 5 days from now, not 90
  });

  test("covers AC-6, AC-7: after the link ended, Share makes a new generation and a new code; the old code stays dead", async () => {
    const t = makeBackend();
    const s = await student(t);
    const first = await link(s);
    vi.setSystemTime(Date.now() + 91 * DAY);
    expect((await read(t, first.code)).status).toBe(404);
    const second = await link(s);
    const row = await only(t);
    expect(row.generation).toBe(2);
    expect(row.createdAt).toBe(Date.now());
    expect(second.code).not.toBe(first.code);
    expect((await read(t, first.code)).status).toBe(404);
    expect((await read(t, second.code)).status).toBe(200);
  });

  test("covers AC-6, AC-7: after the link was switched off, Share makes a new generation that clears the off mark; the old code stays dead", async () => {
    const t = makeBackend();
    const s = await student(t);
    const first = await link(s);
    await patch(t, (await only(t))._id, { offAt: Date.now() });
    expect((await read(t, first.code)).status).toBe(404);
    const second = await link(s);
    const row = await only(t);
    expect(row.generation).toBe(2);
    expect(row.offAt).toBeUndefined();
    expect((await read(t, first.code)).status).toBe(404);
    expect((await read(t, second.code)).status).toBe(200);
  });

  test("covers AC-14: each student gets their own row and their own code, and one cannot reach the other's", async () => {
    const t = makeBackend();
    const a = await student(t, { name: "Asha Rao" });
    const b = await student(t, { name: "Bala Iyer" });
    const ca = await link(a);
    const cb = await link(b);
    expect(await shares(t)).toHaveLength(2);
    expect(ca.code).not.toBe(cb.code);
    expect((await (await read(t, ca.code)).json()).profile.name).toBe("Asha");
    expect((await (await read(t, cb.code)).json()).profile.name).toBe("Bala");
  });

  test("covers AC-16: a check that is not finished gets no link, and no row is made", async () => {
    const t = makeBackend();
    const s = await student(t, { finish: false });
    expect(await enable(s)).toEqual({ ok: false, code: "report_not_ready" });
    expect(await shares(t)).toHaveLength(0);
  });

  test("covers AC-14: a signed out caller and a signed in account with no profile are refused, and nothing is written", async () => {
    const t = makeBackend();
    await expect(t.mutation(api.shares.enable, {})).rejects.toMatchObject({ data: { code: "not_signed_in" } });
    const s = await signInAs(t);
    await expect(s.as.mutation(api.shares.enable, {})).rejects.toMatchObject({ data: { code: "no_profile" } });
    expect(await shares(t)).toHaveLength(0);
  });

  test("covers AC-17: a deployment with no SHARE_LINK_SECRET makes no link", async () => {
    delete process.env.SHARE_LINK_SECRET;
    const t = makeBackend();
    expect(await enable(await student(t))).toEqual({ ok: false, code: "unavailable" });
    expect(await shares(t)).toHaveLength(0);
  });

  test("covers AC-17 (server side switch): with PUBLIC_SHARE_ENABLED off or unset, a signed in student calling enable directly makes no link, status shows no code, and a link made while it was on stops opening", async () => {
    const t = makeBackend();
    const s = await student(t);
    const made = await link(s); // switch on: a link exists
    expect((await s.as.query(api.shares.status, {})).code).toBe(made.code);
    for (const off of [undefined, "", "false", "0", "no", "off", "TRUEish"]) {
      if (off === undefined) delete process.env.PUBLIC_SHARE_ENABLED;
      else process.env.PUBLIC_SHARE_ENABLED = off;
      expect(await enable(s, { notice: await notice() })).toEqual({ ok: false, code: "unavailable" });
      expect((await s.as.query(api.shares.status, {})).code).toBeNull();
      const res = await read(t, made.code);
      expect([res.status, await body(res)]).toEqual([404, UNAVAILABLE]); // the same 404 as any dead link
    }
    process.env.PUBLIC_SHARE_ENABLED = " True "; // read trimmed and ignoring case
    expect((await read(t, made.code)).status).toBe(200);
    const other = await student(t);
    delete process.env.PUBLIC_SHARE_ENABLED;
    expect(await enable(other, { notice: await notice() })).toEqual({ ok: false, code: "unavailable" });
    expect((await shares(t)).length).toBe(1); // nothing was written for the second student
  });

  test("covers AC-11: 20 an hour for each student, counted before the finished check is looked at, and other students are not affected", async () => {
    const t = makeBackend();
    const s = await student(t, { finish: false });
    for (let i = 0; i < 20; i++) expect(await enable(s)).toEqual({ ok: false, code: "report_not_ready" });
    expect(await enable(s)).toEqual({ ok: false, code: "rate_limited" });
    const other = await student(t);
    expect((await enable(other, { notice: await notice() })).ok).toBe(true);
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect(await enable(s)).toEqual({ ok: false, code: "report_not_ready" }); // the hour is over
  });
});

describe("GET /api/shared/payload", () => {
  test("covers AC-4, AC-12: a good code answers 200 with the first name, the date, the seed and the result, not cached and not indexed", async () => {
    const t = makeBackend();
    const r = await link(await student(t, { name: "Asha Rao" }));
    const res = await read(t, r.code);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const data = await res.json();
    expect(Object.keys(data).sort()).toEqual(["completedAt", "profile", "result", "seed"]);
    expect(data.profile).toEqual({ name: "Asha" }); // the first name only, no class, no last name, no picture when there is none
    expect(data.completedAt).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
    expect(data.result.styleKey).toMatch(/^[vpk]$/);
  });

  test("covers AC-12: a student with every flag set shows no flag and no private field in the payload", async () => {
    const t = makeBackend();
    const s = await student(t, { name: "Asha Rao" });
    const r = await link(s);
    await t.run(async (ctx) => {
      for (const f of await ctx.db.query("resultFlags").collect()) {
        await ctx.db.patch(f._id, { keepsFeelingsInside: true, lowCareerClarity: true, heavyExpectations: true, selfDoubt: true, sleepStrain: true, lowMood: true, lowConsistency: true });
      }
    });
    const text = await body(await read(t, r.code));
    const data = JSON.parse(text);
    expect(Object.values(data.result.flags).every((f) => f === false)).toBe(true);
    // no field a stranger must not see appears anywhere, at any depth
    const names: string[] = [];
    const walk = (x: unknown) => {
      if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { names.push(k); walk(v); }
    };
    walk(data);
    for (const bad of ["email", "age", "class", "phone", "authUserId", "studentId", "checkId", "wantedVersion"]) expect(names).not.toContain(bad);
    expect(text).not.toMatch(/example\.com|Rao/);
  });

  test("covers AC-4, AC-12 (review blocker): the mood split and the student's quoted answers are not sent, because they give the sensitive flags away", async () => {
    const t = makeBackend();
    const r = await link(await student(t, { name: "Asha Rao" }));
    // the saved result does hold them, so this test means something
    const saved = await t.run(async (ctx) => (await ctx.db.query("results").first())!.detail as { state: Record<string, number>; top: { said: unknown }[]; bottom: { said: unknown }[] });
    expect(Object.keys(saved.state).length).toBeGreaterThan(0);
    expect([...saved.top, ...saved.bottom].some((a) => a.said)).toBe(true);
    const text = await body(await read(t, r.code));
    const data = JSON.parse(text);
    expect(data.result.state).toEqual({});
    expect(data.result.top.length).toBeGreaterThan(0);
    for (const a of [...data.result.top, ...data.result.bottom]) {
      expect(a.said).toBeNull();
      expect(typeof a.area).toBe("string"); // the rest of the area is still there
      expect(typeof a.score).toBe("number");
    }
    for (const s of [...saved.top, ...saved.bottom].map((a) => (a.said as { text?: string } | null)?.text).filter((x): x is string => !!x)) {
      expect(text).not.toContain(s);
    }
  });

  test("covers AC-4, spec 0011: the sharer's picture path is in the payload when the student has one, from pictureFor, and never the Google address", async () => {
    const t = makeBackend();
    const s = await student(t);
    const r = await link(s);
    const { key, avatarId } = await t.run(async (ctx) => {
      const studentId = (await ctx.db.query("students").first())!._id;
      const storageId = await ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], { type: "image/jpeg" }));
      const key = newKey();
      const avatarId = await ctx.db.insert("avatars", {
        studentId, key, storageId, contentType: "image/jpeg", size: 6, sha256: "abc",
        sourceUrl: "https://lh3.googleusercontent.com/a/private-address", etag: '"private-etag"', checkedAt: Date.now(), updatedAt: Date.now(),
      });
      return { key, avatarId };
    });
    const text = await body(await read(t, r.code));
    expect(JSON.parse(text).profile).toEqual({ name: "Asha", avatar: `/api/avatar/${key}` });
    expect(text).not.toMatch(/googleusercontent|private-etag|storageId/);
    // removed or blocked by the team: no picture
    await t.run(async (ctx) => await ctx.db.patch(avatarId, { removedAt: Date.now() }));
    expect((await (await read(t, r.code)).json()).profile).toEqual({ name: "Asha" });
    await t.run(async (ctx) => await ctx.db.patch(avatarId, { removedAt: undefined, blockedAt: Date.now() }));
    expect((await (await read(t, r.code)).json()).profile).toEqual({ name: "Asha" });
    // the asked mode: a student who has not agreed has no picture here either
    await t.run(async (ctx) => await ctx.db.patch(avatarId, { blockedAt: undefined }));
    process.env.PICTURE_CONSENT_REQUIRED = "true";
    expect((await (await read(t, r.code)).json()).profile).toEqual({ name: "Asha", avatar: `/api/avatar/${key}` }); // v4 names the picture, so this student agreed
    await t.run(async (ctx) => {
      const c = (await ctx.db.query("consents").first())!;
      await ctx.db.patch(c._id, { textVersion: "v3" }); // v3 does not
    });
    expect((await (await read(t, r.code)).json()).profile).toEqual({ name: "Asha" });
  });

  test("covers AC-7: an unknown, altered, off, ended or old generation link, a missing header and an unset secret all get the same 404 and the same body", async () => {
    const t = makeBackend();
    const s = await student(t);
    const live = await link(s);
    const row = await only(t);
    const [id, gen, sig] = live.code.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    const unknownRow = await makeShareCode(SECRET, "k".repeat(32), 1); // a good signature for a row that does not exist
    const wrongGeneration = await makeShareCode(SECRET, id, 7); // a good signature for a generation the row does not have
    expect((await read(t, live.code)).status).toBe(200);

    const cases: Array<[string, string | undefined]> = [
      ["altered", `${id}.${gen}.${flipped}`],
      ["unknown row", unknownRow],
      ["wrong generation", wrongGeneration],
      ["nonsense", "not-a-code"],
      ["no header", undefined],
    ];
    for (const [name, code] of cases) {
      const res = await read(t, code);
      expect([name, res.status]).toEqual([name, 404]);
      expect([name, await body(res)]).toEqual([name, UNAVAILABLE]);
    }
    await patch(t, row._id, { offAt: Date.now() });
    const off = await read(t, live.code);
    expect([off.status, await body(off)]).toEqual([404, UNAVAILABLE]);
    await patch(t, row._id, { offAt: undefined, expiresAt: Date.now() - 1 });
    const ended = await read(t, live.code);
    expect([ended.status, await body(ended)]).toEqual([404, UNAVAILABLE]);
    await patch(t, row._id, { expiresAt: Date.now() + DAY });
    delete process.env.SHARE_LINK_SECRET;
    const noSecret = await read(t, live.code);
    expect([noSecret.status, await body(noSecret)]).toEqual([404, UNAVAILABLE]);
  });

  test("covers AC-7: a link whose check is no longer finished, or has no result, is unavailable too", async () => {
    const t = makeBackend();
    const r = await link(await student(t));
    await t.run(async (ctx) => {
      for (const res of await ctx.db.query("results").collect()) {
        for (const f of await ctx.db.query("resultFlags").collect()) await ctx.db.delete(f._id);
        await ctx.db.delete(res._id);
      }
    });
    const res = await read(t, r.code);
    expect([res.status, await body(res)]).toEqual([404, UNAVAILABLE]);
  });

  test("covers AC-6: opening the page, again and again, never moves the end date", async () => {
    const t = makeBackend();
    const r = await link(await student(t));
    vi.setSystemTime(Date.now() + 30 * DAY);
    for (let i = 0; i < 3; i++) expect((await read(t, r.code)).status).toBe(200);
    expect((await only(t)).expiresAt).toBe(r.expiresAt);
  });

  test("covers AC-15: no link state or payload field depends on the report version", async () => {
    const t = makeBackend();
    const r = await link(await student(t));
    const data = await (await read(t, r.code)).json();
    expect(JSON.stringify(data)).not.toMatch(/wantedVersion|reportVersion/);
    const row = await only(t);
    expect(Object.keys(row).filter((k) => /version/i.test(k))).toEqual([]);
  });

  test("covers AC-11: a link is read 600 times a minute at most; by the 601st it answers 429, another link is not affected, and the next minute starts again", async () => {
    const t = makeBackend();
    const a = await link(await student(t, { name: "Asha Rao" }));
    const b = await link(await student(t, { name: "Bala Iyer" }));
    // The bucket is in 16 shards, so the 429 can come a little before the 600th read (each shard holds a sixteenth), never after the 601st.
    let answered = 0;
    let slow: Response | undefined;
    for (let i = 0; i < 601 && !slow; i++) {
      const res = await read(t, a.code);
      if (res.status === 200) answered += 1;
      else slow = res;
    }
    expect(slow?.status).toBe(429);
    expect(JSON.parse(await body(slow!))).toEqual({ code: "slow_down" });
    expect(answered).toBeGreaterThan(450);
    expect(answered).toBeLessThanOrEqual(600);
    expect((await read(t, b.code)).status).toBe(200);
    vi.setSystemTime(Date.now() + 61_000);
    expect((await read(t, a.code)).status).toBe(200);
  }, 120_000);

  test("covers AC-11: made up codes share one bucket, so a flood of them ends in 429 and never touches a real link's own limit", async () => {
    const t = makeBackend();
    const real = await link(await student(t));
    let slow = 0;
    for (let i = 0; i < 700; i++) {
      const res = await read(t, `${"k".repeat(32)}.1.${String(i).padStart(22, "A")}`);
      if (res.status === 429) slow += 1;
      else expect(res.status).toBe(404);
    }
    expect(slow).toBeGreaterThan(0); // 700 is more than the 600 a minute the bucket allows
    expect(slow).toBeLessThan(700); // and the first ones were answered
    expect((await read(t, real.code)).status).toBe(200); // a good link has its own bucket
  }, 120_000);

  test("covers AC-11: both read buckets are sharded and start every window on the same clock minute (the settings the live race fix depends on)", () => {
    for (const name of ["shareRead", "shareBad"] as const) {
      const config = rateLimiter.limits?.[name] as { kind: string; rate: number; period: number; shards?: number; start?: number } | undefined;
      expect(config).toMatchObject({ kind: "fixed window", rate: 600, period: 60_000, start: 0 });
      expect(config?.shards).toBeGreaterThanOrEqual(16);
    }
  });

  test("covers AC-11: the shards share one window, so a link is never answered more than 600 times in one clock minute, however the reads are spread", async () => {
    // Without a shared start every shard picks its own random window and resets at its own moment, so a burst spread over half a minute
    // was let through about 650 times on dev. Here the reads start at the top of a minute, pause for half of it, and must still stop at 600.
    const t = makeBackend();
    const a = await link(await student(t));
    vi.setSystemTime(Math.ceil(Date.now() / 60_000) * 60_000 + 1_000);
    let answered = 0;
    for (let i = 0; i < 700; i++) {
      if (i === 350) vi.setSystemTime(Date.now() + 30_000);
      if ((await read(t, a.code)).status === 200) answered += 1;
    }
    expect(answered).toBeGreaterThan(450);
    expect(answered).toBeLessThanOrEqual(600);
  }, 120_000);

  // convex-test runs one mutation at a time, so it cannot lose a race on a document the way the real deployment does (the live check in
  // verify.md does that, 40 readers at once). These two tests keep what it can: many requests started together all end in 200, 404 or
  // 429 with the one 404 body, and the route's answer to a lost race.
  test("covers AC-7, AC-11: 300 reads started together, good and made up codes mixed, answer only 200, 404 or 429, and every 404 has the same body", async () => {
    const t = makeBackend();
    const real = await link(await student(t));
    const codes = Array.from({ length: 300 }, (_, i) => (i % 2 === 0 ? real.code : `${"k".repeat(32)}.1.${String(i).padStart(22, "A")}`));
    const answers = await Promise.all(codes.map(async (c) => {
      const res = await read(t, c);
      return { status: res.status, text: await body(res) };
    }));
    expect(new Set(answers.map((a) => a.status)).size).toBeGreaterThan(1);
    for (const a of answers) {
      expect([200, 404, 429]).toContain(a.status);
      if (a.status === 404) expect(a.text).toBe(UNAVAILABLE);
      if (a.status === 429) expect(JSON.parse(a.text)).toEqual({ code: "slow_down" });
    }
    expect(answers.filter((a) => a.status === 200).length).toBeGreaterThan(100);
  }, 120_000);

  test("covers AC-11: when the rate limit rows are lost to other readers on every retry, the route answers 429 slow_down for a good code and a bad one, never a 500", async () => {
    const t = makeBackend();
    const real = await link(await student(t));
    const conflict = new Error(
      'Uncaught Error: Documents read from or written to the "rateLimits" table changed while this mutation was being run and on every subsequent retry. Another call to this mutation changed the document with ID "x". See https://docs.convex.dev/error#1',
    );
    const call = async (code: string | undefined, error: unknown) => {
      const ctx = { runMutation: async () => { throw error; } };
      const req = new Request("https://example.test/api/shared/payload", { headers: code === undefined ? {} : { "x-share-token": code } });
      return await (sharedPayload as unknown as { _handler: (c: unknown, r: Request) => Promise<Response> })._handler(ctx, req);
    };
    for (const code of [real.code, `${"k".repeat(32)}.1.${"A".repeat(22)}`, undefined]) {
      const res = await call(code, conflict);
      expect([res.status, await body(res)]).toEqual([429, JSON.stringify({ code: "slow_down" })]);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    await expect(call(real.code, new Error("something else broke"))).rejects.toThrow("something else broke"); // a real fault is not hidden
  });
});

const consents = (t: Backend) => t.run(async (ctx) => (await ctx.db.query("consents").collect()).filter((c) => c.kind === "share"));

describe("the notice and the consent row (AC-3)", () => {
  test("covers AC-3: a student who has not agreed gets needs_consent, and nothing is written", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await enable(s)).toEqual({ ok: false, code: "needs_consent" });
    expect(await shares(t)).toHaveLength(0);
    expect(await consents(t)).toHaveLength(0);
  });

  test("covers AC-3: agreeing records one share consent (version, the age, no guardian for an adult) and makes the link", async () => {
    const t = makeBackend();
    const s = await student(t, { age: 20 });
    const r = await enable(s, { notice: await notice() });
    expect(r.ok).toBe(true);
    const rows = await consents(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "share", textVersion: SHARE_CONSENT_VERSION, ageAtConsent: 20, guardianPresent: false });
    const row = await only(t);
    expect(row.consentId).toBe(rows[0]._id);
    // the exact words are kept once, with their fingerprint
    const texts = await t.run(async (ctx) => (await ctx.db.query("consentTexts").collect()).filter((x) => x.version === SHARE_CONSENT_VERSION));
    expect(texts).toHaveLength(1);
    expect(texts[0].hash).toBe(await consentHash(CONSENT_TEXTS[SHARE_CONSENT_VERSION]));
  });

  test("covers AC-3: after agreeing, later Share taps need no notice, and agreeing again adds no second row; turning the link off and on does not ask again", async () => {
    const t = makeBackend();
    const s = await student(t);
    const first = await link(s);
    expect((await enable(s)).ok).toBe(true); // no notice sent
    await link(s); // the notice sent again
    expect(await consents(t)).toHaveLength(1);
    await s.as.mutation(api.shares.disable, {});
    const again = await enable(s); // after Stop sharing, still no notice
    expect(again.ok).toBe(true);
    expect((again as { code: string }).code).not.toBe(first.code);
    expect(await consents(t)).toHaveLength(1);
  });

  test("covers AC-3: a student under 18 cannot continue without the tick, and the tick is kept as guardianPresent", async () => {
    const t = makeBackend();
    const s = await student(t, { age: 15 });
    expect(await enable(s, { notice: await notice() })).toEqual({ ok: false, code: "needs_guardian" });
    expect(await enable(s, { notice: await notice(), guardianTick: false })).toEqual({ ok: false, code: "needs_guardian" });
    expect(await shares(t)).toHaveLength(0);
    expect(await consents(t)).toHaveLength(0);
    expect((await enable(s, { notice: await notice(), guardianTick: true })).ok).toBe(true);
    const rows = await consents(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ageAtConsent: 15, guardianPresent: true });
  });

  test("covers AC-3: an exactly 18 year old is an adult and needs no tick; 17 is not", async () => {
    const t = makeBackend();
    expect((await enable(await student(t, { age: 18 }), { notice: await notice() })).ok).toBe(true);
    expect(await enable(await student(t, { age: 17 }), { notice: await notice() })).toEqual({ ok: false, code: "needs_guardian" });
  });

  test("covers AC-3: a wrong fingerprint, an unknown version, or another kind's text is refused as consent_text_changed, and nothing is written", async () => {
    const t = makeBackend();
    const s = await student(t);
    const good = await notice();
    for (const bad of [
      { version: good.version, hash: "0".repeat(64) },
      { version: "share-v0", hash: good.hash },
      { version: LEAD_CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[LEAD_CONSENT_VERSION]) }, // the phone text cannot stand in
      { version: "v4", hash: await consentHash(CONSENT_TEXTS["v4"]) }, // nor can the landing text
    ]) {
      expect(await enable(s, { notice: bad })).toEqual({ ok: false, code: "consent_text_changed" });
    }
    expect(await shares(t)).toHaveLength(0);
    expect(await consents(t)).toHaveLength(0);
  });

  test("covers AC-3: when the notice version changes the student is asked again (an older version's consent does not count)", async () => {
    const t = makeBackend();
    const s = await student(t);
    await link(s);
    await t.run(async (ctx) => {
      const c = (await ctx.db.query("consents").collect()).find((x) => x.kind === "share")!;
      await ctx.db.patch(c._id, { textVersion: "share-v0" });
    });
    expect(await enable(s)).toEqual({ ok: false, code: "needs_consent" });
  });

  test("covers AC-11: the rate limit is counted before the consent check (20 refused calls, then rate_limited)", async () => {
    const t = makeBackend();
    const s = await student(t);
    for (let i = 0; i < 20; i++) expect(await enable(s)).toEqual({ ok: false, code: "needs_consent" });
    expect(await enable(s, { notice: await notice() })).toEqual({ ok: false, code: "rate_limited" });
    expect(await consents(t)).toHaveLength(0);
  });

  test("covers AC-6: a new generation after the link ended carries the latest share consent", async () => {
    const t = makeBackend();
    const s = await student(t);
    await link(s);
    vi.setSystemTime(Date.now() + 91 * DAY);
    await link(s);
    const row = await only(t);
    expect(row.generation).toBe(2);
    expect(row.consentId).toBe((await consents(t))[0]._id);
  });
});

describe("shares.status", () => {
  test("covers AC-16: before any link: ready once the check is finished, not consented, no code; a student whose check is not finished is not ready", async () => {
    const t = makeBackend();
    expect(await (await student(t)).as.query(api.shares.status, {})).toEqual({ ready: true, consented: false, off: false, expiresAt: null, code: null });
    expect(await (await student(t, { finish: false })).as.query(api.shares.status, {})).toMatchObject({ ready: false, code: null });
  });

  test("covers AC-6: it gives the student their own code and end date without moving the end date, however many times it is read", async () => {
    const t = makeBackend();
    const s = await student(t);
    const made = await link(s);
    vi.setSystemTime(Date.now() + 20 * DAY);
    for (let i = 0; i < 3; i++) {
      expect(await s.as.query(api.shares.status, {})).toEqual({ ready: true, consented: true, off: false, expiresAt: made.expiresAt, code: made.code });
    }
    expect((await only(t)).expiresAt).toBe(made.expiresAt);
  });

  test("covers AC-5, AC-14: after Stop sharing it says off and gives no code; another student sees only their own state; signed out is refused", async () => {
    const t = makeBackend();
    const a = await student(t);
    const b = await student(t);
    await link(a);
    await a.as.mutation(api.shares.disable, {});
    expect(await a.as.query(api.shares.status, {})).toMatchObject({ off: true, code: null, consented: true });
    expect(await b.as.query(api.shares.status, {})).toMatchObject({ off: false, code: null, consented: false, expiresAt: null });
    await expect(t.query(api.shares.status, {})).rejects.toMatchObject({ data: { code: "not_signed_in" } });
  });
});

describe("Stop sharing and the team's switch (AC-5, AC-14)", () => {
  test("covers AC-5, AC-7: Stop sharing ends the link at once, the old code gets the same 404, and sharing again makes a new link", async () => {
    const t = makeBackend();
    const s = await student(t);
    const first = await link(s);
    expect((await read(t, first.code)).status).toBe(200);
    expect(await s.as.mutation(api.shares.disable, {})).toEqual({ ok: true });
    const gone = await read(t, first.code);
    expect([gone.status, await body(gone)]).toEqual([404, UNAVAILABLE]);
    const second = await link(s);
    expect(second.code).not.toBe(first.code);
    expect((await read(t, first.code)).status).toBe(404);
    expect((await read(t, second.code)).status).toBe(200);
    expect((await only(t)).generation).toBe(2);
  });

  test("covers AC-5: Stop sharing twice, or with no link at all, is harmless", async () => {
    const t = makeBackend();
    const s = await student(t);
    expect(await s.as.mutation(api.shares.disable, {})).toEqual({ ok: true });
    await link(s);
    await s.as.mutation(api.shares.disable, {});
    const off = (await only(t)).offAt;
    vi.setSystemTime(Date.now() + 1000);
    expect(await s.as.mutation(api.shares.disable, {})).toEqual({ ok: true });
    expect((await only(t)).offAt).toBe(off); // the first stop time is kept
  });

  test("covers AC-14: a student can switch off only their own link", async () => {
    const t = makeBackend();
    const a = await student(t);
    const b = await student(t);
    const ca = await link(a);
    const cb = await link(b);
    await b.as.mutation(api.shares.disable, {});
    expect((await read(t, ca.code)).status).toBe(200);
    expect((await read(t, cb.code)).status).toBe(404);
    await expect(t.mutation(api.shares.disable, {})).rejects.toMatchObject({ data: { code: "not_signed_in" } });
  });

  test("covers AC-5, AC-14 (review major): Stop sharing and the team's switch give the picture a new address, so the one in an old payload stops answering", async () => {
    const t = makeBackend();
    const s = await student(t);
    const addPicture = async () =>
      await t.run(async (ctx) => {
        const studentId = (await ctx.db.query("students").first())!._id;
        const storageId = await ctx.storage.store(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])], { type: "image/jpeg" }));
        const key = newKey();
        await ctx.db.insert("avatars", { studentId, key, storageId, contentType: "image/jpeg", size: 6, sha256: "abc", sourceUrl: "https://lh3.googleusercontent.com/a/x", checkedAt: Date.now(), updatedAt: Date.now() });
        return key;
      });
    const keyOf = async () => await t.run(async (ctx) => (await ctx.db.query("avatars").first())!.key);
    const email = await t.run(async (ctx) => (await ctx.db.query("students").first())!.email);

    // Stop sharing
    const key1 = await addPicture();
    const made = await link(s);
    expect((await (await read(t, made.code)).json()).profile.avatar).toBe(`/api/avatar/${key1}`);
    expect((await t.fetch(`/api/avatar/${key1}`)).status).toBe(200);
    await s.as.mutation(api.shares.disable, {});
    expect((await t.fetch(`/api/avatar/${key1}`)).status).toBe(404); // the old address is dead
    const key2 = await keyOf();
    expect(key2).not.toBe(key1);
    await s.as.mutation(api.shares.disable, {}); // twice changes nothing more
    expect(await keyOf()).toBe(key2);
    expect((await t.fetch(`/api/avatar/${key2}`)).status).toBe(200); // the student's own screens use the new address

    // the team's switch
    const again = await link(s);
    expect((await (await read(t, again.code)).json()).profile.avatar).toBe(`/api/avatar/${key2}`);
    await t.mutation(internal.shares.adminOff, { email });
    expect((await t.fetch(`/api/avatar/${key2}`)).status).toBe(404);
    expect(await keyOf()).not.toBe(key2);

    // a student with no picture is not a problem
    const t2 = makeBackend();
    const s2 = await student(t2);
    await link(s2);
    expect(await s2.as.mutation(api.shares.disable, {})).toEqual({ ok: true });
  });

  test("covers AC-14: the team switches a student's link off by email from a terminal; it is not a browser function", async () => {
    const t = makeBackend();
    const s = await student(t);
    const made = await link(s);
    const email = await t.run(async (ctx) => (await ctx.db.query("students").first())!.email);
    expect((await read(t, made.code)).status).toBe(200);
    expect(await t.mutation(internal.shares.adminOff, { email: email.toUpperCase() + " " })).toEqual({ ok: true });
    expect((await read(t, made.code)).status).toBe(404);
    expect(await t.mutation(internal.shares.adminOff, { email: "nobody@example.com" })).toEqual({ ok: false });
    // the student can make a new link by sharing again
    const again = await link(s);
    expect(again.code).not.toBe(made.code);
    expect((await read(t, again.code)).status).toBe(200);
  });
});

describe("what the code can and cannot do", () => {
  const raw = import.meta.glob("./*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const source = (name: string) => raw[`./${name}`];
  // code only: the comments describe what the file does not do, and would match the scans below
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("covers AC-12: the payload builder never reads the flags, leads or feedback, or the email, phone, age and class of a student", () => {
    expect(code(source("sharePayload.ts"))).not.toMatch(/resultFlags|leads|feedback|\.email|\.phone|\.age\b|\.class\b|authUserId|referralCode/);
    // it reads a student only for the name, and the picture rule is the shared one
    expect(code(source("sharePayload.ts"))).toMatch(/student\.name/);
    expect(code(source("sharePayload.ts"))).toContain("pictureFor(");
    expect(code(source("sharePayload.ts"))).toContain("NO_FLAGS");
  });

  test("covers AC-15: nothing in the link code reads the report version", () => {
    for (const f of ["shares.ts", "sharePayload.ts", "shareCore.ts", "shareHttp.ts"]) expect(code(source(f)), f).not.toMatch(/reportVersion|REPORT_VERSION|wantedVersion/);
  });

  test("covers AC-14: no public function takes a student, check, share or auth id (or an email), and each finds the student from the session", () => {
    const text = source("shares.ts");
    const publicFns = [...text.matchAll(/export const (\w+) = (mutation|query|action)\(/g)].map((m) => m[1]);
    expect(publicFns).toEqual(["enable", "status", "disable"]);
    for (const name of publicFns) {
      const start = text.indexOf(`export const ${name} = `);
      const body = text.slice(start, text.indexOf("\nexport const ", start + 10) === -1 ? undefined : text.indexOf("\nexport const ", start + 10));
      const args = /args:\s*(\{[^\n]*\})/.exec(body)?.[1] ?? "";
      expect(args, name).not.toMatch(/studentId|checkId|shareId|authUserId|email|v\.id\(/);
      expect(body, name).toContain("requireStudent(ctx)");
    }
    // the team's switch is internal, so no browser can call it
    expect(text).toMatch(/export const adminOff = internalMutation\(/);
  });

  test("covers AC-7, AC-11: the code travels in a header only, never in a log line, and the route is a GET", () => {
    // the one allowed line is the fixed words logged when a read loses its race on the rate limit rows: no code, no id, no argument
    const lostRace = /console\.warn\("share read lost its race on the rate limit rows"\);/;
    for (const f of ["shares.ts", "shareHttp.ts", "shareCore.ts", "sharePayload.ts"]) expect(code(source(f)).replace(lostRace, ""), f).not.toMatch(/console\./);
    const http = code(source("shareHttp.ts"));
    expect(http).toContain('req.headers.get("x-share-token")');
    expect(http).not.toMatch(/req\.url|searchParams|pathname/);
    expect(code(source("http.ts"))).toMatch(/path: "\/api\/shared\/payload", method: "GET"/);
  });
});
