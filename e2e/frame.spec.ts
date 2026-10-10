// The shared site frame and the 404 page (spec 0009). Runs on the Astro dev server, which serves src/pages/404.astro for an unknown
// address with status 404. What only Cloudflare Pages does (the root redirect, _headers, the status of the built 404.html, the
// functions) is checked on the built site by `pnpm verify:pages`. The team pages are shown signed out, which needs no account.
import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  { path: "/dhiinterviews/privacy.html", name: "privacy" },
  { path: "/dhiinterviews/terms.html", name: "terms" },
  { path: "/dhiinterviews/team.html", name: "team list" },
  { path: "/dhiinterviews/team-report.html?s=abc123", name: "team report" },
  { path: "/nope", name: "404" },
];
const WIDTHS = [390, 820, 1280];

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("the 404 page (AC-3)", () => {
  for (const path of ["/nope", "/dhiinterviews/nope", "/a/b/c/d", "/api/nope"]) {
    test(`covers AC-3: ${path} answers 404 with the styled page, its button and its styles at any depth`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(404);
      await expect(page.locator("main h1")).toHaveText("We could not find that page");
      await expect(page.locator("main p")).toHaveText("The address may have a typo, or the page may have moved. If a friend sent you this link, ask them to share it again.");
      const button = page.locator("main a.fr-btn");
      await expect(button).toHaveText("Go to DhiRise");
      await expect(button).toHaveAttribute("href", "/dhiinterviews/landing.html");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
      // the stylesheet loaded even though the address is deep: Mukta and the ink background are in force
      const look = await page.evaluate(() => ({ font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor }));
      expect(look.font).toContain("Mukta");
      expect(look.bg).toBe("rgb(11, 12, 24)");
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    });
  }

  test("covers AC-3: the Go to DhiRise button leads to the landing page", async ({ page }) => {
    await page.goto("/nope");
    await page.locator("main a.fr-btn").click();
    await expect(page).toHaveURL(/\/dhiinterviews\/landing((\.html)?)?$/);
  });
});

