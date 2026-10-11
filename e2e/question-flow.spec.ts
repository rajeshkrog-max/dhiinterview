// All 18 questions are one page: Next and Back swap the question and blur fade the background in place, the page never
// reloads, so the music keeps playing. The address still follows the question (question.html, question2.html, questions.html?q=N).
import { expect, test } from "@playwright/test";
import { newStudent, openQuestion, waitSaved } from "./helpers";

const heading = (page: import("@playwright/test").Page) => page.locator("#qText").innerText();
// the layer that is showing: the one with the highest opacity whose image is set
const shownImage = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const layers = Array.from(document.querySelectorAll<HTMLElement>("#qbg i"));
    const on = layers.filter((l) => l.style.backgroundImage && Number(getComputedStyle(l).opacity) > 0.99);
    return on.map((l) => decodeURIComponent(l.style.backgroundImage)).join("|");
  });

test("moving between questions does not reload the page, so the music is not restarted", async ({ page }) => {
  await newStudent(page);
  // answers already saved for 1 to 4, so Next is open at once (a fresh answer makes Next wait 10 seconds)
  await openQuestion(page, 1);
  await page.evaluate(() => {
    const s = (window as any).DhiStore;
    for (let n = 1; n <= 4; n++) s.answer(n, `q${n}o2`);
  });
  await waitSaved(page);
  await openQuestion(page, 1);

  // marks that survive only while this very page document stays alive
  await page.evaluate(() => {
    (window as any).__sameDocument = "yes";
    (window as any).__music = (window as any).DhiMusic;
    (window as any).__loads = 0;
    window.addEventListener("pagehide", () => ((window as any).__loads = 1));
  });
  const q1 = await heading(page);
  await expect.poll(() => shownImage(page)).toContain("Q1.png");

  await page.locator("#next").click();
  await expect(page).toHaveURL(/question2(\.html)?$/);
  await expect.poll(() => heading(page)).not.toBe(q1);
  await expect(page.locator("#step")).toHaveText("2 / 18");
  await expect.poll(() => shownImage(page)).toContain("Q2.png");   // the blur fade ends with the new image fully on screen

  // question 2 has no saved answer, so go on from 3 by address-free steps: back then forward
  await page.locator("#back").click();
  await expect(page).toHaveURL(/question(\.html)?$/);
  await expect(page.locator("#step")).toHaveText("1 / 18");
  expect(await heading(page)).toBe(q1);
  await expect.poll(() => shownImage(page)).toContain("Q1.png");
  // Q1 comes back with its saved answer marked and Next open
  await expect(page.locator("#options button[aria-checked='true']")).toHaveCount(1);
  await expect(page.locator("#next")).toBeEnabled();

  // the browser's Back and Forward walk the same way
  await page.locator("#next").click();
  await expect(page.locator("#step")).toHaveText("2 / 18");
  await page.goBack();
  await expect(page.locator("#step")).toHaveText("1 / 18");
  await page.goForward();
  await expect(page.locator("#step")).toHaveText("2 / 18");

  // the same document the whole time, and the same music object
  expect(await page.evaluate(() => (window as any).__sameDocument)).toBe("yes");
  expect(await page.evaluate(() => (window as any).__music === (window as any).DhiMusic)).toBe(true);
  expect(await page.evaluate(() => (window as any).__loads)).toBe(0);
  expect(await page.evaluate(() => performance.getEntriesByType("navigation").length)).toBe(1);
});

test("a reload or a direct address opens the question the address names", async ({ page }) => {
  await newStudent(page);
  for (const n of [2, 9, 18]) {
    await openQuestion(page, n);
    await expect(page.locator("#step")).toHaveText(`${n} / 18`);
    await expect.poll(() => shownImage(page)).toContain(`Q${n}.png`);
    await page.reload();
    await expect(page.locator("#step")).toHaveText(`${n} / 18`);
  }
  await expect(page.locator("#next")).toHaveText("Finish");
});

test("a picture that fails to load keeps the old picture and the page keeps working", async ({ page }) => {
  await newStudent(page);
  await openQuestion(page, 1);
  await page.evaluate(() => {
    const s = (window as any).DhiStore;
    s.answer(1, "q1o2");
  });
  await waitSaved(page);
  await openQuestion(page, 1);
  await page.route("**/interview%20bg/Q2.png", (r) => r.abort());
  await page.route("**/interview bg/Q2.png", (r) => r.abort());
  await page.locator("#next").click();
  await expect(page.locator("#step")).toHaveText("2 / 18");
  await expect.poll(() => shownImage(page)).toContain("Q1.png");
  await expect(page.locator("#options button")).toHaveCount(4);
});

test("the clean addresses (no .html, as Pages can serve them) work too, including a reload after moving on", async ({ page }) => {
  await newStudent(page);
  await openQuestion(page, 4);
  await page.evaluate(() => (window as any).DhiStore.answer(4, "q4o2"));
  await waitSaved(page);
  await page.goto("/dhiinterviews/questions?q=4");
  await expect(page.locator("#step")).toHaveText("4 / 18");
  await expect(page.locator("#next")).toBeEnabled();
  await page.locator("#next").click();
  await expect(page.locator("#step")).toHaveText("5 / 18");
  await expect(page).toHaveURL(/questions(\.html)?\?q=5$/);
  await page.goBack();
  await expect(page.locator("#step")).toHaveText("4 / 18");
  await page.goForward();
  await page.reload();
  await expect(page.locator("#step")).toHaveText("5 / 18");
  await page.goto("/dhiinterviews/question2");
  await expect(page.locator("#step")).toHaveText("2 / 18");
});
