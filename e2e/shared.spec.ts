// The public report page (spec 0010, milestone 1): what a stranger with the private link sees at /s/<code>.
// Most tests answer the payload route themselves, so only the local site (`pnpm dev`) must be running. The last test runs against the Convex DEV
// deployment: it makes a real link for a fake student and opens it in a fresh browser that has never signed in.
// The headers of /s/* (noindex, no referrer, no store, the content security policy) need the built site: see the live check in verify.md.
import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { CONSENT_TEXTS, SHARE_CONSENT_VERSION, consentHash } from "../convex/consentText";
import { finishedCheck, newContext, newTag } from "./helpers";

const ENGINE = resolve("public/dhiinterviews/js/engine");
const CODE = "k".repeat(32) + ".1." + "A".repeat(22); // the shape of a real code; the test answers the route itself
const PAGE = "/s/" + CODE;

type G = Record<string, any>;
const g = globalThis as unknown as G;

// The payload the server sends: the first name, the date, the seed and the result with every flag false. Same scoring and words as the page.
async function makePayload(over: { avatar?: string; name?: string } = {}) {
  g.window = g;
  for (const f of ["questions.js", "score.js", "reportText.js"]) await import(pathToFileURL(resolve(ENGINE, f)).href);
  const seed = "seed-shared-test";
  const answers: Record<string, string> = {};
  for (let n = 1; n <= 18; n++) answers["q" + n] = `q${n}o${((n * 7) % 4) + 1}`;
  const r = g.DhiScore.score(answers, { seed });
  const flags = Object.fromEntries(Object.keys(r.flags).map((k) => [k, false]));
  return {
    T: g.DhiReportText,
    payload: {
      completedAt: "2026-10-09T20:30:00.000Z",
      seed,
      profile: { name: over.name ?? "Asha", ...(over.avatar ? { avatar: over.avatar } : {}) },
      result: { ...r, flags, engineVersion: 1, scoredAt: 1 },
    },
  };
}