test.describe("the frame on its five pages (AC-4, AC-5, AC-9)", () => {
  for (const p of PAGES) {
    for (const width of WIDTHS) {
      test(`covers AC-9: ${p.name} at ${width}px has no sideways scroll, text of 16px or more, and tap targets of 44px or more`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(p.path);
        await expect(page.locator("header .fr-brand")).toBeVisible();
        expect(await sideways(page)).toBeLessThanOrEqual(0);

        const small = await page.evaluate(() => {
          const out: string[] = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const el = n.parentElement as HTMLElement;
            if (!n.textContent?.trim() || el.closest("[hidden]") || ["SCRIPT", "STYLE"].includes(el.tagName)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (size < 16) out.push(`${el.tagName.toLowerCase()} ${size}px "${n.textContent.trim().slice(0, 30)}"`);
          }
          return out;
        });
        expect(small).toEqual([]);

        const shortTargets = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("header .fr-brand, header .fr-back, footer a, main .fr-btn, main .tt-btn")) {
            if (el.closest("[hidden]") || el.hidden) continue;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height < 43.5) out.push(`${el.textContent?.trim().slice(0, 24)} ${Math.round(r.height)}px`);
          }
          return out;
        });
        expect(shortTargets).toEqual([]);
      });
    }
  }

  test("covers AC-5: the footer has the links, the privacy contact and the copyright, sits outside main, and has no heading", async ({ page }) => {
    await page.goto("/dhiinterviews/privacy.html");
    const footer = page.locator("footer");
    await expect(footer.locator("a")).toHaveText(["Privacy", "Terms", "privacy@dhirise.com"]);
    await expect(footer).toContainText(`© ${new Date().getFullYear()} DhiRise`);
    await expect(page.locator("main footer")).toHaveCount(0);
    await expect(footer.locator("h1, h2, h3")).toHaveCount(0);
    await expect(footer.locator('a[href^="mailto:"]')).toHaveAttribute("href", "mailto:privacy@dhirise.com");
  });

  test("covers AC-5: every link in the header and footer of every frame page ends at a page (200 after at most one redirect)", async ({ page }) => {
    const seen = new Set<string>();
    for (const p of PAGES) {
      await page.goto(p.path);
      const hrefs = await page.locator("header.fr-top a, footer.fr-foot a").evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""));
      for (const h of hrefs) {
        if (h.startsWith("mailto:")) continue;
        expect(h, `${p.name}: absolute address`).toMatch(/^\/dhiinterviews\//);
        seen.add(h);
      }
    }
    expect([...seen].sort()).toEqual(["/dhiinterviews/challenge.html", "/dhiinterviews/landing.html", "/dhiinterviews/privacy.html", "/dhiinterviews/terms.html"]);
    for (const h of seen) {
      const res = await page.request.get(h);
      expect(res.status(), h).toBe(200);
    }
  });

  test("covers AC-4: the terms page keeps its back link to the challenge, the privacy page its back link to the landing page", async ({ page }) => {
    await page.goto("/dhiinterviews/terms.html");
    await expect(page.locator("header .fr-back")).toHaveText("← Challenge");
    await expect(page.locator("header .fr-back")).toHaveAttribute("href", "/dhiinterviews/challenge.html");
    await page.goto("/dhiinterviews/privacy.html");
    await expect(page.locator("header .fr-back")).toHaveText("← Back");
    await expect(page.locator("header .fr-back")).toHaveAttribute("href", "/dhiinterviews/landing.html");
  });

  test("covers AC-6: the frame pages ask for nothing from any other address (no Google, no outside fonts or images)", async ({ page }) => {
    const hosts = new Set<string>();
    page.on("request", (req) => {
      const u = new URL(req.url());
      if (!["localhost", "127.0.0.1"].includes(u.hostname) && u.protocol.startsWith("http")) hosts.add(u.hostname);
    });
    for (const p of PAGES) await page.goto(p.path, { waitUntil: "networkidle" });
    expect([...hosts]).toEqual([]);
  });

  test("covers AC-4: the glass shows (blur and a translucent fill) on the header and the footer", async ({ page }) => {
    await page.goto("/dhiinterviews/terms.html");
    const style = await page.evaluate(() => {
      const bar = getComputedStyle(document.querySelector(".fr-bar")!);
      return { filter: bar.backdropFilter || (bar as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || "", bg: bar.backgroundColor };
    });
    expect(style.filter).toContain("blur");
    expect(style.bg).toMatch(/^rgba\(20, 15, 42, 0\.62\)$/);
  });

  test("covers AC-9: nothing moves in the frame (no animation or transition on any element)", async ({ page }) => {
    await page.goto("/dhiinterviews/privacy.html");
    const moving = await page.evaluate(() => [...document.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e);
      return (s.animationName && s.animationName !== "none") || parseFloat(s.transitionDuration) > 0;
    }).length);
    expect(moving).toBe(0);
  });

  test("covers AC-9: the keyboard focus is visible on the header, footer and button links", async ({ page }) => {
    await page.goto("/nope");
    await page.keyboard.press("Tab");
    await expect(page.locator("header .fr-brand")).toBeFocused();
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).toBe("solid");
  });
});

test.describe("the privacy and terms words stay the same (AC-8)", () => {
  test("covers AC-8: privacy has its 10 sections (the picture section is the fifth, the report link the sixth) and names the services; terms its 10", async ({ page }) => {
    await page.goto("/dhiinterviews/privacy.html");
    await expect(page.locator("main h1")).toHaveText("Privacy at DhiRise");
    await expect(page.locator("main h2")).toHaveCount(10);
    await expect(page.locator("main")).toContainText("Cloudflare Browser Run");
    await page.goto("/dhiinterviews/terms.html");
    await expect(page.locator("main h1")).toHaveText("Founding Circle Challenge: full terms");
    await expect(page.locator("main h2")).toHaveCount(10);
  });
});
