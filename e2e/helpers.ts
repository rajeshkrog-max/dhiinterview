// Shared steps for the browser flow tests. Every student is a fresh fake account (dev only).
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const PATH = "/dhiinterviews/";

// A short unique tag, letters and digits only (the test sign in builds the email from it).
export const newTag = () => "e2e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Opens the landing page with the fake sign in button and uses it. Resolves once the server has answered.
export async function signIn(page: Page, tag: string): Promise<"needsProfile" | "ready"> {
  await page.goto(`${PATH}landing.html?test=${tag}`);
  await page.locator("#testBtn:not([hidden])").waitFor();
  await page.evaluate(() => (document.getElementById("testBtn") as HTMLButtonElement).click());
  await page.waitForFunction(() => ["needsProfile", "ready"].includes((window as any).DhiSession.state), null, { timeout: 40_000 });
  return page.evaluate(() => (window as any).DhiSession.state);
}

// A signed in student with a finished form (age 20, no guardian needed).
export async function newStudent(page: Page, tag = newTag(), name = "Eli Tester", age = 20) {
  await signIn(page, tag);
  const res = await page.evaluate(
    async ([n, a]) => (window as any).DhiSession.createProfile({ name: n, age: a, class: "College", guardianPresent: (a as number) < 18 }),
    [name, age] as const,
  );
  expect(res).toEqual({ ok: true });
  return tag;
}

export async function newContext(browser: Browser, opts: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 390, height: 800 }, ...opts });
}

// Opens a question page and waits for the guard to let it through and the engine to draw the options.
export async function openQuestion(page: Page, n = 1) {
  await page.goto(PATH + (n === 1 ? "question.html" : n === 2 ? "question2.html" : `questions.html?q=${n}`));
  await expect(page.locator("#options button")).toHaveCount(4);
  await page.waitForFunction(() => !document.documentElement.classList.contains("dhi-pending"));
  // the guard reveals the page first and starts the page's own scripts after, so wait until the engine has drawn the question
  // The static page already holds the question and the options in the written order, so their text proves nothing.
  // music.js is the last script on a question page (after the one that shuffles and draws the options).
  await page.waitForFunction(() => !!(window as any).DhiStore && !!(window as any).DhiMusic);
}

// A finished check: a signed in student with all 18 answers saved and the check completed. Lands on done.html.
export async function finishedCheck(page: Page, tag = newTag(), name = "Eli Tester", age = 20) {
  await newStudent(page, tag, name, age);
  await openQuestion(page, 1);
  await page.evaluate(() => {
    const s = (window as any).DhiStore;
    for (let n = 1; n <= 18; n++) s.answer(n, `q${n}o2`);
  });
  await waitSaved(page);
  expect(await page.evaluate(() => (window as any).DhiSession.finish())).toEqual({ ok: true });
  return tag;
}

// On done.html: skips the reveal and opens the phone step. Reduced motion makes the "See your result" button appear quickly.
export async function openPhoneStep(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(PATH + "done.html");
  await page.locator("#see:not([hidden])").waitFor({ timeout: 30_000 });
  await page.evaluate(() => (document.getElementById("see") as HTMLButtonElement).click());
  await page.evaluate(() => (document.getElementById("unlock") as HTMLButtonElement).click());
}

// Types a number into the phone step and taps Submit (the guardian box too, when asked).
export async function submitPhone(page: Page, phone = "9876543210", opts: { guardian?: boolean } = {}) {
  await page.fill("#phone", phone);
  if (opts.guardian) await page.locator("#guardian").check();
  await page.locator("#submit").click();
}

export const answersOnDevice = (page: Page) => page.evaluate(() => (window as any).DhiStore.get().answers as Record<string, string>);
export const waitSaved = (page: Page) => page.waitForFunction(() => (window as any).DhiSession.pendingCount() === 0, null, { timeout: 30_000 });
export const sessionBody = (page: Page) => page.evaluate(async () => (await (await fetch("/api/auth/get-session")).text()).slice(0, 12));
export const dhiKeys = (page: Page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("dhirise.")));
