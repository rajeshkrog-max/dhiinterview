// The profile picture circle on the student's own screens (spec 0011, M5: AC-3, AC-5, AC-14, AC-16). Runs on the dev site with the fake
// test sign in. A fake account has no Google photo, so the real flow always shows the initial; that is the fallback these tests check
// first. For the picture itself the browser is given a path through the one seam the pages read (`DhiSession.picture()` and
// `DhiSession.onPicture()`), and `/api/avatar/*` is answered by the test, so no picture code is changed and Google is never asked.
// The server half (fetch, store, key, Remove, Restore, block) is in convex/avatars.test.ts.
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { PATH, finishedCheck, newContext, newStudent, newTag } from "./helpers";

const NAME = "Asha Rao"; // the initial is A
const KEY_PATH = "/api/avatar/AbCdEfGhIjKlMnOpQrStUv";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// Each own screen, the circle it draws, and its size (spec 0011, "Where the picture is delivered").
const SCREENS = [
  { name: "landing welcome back", path: "landing.html", circle: "#backPic .dhi-avatar", size: 64 },
  { name: "report heading", path: "report-student.html", circle: ".card.head .dhi-avatar", size: 64 },
  { name: "done page", path: "done.html", circle: "#teaser .t-pic .dhi-avatar", size: 40, reveal: true }, // the teaser shows after "See your result"
  { name: "who page", path: "who.html", circle: ".who-wrap .dhi-avatar", size: 40 },
  { name: "challenge page", path: "challenge.html", circle: "#cpMe .dhi-avatar", size: 40 },
  { name: "leaderboard you card", path: "leaderboard.html", circle: "#lbYou .dhi-avatar", size: 40 },
] as const;

type State = Awaited<ReturnType<BrowserContext["storageState"]>>;
let signedIn: State; // a finished student who joined the challenge
let fresh: State; // a student who has only made their profile: the question pages do not redirect them away

// One finished student who has joined the challenge (the leaderboard "you" card needs that), reused by every test.
test.beforeAll(async ({ browser }, testInfo) => {
  testInfo.setTimeout(180_000);
  const ctx = await newContext(browser);
  const page = await ctx.newPage();
  await finishedCheck(page, newTag(), NAME, 20);
  // the phone step is saved (without the page's own form: see results.spec.ts), so the later pages such as who.html open and do not send the student back to done.html
  await page.goto(PATH + "done.html");
  await page.waitForFunction(() => (window as any).DhiSession?.state === "ready");
  expect(await page.evaluate(() => (window as any).DhiSession.submitLead({ phone: "9876543210", wantsCommunity: false, guardianPresent: false }))).toMatchObject({ ok: true });
  await page.goto(PATH + "challenge.html");
  await page.waitForFunction(() => !!(window as any).DhiApi);
  expect(await page.evaluate(() => (window as any).DhiApi.joinChallenge({ parentConsent: true }))).toMatchObject({ ok: true });
  signedIn = await ctx.storageState();
  await ctx.close();

  const ctx2 = await newContext(browser);
  await newStudent(await ctx2.newPage(), newTag(), NAME, 20);
  fresh = await ctx2.storageState();
  await ctx2.close();
});

type Options = {
  picture?: "ok" | "missing" | null; // what /api/avatar/* answers; null leaves the student with no picture path at all (the real flow)
  off?: boolean; // DHI_FUNNEL.profilePicture is false
  as?: "finished" | "fresh";
  reveal?: boolean; // done.html: skip the reveal and show the teaser
};

