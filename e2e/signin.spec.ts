// Sign in, the guard, the form, resume on a second device, the offline queue and the sign in problem screens
// (spec 0002, AC-1 to AC-5, AC-12, AC-15, AC-16). Runs on the dev deployment with the fake test sign in.
import { expect, test } from "@playwright/test";
import { PATH, answersOnDevice, newContext, newStudent, newTag, openQuestion, signIn, waitSaved } from "./helpers";

const PROTECTED = ["questions.html?q=5", "question.html", "question2.html", "meet.html", "done.html", "who.html", "report-student.html", "challenge.html", "leaderboard.html"];

test.describe("the guard (AC-1)", () => {
  test("covers AC-1: a visitor with no session is sent to landing from every page after it, and terms stays public", async ({ page }) => {
    for (const p of PROTECTED) {
      await page.goto(PATH + p);
      await expect(page, p).toHaveURL(/\/landing\.html$/);
    }
    await page.goto(PATH + "terms.html");
    await expect(page).toHaveURL(/\/terms\.html$/);
  });

  test("covers AC-1: a signed in student who has not finished the form is also sent to landing", async ({ page }) => {
    await signIn(page, newTag());
    for (const p of ["questions.html?q=5", "meet.html", "report-student.html"]) {
      await page.goto(PATH + p);
      await expect(page, p).toHaveURL(/\/landing\.html$/);
    }
  });
});

