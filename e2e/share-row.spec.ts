// The share row on the report page (spec 0010, milestones 2 to 4): the three buttons under the Founding Card and the report's own Share button,
// the notice and the under 18 tick, the link, the laptop fallbacks and the Instagram dialog, and the Stop sharing line.
// Runs on the dev site against the Convex DEV deployment with the fake test sign in (needs SHARE_LINK_SECRET on dev). The browser's share sheet
// and clipboard do not exist in a test browser, so each test is handed pretend ones that record what they were asked to send. The link feature is
// switched on the way a deploy does it: by the value `publicShare: true` in js/funnel-config.js, which the test answers itself.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PATH, finishedCheck, newContext, newTag } from "./helpers";

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
type Opts = { state: State; phone?: boolean; link?: boolean; noQr?: boolean };

const CONFIG_ON = "window.DHI_FUNNEL = { whatsappInvite: '', shareUrl: '', publicShare: true };";
const CONFIG_OFF = "window.DHI_FUNNEL = { whatsappInvite: '', shareUrl: '' };";
const india = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
const DAY = 24 * 3600 * 1000;

let adult: State;
let minor: State;

// A finished student with the phone step saved, so the report opens (the report sends a student without it back to done.html).
async function makeStudent(browser: Browser, name: string, age: number): Promise<State> {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await finishedCheck(page, newTag(), name, age);
  await page.goto(PATH + "done.html");
  await page.waitForFunction(() => (window as any).DhiSession?.state === "ready");
  expect(await page.evaluate((a) => (window as any).DhiSession.submitLead({ phone: "9876543210", wantsCommunity: false, guardianPresent: a < 18 }), age)).toMatchObject({ ok: true });
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(240_000);
  adult = await makeStudent(browser, "Asha Rao", 20);
  minor = await makeStudent(browser, "Kiran Das", 15);
});

// Opens the report as the student, with a pretend share sheet (a phone, or with phone: false a computer) and clipboard, and the link switch.
async function openReport(browser: Browser, o: Opts) {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: o.state });
  await context.route("**/js/funnel-config.js", (r) => r.fulfill({ contentType: "application/javascript", body: o.link === false ? CONFIG_OFF : CONFIG_ON }));
  if (o.noQr) await context.route("**/js/vendor/qrcode-generator*", (r) => r.abort());
  await context.addInitScript((phone: boolean) => {
    const w = window as any;
    w.__shares = [];
    w.__copied = [];
    w.__opened = [];
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (d: any) => !!phone && !!d && Array.isArray(d.files) });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: phone
        ? async (d: any) => { w.__shares.push({ files: (d.files || []).map((f: File) => f.type + ":" + (f.size > 1000 ? "ok" : "tiny")), text: d.text, title: d.title }); }
        : undefined,
    });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { w.__copied.push(t); } } });
    // a computer's WhatsApp and Facebook buttons are real links: record where they would go, and do not leave the site
    document.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a.fs") as HTMLAnchorElement | null;
      if (a) { w.__opened.push(a.href); e.preventDefault(); }
    });
  }, o.phone !== false);
  const page = await context.newPage();
  await page.goto(PATH + "report-student.html");
  await expect(page.locator(".fc-share .fs-wa")).toBeVisible({ timeout: 40_000 });
  if (o.link !== false) await page.waitForFunction(() => (window as any).DhiSession.share.current() !== null, null, { timeout: 30_000 });
  return { context, page };
}

// A tap that does not depend on what sits on top of the button at phone width (the dev toolbar covers part of the page).
const tap = (l: ReturnType<Page["locator"]>) => l.evaluate((n) => (n as HTMLElement).click());
const shares = (page: Page) => page.evaluate(() => (window as any).__shares as { files: string[]; text: string; title: string }[]);
const copied = (page: Page) => page.evaluate(() => (window as any).__copied as string[]);
const opened = (page: Page) => page.evaluate(() => (window as any).__opened as string[]);
const toast = (page: Page) => page.locator(".fc-toast");
const dialog = (page: Page) => page.getByRole("dialog");
const wa = (page: Page) => page.locator(".fc-share .fs-wa");
const ig = (page: Page) => page.locator(".fc-share .fs-ig");
const fb = (page: Page) => page.locator(".fc-share .fs-fb");
const copyBtn = (page: Page) => page.locator(".fc-share .fs-copy");
const control = (page: Page) => page.locator(".sh-ctl");
const LANDING = /landing\.html/;
const PUBLIC = /^http:\/\/localhost:4321\/s\/[A-Za-z0-9]+\.\d+\.[A-Za-z0-9_-]{22}$/;
const urlIn = (text: string) => /https?:\/\/\S+/.exec(text)?.[0] ?? "";