// Opens the screen as the student. With `picture` set, the pages are handed KEY_PATH as the student's picture path.
async function open(browser: Browser, path: string, opts: Options = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: opts.as === "fresh" ? fresh : signedIn });
  const page = await context.newPage();
  if (opts.reveal) await page.emulateMedia({ reducedMotion: "reduce" }); // makes the "See your result" button appear quickly
  const hosts: string[] = [];
  const avatarRequests: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    hosts.push(u.host);
    if (u.pathname.startsWith("/api/avatar/")) avatarRequests.push(u.pathname);
  });
  if (opts.picture) {
    await page.route("**/api/avatar/**", (route) =>
      opts.picture === "ok" ? route.fulfill({ status: 200, contentType: "image/png", body: PNG }) : route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }),
    );
    await page.addInitScript((url) => {
      // The pages read the picture path from window.DhiSession; hand them one, and keep their listeners so a test can say "it arrived".
      const w = window as any;
      w.__picListeners = [] as Array<(u: string | null) => void>;
      w.__picUrl = url;
      let real: any;
      Object.defineProperty(window, "DhiSession", {
        configurable: true,
        get: () => real,
        set: (v) => {
          real = v;
          if (v) {
            v.picture = () => w.__picUrl;
            v.onPicture = (fn: (u: string | null) => void) => w.__picListeners.push(fn);
          }
        },
      });
    }, KEY_PATH);
  }
  if (opts.off) {
    await page.route("**/js/funnel-config.js", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: 'window.DHI_FUNNEL = { whatsappInvite: "", shareUrl: "", profilePicture: false };' }),
    );
  }
  await page.goto(PATH + path);
  if (opts.reveal) {
    await page.locator("#see:not([hidden])").waitFor({ timeout: 30_000 });
    await page.evaluate(() => (document.getElementById("see") as HTMLButtonElement).click());
  }
  return { page, context, hosts, avatarRequests };
}

const fire = (page: Page, url: string | null) => page.evaluate((u) => ((window as any).__picListeners as Array<(x: string | null) => void>).forEach((fn) => fn(u)), url);
// The circle's size, and where it sits inside its parent (so a page that is still sliding into place, like the report, does not count as a shift).
const box = async (page: Page, circle: string) => {
  const el = page.locator(circle).first();
  await el.waitFor({ state: "visible" });
  return await el.evaluate((e) => {
    const r = e.getBoundingClientRect();
    const p = (e.parentElement as HTMLElement).getBoundingClientRect();
    return { width: r.width, height: r.height, x: r.x - p.x, y: r.y - p.y };
  });
};

test.describe("the circle falls back to the initial (AC-3, AC-14)", () => {
  for (const s of SCREENS) {
    test(`covers AC-3 and AC-14: ${s.name}: a student with no Google photo sees the initial in a fixed ${s.size}px circle, and nothing is fetched`, async ({ browser }) => {
      const { page, context, hosts, avatarRequests } = await open(browser, s.path, { reveal: "reveal" in s });
      const circle = page.locator(s.circle);
      await expect(circle).toHaveCount(1);
      await expect(circle).toHaveClass(new RegExp(`dhi-avatar--${s.size}\\b.*dhi-avatar--c[0-5]`));
      await expect(circle).toHaveText("A");
      await expect(circle).toHaveAttribute("aria-hidden", "true"); // the name is written beside it
      const size = await box(page, s.circle);
      expect(Math.round(size.width)).toBe(s.size);
      expect(Math.round(size.height)).toBe(s.size);
      expect(await circle.locator("img").count()).toBe(0);
      expect(avatarRequests).toEqual([]); // no picture path, so no picture request
      expect(hosts.filter((h) => /googleusercontent/.test(h))).toEqual([]); // and Google is never asked by a page (AC-1)
      await context.close();
    });
  }
});

