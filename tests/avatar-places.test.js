// The profile picture in the places other than the student's own screens (spec 0011, M3: AC-4, AC-5, AC-13, AC-17): the saved PDF copy
// and its render page, the team list and viewer, and the leaderboard rows. What can be checked from the source and the mock api without a
// browser; the real pages are looked at in M5. The server side of each place is in convex/avatars.test.ts, reportCopy.test.ts and team.test.ts.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// the code only, so a comment that names a word does not count
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^---[\s\S]*?---/, "").replace(/^\s*\/\/.*$/gm, "");

describe("the saved PDF copy (AC-4, AC-17)", () => {
  const report = read("public/dhiinterviews/js/report-student.js");
  const boot = read("public/dhiinterviews/js/render-boot.js");
  const page = read("src/pages/dhiinterviews/report-render.astro");

  test("covers AC-4: the copy draws a 64px circle only when the payload carried a picture path, and never wires itself to the session", () => {
    expect(report).toMatch(/if \(!HIDE\) pic = DhiAvatar\.mine\(\{ size: 64, name: profile\.name \}\);/);
    expect(report).toMatch(/else if \(profile\.avatar\) pic = DhiAvatar\.make\(\{ url: profile\.avatar, name: profile\.name, size: 64 \}\);/);
    expect(code(report)).not.toMatch(/googleusercontent/);
  });

  test("covers AC-17: the render page loads the picture eagerly (no lazy), and the copy waits for it at most 3 seconds, then keeps the initials", () => {
    expect(code(report)).not.toMatch(/lazy: true/);
    expect(boot).toContain("var PICTURE_WAIT_MS = 3000;");
    expect(boot).toMatch(/DhiAvatar\.update\(img\.parentNode, null\)/); // after the wait: the initials
    expect(boot).toMatch(/Promise\.all\(\[fonts, logo \? decoded\(logo\) : Promise\.resolve\(\), pictureSettled\(\)\]\)/); // ready only after it
    expect(boot).toMatch(/img\.addEventListener\("load", done\)/);
    expect(boot).toMatch(/img\.addEventListener\("error", done\)/); // a broken picture never holds the copy
  });

  test("covers AC-4: the render page loads the picture helper and its styles before the boot script, and still no sign in, session or tracking", () => {
    expect(page).toContain('href="css/avatar.css"');
    expect(page.indexOf('src="js/avatar.js"')).toBeGreaterThan(0);
    expect(page.indexOf('src="js/avatar.js"')).toBeLessThan(page.indexOf('src="js/render-boot.js"'));
    expect(code(page)).not.toMatch(/Guard|session|posthog|leaves|challenge|music/i);
  });

  test("covers AC-4: REPORT_VERSION is not bumped for a picture (it is not report content)", () => {
    expect(read("convex/reportVersion.ts")).toContain("REPORT_VERSION");
    expect(code(read("convex/reportCopy.ts"))).not.toMatch(/avatar[^\n]*REPORT_VERSION|REPORT_VERSION[^\n]*avatar/i);
  });
});

describe("the team pages (AC-4, AC-13)", () => {
  const team = code(read("src/lib/team.ts"));

  test("covers AC-4: the list row has a 28px lazy circle and the viewer a 40px one, drawn by the shared helper from the server's path", () => {
    expect(team).toMatch(/circle\(r\.avatar, r\.name, 28, true\)/);
    expect(team).toMatch(/circle\(r\.avatar, r\.name, 40\)/);
    expect(team).toMatch(/avatar: typeof r\.avatar === "string" \? r\.avatar : null/);
    expect(team).toContain('"/api/team/list?ref=" + encodeURIComponent(code)'); // the viewer asks the one row for its code
  });

  test("covers AC-13: the pages load the helper as a same site file and the strict policy is unchanged", () => {
    for (const p of ["team", "team-report"]) {
      const html = read(`src/pages/dhiinterviews/${p}.astro`);
      expect(html).toContain('href="/dhiinterviews/css/avatar.css"');
      expect(html).toContain('<script is:inline src="/dhiinterviews/js/avatar.js"></script>');
      expect(html.indexOf("avatar.js")).toBeLessThan(html.indexOf('import "../../lib/team"')); // the helper is there before the module runs
    }
    expect(read("public/_headers")).not.toMatch(/img-src[^\n]*(lh\d|googleusercontent|https:)/);
  });

  test("covers AC-4: a name or class is never drawn as HTML, and the picture path goes only through the helper (which draws only /api/avatar/ paths)", () => {
    expect(team).not.toMatch(/\.innerHTML\b|insertAdjacentHTML/);
    expect(team).not.toMatch(/new Image\(|\.src = r\.avatar|createElement\("img"\)/);
  });
});

describe("the leaderboard rows (AC-4, AC-5)", () => {
  const board = read("public/dhiinterviews/js/leaderboard.js");

  test("covers AC-4: a row's picture replaces its owl only when the row carries a path, is not a demo row, and the feature is on in this browser", () => {
    expect(board).toMatch(/if \(row && row\.avatar && !row\.demo && picturesOn\(\)\)/);
    expect(board).toMatch(/size: cls === "big" \? 40 : 28, lazy: true/);
    expect(board).toMatch(/avatar\(row\.style, "big", row\)/);
    expect(board).toMatch(/avatar\(row\.style, "", row\)/);
    expect(code(board)).not.toMatch(/googleusercontent/);
  });

  test("covers AC-4: the leaderboard page already loads the picture helper and its styles", () => {
    const html = read("src/pages/dhiinterviews/leaderboard.astro");
    expect(html).toContain('href="css/avatar.css"');
    expect(html).toContain('src="js/avatar.js"');
  });
});

describe("the challenge mock api: the avatar contract on leaderboard rows (AC-4, AC-5)", () => {
  function makeStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
  }
  beforeAll(() => {
    globalThis.window = globalThis;
  });
  beforeEach(async () => {
    vi.resetModules();
    globalThis.localStorage = makeStorage();
    delete globalThis.DhiApi;
    await import("../public/dhiinterviews/js/api.js");
  });

  test("covers AC-5: every row has an avatar field, and the demo rows never carry a picture", async () => {
    const rows = await globalThis.DhiApi.getLeaderboard();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r, r.displayName).toHaveProperty("avatar", null);
    expect(rows.every((r) => r.demo)).toBe(true);
  });

  test("covers AC-4: the contract is documented where the backend will read it", () => {
    const api = read("public/dhiinterviews/js/api.js");
    expect(api).toContain("leaderboardPictureFor");
    expect(api).toContain("LEADERBOARD_PICTURES_ENABLED");
  });
});

describe("the other places stay clear of the pages that must not carry a picture (AC-5)", () => {
  test.each(["question", "question2", "questions", "meet"])("covers AC-5: the %s page loads no picture script or style", (name) => {
    expect(read(`src/pages/dhiinterviews/${name}.astro`)).not.toMatch(/avatar|picture-/);
  });

  test("covers AC-5: the Sheet copy and the Founding Card image code never mention the picture", () => {
    for (const f of ["convex/sheetRows.ts", "convex/sheetRowsCore.ts", "convex/sheetFlush.ts", "convex/sheetSync.ts", "public/dhiinterviews/js/card-export.js", "public/dhiinterviews/js/card.js"]) {
      expect(code(read(f)), f).not.toMatch(/avatar|picture/i);
    }
  });
});
