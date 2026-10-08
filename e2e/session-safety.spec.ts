// Sign out, the cache wipe, switching accounts and the one time import (spec 0002, AC-8 and AC-11).
// The "Not you" tests exercise the fix for the offline sign out gap found by /check verify.
import { expect, test } from "@playwright/test";
import { PATH, dhiKeys, newContext, newStudent, newTag, openQuestion, sessionBody, signIn, waitSaved } from "./helpers";

test.describe("Not you / sign out (AC-8)", () => {
  test("covers AC-8: online, sign out ends the session and clears every dhirise key except the music setting", async ({ page }) => {
    await newStudent(page);
    await page.evaluate(() => {
      localStorage.setItem("dhirise.music.muted", "1");
      localStorage.setItem("dhirise.founding.v1", "{}");
      localStorage.setItem("dhirise.challenge.v1", "{}");
    });
    expect(await page.evaluate(() => (window as any).DhiSession.signOut(false))).toEqual({ ok: true });
    expect(await sessionBody(page)).toBe("null");
    expect(await dhiKeys(page)).toEqual(["dhirise.music.muted"]);
  });

  test("covers AC-8: offline, sign out is refused, nothing is cleared and the session is still the student's", async ({ page, context }) => {
    await newStudent(page);
    await context.setOffline(true);
    const res = await page.evaluate(() => (window as any).DhiSession.signOut(false));
    expect(res).toEqual({ ok: false, offline: true });
    expect((await dhiKeys(page)).length).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as any).DhiSession.state)).toBe("ready");
    await context.setOffline(false);
    expect(await sessionBody(page)).toContain('{"session"');
    // once back online the same call works
    expect(await page.evaluate(() => (window as any).DhiSession.signOut(false))).toEqual({ ok: true });
    expect(await sessionBody(page)).toBe("null");
  });

  test("covers AC-8: with answers not yet sent, sign out warns first and a forced one offline still changes nothing", async ({ page, context }) => {
    await newStudent(page);
    await openQuestion(page, 1);
    await context.setOffline(true);
    await page.evaluate(() => {
      const s = (window as any).DhiStore;
      s.answer(2, "q2o2");
      s.answer(3, "q3o2");
    });
    expect(await page.evaluate(() => (window as any).DhiSession.signOut(false))).toEqual({ ok: false, unsent: 2 });
    expect(await page.evaluate(() => (window as any).DhiSession.signOut(true))).toEqual({ ok: false, offline: true });
    expect(await page.evaluate(() => (window as any).DhiSession.pendingCount())).toBe(2);
    await context.setOffline(false);
    await waitSaved(page); // nothing was lost by the refused sign out
  });

  test("covers AC-8: the landing page shows the unsent warning with a Sign out anyway button, and the offline message", async ({ page, context }) => {
    await newStudent(page);
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#back")).toBeVisible();
    const owner = await page.evaluate(() => localStorage.getItem("dhirise.owner.v1"));
    await context.setOffline(true);
    await page.evaluate((o) => localStorage.setItem("dhirise.sync.v1." + o, JSON.stringify({ 5: { optionId: "q5o1", answeredAt: Date.now(), synced: false } })), owner);
    await page.evaluate(() => (document.getElementById("notYou") as HTMLButtonElement).click());
    await expect(page.locator("#outMsg")).toContainText("answer has not been sent yet");
    await expect(page.locator("#notYou")).toHaveText("Sign out anyway");
    await page.evaluate(() => (document.getElementById("notYou") as HTMLButtonElement).click());
    await expect(page.locator("#outMsg")).toContainText("could not sign you out", { timeout: 20_000 });
    await expect(page.locator("#back")).toBeVisible(); // still signed in, nothing cleared
    await context.setOffline(false);
    await page.evaluate(() => (document.getElementById("notYou") as HTMLButtonElement).click());
    await expect(page.locator("#stSignedOut")).toBeVisible({ timeout: 30_000 });
    expect(await dhiKeys(page)).toEqual([]);
  });

  test("covers AC-8: a sign out when the session is already gone still counts as signed out", async ({ page }) => {
    await newStudent(page);
    await page.evaluate(() => fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(await page.evaluate(() => (window as any).DhiSession.signOut(false))).toEqual({ ok: true });
  });

  test("covers AC-8: signing out in one tab sends the other open tab back to landing", async ({ page, context }) => {
    await newStudent(page);
    await openQuestion(page, 1);
    const other = await context.newPage();
    await other.goto(PATH + "landing.html");
    await expect(other.locator("#back")).toBeVisible();
    await other.evaluate(() => (document.getElementById("notYou") as HTMLButtonElement).click());
    await expect(other.locator("#stSignedOut")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/landing\.html$/, { timeout: 15_000 });
  });

  test("covers AC-8: when the session ends another way and a different account signs in, the earlier student's data is gone", async ({ page }) => {
    await newStudent(page, newTag(), "First Student");
    await page.evaluate(() => localStorage.setItem("dhirise.music.muted", "1"));
    await page.evaluate(() => fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })); // cookie only
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#stSignedOut")).toBeVisible();
    // the device still remembers whose data it holds
    expect(await dhiKeys(page)).toContain("dhirise.owner.v1");
    const second = newTag();
    await newStudent(page, second, "Second Student");
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored).not.toContain("First Student");
    expect(await page.evaluate(() => (window as any).DhiStore.get().profile.name)).toBe("Second Student");
    expect(await dhiKeys(page)).toContain("dhirise.music.muted");
  });

  test("covers AC-8: the same account signing in again keeps its unsent answers", async ({ page }) => {
    const tag = await newStudent(page);
    await page.evaluate(() => fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    const owner = await page.evaluate(() => localStorage.getItem("dhirise.owner.v1"));
    await page.evaluate((o) => localStorage.setItem("dhirise.sync.v1." + o, JSON.stringify({ 6: { optionId: "q6o2", answeredAt: Date.now() - 1000, synced: false } })), owner);
    await signIn(page, tag);
    await waitSaved(page); // the waiting answer is sent after the same student signs in again
    const check = await page.evaluate(() => (window as any).DhiStore.get().answers);
    expect(check.q6).toBe("q6o2");
  });
});