test.describe("the circle shows the stored picture (AC-3, AC-14)", () => {
  for (const s of SCREENS) {
    test(`covers AC-3 and AC-14: ${s.name}: the picture is drawn from our own path, at ${s.size}px, with no motion and no third party`, async ({ browser }) => {
      const { page, context, hosts, avatarRequests } = await open(browser, s.path, { picture: "ok", reveal: "reveal" in s });
      const circle = page.locator(s.circle);
      await expect(circle).toHaveClass(new RegExp(`dhi-avatar--${s.size}\\b.*dhi-avatar--photo`));
      const img = circle.locator("img");
      await expect(img).toHaveCount(1);
      await expect(img).toHaveAttribute("src", KEY_PATH);
      await expect(img).toHaveAttribute("alt", "");
      await expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
      await expect(img).toHaveAttribute("width", String(s.size));
      await expect(img).toHaveAttribute("height", String(s.size));
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0); // it really loaded
      const size = await box(page, s.circle);
      expect(Math.round(size.width)).toBe(s.size);
      expect(Math.round(size.height)).toBe(s.size);
      await expect(circle).toHaveAttribute("aria-hidden", "true");
      expect(await circle.evaluate((e) => getComputedStyle(e).animationName + "|" + getComputedStyle(e).transitionDuration)).toMatch(/^none\|0s$/); // no motion
      expect(new Set(avatarRequests)).toEqual(new Set([KEY_PATH]));
      expect(hosts.filter((h) => /googleusercontent/.test(h))).toEqual([]);
      await context.close();
    });
  }
});

test.describe("a picture that cannot be loaded falls back to the initial (AC-3)", () => {
  for (const s of SCREENS) {
    test(`covers AC-3: ${s.name}: when the image answers 404 the circle turns into the initial, with no broken image left behind`, async ({ browser }) => {
      const { page, context } = await open(browser, s.path, { picture: "missing", reveal: "reveal" in s });
      const circle = page.locator(s.circle);
      await expect(circle).toHaveClass(new RegExp(`dhi-avatar--${s.size}\\b.*dhi-avatar--c[0-5]`));
      await expect(circle).toHaveText("A");
      expect(await circle.locator("img").count()).toBe(0);
      const size = await box(page, s.circle);
      expect(Math.round(size.width)).toBe(s.size); // the same size, so nothing around it moves
      await context.close();
    });
  }
});

