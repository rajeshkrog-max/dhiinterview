// The report render page (spec 0006): the page Cloudflare Browser Run opens to make the saved PDF. It needs no sign in and no
// Convex: the payload route is answered here by the test, so only the local site (`pnpm dev`) must be running.
import { expect, test, type Page } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const PAGE = "/dhiinterviews/report-render.html";
const ENGINE = resolve("public/dhiinterviews/js/engine");

type G = Record<string, any>;
const g = globalThis as unknown as G;

// The same answers a student could give, scored by the same score.js and worded by the same reportText.js the page uses.
async function makePayload(over: { flags?: boolean; version?: number; completedAt?: string } = {}) {
  g.window = g;
  for (const f of ["questions.js", "score.js", "reportText.js"]) await import(pathToFileURL(resolve(ENGINE, f)).href);
  const seed = "seed-render-test";
  const answers: Record<string, string> = {};
  for (let n = 1; n <= 18; n++) answers["q" + n] = `q${n}o${((n * 7) % 4) + 1}`;
  const r = g.DhiScore.score(answers, { seed });
  // the server sends every flag as false; `flags: true` is a hostile payload to prove the page would not print flag text anyway
  const flags = Object.fromEntries(Object.keys(r.flags).map((k) => [k, !!over.flags]));
  return {
    T: g.DhiReportText,
    payload: {
      completedAt: over.completedAt ?? "2026-10-09T20:30:00.000Z",
      seed,
      profile: { name: "Asha", class: "Class 10" },
      result: { ...r, flags, engineVersion: 1, scoredAt: 1 },
      wantedVersion: over.version ?? g.DhiReportText.VERSION,
    },
  };
}

async function serve(page: Page, payload: unknown, token = "good") {
  const seen: { token: string | undefined; url: string }[] = [];
  await page.route("**/api/render/payload", async (route) => {
    const t = route.request().headers()["x-render-token"];
    seen.push({ token: t, url: route.request().url() });
    if (t !== token) return route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"bad_token"}' });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
  });
  return seen;
}

const settled = (page: Page) => page.waitForSelector('#report[data-ready="1"], #report[data-error]', { state: "attached", timeout: 30_000 });

test("covers AC-5: the copy has the report cards and the Founding Card, and nothing interactive, flagged or promotional", async ({ page }) => {
  const { payload, T } = await makePayload({ flags: true }); // even a payload that wrongly carries flags prints none
  await serve(page, payload);
  await page.goto(`${PAGE}#t=good`);
  await settled(page);
  await expect(page.locator("#report")).toHaveAttribute("data-ready", "1");

  // what is there
  await expect(page.locator("img.fc-print")).toHaveCount(1);
  await expect(page.locator(".card.head .title")).toContainText("Asha");
  await expect(page.locator(".card.start .ring-num")).toHaveText(String(payload.result.dhiStart)); // final number, no count up
  for (const cls of ["kpis", "overview", "style", "working", "grow", "blueprint", "food", "sports", "careers", "path", "rooms"]) {
    await expect(page.locator(`.card.${cls}`)).toHaveCount(1);
  }

  // what is not there
  await expect(page.locator("#report").locator("button, a, input, textarea, select, audio, video, iframe")).toHaveCount(0);
  for (const cls of [".signals", ".week-locked", ".days", ".tick", ".feedback", ".join", ".head-trophy", ".fc-actions", ".leaves", ".ch-bar", ".ch-dim", ".dl"]) {
    await expect(page.locator(cls), cls).toHaveCount(0);
  }
  const text = await page.locator("body").innerText();
  for (const passages of Object.values(T.flags) as unknown[]) {
    for (const p of ([] as string[]).concat(passages as string[])) expect(text).not.toContain(p);
  }
  for (const w of ["WhatsApp", "Dhi early access", "Share with a friend", T.feedbackTitle, T.signalsTitle]) expect(text).not.toContain(w);
  // nothing from the student's account beyond the first name and class
  expect(text).not.toMatch(/@|\+91|\b\d{10}\b/);
});