test.describe("no leave site prompt (the unsaved changes warning)", () => {
  test("covers AC-5: reloading with an answer still being sent does not pop the browser's 'Leave site?' prompt", async ({ page, context }) => {
    await newStudent(page);
    await openQuestion(page, 1);
    let prompts = 0;
    page.on("dialog", (d) => {
      prompts++;
      void d.dismiss();
    });
    await context.setOffline(true);
    await page.evaluate(() => (window as any).DhiStore.answer(2, "q2o2"));
    await page.waitForTimeout(1500);
    await context.setOffline(false);
    await page.evaluate(() => (window as any).DhiStore.answer(2, "q2o1")); // a call in flight right now
    await page.reload();
    await page.waitForTimeout(1500);
    expect(prompts).toBe(0);
  });
});

test.describe("answers from the old stub (AC-11)", () => {
  const old = { profile: { name: "Old" }, answers: { q1: "q1o2", q2: "q2o3", q3: "q9o9", q4: "q3o1" }, startedAt: "2026-10-01T00:00:00Z", completedAt: null };

  test("covers AC-11: Yes keeps the well formed old answers once, marks the check imported, clears the old key and never asks again", async ({ page }) => {
    const tag = newTag();
    await page.goto(PATH + "landing.html");
    await page.evaluate((o) => localStorage.setItem("dhirise.check.v1", JSON.stringify(o)), old);
    await signIn(page, tag);
    await page.evaluate(() => (window as any).DhiSession.createProfile({ name: "Olive Old", age: 20, class: "College", guardianPresent: false }));
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#stImport")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#stImport")).toContainText("We found answers saved on this device. Keep them?");
    await page.evaluate(() => (document.getElementById("importYes") as HTMLButtonElement).click());
    await expect(page.locator("#back")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => localStorage.getItem("dhirise.check.v1"))).toBeNull();
    expect(await page.evaluate(() => (window as any).DhiStore.get().answers)).toEqual({ q1: "q1o2", q2: "q2o3" }); // the two bad ones are dropped
    expect(await page.evaluate(() => (window as any).DhiStore.resumeTarget())).toBe("questions.html?q=3");
    // a second try, even with a new old key, is refused by the server and nothing changes
    await page.evaluate(() => localStorage.setItem("dhirise.check.v1", JSON.stringify({ answers: { q5: "q5o1" } })));
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#back")).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => (window as any).DhiSession.importOld())).toEqual({ ok: false });
    expect(Object.keys(await page.evaluate(() => (window as any).DhiStore.get().answers))).toEqual(["q1", "q2"]);
  });

  test("covers AC-11: No clears the old answers, starts fresh and the question never comes back", async ({ page }) => {
    await page.goto(PATH + "landing.html");
    await page.evaluate((o) => localStorage.setItem("dhirise.check.v1", JSON.stringify(o)), old);
    await signIn(page, newTag());
    await page.evaluate(() => (window as any).DhiSession.createProfile({ name: "Nora No", age: 20, class: "College", guardianPresent: false }));
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#stImport")).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => (document.getElementById("importNo") as HTMLButtonElement).click());
    expect(await page.evaluate(() => localStorage.getItem("dhirise.check.v1"))).toBeNull();
    expect(await page.evaluate(() => Object.keys((window as any).DhiStore.get().answers).length)).toBe(0);
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#back")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#stImport")).toBeHidden();
  });

  test("covers AC-11: the question is not asked when the server already has answers", async ({ page }) => {
    await newStudent(page);
    await openQuestion(page, 1);
    await page.evaluate(() => (window as any).DhiStore.answer(1, "q1o1"));
    await waitSaved(page);
    await page.evaluate((o) => localStorage.setItem("dhirise.check.v1", JSON.stringify(o)), old);
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#back")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#stImport")).toBeHidden();
  });
});

test("covers AC-8 and AC-9: two students on two devices never see each other's answers", async ({ page, browser }) => {
  await newStudent(page, newTag(), "Alpha");
  await openQuestion(page, 1);
  await page.evaluate(() => (window as any).DhiStore.answer(1, "q1o1"));
  await waitSaved(page);
  const ctxB = await newContext(browser);
  const b = await ctxB.newPage();
  await newStudent(b, newTag(), "Beta");
  await openQuestion(b, 1);
  expect(await b.evaluate(() => (window as any).DhiStore.get().answers)).toEqual({});
  await ctxB.close();
});