test.describe("a picture that arrives or is removed after the page has drawn (AC-3, AC-9, AC-14)", () => {
  for (const s of SCREENS) {
    test(`covers AC-3 and AC-14: ${s.name}: initial first, then the picture when it lands, then the initial again after a Remove, always the same box`, async ({ browser }) => {
      const { page, context } = await open(browser, s.path, { picture: "ok", reveal: "reveal" in s });
      await page.evaluate(() => ((window as any).__picUrl = null));
      // wait until the page has stopped changing around the circle: the leaderboard card gains its share panel a moment after it draws
      if (s.path === "leaderboard.html") await page.locator("#lbYou .lb-shares").waitFor({ state: "attached" });
      await fire(page, null); // the page learns there is no picture: initials
      const circle = page.locator(s.circle);
      await expect(circle).toHaveText("A");
      const before = await box(page, s.circle);
      await fire(page, KEY_PATH);
      await expect(circle.locator("img")).toHaveAttribute("src", KEY_PATH);
      await expect.poll(() => circle.locator("img").evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
      const during = await box(page, s.circle);
      await fire(page, null); // the student removed it
      await expect(circle).toHaveText("A");
      expect(await circle.locator("img").count()).toBe(0);
      const after = await box(page, s.circle);
      for (const b of [during, after]) {
        expect(b.width).toBe(before.width);
        expect(b.height).toBe(before.height);
        expect(b.x).toBe(before.x);
        expect(b.y).toBe(before.y);
      }
      await context.close();
    });
  }
});

test.describe("the feature switch in the browser (AC-16)", () => {
  for (const s of SCREENS) {
    test(`covers AC-16: ${s.name}: with DHI_FUNNEL.profilePicture false there is no circle and no picture request`, async ({ browser }) => {
      const { page, context, avatarRequests } = await open(browser, s.path, { off: true, picture: "ok" });
      await page.waitForFunction(() => !!(window as any).DhiSession && (window as any).DhiSession.state === "ready", null, { timeout: 30_000 });
      await page.waitForTimeout(2000); // the page scripts run right after the session is ready; give them (and any picture request) time to show up (the Convex socket never goes idle)
      await expect(page.locator(".dhi-avatar")).toHaveCount(0);
      expect(avatarRequests).toEqual([]);
      await context.close();
    });
  }
});

test.describe("where there is no circle at all (AC-5)", () => {
  for (const p of ["question.html", "question2.html", "questions.html?q=3", "meet.html"]) {
    test(`covers AC-5: ${p} draws no circle and loads no picture`, async ({ browser }) => {
      const { page, context, avatarRequests } = await open(browser, p, { picture: "ok", as: "fresh" });
      await expect(page).toHaveURL(/\/(question|questions|question2|meet)(\.html)?/);
      await page.waitForFunction(() => !!(window as any).DhiSession && (window as any).DhiSession.state === "ready", null, { timeout: 30_000 });
      await page.waitForTimeout(2000); // the page scripts run right after the session is ready; give them (and any picture request) time to show up (the Convex socket never goes idle)
      await expect(page.locator(".dhi-avatar")).toHaveCount(0);
      expect(avatarRequests).toEqual([]);
      await context.close();
    });
  }
});

// ---------- leaderboard rows carry a picture only when the server sends a path (spec 0011, AC-4 and AC-5) ----------
// The live board (scope row 12) is not built: the mock api.js has only demo rows and the student's own row. These cases give the page the
// rows the real answer will have, by wrapping api.js's getLeaderboard, so the drawing rules are locked in before row 12 arrives.
const ROW_PNG_PATH = "/api/avatar/ZyXwVuTsRqPoNmLkJiHgFe";

async function openBoard(browser: Browser, avatars: Record<number, string | null>, demo: boolean) {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: signedIn });
  const page = await context.newPage();
  const asked: string[] = [];
  const hosts = new Set<string>();
  page.on("request", (r) => {
    const u = new URL(r.url());
    hosts.add(u.host);
    if (u.pathname.startsWith("/api/avatar/")) asked.push(u.pathname);
  });
  await page.route("**/api/avatar/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  // api.js is served with a small wrapper after it: ranks 1 to 3 (podium) and some list rows get the given avatars, and `demo` says whether they count as demo rows
  await page.route("**/js/api.js", async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    const wrap = `;(function(){var g=window.DhiApi.getLeaderboard,A=${JSON.stringify(avatars)},D=${demo};window.DhiApi.getLeaderboard=function(){return g().then(function(rows){return rows.map(function(r){var a=A[r.rank];return a===undefined?r:Object.assign({},r,{avatar:a,demo:D&&r.demo});});});};})();`;
    await route.fulfill({ response: res, body: body + wrap });
  });
  await page.goto(PATH + "leaderboard.html");
  await page.locator("#lbList .lb-row").first().waitFor({ timeout: 30_000 });
  return { page, context, asked, hosts };
}
const pics = (page: Page, where: string) => page.locator(`${where} .dhi-avatar`);

