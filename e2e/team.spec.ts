// The team list and the team's report viewer (spec 0008). Runs on the dev deployment with the fake test sign in. The team account
// is team.e2e@example.com, which is on dev's TEAM_EMAILS (set with `convex env set`, see the spec's configuration). The pages are
// tested against the real server for sign in and the team check, and against answers the test serves itself when it needs a
// ready report, a long list, a hostile name or a server problem, because dev has no Browser Run to make a real copy.
// The content security policy and the PDF inside the page need the built site with its headers: see the live check in verify.md.
import { expect, test, type Page, type Route } from "@playwright/test";
import { PATH, newStudent, newTag } from "./helpers";

const TEAM = "team.e2e@example.com";
const LIST = PATH + "team.html";
const VIEW = PATH + "team-report.html";
const PDF = "%PDF-1.4\n% a tiny pretend report\n";

type Row = { studentId: string; name: string; class: string; madeAt: number };
const row = (i: number, over: Partial<Row> = {}): Row => ({ studentId: "id" + i, name: "Student " + i, class: "College", madeAt: Date.UTC(2026, 9, 9, 10, 15) - i * 60_000, ...over });
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// Opens a team page, signs in as the team account with the fake sign in and loads the page again, signed in.
async function signInAsTeam(page: Page, path: string, email = TEAM) {
  await page.goto(path);
  await page.locator("#signIn:not([hidden])").waitFor();
  const res = await page.evaluate((e) => (window as unknown as { DhiTeam: { testSignIn: (e: string) => Promise<{ ok: boolean }> } }).DhiTeam.testSignIn(e), email);
  expect(res.ok).toBe(true);
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.describe("signed out (AC-4)", () => {
  test("covers AC-4: a signed out visitor sees a Sign in with Google button and no list, on both pages", async ({ page }) => {
    for (const p of [LIST, VIEW + "?s=abc123"]) {
      await page.goto(p);
      await expect(page.locator("#signIn")).toBeVisible();
      await expect(page.locator("#signIn")).toHaveText("Sign in with Google");
      await expect(page.locator("#rows li")).toHaveCount(0);
      await expect(page.locator("#signOut")).toBeHidden();
      await expect(page.locator("#pdf")).toBeHidden();
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
  });

  test("covers AC-4: if Google refuses the sign in (?signin=error) the page says so in plain words", async ({ page }) => {
    await page.goto(LIST + "?signin=error");
    await expect(page.locator("#msg")).toContainText("Google did not let you in");
    await expect(page.locator("#signIn")).toBeVisible();
  });

  test("covers AC-4: after Google, the person returns to the same page and the same report; a free address is never used", async ({ page }) => {
    const sent: { callbackURL: string; errorCallbackURL: string }[] = [];
    await page.route("**/api/auth/sign-in/social", async (route) => {
      sent.push(JSON.parse(route.request().postData() ?? "{}"));
      await json(route, 200, { url: LIST + "?stubbed=1", redirect: false });
    });
    const click = async (path: string) => {
      await page.goto(path);
      await page.locator("#signIn:not([hidden])").waitFor();
      const n = sent.length;
      await page.click("#signIn");
      await expect.poll(() => sent.length).toBe(n + 1);
      return sent[n];
    };

    expect((await click(LIST)).callbackURL).toBe("/dhiinterviews/team.html");
    const good = await click(VIEW + "?s=abc123XYZ");
    expect(good.callbackURL).toBe("/dhiinterviews/team-report.html?s=abc123XYZ");
    expect(good.errorCallbackURL).toBe("/dhiinterviews/team-report.html?s=abc123XYZ&signin=error");
    for (const hostile of ["//evil.example/x", "https://evil.example", "abc&next=https://evil.example", "<script>alert(1)</script>", "a/../b", "x".repeat(65)]) {
      const sentOne = await click(VIEW + "?s=" + encodeURIComponent(hostile));
      expect(sentOne.callbackURL, hostile).toBe("/dhiinterviews/team-report.html");
      expect(sentOne.errorCallbackURL, hostile).toBe("/dhiinterviews/team-report.html?signin=error");
    }
    // a list page ignores `s` completely
    expect((await click(LIST + "?s=abc123")).callbackURL).toBe("/dhiinterviews/team.html");
  });
});

test.describe("an account that is not on the list (AC-4)", () => {
  test("covers AC-4: a student gets a plain refusal on both pages, no student data and a Sign out button", async ({ page }) => {
    await newStudent(page, newTag(), "Eli Tester");
    for (const p of [LIST, VIEW + "?s=abc123"]) {
      await page.goto(p);
      await expect(page.locator("#msg")).toContainText("not on the DhiRise team list");
      await expect(page.locator("#signOut")).toBeVisible();
      await expect(page.locator("#rows li")).toHaveCount(0);
      await expect(page.locator("#pdf")).toBeHidden();
      await expect(page.locator("body")).not.toContainText("Eli Tester");
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
    // Sign out ends the session, so the next load asks for a sign in again and another account can be used
    await page.click("#signOut");
    await expect(page.locator("#signIn")).toBeVisible();
  });

  test("covers AC-4: an account that is signed in but not on the list is refused by the real routes", async ({ page }) => {
    await signInAsTeam(page, LIST, "someone.else.e2e@example.com");
    await page.reload();
    await expect(page.locator("#msg")).toContainText("not on the DhiRise team list");
    await expect(page.locator("#listBox")).toBeHidden();
    await expect(page.locator("#signOut")).toBeVisible();
  });
});

test.describe("the list (AC-1, AC-2, AC-10)", () => {
  test("covers AC-1: the real route answers for a team account, with no error on the page", async ({ page }) => {
    await signInAsTeam(page, LIST);
    await page.reload();
    await expect(page.locator("#listBox")).toBeVisible();
    await expect(page.locator("#signOut")).toBeVisible();
    await expect(page.locator("#msg.bad")).toHaveCount(0);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("covers AC-1: names and classes show as plain text, the date is India time, Open opens a new tab with an encoded address", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, timezoneId: "America/Los_Angeles" }); // not India
    const page = await ctx.newPage();
    await signInAsTeam(page, LIST);
    const evil = "<img src=x onerror=window.__pwn=1>";
    const long = "W".repeat(120);
    await page.route("**/api/team/list*", (route) =>
      json(route, 200, { rows: [row(1, { name: evil, studentId: "a b&c" }), row(2, { name: long, class: "Class 10" })], next: null }),
    );
    await page.reload();
    await expect(page.locator("#rows li")).toHaveCount(2);
    const first = page.locator("#rows li").first();
    await expect(first.locator(".tt-name")).toHaveText(evil); // text, not markup
    await expect(page.locator("#rows img")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __pwn?: number }).__pwn)).toBeUndefined();
    await expect(first.locator(".tt-meta")).toHaveText(/College · 9 Oct 2026, 3:44\s?pm/i); // 10:14 UTC = 3:44 pm in India, whatever the viewer's zone
    const open = first.locator("a");
    await expect(open).toHaveText("Open");
    await expect(open).toHaveAttribute("href", "team-report.html?s=a%20b%26c");
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener");
    await expect(page.locator("#rows li").nth(1).locator(".tt-meta")).toContainText("Class 10");
    expect(await overflow(page)).toBeLessThanOrEqual(0); // a very long name wraps, nothing scrolls sideways
    // no phone, email, score or flag on the page
    await expect(page.locator("body")).not.toContainText(/@|phone|score|flag/i);
    await ctx.close();
  });

  test("covers AC-1: 50 at a time, and Load more adds the next page and then goes away", async ({ page }) => {
    await signInAsTeam(page, LIST);
    const seen: string[] = [];
    await page.route("**/api/team/list*", (route) => {
      const url = new URL(route.request().url());
      seen.push(url.search);
      if (url.searchParams.get("cursor") === "next-page") return json(route, 200, { rows: [row(51), row(52)], next: null });
      return json(route, 200, { rows: Array.from({ length: 50 }, (_, i) => row(i)), next: "next-page" });
    });
    await page.reload();
    await expect(page.locator("#rows li")).toHaveCount(50);
    await expect(page.locator("#more")).toBeVisible();
    await page.click("#more");
    await expect(page.locator("#rows li")).toHaveCount(52);
    await expect(page.locator("#more")).toBeHidden();
    expect(seen).toEqual(["", "?cursor=next-page"]);
  });

  test("covers AC-2: the box finds one student by code, ignores spaces, says 'No saved report found' for nothing, and Show all comes back", async ({ page }) => {
    await signInAsTeam(page, LIST);
    const asked: (string | null)[] = [];
    await page.route("**/api/team/list*", (route) => {
      const ref = new URL(route.request().url()).searchParams.get("ref");
      asked.push(ref);
      if (ref === "id7") return json(route, 200, { rows: [row(7, { name: "Found One" })], next: null });
      if (ref !== null) return json(route, 200, { rows: [], next: null });
      return json(route, 200, { rows: [row(1), row(2)], next: null });
    });
    await page.reload();
    await expect(page.locator("#rows li")).toHaveCount(2);

    await page.fill("#ref", "   id7  ");
    await page.click("#findBtn");
    await expect(page.locator("#rows li")).toHaveCount(1);
    await expect(page.locator("#rows .tt-name")).toHaveText("Found One");
    await expect(page.locator("#showAll")).toBeVisible();

    await page.fill("#ref", "unknown-code");
    await page.click("#findBtn");
    await expect(page.locator("#rows li")).toHaveCount(0);
    await expect(page.locator("#msg")).toHaveText("No saved report found");

    await page.fill("#ref", "");
    await page.click("#findBtn");
    await expect(page.locator("#msg")).toHaveText("No saved report found"); // an empty code is not an error page

    await page.click("#showAll");
    await expect(page.locator("#rows li")).toHaveCount(2);
    await expect(page.locator("#ref")).toHaveValue("");
    expect(asked).toEqual([null, "id7", "unknown-code", "", null]);
  });

  test("covers AC-1: a server problem and being offline each get kind words and a Try again button", async ({ page }) => {
    await signInAsTeam(page, LIST);
    let mode: "500" | "offline" | "ok" = "500";
    await page.route("**/api/team/list*", (route) =>
      mode === "500" ? json(route, 500, {}) : mode === "offline" ? route.abort("connectionrefused") : json(route, 200, { rows: [row(1)], next: null }),
    );
    await page.reload();
    await expect(page.locator("#msg")).toContainText("Something went wrong on our side");
    mode = "offline";
    await page.locator("#msg button").click();
    await expect(page.locator("#msg")).toContainText("could not reach DhiRise");
    mode = "ok";
    await page.locator("#msg button").click();
    await expect(page.locator("#rows li")).toHaveCount(1);
    await expect(page.locator("#msg")).toBeHidden();
  });
});