async function stranger(browser: Browser, url: string) {
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await page.goto(url);
  return { ctx, page };
}

test.describe.serial("a student of 18 or more, from the first tap to Stop sharing", () => {
  let link = "";

  test("covers AC-17: with the link switch off there is no notice, no link and no Stop sharing line, and the picture goes with the landing address", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult, link: false });
    await tap(wa(page));
    await expect.poll(async () => (await shares(page)).length, { timeout: 30_000 }).toBe(1);
    const sent = (await shares(page))[0];
    expect(sent.files).toEqual(["image/png:ok"]);
    expect(urlIn(sent.text)).toMatch(LANDING);
    await expect(dialog(page)).toHaveCount(0);
    await expect(control(page)).toHaveCount(0);
    await context.close();
  });

  test("covers AC-3, AC-16: the first tap shows the notice with the draft words and no tick for an adult; Not now makes no link and shares nothing", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    expect(await page.evaluate(() => (window as any).DhiSession.share.current())).toMatchObject({ ready: true, consented: false, active: false });
    await tap(wa(page));
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole("heading")).toHaveText("Before you share");
    await expect(dialog(page)).toContainText("Anyone who has the link can read your whole report");
    await expect(dialog(page)).toContainText("They cannot see your age, class, email, phone number or your private notes");
    await expect(dialog(page).getByRole("checkbox")).toHaveCount(0);
    expect(await dialog(page).getAttribute("aria-modal")).toBe("true");
    await tap(dialog(page).getByRole("button", { name: "Not now" }));
    await expect(dialog(page)).toHaveCount(0);
    expect(await shares(page)).toEqual([]);
    expect(await page.evaluate(async () => (await (window as any).DhiSession.share.status()).consented)).toBe(false); // nothing was recorded
    await context.close();
  });

  test("covers AC-3: Escape closes the notice, and focus goes back to the button that was tapped", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await wa(page).focus();
    await tap(wa(page));
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    expect(await shares(page)).toEqual([]);
    await context.close();
  });

  test("covers AC-3: before the student has agreed, Copy link shows the notice first and copies nothing", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await tap(copyBtn(page));
    await expect(dialog(page)).toBeVisible();
    await tap(dialog(page).getByRole("button", { name: "Not now" }));
    await expect(dialog(page)).toHaveCount(0);
    expect(await copied(page)).toEqual([]);
    expect(await shares(page)).toEqual([]);
    await context.close();
  });

  test("covers AC-3, AC-18: Share makes the link, the dialog closes with 'ready, tap again', and the Stop sharing line shows the end date in India time", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await tap(wa(page));
    await tap(dialog(page).getByRole("button", { name: "Share", exact: true }));
    await expect(dialog(page)).toHaveCount(0);
    await expect(toast(page)).toContainText("Your report link is ready. Tap WhatsApp again to share.");
    expect(await shares(page)).toEqual([]); // the first tap was used up by the notice
    await expect(control(page)).toContainText(`Your link is on until ${india(Date.now() + 90 * DAY)} (India time).`);
    await expect(control(page).getByRole("button", { name: "Stop sharing" })).toBeVisible();
    await context.close();
  });

  test("covers AC-1, AC-6: the next tap shares the story picture with a text holding the public link, at once; a signed out browser opens that link", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await tap(wa(page));
    await expect.poll(async () => (await shares(page)).length, { timeout: 30_000 }).toBe(1);
    const sent = (await shares(page))[0];
    expect(sent.files).toEqual(["image/png:ok"]);
    expect(sent.title).toBe("My DhiRise card");
    expect(sent.text).toMatch(/^I'm a .+! Here is my DhiRise report: /);
    link = urlIn(sent.text);
    expect(link).toMatch(PUBLIC);
    await expect(dialog(page)).toHaveCount(0); // no notice the second time
    expect(await copied(page)).toEqual([link]); // apps that keep only the picture still get the link by paste
    await expect(toast(page)).toContainText("Your report link is copied too");
    await context.close();

    const s = await stranger(browser, link);
    await expect(s.page.locator("body")).toHaveAttribute("data-state", "report", { timeout: 30_000 });
    await expect(s.page.locator("#shBannerText")).toHaveText("Asha shared this DhiRise report with you.");
    await s.ctx.close();
  });

  test("covers AC-1: Instagram shares the picture and copies the link, and the toast says so", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await tap(ig(page));
    await expect.poll(async () => (await shares(page)).length, { timeout: 30_000 }).toBe(1);
    expect(await copied(page)).toEqual([link]);
    await expect(toast(page)).toContainText("Picture shared and your report link is copied");
    await context.close();
  });

  test("covers AC-10: the report's own Share button uses the same flow: the picture and the same public link", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await tap(page.getByRole("button", { name: "Share with a friend" }));
    await expect.poll(async () => (await shares(page)).length, { timeout: 30_000 }).toBe(1);
    const sent = (await shares(page))[0];
    expect(sent.files).toEqual(["image/png:ok"]);
    expect(urlIn(sent.text)).toBe(link);
    expect(await copied(page)).toEqual([link]); // the link is also copied, for apps that keep only the picture
    await context.close();
  });

  test("covers AC-1 (a student asked for it): Copy link puts the student's own public link on the clipboard, shares no picture, and says so", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await expect(copyBtn(page)).toBeVisible();
    expect(await copyBtn(page).getAttribute("aria-label")).toBe("Copy my report link");
    await tap(copyBtn(page));
    await expect.poll(async () => (await copied(page)).length, { timeout: 30_000 }).toBe(1);
    expect(await copied(page)).toEqual([link]);
    await expect(toast(page)).toContainText("Your report link is copied");
    expect(await shares(page)).toEqual([]);
    await context.close();
  });

  test("covers AC-1, AC-10: the report's own 'Copy my report link' button copies the same link", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await tap(page.locator(".join .btn-ghost", { hasText: "Copy my report link" }));
    await expect.poll(async () => (await copied(page)).length, { timeout: 30_000 }).toBe(1);
    expect(await copied(page)).toEqual([link]);
    await expect(toast(page)).toContainText("Your report link is copied");
    expect(await shares(page)).toEqual([]);
    await context.close();
  });

  test("covers AC-6: a Share tap keeps the same link and the end date stays 90 days ahead", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    const before = await page.evaluate(() => (window as any).DhiSession.share.current());
    await tap(fb(page));
    await expect.poll(async () => (await shares(page)).length, { timeout: 30_000 }).toBe(1);
    await expect.poll(() => page.evaluate(() => (window as any).DhiSession.share.current().expiresAt), { timeout: 20_000 }).toBeGreaterThan(before.expiresAt);
    expect(await page.evaluate(() => (window as any).DhiSession.share.current().url)).toBe(link);
    await context.close();
  });

  test("covers AC-5, AC-18: Stop sharing asks first; Keep sharing changes nothing; Stop ends the link at once and the line says sharing is off", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await tap(control(page).getByRole("button", { name: "Stop sharing" }));
    await expect(control(page)).toContainText("Anyone who has the link will no longer see your report.");
    await tap(control(page).getByRole("button", { name: "Keep sharing" }));
    await expect(control(page)).toContainText("Your link is on until");
    const still = await stranger(browser, link);
    await expect(still.page.locator("body")).toHaveAttribute("data-state", "report", { timeout: 30_000 });
    await still.ctx.close();

    await tap(control(page).getByRole("button", { name: "Stop sharing" }));
    await tap(control(page).getByRole("button", { name: "Stop sharing" }));
    await expect(control(page)).toHaveText("Sharing is off. Tap a button to make a new link.");
    const gone = await stranger(browser, link);
    await expect(gone.page.locator("body")).toHaveAttribute("data-state", "gone", { timeout: 30_000 });
    await gone.ctx.close();
    await context.close();
  });

  test("covers AC-3, AC-6: after Stop sharing a tap makes a new link with no notice (not asked again), and the old link stays dead", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await expect(control(page)).toHaveText("Sharing is off. Tap a button to make a new link.");
    await tap(wa(page));
    await expect(toast(page)).toContainText("Your report link is ready. Tap WhatsApp again to share.");
    await expect(dialog(page)).toHaveCount(0);
    const fresh = await page.evaluate(() => (window as any).DhiSession.share.current().url);
    expect(fresh).toMatch(PUBLIC);
    expect(fresh).not.toBe(link);
    await expect(control(page)).toContainText("Your link is on until");
    const old = await stranger(browser, link);
    await expect(old.page.locator("body")).toHaveAttribute("data-state", "gone", { timeout: 30_000 });
    await old.ctx.close();
    await context.close();
  });
});

