// The privacy page (spec 0007): it opens for anyone, reads well on a phone, and the landing consent sheet links to it.
import { expect, test } from "@playwright/test";
import { PATH } from "./helpers";

test("covers AC-1, AC-2, AC-3: the page opens without signing in, names the services, and fits a phone", async ({ page }) => {
  const res = await page.goto(PATH + "privacy.html");
  expect(res?.status()).toBe(200);
  await expect(page.locator("main h1")).toHaveText("Privacy at DhiRise");
  await expect(page.locator("main h2")).toHaveCount(8);
  const text = await page.locator("main").innerText();
  for (const w of ["Cloudflare Browser Run", "Convex", "Google", "PDF copy"]) expect(text).toContain(w);
  const mails = await page.locator('a[href^="mailto:"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(mails.length).toBeGreaterThanOrEqual(2);
  for (const m of mails) expect(m).toBe("mailto:privacy@dhirise.com");
  // no sideways scrolling at phone width
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test("covers AC-5: the landing consent sheet has a link to the privacy page that opens in a new tab", async ({ page }) => {
  await page.goto(PATH + "landing.html");
  await expect(page.locator("#stSignedOut")).toBeVisible();
  await page.click("#readNotice");
  await expect(page.locator("#sheetDim")).toBeVisible();
  const link = page.locator(".sheet-privacy a");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "privacy.html");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(page.locator("#consentLines p")).toHaveCount(7); // the notice itself is unchanged by the link: consent v3 has seven lines
});