test.describe("leaderboard rows (AC-4, AC-5)", () => {
  test("covers AC-5: today's demo rows keep their owls, with no picture circle and no picture request", async ({ browser }) => {
    const { page, context, asked } = await openBoard(browser, {}, true);
    await expect(page.locator("#lbPodium .lb-av")).toHaveCount(3);
    await expect(page.locator("#lbList .lb-av").first()).toBeVisible();
    await expect(pics(page, "#lbPodium")).toHaveCount(0);
    await expect(pics(page, "#lbList")).toHaveCount(0);
    expect(asked).toEqual([]);
    await context.close();
  });

  test("covers AC-4: a real row with a path shows a 28px picture in the list and a 40px one on the podium, in the owl's own box", async ({ browser }) => {
    const { page, context, asked } = await openBoard(browser, { 1: ROW_PNG_PATH, 5: ROW_PNG_PATH }, false);
    const podium = pics(page, "#lbPodium");
    await expect(podium).toHaveCount(1);
    await expect(podium.first()).toHaveClass(/dhi-avatar--40\b.*dhi-avatar--photo/);
    await expect(podium.first().locator("img")).toHaveAttribute("src", ROW_PNG_PATH);
    const list = pics(page, "#lbList");
    await expect(list).toHaveCount(1);
    await expect(list.first()).toHaveClass(/dhi-avatar--28\b.*dhi-avatar--photo/);
    await expect(list.first().locator("img")).toHaveAttribute("loading", "lazy"); // rows are lazy, own screens are eager
    // the owl is replaced, not added to, and the other rows keep theirs
    await expect(page.locator("#lbPodium .lb-spot").nth(1).locator(".lb-av")).toHaveCount(0); // rank 1 is the centre spot
    await expect(page.locator("#lbPodium .lb-av")).toHaveCount(2);
    expect(new Set(asked)).toEqual(new Set([ROW_PNG_PATH]));
    await context.close();
  });

  test("covers AC-4: a row with avatar null, or one the page has never heard of, keeps the owl", async ({ browser }) => {
    const { page, context } = await openBoard(browser, { 1: null, 4: null }, false);
    await expect(pics(page, "#lbPodium")).toHaveCount(0);
    await expect(pics(page, "#lbList")).toHaveCount(0);
    await expect(page.locator("#lbPodium .lb-av")).toHaveCount(3);
    await context.close();
  });

  test("covers AC-4 and AC-10: only a same origin /api/avatar/ path becomes a picture; any other address falls back to the initial and is never contacted", async ({ browser }) => {
    const { page, context, hosts } = await openBoard(browser, { 1: "https://evil.example/x.png", 4: "//evil.example/x.png", 5: "javascript:alert(1)" }, false);
    await expect(pics(page, "#lbPodium").first()).toHaveClass(/dhi-avatar--c[0-5]/);
    await expect(pics(page, "#lbPodium").first().locator("img")).toHaveCount(0);
    await expect(pics(page, "#lbList").first().locator("img")).toHaveCount(0);
    expect([...hosts].some((h) => /evil/.test(h))).toBe(false);
    await context.close();
  });

  test("covers AC-4: a picture that fails to load turns into the initial and the row does not move", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: signedIn });
    const page = await context.newPage();
    await page.route("**/api/avatar/**", (route) => route.fulfill({ status: 404, body: "Not found" }));
    await page.route("**/js/api.js", async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: (await res.text()) + `;(function(){var g=window.DhiApi.getLeaderboard;window.DhiApi.getLeaderboard=function(){return g().then(function(rows){return rows.map(function(r){return r.rank===4?Object.assign({},r,{avatar:"${ROW_PNG_PATH}",demo:false}):r;});});};})();` });
    });
    await page.goto(PATH + "leaderboard.html");
    await page.locator("#lbList .lb-row").first().waitFor({ timeout: 30_000 });
    const c = pics(page, "#lbList").first();
    await expect(c).toHaveClass(/dhi-avatar--28\b.*dhi-avatar--c[0-5]/);
    await expect(c.locator("img")).toHaveCount(0);
    expect(await c.evaluate((e: HTMLElement) => Math.round(e.getBoundingClientRect().width))).toBe(28);
    await context.close();
  });

  test("covers AC-16: with the picture feature off in this browser, rows keep their owls even when the server sends paths", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 800 }, storageState: signedIn });
    const page = await context.newPage();
    const asked: string[] = [];
    page.on("request", (r) => new URL(r.url()).pathname.startsWith("/api/avatar/") && asked.push(r.url()));
    await page.route("**/js/funnel-config.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: 'window.DHI_FUNNEL = { whatsappInvite: "", shareUrl: "", profilePicture: false };' }));
    await page.route("**/js/api.js", async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, body: (await res.text()) + `;(function(){var g=window.DhiApi.getLeaderboard;window.DhiApi.getLeaderboard=function(){return g().then(function(rows){return rows.map(function(r){return Object.assign({},r,{avatar:"${ROW_PNG_PATH}",demo:false});});});};})();` });
    });
    await page.goto(PATH + "leaderboard.html");
    await page.locator("#lbList .lb-row").first().waitFor({ timeout: 30_000 });
    await expect(page.locator(".dhi-avatar")).toHaveCount(0);
    await expect(page.locator("#lbPodium .lb-av")).toHaveCount(3);
    expect(asked).toEqual([]);
    await context.close();
  });
});