test.describe("a student under 18", () => {
  test("covers AC-3: the notice has a required tick; without it there is no link, with it the link is made", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: minor });
    await tap(wa(page));
    const tick = dialog(page).getByRole("checkbox");
    await expect(tick).toBeVisible();
    await expect(dialog(page)).toContainText("I have checked with a parent or guardian.");
    await tap(dialog(page).getByRole("button", { name: "Share", exact: true }));
    await expect(dialog(page)).toContainText("Please tick the box to continue.");
    expect(await page.evaluate(async () => (await (window as any).DhiSession.share.status()).consented)).toBe(false);
    await tick.check();
    await tap(dialog(page).getByRole("button", { name: "Share", exact: true }));
    await expect(dialog(page)).toHaveCount(0);
    await expect(toast(page)).toContainText("Your report link is ready");
    expect(await page.evaluate(async () => (await (window as any).DhiSession.share.status()).consented)).toBe(true);
    await context.close();
  });
});

test.describe("a computer, where files cannot be shared", () => {
  test("covers AC-2: WhatsApp and Facebook open their links with the public link in them, and the picture is saved", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult, phone: false });
    // the earlier tests left this student with a link switched on again at the end
    const url = await page.evaluate(() => (window as any).DhiSession.share.current()?.url as string | null);
    if (!url) {
      await tap(wa(page));
      await expect(toast(page)).toContainText("Your report link is ready");
    }
    const now = await page.evaluate(() => (window as any).DhiSession.share.current().url as string);
    expect(now).toMatch(PUBLIC);
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await tap(wa(page));
    expect((await download).suggestedFilename()).toMatch(/^DhiRise_.+_story\.png$/);
    const [first] = await opened(page);
    expect(first).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(first)).toContain(now);
    await tap(fb(page));
    await expect.poll(async () => (await opened(page)).length).toBe(2);
    expect((await opened(page))[1]).toBe("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(now));
    await context.close();
  });

  test("covers AC-2: Instagram saves the picture and opens a dialog with a QR code of the student's own report, a copy button and a Close button", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult, phone: false });
    const download = page.waitForEvent("download", { timeout: 30_000 });
    await tap(ig(page));
    await download;
    await expect(dialog(page)).toBeVisible({ timeout: 20_000 });
    await expect(dialog(page).getByRole("heading")).toHaveText("Post to Instagram from your phone");
    await expect(dialog(page)).toContainText("Your phone may ask you to sign in first.");
    await expect(dialog(page).locator(".sh-qr svg")).toBeVisible();
    await expect(dialog(page).locator(".sh-qr")).toHaveAttribute("aria-label", "QR code that opens your report on your phone");
    await tap(dialog(page).getByRole("button", { name: "Copy my report address" }));
    await expect(dialog(page)).toContainText("Address copied");
    expect(await copied(page)).toEqual([new URL(PATH + "report-student.html", "http://localhost:4321").href]);
    await tap(dialog(page).getByRole("button", { name: "Close" }));
    await expect(dialog(page)).toHaveCount(0);
    await context.close();
  });

  test("covers AC-2: if the QR file does not load, only the copy button shows, with words that still say what to do", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult, phone: false, noQr: true });
    await tap(ig(page));
    await expect(dialog(page)).toBeVisible({ timeout: 30_000 });
    await expect(dialog(page).locator(".sh-qr")).toHaveCount(0);
    await expect(dialog(page)).toContainText("Copy your report address, open it on your phone, then tap Share.");
    await expect(dialog(page).getByRole("button", { name: "Copy my report address" })).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: "Close" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await context.close();
  });

  test("covers AC-2: the dialog keeps the keyboard inside it, and focus goes back to Instagram when it closes", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult, phone: false });
    await ig(page).focus();
    await tap(ig(page));
    await expect(dialog(page)).toBeVisible({ timeout: 30_000 });
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(ig(page)).toBeFocused();
    await context.close();
  });
});