test("covers AC-5: the date is the Kolkata day whatever zone the machine is in", async ({ browser }) => {
  const { payload } = await makePayload({ completedAt: "2026-10-09T20:30:00.000Z" }); // 02:00 on 10 Oct in India
  for (const timezoneId of ["America/Los_Angeles", "Pacific/Auckland", "Asia/Kolkata"]) {
    const ctx = await browser.newContext({ timezoneId });
    const page = await ctx.newPage();
    await serve(page, payload);
    await page.goto(`${PAGE}#t=good`);
    await settled(page);
    await expect(page.locator(".card.head .meta")).toHaveText("Class 10 · 10 Oct 2026");
    await ctx.close();
  }
});

test("covers AC-9: a missing, wrong or refused token gives a blank page with data-error and no report", async ({ page }) => {
  const { payload } = await makePayload();
  await serve(page, payload, "good");
  const cases: [string, string][] = [
    ["", "no_token"],
    ["#t=wrong", "payload_401"],
    ["#nothing", "no_token"],
  ];
  for (const [hash, error] of cases) {
    await page.goto("about:blank"); // a change of fragment alone would not reload the page
    await page.goto(`${PAGE}${hash}`);
    await settled(page);
    await expect(page.locator("#report")).toHaveAttribute("data-error", error);
    await expect(page.locator("#report")).not.toHaveAttribute("data-ready", "1");
    expect((await page.locator("#report").innerText()).trim()).toBe("");
  }
});

test("covers AC-9: the token travels as a header only; the address in the request carries no token and the fragment is cleared", async ({ page }) => {
  const { payload } = await makePayload();
  const seen = await serve(page, payload);
  await page.goto(`${PAGE}#t=good`);
  await settled(page);
  expect(seen).toHaveLength(1);
  expect(seen[0].token).toBe("good");
  expect(seen[0].url).not.toContain("good");
  expect(await page.evaluate(() => location.hash)).toBe("");
});

test("covers AC-13: a report version that differs from the data's gives data-error, never a copy", async ({ page }) => {
  const { payload } = await makePayload({ version: 999 });
  await serve(page, payload);
  await page.goto(`${PAGE}#t=good`);
  await settled(page);
  await expect(page.locator("#report")).toHaveAttribute("data-error", "version_mismatch");
  expect((await page.locator("#report").innerText()).trim()).toBe("");
});

test("covers AC-5: if the report fonts cannot be loaded the page says so instead of printing in the wrong font", async ({ page }) => {
  const { payload } = await makePayload();
  await serve(page, payload);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto(`${PAGE}#t=good`);
  await settled(page);
  await expect(page.locator("#report")).toHaveAttribute("data-error", "fonts_missing");
});

test("covers AC-5: the page makes no request to any analytics or other site, and loads no sign in script", async ({ page }) => {
  const { payload } = await makePayload();
  await serve(page, payload);
  const hosts = new Set<string>();
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  const scripts: string[] = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(new URL(r.url()).pathname));
  await page.goto(`${PAGE}#t=good`);
  await settled(page);
  await expect(page.locator("#report")).toHaveAttribute("data-ready", "1");
  for (const h of hosts) expect(["localhost:4321", "fonts.googleapis.com", "fonts.gstatic.com"]).toContain(h);
  expect(scripts.filter((s) => /session|posthog|leaves|identity|challenge|music|\/card\.js|convex/i.test(s))).toEqual([]);
});

test("covers AC-11: the page prints to a real PDF under 5 MB", async ({ page }) => {
  const { payload } = await makePayload();
  await serve(page, payload);
  await page.goto(`${PAGE}#t=good`);
  await settled(page);
  const pdf = await page.pdf({ format: "a4", printBackground: true });
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(50_000);
  expect(pdf.length).toBeLessThan(5 * 1024 * 1024);
});

// ---------- the student's picture in the copy (spec 0011, AC-4 and AC-17) ----------
const KEY_PATH = "/api/avatar/AbCdEfGhIjKlMnOpQrStUv";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const headCircle = (page: Page) => page.locator("#report .card.head .dhi-avatar");

