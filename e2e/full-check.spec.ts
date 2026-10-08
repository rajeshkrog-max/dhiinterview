// The whole check from the form to the report, and finishing (spec 0002, AC-4, AC-7). One student, the real pages.
import { expect, test } from "@playwright/test";
import { PATH, newStudent, openPhoneStep, openQuestion, signIn, newTag, submitPhone, waitSaved } from "./helpers";

const fill = (page: import("@playwright/test").Page, from: number, to: number) =>
  page.evaluate(([a, b]) => {
    const s = (window as any).DhiStore;
    for (let n = a; n <= b; n++) s.answer(n, `q${n}o2`);
  }, [from, to]);

test("covers AC-2, AC-3, AC-4, AC-7: form, question 1, the Finish button, the report, then Continue as resumes at the report", async ({ page }) => {
  // the form, through the real controls (a minor, so the guardian tick is needed)
  await signIn(page, newTag());
  await page.fill("#name", "Mira Full");
  await page.fill("#age", "17");
  await page.selectOption("#cls", "Class 12");
  await page.evaluate(() => (document.getElementById("consent") as HTMLInputElement).click());
  await page.evaluate(() => {
    const b = document.getElementById("sheetBody") as HTMLElement;
    b.scrollTop = 99999;
    b.dispatchEvent(new Event("scroll"));
  });
  await page.evaluate(() => (document.getElementById("agree") as HTMLButtonElement).click());
  await page.evaluate(() => (document.getElementById("guardian") as HTMLInputElement).click());
  await page.evaluate(() => (document.getElementById("form") as HTMLFormElement).requestSubmit());
  await expect(page).toHaveURL(/\/meet\.html$/, { timeout: 40_000 });

  // meet → question 1 by tapping an option
  // the page is shown before its own script has attached the button, so retry the tap until it takes
  await expect(async () => {
    await page.evaluate(() => (document.getElementById("start") as HTMLButtonElement).click());
    await expect(page).toHaveURL(/\/question\.html$/, { timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.locator("#options button")).toHaveCount(4);
  await page.locator("#options button").nth(2).click();
  await expect(page.locator("#dhiSaveMark")).toHaveText("Saved", { timeout: 20_000 });

  // 2 to 17 quickly, 18 by the real Finish button
  await fill(page, 2, 17);
  await waitSaved(page);
  await openQuestion(page, 18);
  await page.locator("#options button").nth(3).click();
  await expect(page.locator("#next")).toBeEnabled({ timeout: 20_000 }); // opens after the tip has been read
  await expect(page.locator("#next")).toHaveText("Finish");
  await page.locator("#next").click();
  await expect(page).toHaveURL(/\/done\.html$/, { timeout: 40_000 });

  // without a saved number, the story and the report send the student back to the phone step (spec 0003, AC-7)
  for (const p of ["who.html", "report-student.html"]) {
    await page.goto(PATH + p);
    await expect(page, p).toHaveURL(/\/done\.html$/);
  }

  // the phone step (a minor, so the guardian tick is needed), then the story opens
  await openPhoneStep(page);
  await submitPhone(page, "9876543210", { guardian: true });
  await expect(page.locator("#thanks")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/who\.html$/, { timeout: 30_000 });

  // the later pages open now; the report is marked seen on the server
  for (const p of ["challenge.html", "leaderboard.html"]) {
    await page.goto(PATH + p);
    await expect(page, p).toHaveURL(new RegExp(p.replace(".", "\\.") + "$"));
  }
  await page.goto(PATH + "report-student.html");
  await expect(page.locator("#report h1").first()).toContainText("Mind & Study Profile");
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem("dhirise.session.v1") || "{}").reportSeenAt, null, { timeout: 30_000 });

  // landing offers Continue as, never an automatic redirect, and goes to the report
  await page.goto(PATH + "landing.html");
  await expect(page.locator("#back")).toBeVisible();
  await expect(page).toHaveURL(/landing\.html$/);
  await page.evaluate(() => (document.getElementById("continueAs") as HTMLButtonElement).click());
  await expect(page).toHaveURL(/\/report-student\.html$/);
});

test("covers AC-7: Finish offline says Connect to finish, and works once the connection is back", async ({ page, context }) => {
  await newStudent(page);
  await openQuestion(page, 1);
  await fill(page, 1, 17);
  await waitSaved(page);
  await openQuestion(page, 18);
  await page.locator("#options button").nth(1).click();
  await expect(page.locator("#next")).toBeEnabled({ timeout: 20_000 });
  await waitSaved(page);
  await context.setOffline(true);
  await page.locator("#next").click();
  await expect(page.locator("#next")).toHaveText("Connect to finish", { timeout: 30_000 });
  await expect(page).toHaveURL(/questions\.html\?q=18$/);
  await context.setOffline(false);
  await page.locator("#next").click();
  await expect(page).toHaveURL(/\/done\.html$/, { timeout: 40_000 });
});

test("covers AC-7: after finishing, an answer change is refused, the student is told, and the server keeps the old answer", async ({ page }) => {
  await newStudent(page);
  await openQuestion(page, 1);
  await fill(page, 1, 18);
  await waitSaved(page);
  expect(await page.evaluate(() => (window as any).DhiSession.finish())).toEqual({ ok: true });
  await page.evaluate(() => (window as any).DhiStore.answer(3, "q3o4"));
  await expect(page.locator("#dhiSaveMark")).toContainText("could not be saved", { timeout: 20_000 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => (window as any).DhiStore?.get().answers.q3), { timeout: 30_000 }).toBe("q3o2");
});

test("covers AC-7: finishing with an answer missing on the server is refused and finishing twice is harmless", async ({ page }) => {
  await newStudent(page);
  await openQuestion(page, 1);
  await fill(page, 1, 17);
  await waitSaved(page);
  expect(await page.evaluate(() => (window as any).DhiSession.finish())).toEqual({ ok: false, code: "answers_missing" });
  await fill(page, 18, 18);
  expect(await page.evaluate(() => (window as any).DhiSession.finish())).toEqual({ ok: true });
  expect(await page.evaluate(() => (window as any).DhiSession.finish())).toEqual({ ok: true });
});
