// The saved result in the browser (spec 0005): the report reads the result saved on the server, so it matches on a second
// device (AC-3), the device copy lets it open without the server and is ignored when it belongs to someone else (AC-10),
// and a result that cannot be reached shows a kind try again state instead of the landing page (AC-13).
import { expect, test, type Page } from "@playwright/test";
import { PATH, dhiKeys, finishedCheck, newContext, newStudent, newTag, openPhoneStep, openQuestion, signIn, waitSaved } from "./helpers";

const RESULT_KEY = "dhirise.result.v1";

// Saves the phone step so the story and the report open (spec 0003), through the real bridge.
async function saveLead(page: Page) {
  const res = await page.evaluate(() => (window as any).DhiSession.submitLead({ phone: "9876543210", wantsCommunity: false, guardianPresent: false }));
  expect(res.ok).toBe(true);
}

// What the report says about the result: the Dhi starting score ring and the style pill.
async function readReport(page: Page) {
  await page.goto(PATH + "report-student.html");
  const ring = page.locator(".ring");
  await expect(ring).toBeVisible({ timeout: 40_000 });
  return { score: await ring.getAttribute("aria-label"), style: await page.locator(".head .pill").innerText() };
}

test("covers AC-3 and AC-10: the report on a second device shows the same score and style, and the device keeps a copy", async ({ page, browser }) => {
  const tag = newTag();
  await finishedCheck(page, tag);
  await saveLead(page);
  const first = await readReport(page);
  expect(first.score).toMatch(/^Dhi starting score \d+ out of 100$/);
  const copy = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), RESULT_KEY);
  expect(copy).toMatchObject({ v: 1, result: { answered: 18, complete: true, engineVersion: 1 } });
  expect(copy.owner).toBe(await page.evaluate(() => localStorage.getItem("dhirise.owner.v1")));

  const ctxB = await newContext(browser);
  const b = await ctxB.newPage();
  expect(await signIn(b, tag)).toBe("ready");
  expect(await b.evaluate((k) => localStorage.getItem(k), RESULT_KEY)).toBeNull(); // nothing on this device yet
  const second = await readReport(b);
  expect(second).toEqual(first);
  expect(await b.evaluate((k) => localStorage.getItem(k) !== null, RESULT_KEY)).toBe(true);
  await ctxB.close();
});

test("covers AC-10: with a copy on the device the report opens without asking the server; a copy that belongs to another account is ignored", async ({ page }) => {
  await finishedCheck(page);
  await saveLead(page);
  const real = await readReport(page);

  // a marked copy of this account's result is what the page draws (so it did not wait for the server)
  await page.evaluate((k) => {
    const c = JSON.parse(localStorage.getItem(k) as string);
    c.result.dhiStart = 77;
    localStorage.setItem(k, JSON.stringify(c));
  }, RESULT_KEY);
  await page.route("**/api/auth/**", (route) => route.abort()); // the server cannot be reached at all
  expect((await readReport(page)).score).toBe("Dhi starting score 77 out of 100");
  await page.unroute("**/api/auth/**");

  // the same marked copy, but owned by someone else: it is not used, the server's result is
  await page.evaluate((k) => {
    const c = JSON.parse(localStorage.getItem(k) as string);
    c.owner = "someone-else";
    localStorage.setItem(k, JSON.stringify(c));
  }, RESULT_KEY);
  expect(await readReport(page)).toEqual(real);
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) as string), RESULT_KEY);
  expect(after.owner).not.toBe("someone-else"); // replaced by this account's own copy
});

test("covers AC-10: signing out wipes the saved result from the device", async ({ page }) => {
  await finishedCheck(page);
  await saveLead(page);
  await readReport(page);
  expect(await dhiKeys(page)).toContain(RESULT_KEY);
  expect(await page.evaluate(() => (window as any).DhiSession.signOut(true))).toEqual({ ok: true });
  expect(await dhiKeys(page)).not.toContain(RESULT_KEY);
});

