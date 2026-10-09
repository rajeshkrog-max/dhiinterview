// The team link to the saved report (spec 0008): the rules no single function test can see. They read the shipped files, so
// they fail the day someone weakens a header, lets the forwarder pass more than it should, puts a student's name on a page as
// HTML, or adds a team function that skips the team check. The behavior is covered in convex/team.test.ts and e2e/team.spec.ts.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("public/_headers: both team pages, on both addresses (AC-9, AC-10)", () => {
  // "/path\n  Header: value\n  Header: value" blocks, split on blank lines
  const blocks = Object.fromEntries(
    read("public/_headers")
      .split(/\n\s*\n/)
      .map((b) => b.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")))
      .filter((lines) => lines.length && lines[0].startsWith("/"))
      .map(([path, ...headers]) => [path.trim(), headers.map((h) => h.trim())]),
  );
  const PATHS = ["/dhiinterviews/team", "/dhiinterviews/team.html", "/dhiinterviews/team-report", "/dhiinterviews/team-report.html"];
  const header = (path, name) => blocks[path]?.find((h) => h.toLowerCase().startsWith(name.toLowerCase() + ":"))?.slice(name.length + 1).trim();

  test("covers AC-9: each of the four addresses is noindex and private, no-store", () => {
    for (const p of PATHS) {
      expect(blocks[p], p).toBeDefined();
      expect(header(p, "X-Robots-Tag"), p).toBe("noindex");
      expect(header(p, "Cache-Control"), p).toBe("private, no-store");
    }
  });

  test("covers AC-10: each content security policy allows only this site's own scripts, its own calls and a blob: PDF frame", () => {
    for (const p of PATHS) {
      const csp = header(p, "Content-Security-Policy");
      expect(csp, p).toBeTruthy();
      const rule = (name) => csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " "))?.slice(name.length + 1).split(/\s+/);
      expect(rule("default-src"), p).toEqual(["'self'"]);
      expect(rule("script-src"), p).toEqual(["'self'"]); // no inline scripts, no outside host, no eval
      expect(rule("connect-src"), p).toEqual(["'self'"]);
      expect(rule("frame-src"), p).toEqual(["blob:"]);
      expect(rule("object-src"), p).toEqual(["blob:"]);
      expect(rule("base-uri"), p).toEqual(["'none'"]);
      expect(csp, p).not.toMatch(/https?:|\*|unsafe-eval/);
    }
  });

  test("covers AC-10: the four rules are the same policy, so the two addresses of a page cannot drift apart", () => {
    const all = new Set(PATHS.map((p) => header(p, "Content-Security-Policy")));
    expect(all.size).toBe(1);
  });
});

describe("the Pages forwarder functions/api/team (AC-3, AC-9)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const load = async () => (await import("../functions/api/team/[[path]].ts")).onRequest;
  const call = async (request, env = { CONVEX_SITE_URL: "https://dev.example.convex.site" }, upstream = () => new Response("%PDF-1.7 x", { status: 200, headers: { "content-type": "application/pdf", "cache-control": "public, max-age=999", "set-cookie": "a=b" } })) => {
    const seen = [];
    vi.stubGlobal("fetch", async (url, init) => {
      seen.push({ url: String(url), method: init.method, headers: Object.fromEntries(new Headers(init.headers)), redirect: init.redirect });
      return upstream();
    });
    const res = await (await load())({ request, env });
    return { res, seen };
  };

  test("passes the path, the query string and the Authorization header on, and nothing else of the browser's request", async () => {
    const { res, seen } = await call(
      new Request("https://site.test/api/team/report?s=abc123", {
        headers: { authorization: "Bearer tok", cookie: "session=secret", origin: "https://evil.test", "x-forwarded-for": "1.2.3.4", "x-render-token": "t" },
      }),
    );
    expect(res.status).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://dev.example.convex.site/api/team/report?s=abc123");
    expect(seen[0].method).toBe("GET");
    expect(seen[0].redirect).toBe("manual");
    expect(Object.keys(seen[0].headers).sort()).toEqual(["accept", "accept-encoding", "authorization"]);
    expect(seen[0].headers.authorization).toBe("Bearer tok");
  });

  test("a request with no token sends no Authorization header", async () => {
    const { seen } = await call(new Request("https://site.test/api/team/list"));
    expect(seen[0].headers.authorization).toBeUndefined();
  });

  test("the answer is private, no-store and nosniff whatever the upstream said, and the body and status are kept", async () => {
    const { res } = await call(new Request("https://site.test/api/team/list"), undefined, () => new Response('{"code":"not_team"}', { status: 403, headers: { "cache-control": "public, max-age=999" } }));
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe('{"code":"not_team"}');
  });

  test("only GET is forwarded: anything else gets 405 and never reaches Convex", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const { res, seen } = await call(new Request("https://site.test/api/team/report?s=abc", { method, body: "x" }));
      expect(res.status, method).toBe(405);
      expect(res.headers.get("allow"), method).toBe("GET");
      expect(res.headers.get("cache-control"), method).toBe("private, no-store");
      expect(seen, method).toHaveLength(0);
    }
  });

  test("with no Convex address configured it answers 503 and calls nothing", async () => {
    const { res, seen } = await call(new Request("https://site.test/api/team/list"), {});
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(seen).toHaveLength(0);
  });

  test("an oversized query string is refused with 400 before it reaches Convex", async () => {
    const { res, seen } = await call(new Request("https://site.test/api/team/list?cursor=" + "a".repeat(4300)));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: "bad_request" });
    expect(seen).toHaveLength(0);
    const ok = await call(new Request("https://site.test/api/team/list?cursor=" + "a".repeat(4000)));
    expect(ok.res.status).toBe(200); // the longest cursor the server accepts still goes through
  });
});