async function serve(page: Page, status: number, body: unknown) {
  const seen: { token: string | undefined; url: string; method: string }[] = [];
  await page.route("**/api/shared/payload", (route) => {
    seen.push({ token: route.request().headers()["x-share-token"], url: route.request().url(), method: route.request().method() });
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return seen;
}
const state = (page: Page) => page.locator("body");

test("covers AC-4: the whole report is drawn with the Founding Card on top, a banner with the first name, and a button to take the check", async ({ page }) => {
  const { payload } = await makePayload();
  const seen = await serve(page, 200, payload);
  await page.goto(PAGE);
  await expect(state(page)).toHaveAttribute("data-state", "report");
  await expect(page.locator("#shBanner")).toBeVisible();
  await expect(page.locator("#shBannerText")).toHaveText("Asha shared this DhiRise report with you.");
  await expect(page.locator("#shBanner a.btn-gold")).toHaveText("Take your own check");
  await expect(page.locator("#report img.fc-print")).toHaveCount(1);
  await expect(page.locator("#report img.fc-print")).toHaveAttribute("alt", "Asha’s DhiRise Founding Card");
  await expect(page.locator(".card.head .title")).toContainText("Asha");
  for (const cls of ["start", "kpis", "overview", "style", "working", "grow", "blueprint", "food", "sports", "careers", "path", "rooms"]) {
    await expect(page.locator(`.card.${cls}`), cls).toHaveCount(1);
  }
  // the card is the first thing in the report
  expect(await page.locator("#report").evaluate((r) => (r.querySelector(".fc-copy") ? Array.from(r.children).findIndex((c) => c.classList.contains("fc-copy")) : -1))).toBeLessThanOrEqual(1);
  // the code goes in one request header, and the address that was asked for has no code in it
  expect(seen).toHaveLength(1);
  expect(seen[0]).toMatchObject({ token: CODE, method: "GET" });
  expect(seen[0].url).not.toContain(CODE);
  expect(await page.title()).toBe("A DhiRise report shared with you");
});

test("covers AC-4: no Download, no join card, no feedback box, no teasers, no week ticks, no trophy, no picture row, no notice", async ({ page }) => {
  const { payload, T } = await makePayload();
  await serve(page, 200, payload);
  await page.goto(PAGE);
  await expect(state(page)).toHaveAttribute("data-state", "report");
  for (const cls of [".dl", ".dl-btn", ".join", ".feedback", ".week-locked", ".days", ".tick", ".head-trophy", ".signals", ".leaves", ".ch-bar", ".ch-dim", ".pc-head", ".pn-text", "#fbShare"]) {
    await expect(page.locator(cls), cls).toHaveCount(0);
  }
  const text = await page.locator("body").innerText();
  for (const w of [T.feedbackTitle, T.joinTitle, T.downloadButton, "WhatsApp", "Share with a friend"]) expect(text).not.toContain(w);
  // only the banner's one button and nothing else can be pressed inside the report
  await expect(page.locator("#report").locator("button, input, textarea, select")).toHaveCount(0);
});

test("covers AC-4: with no class, age, email or phone in the payload there is none on the page, and the date is the Kolkata day", async ({ browser }) => {
  const { payload } = await makePayload();
  for (const timezoneId of ["America/Los_Angeles", "Pacific/Auckland"]) {
    const ctx = await browser.newContext({ timezoneId });
    const page = await ctx.newPage();
    await serve(page, 200, payload);
    await page.goto(PAGE);
    await expect(page.locator(".card.head")).toBeVisible();
    await expect(page.locator(".card.head .meta")).toHaveText("10 Oct 2026"); // 02:00 on 10 Oct in India; no class before it
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/@|\+91|\b\d{10}\b|Class \d|College/);
    await ctx.close();
  }
});

test("covers AC-4, spec 0011: the sharer's picture is drawn from the payload's own path; with none, the initial", async ({ page }) => {
  const { payload } = await makePayload({ avatar: "/api/avatar/AbCdEfGhIjKlMnOpQrStUv" });
  await serve(page, 200, payload);
  const asked: string[] = [];
  await page.route("**/api/avatar/**", (route) => {
    asked.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  });
  await page.goto(PAGE);
  await expect(page.locator(".card.head .dhi-avatar img")).toHaveAttribute("src", "/api/avatar/AbCdEfGhIjKlMnOpQrStUv");
  // only that one path is ever asked for (a browser may ask twice; that is not a problem)
  expect(asked.length).toBeGreaterThan(0);
  expect([...new Set(asked)]).toEqual(["/api/avatar/AbCdEfGhIjKlMnOpQrStUv"]);

  const plain = await makePayload();
  await page.unroute("**/api/shared/payload");
  await serve(page, 200, plain.payload);
  await page.goto("about:blank");
  await page.goto(PAGE);
  await expect(page.locator(".card.head .dhi-avatar")).toBeVisible();
  await expect(page.locator(".card.head .dhi-avatar img")).toHaveCount(0);
  await expect(page.locator(".card.head .dhi-avatar")).toContainText("A");
});

test("covers AC-7: a 404 shows one message, and it says nothing about why; the report area stays empty", async ({ page }) => {
  await serve(page, 404, { code: "unavailable" });
  await page.goto(PAGE);
  await expect(state(page)).toHaveAttribute("data-state", "gone");
  await expect(page.locator("#shGone")).toBeVisible();
  await expect(page.locator("#shGone h1")).toHaveText("This link is off or has ended");
  await expect(page.locator("#shGone a.btn-gold")).toHaveText("Take your own check");
  await expect(page.locator("#shBanner")).toBeHidden();
  await expect(page.locator("#shSlow")).toBeHidden();
  await expect(page.locator("#shError")).toBeHidden();
  expect((await page.locator("#report").innerText()).trim()).toBe("");
  expect(await page.locator("body").innerText()).not.toMatch(/ended on|off since|expired|turned off by/i);
});

test("covers AC-11: a 429 asks the visitor to wait, and a failure gives a try again button that loads the page again", async ({ page }) => {
  const { payload } = await makePayload();
  await serve(page, 429, { code: "slow_down" });
  await page.goto(PAGE);
  await expect(state(page)).toHaveAttribute("data-state", "slow");
  await expect(page.locator("#shSlow")).toContainText("Please wait a minute");

  await page.unroute("**/api/shared/payload");
  await serve(page, 500, { code: "boom" });
  await page.goto("about:blank");
  await page.goto(PAGE);
  await expect(state(page)).toHaveAttribute("data-state", "error");
  await expect(page.locator("#shError")).toBeVisible();
  await page.unroute("**/api/shared/payload");
  await serve(page, 200, payload);
  await page.locator("#shRetry").click();
  await expect(state(page)).toHaveAttribute("data-state", "report");
});

test("covers AC-7: an address that is not a link (no code, or a code with odd characters) shows the same one message and asks nothing", async ({ page }) => {
  const seen = await serve(page, 200, (await makePayload()).payload);
  for (const path of ["/s/", "/s/a b", "/s/%3Cscript%3E"]) {
    await page.goto("about:blank");
    await page.goto(path);
    await expect(state(page)).toHaveAttribute("data-state", "gone");
  }
  expect(seen).toHaveLength(0);
});

test("covers AC-13: the page makes no request to another site, sets no cookie and writes no localStorage or sessionStorage", async ({ page, context }) => {
  const { payload } = await makePayload({ avatar: "/api/avatar/AbCdEfGhIjKlMnOpQrStUv" });
  await serve(page, 200, payload);
  await page.route("**/api/avatar/**", (route) => route.fulfill({ status: 404, body: "" }));
  const hosts = new Set<string>();
  const paths: string[] = [];
  page.on("request", (req) => {
    const u = new URL(req.url());
    if (u.protocol === "http:" || u.protocol === "https:") { hosts.add(u.host); paths.push(u.pathname); }
  });
  await page.goto(PAGE);
  await expect(state(page)).toHaveAttribute("data-state", "report");
  await page.waitForLoadState("networkidle");
  expect([...hosts]).toEqual(["localhost:4321"]);
  expect(paths.filter((p) => /\/(api\/auth|api\/files|api\/render)|posthog|convex/.test(p))).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  // no script that signs in, tracks, plays sound or makes an identity was loaded
  const scripts = await page.evaluate(() => Array.from(document.scripts).map((s) => s.getAttribute("src")));
  expect(scripts.filter((s) => /session|auth|posthog|leaves|music|identity|challenge|api\.js|store\.js/i.test(String(s)))).toEqual([]);
});

test("covers AC-8: every address under /s/ is the same page; the images and scripts still load from /dhiinterviews/ (the base address)", async ({ page }) => {
  const { payload } = await makePayload();
  await serve(page, 200, payload);
  const failed: string[] = [];
  page.on("response", (res) => { if (res.status() >= 400 && !res.url().includes("/api/")) failed.push(`${res.status()} ${res.url()}`); });
  for (const path of ["/s/" + CODE, "/s/" + CODE + "/"]) {
    await page.goto("about:blank");
    await page.goto(path);
    await expect(state(page)).toHaveAttribute("data-state", "report");
    await expect(page.locator("img.logo, .brand-logo").first()).toBeVisible();
    // the picture is asked for after the page is drawn, so give it a moment to arrive
    await expect.poll(() => page.locator("img.logo, .brand-logo").first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  }
  expect(failed).toEqual([]);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("noindex, nofollow");
  expect(await page.locator('meta[property="og:image"]').getAttribute("content")).toMatch(/^https:\/\/dhirise\.com\/dhiinterviews\/assets\/share-preview\.v1\.png$/);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
});

test("covers AC-4: on a phone the page does not scroll sideways", async ({ page }) => {
  const { payload } = await makePayload();
  await serve(page, 200, payload);
  await page.goto(PAGE);
  await expect(state(page)).toHaveAttribute("data-state", "report");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

// ---- against the real backend on the dev deployment ----
function convexUrl(): string {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^(?:PUBLIC_CONVEX_URL|CONVEX_URL)=(\S+)/m);
    if (m) return m[1];
  }
  return process.env.PUBLIC_CONVEX_URL ?? "";
}

test("covers AC-4, AC-6, AC-7, AC-14 (live on dev): a real student's link opens for a browser that never signed in, and an altered or unknown link shows the one message", async ({ browser }) => {
  const owner = await newContext(browser);
  const ownerPage = await owner.newPage();
  await finishedCheck(ownerPage, newTag(), "Priya Nair");

  // the student's own token, the way the site's own client gets it, then the one function a student has
  const token = await ownerPage.evaluate(async () => (await (await fetch("/api/auth/convex/token", { credentials: "include" })).json()).token as string);
  expect(token).toBeTruthy();
  const client = new ConvexHttpClient(convexUrl());
  client.setAuth(token);
  // the first link needs the notice (spec 0010, AC-3): the page sends the version and the fingerprint of the words the student agreed to
  const notice = { version: SHARE_CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[SHARE_CONSENT_VERSION]) };
  const made = (await client.mutation("shares:enable" as never, { notice } as never)) as { ok: boolean; code: string; expiresAt: number };
  expect(made.ok).toBe(true);
  expect(made.expiresAt).toBeGreaterThan(Date.now() + 89 * 24 * 3600 * 1000);
  // a second tap keeps the same link
  const again = (await client.mutation("shares:enable" as never, {} as never)) as { ok: boolean; code: string };
  expect(again.code).toBe(made.code);

  // a different browser, never signed in
  const stranger = await newContext(browser);
  const page = await stranger.newPage();
  await page.goto("/s/" + made.code);
  await expect(page.locator("body")).toHaveAttribute("data-state", "report", { timeout: 30_000 });
  await expect(page.locator("#shBannerText")).toHaveText("Priya shared this DhiRise report with you.");
  await expect(page.locator(".card.head .title")).toContainText("Priya");
  await expect(page.locator("#report img.fc-print")).toHaveCount(1);
  expect(await page.locator("body").innerText()).not.toMatch(/Nair|@example\.com|College/);
  expect(await stranger.cookies()).toEqual([]);

  // a link with one character changed, and one for a row that does not exist: the same one message
  for (const bad of [made.code.slice(0, -2) + (made.code.endsWith("AA") ? "BB" : "AA"), "k".repeat(32) + ".1." + "A".repeat(22)]) {
    await page.goto("about:blank");
    await page.goto("/s/" + bad);
    await expect(page.locator("body")).toHaveAttribute("data-state", "gone", { timeout: 30_000 });
  }
  await owner.close();
  await stranger.close();
});