test("covers AC-13: a result that cannot be reached shows a kind try again state, never the landing page, and the button works once it can", async ({ page }) => {
  await finishedCheck(page);
  await saveLead(page);
  await readReport(page);
  await page.evaluate((k) => localStorage.removeItem(k), RESULT_KEY); // a device with no copy yet
  await page.route("**/api/auth/**", (route) => route.abort());
  await page.goto(PATH + "report-student.html");
  const box = page.locator("#dhiResultBox");
  await expect(box).toContainText("We could not load your result", { timeout: 30_000 });
  await expect(page).toHaveURL(/\/report-student\.html$/); // the sign in is fine: no redirect
  await expect(page.locator(".ring")).toHaveCount(0); // nothing drawn from a guess

  await page.unroute("**/api/auth/**");
  await box.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".ring")).toBeVisible({ timeout: 40_000 });
  await expect(box).toHaveCount(0);
});

test("covers AC-14: a check that is not finished goes to where it left off, not to the result", async ({ page }) => {
  const tag = newTag();
  await signIn(page, tag);
  await page.evaluate(async () => (window as any).DhiSession.createProfile({ name: "Not Yet", age: 20, class: "College", guardianPresent: false }));
  await page.goto(PATH + "report-student.html");
  await expect(page).toHaveURL(/\/question\.html$/, { timeout: 40_000 }); // no answers yet: where the check left off
  expect(await dhiKeys(page)).not.toContain(RESULT_KEY);
});

test("covers AC-3: the done page, the story, the report and its Founding Card draw from the saved result, and no page but the questions loads the scoring engine", async ({ page }) => {
  await finishedCheck(page);

  await openPhoneStep(page);
  expect(await page.evaluate(() => typeof (window as any).DhiScore)).toBe("undefined");
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) as string).result, RESULT_KEY);
  await expect(page.locator("#tScore")).toHaveText(String(saved.dhiStart)); // the teaser shows the saved score
  await saveLead(page);

  await page.goto(PATH + "who.html");
  await expect(page.locator("#track > *").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#track > *")).toHaveCount(6);
  expect(await page.evaluate(() => typeof (window as any).DhiScore)).toBe("undefined");

  await page.goto(PATH + "report-student.html");
  await expect(page.locator(".ring")).toHaveAttribute("aria-label", `Dhi starting score ${saved.dhiStart} out of 100`, { timeout: 30_000 });
  await expect(page.locator("#cardSave")).toBeVisible({ timeout: 30_000 }); // the Founding Card drew from the same result
  expect(await page.evaluate(() => typeof (window as any).DhiScore)).toBe("undefined");

  for (const p of ["challenge.html", "leaderboard.html"]) {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(PATH + p);
    await page.waitForFunction(() => !document.documentElement.classList.contains("dhi-pending"), null, { timeout: 30_000 });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => typeof (window as any).DhiScore), p).toBe("undefined");
    expect(errors, p).toEqual([]);
  }

  await openQuestion(page, 3); // the question pages keep the engine, for the option order
  expect(await page.evaluate(() => typeof (window as any).DhiScore)).toBe("object");
});

test("covers AC-3 and AC-10: the challenge style label is empty until this device has the result, then names the style", async ({ page }) => {
  await finishedCheck(page);
  await saveLead(page);
  const label = async () => {
    await page.goto(PATH + "challenge.html");
    await page.waitForFunction(() => !!(window as any).DhiApi && !document.documentElement.classList.contains("dhi-pending"));
    return page.evaluate(async () => (await (window as any).DhiApi.getMe()).style);
  };
  expect(await label()).toBeNull();
  await readReport(page); // opening the report fills the device copy
  expect(["Explorer", "Achiever", "Builder"]).toContain(await label());
});