describe("the team pages and their script (AC-10)", () => {
  const script = read("src/lib/team.ts");
  const pages = { "team.astro": read("src/pages/dhiinterviews/team.astro"), "team-report.astro": read("src/pages/dhiinterviews/team-report.astro") };
  // the code, without comments, so a comment that mentions innerHTML does not count
  const code = script.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  test("covers AC-10: nothing is ever put on the page as HTML or run as code", () => {
    for (const bad of [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\(/, /new Function\(/, /setTimeout\(\s*["'`]/, /srcdoc/]) {
      expect(code, String(bad)).not.toMatch(bad);
    }
  });

  test("covers AC-10: student names and classes are set with textContent, and every id in an address is encoded", () => {
    expect(code).toMatch(/name\.textContent = r\.name/);
    expect(code).toMatch(/meta\.textContent = `\$\{r\.class\}/);
    expect(code).toMatch(/"team-report\.html\?s=" \+ encodeURIComponent\(r\.studentId\)/);
    expect(code).toMatch(/"\/api\/team\/report\?s=" \+ encodeURIComponent\(code\)/);
    expect(code).toMatch(/"ref=" \+ encodeURIComponent\(ref\)/);
    expect(code).toMatch(/"cursor=" \+ encodeURIComponent\(next\)/);
    // the only places an address is built from the page's own address are the fixed return paths
    expect(code).toMatch(/const LIST_PAGE = "\/dhiinterviews\/team\.html"/);
    expect(code).toMatch(/const REPORT_PAGE = "\/dhiinterviews\/team-report\.html"/);
  });

  test("covers AC-4: the return address keeps `s` only when it looks like a code", () => {
    expect(code).toMatch(/const CODE = \/\^\[A-Za-z0-9\]\{1,64\}\$\//);
    expect(code).toMatch(/CODE\.test\(code\)/);
  });

  test("covers AC-10: the script keeps nothing on the device and reads nothing from outside", () => {
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    expect(code).not.toMatch(/https?:\/\//); // no outside address at all
  });

  test("covers AC-10: the pages have no inline script, no inline handler and no outside address, so the policy can stay strict", () => {
    for (const [name, text] of Object.entries(pages)) {
      const html = text.replace(/^---[\s\S]*?---/, "");
      expect(html, name).not.toMatch(/is:inline/);
      expect(html, name).not.toMatch(/\son[a-z]+=/i); // onclick=, onerror=, ...
      expect(html, name).not.toMatch(/https?:\/\//);
      expect(html, name).not.toMatch(/<iframe[^>]*\ssrc=/i); // the viewer's frame gets its blob address from the script
      expect(html, name).toMatch(/<meta name="robots" content="noindex, nofollow">/);
      expect(html.match(/<script\b/g), name).toHaveLength(1); // the one bundled import of src/lib/team
      expect(html, name).toMatch(/import "\.\.\/\.\.\/lib\/team"/);
    }
  });

  test("covers AC-4: neither team page uses the student page guard, which would send a team member to the landing page", () => {
    for (const [name, text] of Object.entries(pages)) {
      expect(text, name).not.toMatch(/<Guard|components\/Guard/);
      expect(text, name).not.toMatch(/lib\/session/);
    }
    expect(code).not.toMatch(/from "\.\/session"/);
  });
});

describe("the team functions on the server (AC-4, AC-9)", () => {
  const team = read("convex/team.ts");
  const http = read("convex/teamHttp.ts");

  test("covers AC-4: every function in team.ts is internal and runs the team check before anything else", () => {
    const exported = [...team.matchAll(/export const (\w+) = (\w+)\(/g)];
    expect(exported.map((m) => m[1]).sort()).toEqual(["list", "openFile"]);
    for (const [, name, kind] of exported) {
      expect(["internalQuery", "internalMutation"], name).toContain(kind);
      const body = team.slice(team.indexOf(`export const ${name} =`));
      const handler = body.slice(body.indexOf("handler:"));
      const firstUse = handler.search(/ctx\.db\./);
      expect(handler.indexOf("await teamGate(ctx)"), `${name} must check the team first`).toBeGreaterThan(-1);
      expect(handler.indexOf("await teamGate(ctx)"), `${name} must check before reading data`).toBeLessThan(firstUse);
    }
  });

  test("covers AC-4: the team check reads the setting on every call and never caches it", () => {
    expect(team).toMatch(/mayEnterTeam\(user, env\.TEAM_EMAILS, env\.TEST_SIGNIN_ENABLED\)/);
    expect(team).not.toMatch(/^(let|var)\s/m);
    expect(read("convex/teamCore.ts")).not.toMatch(/^(let|var)\s/m);
  });

  test("covers AC-9: both routes answer through one json helper that sets private, no-store", () => {
    expect(http).toMatch(/const NO_STORE = "private, no-store"/);
    expect(http.match(/new Response\(/g)).toHaveLength(2); // the json helper and the PDF
    expect(http).toMatch(/"cache-control": NO_STORE/g);
    expect(http.match(/"cache-control": NO_STORE/g)).toHaveLength(2);
  });

  test("covers AC-5: the PDF route serves only the file openFile confirmed, and writes nothing itself", () => {
    expect(http).toMatch(/ctx\.runMutation\(internal\.team\.openFile/);
    expect(http).toMatch(/ctx\.storage\.get\(res\.storageId\)/);
    expect(http).not.toMatch(/reportViews|ctx\.db|storage\.(store|delete)/);
  });

  test("covers AC-3: the dev server forwards /api/team to Convex like the production forwarder", () => {
    expect(read("astro.config.mjs")).toMatch(/'\/api\/team': \{ target: convexSite/);
  });
});