test.describe("the viewer (AC-3, AC-6, AC-7, AC-10)", () => {
  test("covers AC-3: the PDF shows inside the page from a blob address, and Download saves it under the file name from the server", async ({ page }) => {
    await signInAsTeam(page, VIEW + "?s=abc123");
    const asked: string[] = [];
    await page.route("**/api/team/report*", (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({
        status: 200,
        headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="DhiRise-report-Asha.pdf"', "cache-control": "private, no-store" },
        body: PDF,
      });
    });
    await page.goto(VIEW + "?s=abc123");
    await expect(page.locator("#viewerBox")).toBeVisible();
    await expect(page.locator("#pdf")).toHaveAttribute("src", /^blob:/);
    await expect(page.locator("#signOut")).toBeVisible();
    await expect(page.locator("#msg")).toBeHidden();
    expect(asked).toEqual(["?s=abc123"]);
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
    expect(download.suggestedFilename()).toBe("DhiRise-report-Asha.pdf");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test("covers AC-3: bytes that do not start with %PDF- are never shown", async ({ page }) => {
    await signInAsTeam(page, VIEW + "?s=abc123");
    await page.route("**/api/team/report*", (route) => route.fulfill({ status: 200, contentType: "application/pdf", body: "<html><script>window.__pwn=1</script></html>" }));
    await page.goto(VIEW + "?s=abc123");
    await expect(page.locator("#msg")).toContainText("This file could not be shown");
    await expect(page.locator("#viewerBox")).toBeHidden();
    await expect(page.locator("#pdf")).not.toHaveAttribute("src", /./);
  });

  test("covers AC-7: not ready, a missing code and a code that is not a code all say 'This report copy is not ready.'", async ({ page }) => {
    await signInAsTeam(page, VIEW + "?s=abc123");
    const asked: string[] = [];
    await page.route("**/api/team/report*", (route) => {
      asked.push(new URL(route.request().url()).searchParams.get("s") ?? "<none>");
      return json(route, 404, { code: "not_ready" });
    });
    for (const p of ["?s=abc123", "", "?s=%3Cscript%3E", "?s="]) {
      await page.goto(VIEW + p);
      await expect(page.locator("#msg")).toHaveText("This report copy is not ready.");
      await expect(page.locator("#viewerBox")).toBeHidden();
      await expect(page.locator("#backBox a")).toBeVisible();
    }
    expect(asked).toEqual(["abc123", "", "<script>", ""]);
  });

  test("covers AC-6: when the hourly limit is used up the page shows the server's plain message with the time", async ({ page }) => {
    await signInAsTeam(page, VIEW + "?s=abc123");
    const message = "You have opened the most reports allowed in one hour. Please try again after 3:45 pm (India time).";
    await page.route("**/api/team/report*", (route) => json(route, 429, { code: "rate_limited", retryAt: Date.now() + 600_000, message }));
    await page.goto(VIEW + "?s=abc123");
    await expect(page.locator("#msg")).toHaveText(message);
    await expect(page.locator("#viewerBox")).toBeHidden();
  });

  test("covers AC-4: a session that ended (401) goes back to Sign in, and an account removed from the list (403) is refused", async ({ page }) => {
    await signInAsTeam(page, VIEW + "?s=abc123");
    await page.route("**/api/team/report*", (route) => json(route, 401, { code: "not_signed_in" }));
    await page.goto(VIEW + "?s=abc123");
    await expect(page.locator("#signIn")).toBeVisible();
    await expect(page.locator("#msg")).toContainText("sign in has ended");
    await page.unroute("**/api/team/report*");
    await page.route("**/api/team/report*", (route) => json(route, 403, { code: "not_team" }));
    await page.goto(VIEW + "?s=abc123");
    await expect(page.locator("#msg")).toContainText("not on the DhiRise team list");
    await expect(page.locator("#signOut")).toBeVisible();
    await expect(page.locator("#pdf")).toBeHidden();
  });

  test("covers AC-7: the real route says not ready for a code that is not a student", async ({ page }) => {
    await signInAsTeam(page, VIEW + "?s=nosuchstudent123");
    await page.goto(VIEW + "?s=nosuchstudent123");
    await expect(page.locator("#msg")).toHaveText("This report copy is not ready.");
  });

  test("covers AC-4: Sign out ends the session, and a reload asks for a sign in again with the report code kept", async ({ page }) => {
    await signInAsTeam(page, VIEW + "?s=abc123");
    await page.goto(VIEW + "?s=abc123");
    await expect(page.locator("#signOut")).toBeVisible();
    await page.click("#signOut");
    await expect(page.locator("#signIn")).toBeVisible();
    await expect(page).toHaveURL(/team-report\.html\?s=abc123$/);
  });
});