test("covers AC-6: when Finish answers scoring_failed the page shows a kind try again line, not Connect to finish, and Finish works again", async ({ page }) => {
  await newStudent(page);
  await openQuestion(page, 1);
  await page.evaluate(() => {
    const s = (window as any).DhiStore;
    for (let n = 1; n <= 18; n++) s.answer(n, `q${n}o2`);
  });
  await waitSaved(page);
  await openQuestion(page, 18);
  await page.evaluate(() => {
    const real = (window as any).DhiSession.finish;
    (window as any).__realFinish = real;
    (window as any).DhiSession.finish = async () => ({ ok: false, code: "scoring_failed" });
  });
  await page.locator("#options button").nth(1).click();
  await expect(page.locator("#next")).toBeEnabled({ timeout: 20_000 });
  await page.locator("#next").click();
  await expect(page.locator("#finishNote")).toContainText("We could not finish just now", { timeout: 10_000 });
  await expect(page.locator("#finishNote")).toContainText("answers are safe");
  await expect(page.locator("#next")).toHaveText("Try again");
  await expect(page.locator("#next")).toBeEnabled();

  await page.evaluate(() => ((window as any).DhiSession.finish = (window as any).__realFinish)); // the cause is gone
  await page.locator("#next").click();
  await expect(page).toHaveURL(/\/done\.html$/, { timeout: 40_000 });
  await page.waitForFunction(() => !!(window as any).DhiStore, null, { timeout: 30_000 }); // done.html starts its scripts after the guard
  expect(await page.evaluate(() => (window as any).DhiStore.get().completedAt)).toBeTruthy();
});

test("covers AC-7: a Finish that worked on the server but timed out on the device still opens the done page, with the saved result", async ({ page }) => {
  await finishedCheck(page);
  await page.evaluate(() => {
    // what a timed out Finish leaves on the device: every answer, but no finished time
    const c = JSON.parse(localStorage.getItem("dhirise.session.v1") as string);
    c.completedAt = null;
    localStorage.setItem("dhirise.session.v1", JSON.stringify(c));
    localStorage.removeItem("dhirise.result.v1");
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PATH + "done.html");
  await expect(page.locator("#see:not([hidden])")).toBeVisible({ timeout: 40_000 });
  await expect(page).toHaveURL(/\/done\.html$/);
  expect(await page.evaluate(() => (window as any).DhiStore.get().completedAt)).toBeTruthy(); // the server told the device
  expect(await page.evaluate((k) => localStorage.getItem(k) !== null, RESULT_KEY)).toBe(true);
});

test("covers AC-7: all 18 answers saved but the check not finished on the server sends the student back to question 18, not to a result", async ({ page }) => {
  await newStudent(page);
  await openQuestion(page, 1);
  await page.evaluate(() => {
    const s = (window as any).DhiStore;
    for (let n = 1; n <= 18; n++) s.answer(n, `q${n}o2`);
  });
  await waitSaved(page);
  await page.goto(PATH + "done.html");
  await expect(page).toHaveURL(/questions\.html\?q=18$/, { timeout: 40_000 });
  expect(await dhiKeys(page)).not.toContain(RESULT_KEY);
});

test("covers AC-10: a damaged copy on the device is dropped and the server's result is used, so the page is never blank", async ({ page }) => {
  await finishedCheck(page);
  await saveLead(page);
  const real = await readReport(page);
  for (const damage of ["areas", "top", "flags", "dhiStart"]) {
    await page.evaluate(
      ([k, part]) => {
        const c = JSON.parse(localStorage.getItem(k as string) as string);
        delete c.result[part as string];
        localStorage.setItem(k as string, JSON.stringify(c));
      },
      [RESULT_KEY, damage],
    );
    expect(await readReport(page), damage).toEqual(real);
    const healed = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) as string).result, RESULT_KEY);
    expect(healed.areas && healed.top && healed.flags && typeof healed.dhiStart === "number", damage).toBeTruthy(); // the copy was replaced by a whole one
  }
  await page.evaluate((k) => localStorage.setItem(k, "{not json"), RESULT_KEY);
  expect(await readReport(page)).toEqual(real);
});
