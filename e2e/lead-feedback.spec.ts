// The phone step and the report feedback (specs 0003 and 0004), through the real pages.
import { expect, test } from "@playwright/test";
import { PATH, finishedCheck, openPhoneStep, submitPhone } from "./helpers";

const NOTE = "The study blueprint really fits how I revise before exams.";
const cache = (page: import("@playwright/test").Page) => page.evaluate(() => JSON.parse(localStorage.getItem("dhirise.session.v1") || "{}"));

test("covers AC-6: offline, the phone step shows a kind retry and keeps the number; back online it saves and thanks", async ({ page, context }) => {
  await finishedCheck(page);
  await openPhoneStep(page);
  await context.setOffline(true);
  await submitPhone(page, "9876543210");
  await expect(page.locator("#formErr")).toContainText("could not save your number", { timeout: 30_000 });
  await expect(page.locator("#phone")).toHaveValue("987 654 3210");
  await expect(page.locator("#thanks")).toBeHidden();
  await context.setOffline(false);
  await page.locator("#submit").click();
  await expect(page.locator("#thanks")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/who\.html$/, { timeout: 30_000 });
  expect((await cache(page)).leadSavedAt).toBeTruthy();
});

test("covers AC-2, AC-6: a bad number is refused on the page, and a minor must tick the guardian box", async ({ page }) => {
  await finishedCheck(page, undefined, "Mira Minor", 15);
  await openPhoneStep(page);
  await expect(page.locator("#guardianRow")).toBeVisible();
  await submitPhone(page, "5876543210", { guardian: true });
  await expect(page.locator("#phoneErr")).toContainText("valid 10-digit");
  await page.locator("#guardian").uncheck();
  await submitPhone(page, "9876543210");
  await expect(page.locator("#formErr")).toContainText("parent or guardian");
  await expect(page.locator("#thanks")).toBeHidden();
  expect((await cache(page)).leadSavedAt).toBeFalsy();
});

test("covers AC-6, AC-8, AC-10: with the number saved the step is skipped, and feedback is saved once and shown as thanks on every visit", async ({ page }) => {
  await finishedCheck(page);
  await openPhoneStep(page);
  await submitPhone(page, "9876543210");
  await expect(page).toHaveURL(/\/who\.html$/, { timeout: 30_000 });

  // a student whose number is saved skips the phone step
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PATH + "done.html");
  await page.locator("#see:not([hidden])").waitFor({ timeout: 30_000 });
  await page.evaluate(() => (document.getElementById("see") as HTMLButtonElement).click());
  await page.evaluate(() => (document.getElementById("unlock") as HTMLButtonElement).click());
  await expect(page).toHaveURL(/\/who\.html$/);

  // the report, then the feedback card: a short note is stopped on the page, a real one is saved on the server
  await page.goto(PATH + "report-student.html");
  await expect(page.locator("#report h1").first()).toContainText("Mind & Study Profile");
  await page.waitForFunction(() => !!JSON.parse(localStorage.getItem("dhirise.session.v1") || "{}").reportSeenAt, null, { timeout: 30_000 });
  const card = page.locator(".card.feedback");
  await card.scrollIntoViewIfNeeded();
  await card.locator(".star").nth(3).click();
  await card.locator("textarea").fill("too short");
  await card.getByRole("button", { name: "Submit" }).click();
  await expect(card.locator(".fb-hint")).toContainText("at least 30");
  await card.locator("textarea").fill(NOTE);
  await card.getByRole("button", { name: "Submit" }).click();
  await expect(card.locator(".thanks")).toHaveText("Thank you.", { timeout: 30_000 });
  await expect(card.locator("textarea")).toHaveCount(0);
  expect((await cache(page)).feedbackSavedAt).toBeTruthy();

  // another visit: thanks, not the form
  await page.reload();
  await expect(page.locator(".card.feedback .thanks")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".card.feedback textarea")).toHaveCount(0);
});

test("covers AC-13: the pages hold no old Sheet post and no old local copies of the lead or feedback", async ({ page }) => {
  await finishedCheck(page);
  await openPhoneStep(page);
  await submitPhone(page, "9876543210");
  await expect(page).toHaveURL(/\/who\.html$/, { timeout: 30_000 });
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).not.toContain("dhirise.lead.v1");
  expect(keys).not.toContain("dhirise.reportFeedback.v1");
});