test.describe("the form and the profile (AC-3)", () => {
  test("covers AC-2 and AC-3: the form shows the Google name, enforces its rules, needs the guardian tick under 18, and opens meet.html", async ({ page }) => {
    await signIn(page, newTag());
    await expect(page.locator("#form")).toBeVisible();
    await expect(page.locator("#name")).toHaveValue("Test Student"); // prefilled from the account, editable

    await page.fill("#name", "Eli    Tester");
    await page.selectOption("#cls", "Class 9");
    for (const bad of ["9", "26"]) {
      await page.fill("#age", bad);
      await page.evaluate(() => (document.getElementById("form") as HTMLFormElement).requestSubmit());
      await expect(page.locator("#ageErr")).toHaveText("Age should be between 10 and 25.");
    }
    await page.fill("#age", "15");
    await expect(page.locator("#guardianRow")).toBeVisible();

    // "I agree" stays locked until the sheet is read to the end
    await page.evaluate(() => (document.getElementById("consent") as HTMLInputElement).click());
    await expect(page.locator("#sheetDim")).toBeVisible();
    await expect(page.locator("#agree")).toHaveAttribute("aria-disabled", "true");
    await page.evaluate(async () => {
      const b = document.getElementById("sheetBody") as HTMLElement;
      b.scrollTop = 99999;
      b.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator("#agree")).toHaveAttribute("aria-disabled", "false");
    await page.evaluate(() => (document.getElementById("agree") as HTMLButtonElement).click());

    // without the guardian tick the form does not go through
    await page.evaluate(() => (document.getElementById("form") as HTMLFormElement).requestSubmit());
    await expect(page.locator("#guardianErr")).toContainText("parent or guardian");
    await expect(page).toHaveURL(/landing\.html/);

    await page.evaluate(() => (document.getElementById("guardian") as HTMLInputElement).click());
    await page.evaluate(() => (document.getElementById("form") as HTMLFormElement).requestSubmit());
    await expect(page).toHaveURL(/\/meet\.html$/, { timeout: 40_000 });
    const profile = await page.evaluate(() => JSON.parse(localStorage.getItem("dhirise.session.v1") || "{}").profile); // meet.html does not load the store
    expect(profile).toEqual({ name: "Eli Tester", age: 15, class: "Class 9" }); // spaces collapsed
  });

  test("covers AC-3: the consent notice beside the Google button opens read only and shows the version text", async ({ page }) => {
    await page.goto(PATH + "landing.html");
    await expect(page.locator("#stSignedOut")).toBeVisible();
    await expect(page.locator(".notice")).toContainText("name, age, class and the email of your Google account");
    await page.click("#readNotice");
    await expect(page.locator("#sheetDim")).toBeVisible();
    await expect(page.locator("#agree")).toBeHidden(); // read only: nothing to agree to yet
    await expect(page.locator("#consentLines")).toHaveAttribute("data-version", "v1");
    await expect(page.locator("#consentLines p")).toHaveCount(5);
  });
});

test.describe("resume on a second device (AC-4, AC-5)", () => {
  test("covers AC-4 and AC-5: answers saved on one device resume on another, at the right question, in the same option order", async ({ page, browser }) => {
    const tag = await newStudent(page);
    await openQuestion(page, 1);
    const optionsA = await page.locator("#options button").allTextContents();
    await page.evaluate(() => {
      const s = (window as any).DhiStore;
      s.answer(1, "q1o3");
      s.answer(2, "q2o1");
      s.answer(3, "q3o4");
    });
    await waitSaved(page);

    const ctxB = await newContext(browser);
    const b = await ctxB.newPage();
    await signIn(b, tag);
    await expect(b.locator("#back")).toBeVisible(); // "Continue as", no automatic redirect
    await expect(b).toHaveURL(/landing\.html/);
    await expect(b.locator("#continueAs")).toContainText("Eli Tester");
    await b.evaluate(() => (document.getElementById("continueAs") as HTMLButtonElement).click());
    await expect(b).toHaveURL(/questions\.html\?q=4$/);

    await openQuestion(b, 1);
    expect(await b.locator("#options button").allTextContents()).toEqual(optionsA);
    expect(await answersOnDevice(b)).toEqual({ q1: "q1o3", q2: "q2o1", q3: "q3o4" });
    expect(await b.locator('#options button[aria-checked="true"]').count()).toBe(1);
    await ctxB.close();
  });

  test("covers AC-4: signing in again on another device never starts a second check", async ({ page, browser }) => {
    const tag = await newStudent(page);
    const ctxB = await newContext(browser);
    const b = await ctxB.newPage();
    expect(await signIn(b, tag)).toBe("ready"); // the same account is a returning student, not needsProfile
    const check = await b.evaluate(() => (window as any).DhiStore.get());
    const first = await page.evaluate(() => (window as any).DhiStore.get());
    expect(check.seed).toBe(first.seed);
    await ctxB.close();
  });

  test("covers AC-5: answers given offline wait on the device, the last choice per question wins, and everything is sent when back online", async ({ page, browser, context }) => {
    const tag = await newStudent(page);
    await openQuestion(page, 1);
    await context.setOffline(true);
    await page.evaluate(() => {
      const s = (window as any).DhiStore;
      s.answer(4, "q4o2");
      s.answer(5, "q5o1");
      s.answer(4, "q4o3"); // changed before it was ever sent
    });
    await expect(page.locator("#dhiSaveMark")).toContainText("Offline");
    expect(await page.evaluate(() => (window as any).DhiSession.pendingCount())).toBe(2);
    await context.setOffline(false);
    await waitSaved(page);
    await expect(page.locator("#dhiSaveMark")).toHaveText("Saved");

    const ctxB = await newContext(browser);
    const b = await ctxB.newPage();
    await signIn(b, tag);
    expect(await answersOnDevice(b)).toEqual({ q4: "q4o3", q5: "q5o1" });
    await ctxB.close();
  });
});

test.describe("sign in problems (AC-12)", () => {
  test("covers AC-12: inside an in app browser (Instagram) the page says to open Chrome or Safari and offers a copy link button", async ({ browser }) => {
    const ctx = await newContext(browser, {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0",
    });
    const p = await ctx.newPage();
    await p.goto(PATH + "landing.html");
    await expect(p.locator("#stBlocked")).toBeVisible();
    await expect(p.locator("#stBlocked")).toContainText("Open this page in Chrome or Safari");
    await expect(p.locator("#stSignedOut")).toBeHidden();
    await expect(p.locator("#copyLink")).toBeVisible();
    await ctx.close();
  });

  test("covers AC-12: cancelling at Google comes back with a plain kind message and the button again", async ({ page }) => {
    await page.goto(PATH + "landing.html?signin=error&error=access_denied");
    await expect(page.locator("#signMsg")).toHaveText("No problem. You can try again whenever you like.");
    await expect(page.locator("#google")).toBeVisible();
    await expect(page).toHaveURL(/landing\.html$/); // the return parameters are cleaned from the address
  });

  test("covers AC-12: any other return error shows a kind message that mentions test users", async ({ page }) => {
    await page.goto(PATH + "landing.html?signin=error&error=unable_to_create_user");
    await expect(page.locator("#signMsg")).toContainText("test user");
  });
});

test.describe("a slow or missing connection (AC-16)", () => {
  test("covers AC-16: with a copy on the device, a slow session check does not send the student away and the page appears", async ({ page }) => {
    await newStudent(page);
    await page.route("**/api/auth/get-session", async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.continue();
    });
    await page.goto(PATH + "meet.html", { waitUntil: "commit" });
    await expect(page.locator("html")).not.toHaveClass(/dhi-pending/, { timeout: 4000 }); // shown from the copy, before the server answers
    await page.waitForTimeout(6000);
    await expect(page).toHaveURL(/\/meet\.html$/);
  });

  test("covers AC-16: with a copy on the device and the server unreachable, the quiz page still works", async ({ page }) => {
    await newStudent(page);
    await page.route("**/api/auth/get-session", (route) => route.abort());
    await openQuestion(page, 1);
    await expect(page).toHaveURL(/\/question\.html$/);
    expect(await page.evaluate(() => (window as any).DhiSession.state)).toBe("unknown");
    await page.locator("#options button").first().click();
    await expect(page.locator('#options button[aria-checked="true"]')).toHaveCount(1);
  });

  test("covers AC-16: with no copy and the server unreachable, the page asks to check the connection instead of redirecting", async ({ browser }) => {
    const ctx = await newContext(browser);
    const p = await ctx.newPage();
    await p.route("**/api/auth/get-session", (route) => route.abort());
    await p.goto(PATH + "question.html");
    await expect(p.locator("#dhiBoot")).toContainText("We could not reach DhiRise");
    await expect(p).toHaveURL(/\/question\.html$/);
    await ctx.close();
  });
});
