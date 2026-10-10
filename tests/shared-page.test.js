// The public report page (spec 0010, milestone 1): things that can be checked from the source and the forwarder without a browser. The real
// page is exercised in e2e/shared.spec.ts. Each test names the acceptance criterion it covers.
import { readFileSync } from "node:fs";
import { describe, expect, test, vi, afterEach } from "vitest";
import { onRequest } from "../functions/api/shared/[[path]].ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const bytes = (p) => readFileSync(new URL(`../${p}`, import.meta.url));
// code only: the comments describe what the file does not do, and would match the scans below
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^---[\s\S]*?---/, "").replace(/^\s*\/\/.*$/gm, "");

const shell = read("src/pages/dhiinterviews/shared.astro");
const boot = read("public/dhiinterviews/js/shared-boot.js");
const css = read("public/dhiinterviews/css/shared.css");
const redirects = read("public/_redirects");
const headers = read("public/_headers");
const report = read("public/dhiinterviews/js/report-student.js");
const JS = "public/dhiinterviews/js/";
const scriptsOf = (html) => [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);

// the rule block of a path in _headers (a line holding the path, then the indented lines under it)
const rule = (path) => {
  const m = new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\r?\\n((?:[ \\t]+.+\\r?\\n?)+)`, "m").exec(headers);
  return m ? m[1] : null;
};

describe("the shell and its address (AC-8)", () => {
  test("covers AC-8: every /s/ address is rewritten to the one static page with status 200", () => {
    expect(redirects).toMatch(/^\/s\/\* \/dhiinterviews\/shared 200\s*$/m);
  });

  test("covers AC-8: /s/* gets noindex, no referrer and no cache, in the headers file", () => {
    const r = rule("/s/*");
    expect(r, "no _headers rule for /s/*").not.toBeNull();
    expect(r).toMatch(/X-Robots-Tag:\s*noindex/);
    expect(r).toMatch(/Referrer-Policy:\s*no-referrer/);
    expect(r).toMatch(/Cache-Control:\s*no-store/);
  });

  test("covers AC-8, AC-13: the policy on /s/* lets the page load only this site's own files (plus the card's blob picture), and no frame embeds it", () => {
    const csp = /Content-Security-Policy:\s*(.+)/.exec(rule("/s/*") ?? "")?.[1] ?? "";
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/connect-src 'self'/);
    expect(csp).toMatch(/img-src 'self' data: blob:/);
    expect(csp).toMatch(/font-src 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).not.toMatch(/https?:|\*/); // no outside address, no wildcard
  });

  test("covers AC-8: the shell's own address is kept out of search results too", () => {
    for (const p of ["/dhiinterviews/shared", "/dhiinterviews/shared.html"]) expect(rule(p), p).toMatch(/X-Robots-Tag:\s*noindex/);
  });

  test("covers AC-8: a fixed title and description, noindex, an absolute picture address on our own domain, no og:url, and the code nowhere in a tag", () => {
    expect(shell).toMatch(/<title>\{TITLE\}<\/title>/);
    expect(shell).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(shell).toContain('<meta property="og:image" content={PREVIEW}>');
    expect(shell).toMatch(/const SITE_ORIGIN = "https:\/\/dhirise\.com"/);
    expect(shell).toMatch(/const PREVIEW = `\$\{SITE_ORIGIN\}\/dhiinterviews\/assets\/share-preview\.v1\.png`/);
    expect(code(shell)).not.toMatch(/og:url/);
    // nothing in the page reads the address or the request, so nothing about a code can reach a tag
    expect(shell).not.toMatch(/Astro\.(url|request|params)|location\./);
    expect(code(shell)).not.toMatch(/\bcode\b/i);
  });

  test("covers AC-8: the preview picture exists and is a 1200 by 630 PNG", () => {
    const png = bytes("public/dhiinterviews/assets/share-preview.v1.png");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
    expect(shell).toContain('content="1200"');
    expect(shell).toContain('content="630"');
  });

  test("covers AC-8: relative addresses resolve under /dhiinterviews/, whatever the page address is", () => {
    expect(shell).toContain('<base href="/dhiinterviews/">');
    for (const s of [...scriptsOf(shell), ...[...shell.matchAll(/<link[^>]*\shref="([^"]+)"/g)].map((m) => m[1])]) expect(s, s).not.toMatch(/^(\/|https?:)/);
  });
});

describe("what the public page loads (AC-13)", () => {
  test("covers AC-13: only these scripts, in this order, none that sign in, track, animate, play sound or keep an identity", () => {
    expect(scriptsOf(shell)).toEqual([
      "js/funnel-config.js",
      "js/engine/questions.js",
      "js/engine/reportText.js",
      "js/card-export.js",
      "js/card-image.js",
      "js/avatar.js",
      "js/shared-boot.js",
    ]);
    expect(code(shell)).not.toMatch(/Guard|session|posthog|leaves|identity|challenge|music|card\.js|api\.js|store\.js/i);
  });

  test("covers AC-13: nothing is loaded from a third party: no outside address in the page, its script or its style, and no Google Fonts", () => {
    const outside = (text) => [...text.matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]);
    // the only address in the page is the production origin the link preview picture needs (an absolute address is required there)
    expect(outside(code(shell))).toEqual([]);
    expect(outside(code(boot))).toEqual([]);
    expect(outside(code(css))).toEqual([]);
    expect(shell + boot + css).not.toMatch(/googleapis|gstatic|fonts\.google|cdn\.|unpkg|jsdelivr|posthog|googletagmanager/i);
  });

  test("covers AC-13: the fonts are our own Mukta files and the headings use Mukta, not the Google hosted heading font", () => {
    expect(css).toMatch(/--f-head:"Mukta"/);
    for (const f of ["400", "600", "700"]) expect(css).toContain(`/dhiinterviews/fonts/mukta-${f}.v1.woff2`);
  });

  test("covers AC-13: no script the page loads keeps a cookie or touches localStorage or sessionStorage (the report script only behind its public mode check)", () => {
    for (const f of ["funnel-config.js", "engine/questions.js", "engine/reportText.js", "card-export.js", "card-image.js", "avatar.js", "shared-boot.js"]) {
      expect(code(read(JS + f)), f).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    }
    const lines = code(report).split("\n").filter((l) => /localStorage|sessionStorage|document\.cookie|indexedDB/.test(l));
    // the one read of the week ticks is skipped in public mode; the one write is only reachable from a tick button, and the public page draws none
    expect(lines.map((l) => l.trim())).toEqual([
      expect.stringContaining("if (!SHARED) { try { saved = JSON.parse(localStorage.getItem(KEY)); }"),
      expect.stringContaining("function keep() { try { localStorage.setItem(KEY"),
    ]);
  });

  test("covers AC-13: the fetch sends no cookie and no referrer, and the code goes in a header, not in the address", () => {
    expect(boot).toContain('fetch("/api/shared/payload"');
    expect(boot).toContain('"x-share-token": code');
    expect(boot).toContain('credentials: "omit"');
    expect(boot).toContain('referrerPolicy: "no-referrer"');
    expect(code(boot)).not.toMatch(/console\.|localStorage|sessionStorage|document\.cookie|history\.|postMessage|dataLayer/);
  });
});

describe("the report in public mode (AC-4, AC-15)", () => {
  test("covers AC-4: public mode hides what print mode hides, plus the picture row, the notice and the Download button, through one flag", () => {
    expect(report).toContain("var SHARED = window.DHI_SHARED || null;");
    expect(report).toContain("var HIDE = PRINT || SHARED;");
    for (const part of [
      "var activeFlags = HIDE ? []", // no text that comes from a sensitive flag
      "if (!HIDE && window.DhiSession && DhiSession.reportCopy && window.DhiReportDownload)", // no Download
      /if \(!HIDE\) \{\s*var trophy/, // no trophy link
      "if (!HIDE && window.DhiPictureNotice)",
      "if (!HIDE) (function join()", // no join card
      "if (!HIDE) (function feedback()", // no feedback box
      "if (!HIDE) [1, 2].forEach", // no blurred week teasers
      "if (!HIDE) for (var d = 1; d <= 7; d++)", // no week tick boxes
      "if (!HIDE && window.DhiPictureControl)", // no Remove my picture row
    ]) {
      if (part instanceof RegExp) expect(report, String(part)).toMatch(part);
      else expect(report, part).toContain(part);
    }
  });

  test("covers AC-4: no class on the heading line comes from the page, only what the payload carries (and it carries none)", () => {
    expect(report).toContain('[profile.class, date].filter(Boolean).join(" · ")');
    expect(code(boot)).not.toMatch(/class:|\.class\b|\.age\b|email|phone/);
  });

  test("covers AC-4, spec 0011: the sharer's picture is drawn from the payload's path, not from the visitor's own DhiSession picture", () => {
    expect(report).toContain("if (!HIDE) pic = DhiAvatar.mine({ size: 64, name: profile.name });");
    expect(report).toMatch(/else if \(profile\.avatar\) pic = DhiAvatar\.make\(\{ url: profile\.avatar/);
    // and when the payload has none, the sharer's initial (never the visitor's own picture)
    expect(report).toContain("else if (SHARED) pic = DhiAvatar.make({ url: profile.avatar || null, name: profile.name, size: 64 });");
  });

  test("covers AC-4: the public page keeps the normal animation (print is the only mode that turns it off)", () => {
    expect(report).toMatch(/var reduced = !!PRINT \|\|/);
    expect(report).toContain("if (SHARED) { SHARED.drawn(); return; }");
  });

  test("covers AC-15: the public page does not compare the report version with anything, so a version change never breaks a link", () => {
    expect(code(boot)).not.toMatch(/VERSION|wantedVersion|version_mismatch/);
  });

  test("covers AC-7: one message for an off, ended, altered or unknown link (404), a different one for a busy page (429) and for a failure", () => {
    expect(boot).toMatch(/res\.status === 404\) \{ show\("shGone"\)/);
    expect(boot).toMatch(/res\.status === 429\) \{ show\("shSlow"\)/);
    expect(boot).toMatch(/location\.pathname/);
    expect(shell).toMatch(/id="shGone"[\s\S]*This link is off or has ended/);
  });
});

describe("caching of the site's own files", () => {
  test("covers a deploy reaching visitors at once: scripts, styles and pages revalidate every time, instead of Cloudflare's default 4 hours", () => {
    for (const path of ["/dhiinterviews/js/*", "/dhiinterviews/css/*", "/dhiinterviews/:page"]) {
      expect(rule(path), path).toMatch(/^\s*Cache-Control: no-cache\s*$/m);
    }
    expect(rule("/dhiinterviews/fonts/*")).toMatch(/max-age=31536000, immutable/); // versioned font names keep their long cache
    expect(rule("/dhiinterviews/team")).toMatch(/private, no-store/);               // the stricter rule is still there for the private pages
  });
});

describe("the Pages forwarder for the payload (AC-7, AC-13)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const ENV = { CONVEX_SITE_URL: "https://convex.example" };
  const call = (path, init, env = ENV) => onRequest({ request: new Request(`https://site.example${path}`, init), env });

  test("covers AC-13: a GET is forwarded with only the share header, no cookie and no Authorization; a set-cookie never comes back; nothing is cached", async () => {
    const up = vi.fn(async () => new Response('{"profile":{}}', { status: 200, headers: { "content-type": "application/json", "set-cookie": "x=1", "cache-control": "public, max-age=999" } }));
    vi.stubGlobal("fetch", up);
    const res = await call("/api/shared/payload", { headers: { "x-share-token": "abc.1.sig", cookie: "session=1", authorization: "Bearer z" } });
    expect(res.status).toBe(200);
    const [url, init] = up.mock.calls[0];
    expect(String(url)).toBe("https://convex.example/api/shared/payload");
    const sent = new Headers(init.headers);
    expect(sent.get("x-share-token")).toBe("abc.1.sig");
    expect(sent.get("cookie")).toBeNull();
    expect(sent.get("authorization")).toBeNull();
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("covers AC-7: the upstream status and body pass through unchanged (404 stays the same 404, 429 stays 429)", async () => {
    for (const status of [404, 429]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response('{"code":"x"}', { status })));
      const res = await call("/api/shared/payload", { headers: { "x-share-token": "t" } });
      expect(res.status).toBe(status);
      expect(await res.text()).toBe('{"code":"x"}');
    }
  });

  test("covers AC-11 (review minor): when the site cannot reach Convex the answer is a 502 with the private headers and no code, never a bare error page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    const res = await call("/api/shared/payload", { headers: { "x-share-token": "abc.1.sig" } });
    expect(res.status).toBe(502);
    expect(await res.text()).toBe('{"code":"unavailable_upstream"}');
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(res.headers.get("content-type")).toBe("application/json");
  });

  test("covers AC-13: only a GET is answered, and only for the payload path; every other path is the same 404 as a dead link", async () => {
    const up = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", up);
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) expect((await call("/api/shared/payload", { method })).status, method).toBe(405);
    for (const path of ["/api/shared/other", "/api/shared/", "/api/shared/payload/x", "/api/shared/../auth"]) {
      const res = await call(path);
      expect([path, res.status, await res.text()]).toEqual([path, 404, '{"code":"unavailable"}']);
    }
    expect(up).not.toHaveBeenCalled();
  });

  test("covers AC-13: a code that is too long is not forwarded at all, and with no setting the route says it is not configured", async () => {
    const up = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", up);
    await call("/api/shared/payload", { headers: { "x-share-token": "a".repeat(500) } });
    expect(new Headers(up.mock.calls[0][1].headers).get("x-share-token")).toBeNull();
    expect((await call("/api/shared/payload", {}, {})).status).toBe(503);
  });
});
