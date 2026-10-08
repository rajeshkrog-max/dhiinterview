// The daily clean up of abandoned sign in accounts (spec 0002, AC-10).
import { describe, expect, test } from "vitest";
import { api, components, internal } from "./_generated/api";
import { makeBackend, profileInput, signInAs } from "../tests/convexTestUtils";

const DAY = 86_400_000;

async function usersLeft(t: ReturnType<typeof makeBackend>) {
  return await t.run(async (ctx) => {
    const res = await ctx.runQuery(components.betterAuth.adapter.findMany, { model: "user", paginationOpts: { numItems: 100, cursor: null } });
    return (res.page as { email: string }[]).map((u) => u.email).sort();
  });
}
async function rowsLeft(t: ReturnType<typeof makeBackend>, model: "session" | "account") {
  return await t.run(async (ctx) => {
    const res = await ctx.runQuery(components.betterAuth.adapter.findMany, { model, paginationOpts: { numItems: 100, cursor: null } });
    return res.page.length;
  });
}

describe("purgeAbandoned", () => {
  test("covers AC-10: an account with no student record, older than 7 days and idle, is deleted with its sessions", async () => {
    const t = makeBackend();
    await signInAs(t, { email: "gone@example.com", createdAt: Date.now() - 8 * DAY, sessionUpdatedAt: Date.now() - 8 * DAY });
    await t.mutation(internal.purge.purgeAbandoned, {});
    expect(await usersLeft(t)).toEqual([]);
    expect(await rowsLeft(t, "session")).toBe(0);
  });

  test("covers AC-10: an account with a student record is never deleted, however old", async () => {
    const t = makeBackend();
    const s = await signInAs(t, { email: "keep@example.com", createdAt: Date.now() - 400 * DAY, sessionUpdatedAt: Date.now() - 400 * DAY });
    await s.as.mutation(api.students.createProfile, await profileInput());
    await t.mutation(internal.purge.purgeAbandoned, {});
    expect(await usersLeft(t)).toEqual(["keep@example.com"]);
  });

  test("covers AC-10: an account younger than 7 days is kept", async () => {
    const t = makeBackend();
    await signInAs(t, { email: "new@example.com", createdAt: Date.now() - 2 * DAY, sessionUpdatedAt: Date.now() - 2 * DAY });
    await t.mutation(internal.purge.purgeAbandoned, {});
    expect(await usersLeft(t)).toEqual(["new@example.com"]);
  });

  test("covers AC-10: an old account with session activity in the last 24 hours is kept", async () => {
    const t = makeBackend();
    await signInAs(t, { email: "active@example.com", createdAt: Date.now() - 9 * DAY, sessionUpdatedAt: Date.now() - 3_600_000 });
    await t.mutation(internal.purge.purgeAbandoned, {});
    expect(await usersLeft(t)).toEqual(["active@example.com"]);
  });

  test("covers AC-10: only the abandoned accounts go when several kinds are mixed, across more than one page", async () => {
    const t = makeBackend();
    const old = Date.now() - 10 * DAY;
    for (let i = 0; i < 30; i++) await signInAs(t, { email: `gone${i}@example.com`, createdAt: old, sessionUpdatedAt: old });
    const keep = await signInAs(t, { email: "keep@example.com", createdAt: old, sessionUpdatedAt: old });
    await keep.as.mutation(api.students.createProfile, await profileInput());
    await t.mutation(internal.purge.purgeAbandoned, {});
    await t.finishAllScheduledFunctions(() => {});
    expect(await usersLeft(t)).toEqual(["keep@example.com"]);
    expect(await rowsLeft(t, "session")).toBe(1);
  });

  test("covers AC-10: the clean up never touches the student tables", async () => {
    const t = makeBackend();
    const s = await signInAs(t, { createdAt: Date.now() - 20 * DAY, sessionUpdatedAt: Date.now() - 20 * DAY });
    await s.as.mutation(api.students.createProfile, await profileInput());
    await t.mutation(internal.purge.purgeAbandoned, {});
    await t.run(async (ctx) => {
      expect((await ctx.db.query("students").collect()).length).toBe(1);
      expect((await ctx.db.query("consents").collect()).length).toBe(1);
      expect((await ctx.db.query("checks").collect()).length).toBe(1);
    });
  });
});
