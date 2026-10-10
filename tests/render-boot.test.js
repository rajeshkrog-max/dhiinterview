// The report render page (spec 0006): things that can be checked from the source without a browser. The real page is
// exercised in e2e/report-render.spec.ts.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// code only: the comments describe what the file does not do, and would match the scans below
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^---[\s\S]*?---/, "").replace(/^\s*\/\/.*$/gm, "");
const boot = read("public/dhiinterviews/js/render-boot.js");
const card = read("public/dhiinterviews/js/card.js");
const identity = read("public/dhiinterviews/js/engine/identity.js");
const page = read("src/pages/dhiinterviews/report-render.astro");

describe("render page", () => {
  test("covers AC-5: the Founding Card styles in render-boot.js match card.js and identity.js (they are copied, so they must not drift)", () => {
    // identity.js: v → explorer, p → achiever, k → builder
    const themes = Object.fromEntries([...identity.matchAll(/\b([vpk]): \{ key: "(\w+)"/g)].map((m) => [m[1], m[2]]));
    expect(themes).toEqual({ v: "explorer", p: "achiever", k: "builder" });
    // card.js STYLES: builder / achiever / explorer → tag, colour, sink
    const styles = Object.fromEntries(
      [...card.matchAll(/(\w+):\s+\{ tag: "([^"]+)",\s+c: "(#[0-9a-f]{6})", sink: ([\d.]+) \}/g)].map((m) => [m[1], { tag: m[2], c: m[3], sink: Number(m[4]) }]),
    );
    expect(Object.keys(styles).sort()).toEqual(["achiever", "builder", "explorer"]);
    for (const [k, key] of Object.entries(themes)) {
      const own = new RegExp(`${k}: \\{ key: "${key}", tag: "([^"]+)", c: "(#[0-9a-f]{6})", sink: ([\\d.]+) \\}`).exec(boot);
      expect(own, `render-boot.js has no card style for ${k}`).not.toBeNull();
      expect({ tag: own[1], c: own[2], sink: Number(own[3]) }).toEqual(styles[key]);
    }
    // the colour mix and the first name rule are the same too
    expect(card).toContain('mix(S.c, "#fff8e6", 0.55)');
    expect(card).toContain('mix(S.c, "#10122a", 0.85)');
    expect(boot).toContain('mix(S.c, "#fff8e6", 0.55)');
    expect(boot).toContain('mix(S.c, "#10122a", 0.85)');
  });

  test("covers AC-5: the render page loads only the scripts it needs, and none that sign in, track, animate or play sound", () => {
    const scripts = [...page.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
    expect(scripts).toEqual(["js/funnel-config.js", "js/engine/questions.js", "js/engine/reportText.js", "js/card-export.js", "js/avatar.js", "js/render-boot.js"]);
    expect(code(page)).not.toMatch(/Guard|session|posthog|leaves|identity|challenge|music|card\.js|api\.js|store\.js/i);
  });

  test("covers AC-9: the boot script takes the token from the address fragment only, and sends it as a header, not in the address", () => {
    expect(boot).toContain("location.hash");
    expect(boot).toContain('"x-render-token": token');
    expect(code(boot)).not.toMatch(/location\.search|localStorage|sessionStorage/);
    expect(boot).toContain('fetch("/api/render/payload"');
  });

  test("covers AC-13: the boot script compares its own report version with the data's before drawing", () => {
    expect(boot).toMatch(/data\.wantedVersion !== T\.VERSION/);
    expect(boot).toContain("version_mismatch");
  });

  test("covers AC-5: the page script has one explicit print flag, not the reduced motion setting alone", () => {
    const report = read("public/dhiinterviews/js/report-student.js");
    expect(report).toContain("window.DHI_RENDER");
    expect(report).toMatch(/var reduced = !!PRINT \|\|/);
  });
});

describe("the saved copy words", () => {
  test("covers AC-5: no line in the saved copy asks the student to tick, because the copy has no tick grid", () => {
    const text = read("public/dhiinterviews/js/engine/reportText.js");
    const copy = /weekHowCopy:\s*\{([^}]*)\}/.exec(text);
    expect(copy, "weekHowCopy missing in reportText.js").not.toBeNull();
    expect(copy[1]).not.toMatch(/tick/i);
    // the style whose screen line talks about ticking has a copy line
    expect(/p: "Set a target each day and tick/.test(text)).toBe(true);
    expect(copy[1]).toMatch(/(^|[\s{,])p:/);
    expect(read("public/dhiinterviews/js/report-student.js")).toMatch(/PRINT && T\.weekHowCopy\[styleOrder\[0\]\]/);
  });
});

describe("render page headers", () => {
  // Cloudflare Pages answers /x.html with a redirect to /x, and the page itself comes from /x. A rule that names only
  // one of the two leaves the other with the default `public, max-age=0, must-revalidate` (found live on a preview deploy).
  test("covers AC-9: both the .html address and the clean address get noindex and private, no-store", () => {
    const headers = read("public/_headers");
    for (const path of ["/dhiinterviews/report-render", "/dhiinterviews/report-render.html"]) {
      const rule = new RegExp(`^${path.replace(/\./g, "\\.")}\\r?\\n((?:[ \\t]+.+\\r?\\n?)+)`, "m").exec(headers);
      expect(rule, `no _headers rule for ${path}`).not.toBeNull();
      expect(rule[1]).toMatch(/X-Robots-Tag:\s*noindex/);
      expect(rule[1]).toMatch(/Cache-Control:\s*private, no-store/);
    }
  });
});

describe("report page", () => {
  const report = read("public/dhiinterviews/js/report-student.js");

  test("covers AC-7: the copy is asked for only after the report has drawn, fire and forget, and its answer is never used", () => {
    const drawn = report.indexOf("startAnimations();");
    const ask = report.indexOf("DhiSession.reportCopy.request()");
    expect(drawn).toBeGreaterThan(0);
    expect(ask).toBeGreaterThan(drawn); // after the last thing the report draws
    expect(report.slice(ask - 140, ask)).toContain("requestAnimationFrame"); // a frame is painted first
    expect(report.slice(ask, ask + 60)).not.toMatch(/\.then|await|catch/); // nothing waits on it, and nothing shows its failure
  });

  test("covers AC-6: the Download button is not in the saved copy, and the page script uses the shared rules", () => {
    expect(report).toMatch(/if \(!PRINT && window\.DhiSession && DhiSession\.reportCopy && window\.DhiReportDownload\)/);
    expect(read("src/pages/dhiinterviews/report-student.astro")).toMatch(/report-download\.js[\s\S]*report-student\.js/); // loaded first
  });
});