test.describe("the picture in the saved copy (spec 0011)", () => {
  test("covers AC-4: a payload with a picture path draws a 64px circle with the picture, and the heading no longer shows the DhiRise mark", async ({ page }) => {
    const { payload } = await makePayload();
    await serve(page, { ...payload, profile: { ...payload.profile, avatar: KEY_PATH } });
    const asked: string[] = [];
    await page.route("**/api/avatar/**", (route) => {
      asked.push(new URL(route.request().url()).pathname);
      return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
    });
    await page.goto(`${PAGE}#t=good`);
    await settled(page);
    await expect(page.locator("#report")).toHaveAttribute("data-ready", "1");
    await expect(headCircle(page)).toHaveClass(/dhi-avatar--64\b.*dhi-avatar--photo/);
    await expect(headCircle(page).locator("img")).toHaveAttribute("src", KEY_PATH);
    await expect(headCircle(page).locator("img")).toHaveAttribute("loading", "eager"); // never lazy in the copy
    expect(await headCircle(page).evaluate((e: HTMLElement) => Math.round(e.getBoundingClientRect().width))).toBe(64);
    await expect(page.locator("#report .card.head img.logo")).toHaveCount(0);
    expect(new Set(asked)).toEqual(new Set([KEY_PATH]));
    await expect(page.locator("#report .pcontrol, #report #pictureNotice")).toHaveCount(0); // no picture controls in a saved copy
  });

  test("covers AC-4: no picture path (removed, blocked, off or never fetched) keeps the heading as before, with no empty circle", async ({ page }) => {
    const { payload } = await makePayload();
    for (const avatar of [null, undefined]) {
      await serve(page, { ...payload, profile: { ...payload.profile, avatar } });
      await page.goto(`${PAGE}#t=good`);
      await settled(page);
      await expect(page.locator("#report")).toHaveAttribute("data-ready", "1");
      await expect(headCircle(page)).toHaveCount(0);
      await expect(page.locator("#report .card.head img.logo")).toHaveCount(1);
      await page.unroute("**/api/render/payload");
    }
  });

  test("covers AC-17: a picture that answers 404 leaves the initial in the circle, and the copy is still ready", async ({ page }) => {
    const { payload } = await makePayload();
    await serve(page, { ...payload, profile: { ...payload.profile, avatar: KEY_PATH } });
    await page.route("**/api/avatar/**", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "Not found" }));
    await page.goto(`${PAGE}#t=good`);
    await settled(page);
    await expect(page.locator("#report")).toHaveAttribute("data-ready", "1");
    await expect(headCircle(page)).toHaveText("A");
    await expect(headCircle(page).locator("img")).toHaveCount(0);
  });

  test("covers AC-17: a picture that never arrives is waited for about 3 seconds, then the copy is made with the initial", async ({ page }) => {
    const { payload } = await makePayload();
    await serve(page, { ...payload, profile: { ...payload.profile, avatar: KEY_PATH } });
    let askedAt = 0;
    await page.route("**/api/avatar/**", async (route) => {
      askedAt = Date.now();
      await new Promise((r) => setTimeout(r, 12_000)); // slower than the page will ever wait
      await route.abort().catch(() => undefined);
    });
    await page.goto(`${PAGE}#t=good`);
    await settled(page);
    const readyAt = Date.now();
    await expect(page.locator("#report")).toHaveAttribute("data-ready", "1");
    await expect(headCircle(page)).toHaveText("A");
    expect(askedAt).toBeGreaterThan(0);
    const waited = readyAt - askedAt;
    expect(waited).toBeGreaterThanOrEqual(2500); // it did wait for the picture ...
    expect(waited).toBeLessThan(7000); // ... but not the 12 seconds the server took
  });

  test("covers AC-4 and AC-10: only a same origin /api/avatar/ path is ever drawn, so a hostile payload cannot make the copy contact another host", async ({ page }) => {
    const { payload } = await makePayload();
    const hosts = new Set<string>();
    page.on("request", (r) => hosts.add(new URL(r.url()).host));
    for (const avatar of ["https://evil.example/pic.png", "//evil.example/pic.png", "javascript:alert(1)", "/somewhere/else.png"]) {
      await serve(page, { ...payload, profile: { ...payload.profile, avatar } });
      await page.goto(`${PAGE}#t=good`);
      await settled(page);
      await expect(page.locator("#report"), avatar).toHaveAttribute("data-ready", "1");
      await expect(headCircle(page), avatar).toHaveText("A");
      await expect(headCircle(page).locator("img"), avatar).toHaveCount(0);
      await page.unroute("**/api/render/payload");
    }
    expect([...hosts].some((h) => /evil/.test(h))).toBe(false);
  });
});