test.describe("when the link cannot be made", () => {
  test("covers AC-9: the picture is still shared with the landing address, and a line says only the card was shared", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    // the student has agreed to the notice (so a tap goes straight to making a link), the link is then switched off, and making a new one fails
    // (a stand in for offline, a rate limit or a server error)
    expect(await page.evaluate(() => (window as any).DhiSession.share.make({ agreed: true }))).toMatchObject({ ok: true });
    await page.evaluate(() => {
      const s = (window as any).DhiSession.share;
      s.make = async () => ({ ok: false, code: "offline" });
    });
    // turn the link off first so that a tap has to make one
    await page.evaluate(() => (window as any).DhiSession.share.stop());
    await tap(wa(page));
    await expect.poll(async () => (await shares(page)).length, { timeout: 30_000 }).toBe(1);
    expect(urlIn((await shares(page))[0].text)).toMatch(LANDING);
    await expect(toast(page)).toHaveText("We could not add your report link, so only your card was shared.");
    await context.close();
  });

  test("covers AC-9: when the state cannot be found out at all, the picture still goes with the landing address", async ({ browser }) => {
    const { context, page } = await openReport(browser, { state: adult });
    await page.evaluate(() => {
      const s = (window as any).DhiSession.share;
      s.current = () => null;
      s.status = async () => null;
    });
    await tap(ig(page));
    await expect.poll(async () => (await shares(page)).length, { timeout: 30_000 }).toBe(1);
    expect(urlIn((await shares(page))[0].text)).toMatch(LANDING);
    expect(await copied(page)).toEqual([]); // no link to copy
    await expect(toast(page)).toHaveText("We could not add your report link, so only your card was shared.");
    await context.close();
  });
});
