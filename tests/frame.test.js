// The shared site frame, the root address and the 404 page (spec 0009): the rules no single page test can see. They read the shipped
// files, so they fail the day someone breaks the one root line, adds a link to nowhere, puts a script in the frame, lowers the
// contrast, hosts a font under a name that can go stale, or brings back a superseded file. What a browser shows is in
// e2e/frame.spec.ts, and what Cloudflare Pages does with the built site is checked by `pnpm verify:pages`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");
const exists = (p) => existsSync(new URL(p, root));
const strip = (astro) => astro.replace(/^---[\s\S]*?---/, ""); // the markup of an .astro page, without its front matter

function walk(dir, keep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(full)) out.push(full);
  }
  return out;
}
const abs = (p) => fileURLToPath(new URL(p, root));

const FRAME_PAGES = ["404.astro", "dhiinterviews/privacy.astro", "dhiinterviews/terms.astro", "dhiinterviews/team.astro", "dhiinterviews/team-report.astro"];

describe("the root address (AC-1, AC-2)", () => {
  const lines = read("public/_redirects").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const sources = lines.map((l) => l.split(/\s+/)[0]);

  test("covers AC-2: exactly one line has `/` as its source, and it is a temporary (302) redirect to the landing page", () => {
    const rootLines = lines.filter((l) => l.split(/\s+/)[0] === "/");
    expect(rootLines).toEqual(["/ /dhiinterviews/landing 302"]);
  });

  test("covers AC-2: the two /dhiinterviews addresses stay, and nothing else redirects", () => {
    expect(sources.sort()).toEqual(["/", "/dhiinterviews", "/dhiinterviews/"]);
    for (const l of lines) expect(l.split(/\s+/)[2], l).toBe("302");
  });

  test("covers AC-2: the root has one source only (the redirect line), never a function as well", () => {
    expect(exists("functions/index.ts")).toBe(false);
    expect(exists("functions/index.js")).toBe(false);
    expect(exists("src/pages/index.astro")).toBe(false);
  });

  test("covers AC-2: the line says it is the only place to change", () => {
    expect(read("public/_redirects")).toMatch(/ONLY place that decides what `\/` does/);
  });

  test("covers AC-2: nothing under src/ or the funnel scripts treats `/` as the funnel's home", () => {
    const files = [...walk(abs("src"), (f) => /\.(astro|ts)$/.test(f)), ...walk(abs("public/dhiinterviews/js"), (f) => f.endsWith(".js"))];
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/href=["']\/["']/);
      expect(text, f).not.toMatch(/(location(\.href)?|href)\s*=\s*["']\/["']/);
      expect(text, f).not.toMatch(/location\.(replace|assign)\(\s*["']\/["']\s*\)/);
    }
  });
});

describe("the frame and its pages (AC-4, AC-5, AC-8, AC-10, AC-11)", () => {
  const frame = read("src/layouts/Frame.astro");
  const frameHtml = strip(frame);

  test("covers AC-4: the 404, privacy, terms and both team pages are made with the frame", () => {
    for (const p of FRAME_PAGES) expect(read("src/pages/" + p), p).toMatch(/import Frame from "(\.\.\/)+layouts\/Frame\.astro"/);
  });

  test("covers AC-10: each page names itself and describes itself", () => {
    const expected = { "404.astro": "Page not found", "dhiinterviews/privacy.astro": "Privacy", "dhiinterviews/terms.astro": "Challenge terms", "dhiinterviews/team.astro": "Team", "dhiinterviews/team-report.astro": "Team report" };
    for (const [p, title] of Object.entries(expected)) {
      const html = read("src/pages/" + p);
      expect(html, p).toContain(`title="${title}"`);
      expect(html, p).toMatch(/description="[^"]{20,}"/);
    }
    expect(frameHtml).toContain("DhiRise · ${title}");
  });

  test("covers AC-10: only the 404 and the team pages are noindex; privacy and terms can be found", () => {
    for (const p of ["404.astro", "dhiinterviews/team.astro", "dhiinterviews/team-report.astro"]) expect(read("src/pages/" + p), p).toMatch(/<Frame\b[^>]*\snoindex\b/);
    for (const p of ["dhiinterviews/privacy.astro", "dhiinterviews/terms.astro"]) expect(read("src/pages/" + p), p).not.toMatch(/noindex/);
  });

  test("covers AC-5: the footer sits outside <main>, has no h1 or h2, and shows the links, the privacy contact and the copyright", () => {
    const mainEnd = frameHtml.indexOf("</main>");
    const footer = frameHtml.slice(frameHtml.indexOf("<footer"), frameHtml.indexOf("</footer>"));
    expect(mainEnd).toBeGreaterThan(0);
    expect(frameHtml.indexOf("<footer")).toBeGreaterThan(mainEnd);
    expect(footer).not.toMatch(/<h[1-6]\b/);
    expect(footer).toContain("FOOTER_LINKS");
    expect(footer).toContain("PRIVACY_CONTACT");
    expect(footer).toContain("© ${year} DhiRise");
    expect(frame).toContain("new Date().getFullYear()");
  });

  test("covers AC-5: every link the frame draws goes to a page that exists in the source", () => {
    const frameTs = read("src/lib/frame.ts");
    const hrefs = [...frameTs.matchAll(/["'](\/dhiinterviews\/[a-z0-9-]+\.html)["']/g)].map((m) => m[1]);
    expect(hrefs).toContain("/dhiinterviews/landing.html");
    expect(hrefs).toContain("/dhiinterviews/privacy.html");
    expect(hrefs).toContain("/dhiinterviews/terms.html");
    for (const h of new Set(hrefs)) expect(exists("src/pages" + h.replace(/\.html$/, ".astro")), h).toBe(true);
    for (const l of frameTs.matchAll(/href:\s*["']([^"']+)["']/g)) expect(l[1], "absolute addresses only").toMatch(/^\/dhiinterviews\//);
  });

  test("covers AC-5: the privacy contact is read from the consent text, in one place only", () => {
    expect(read("src/lib/frame.ts")).toContain("convex/consentText");
    expect(read("src/pages/dhiinterviews/privacy.astro")).not.toMatch(/CONSENT_LINES/);
  });

  test("covers AC-4: the frame loads its own stylesheet and logo by absolute address, and adds nothing from outside", () => {
    expect(frameHtml).toContain('href="/dhiinterviews/css/frame.css"');
    expect(frameHtml).toContain('src="/dhiinterviews/assets/dhirise-logo-64.png"');
    expect(exists("public/dhiinterviews/assets/dhirise-logo-64.png")).toBe(true);
    expect(exists("public/dhiinterviews/assets/dhirise-favicon-64.png")).toBe(true);
    expect(frameHtml).not.toMatch(/(href|src)="(?!\/|\{|#|mailto:)/); // no relative address, so the 404 works at any depth
    expect(frameHtml).toContain('<slot name="head" />');
  });

  test("covers AC-8 and AC-11: the superseded pieces are gone from every frame page", () => {
    expect(exists("public/dhiinterviews/css/terms.css")).toBe(false);
    for (const p of FRAME_PAGES) {
      const html = read("src/pages/" + p);
      expect(html, p).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
      expect(html, p).not.toMatch(/onerror=/);
      expect(html, p).not.toMatch(/terms\.css|\btm-[a-z]+|class="tm"/);
    }
  });

  test("covers AC-3: the 404 page carries the approved words and a button to the landing page, with no script", () => {
    const page = read("src/pages/404.astro");
    expect(page).toContain("We could not find that page");
    expect(page).toContain("The address may have a typo, or the page may have moved. If a friend sent you this link, ask them to share it again.");
    expect(page).toContain("Go to DhiRise");
    expect(page).toMatch(/href=\{HOME_PATH\}/);
    expect(strip(page)).not.toMatch(/<script\b/i);
  });
});

describe("fonts (AC-6)", () => {
  const css = read("public/dhiinterviews/css/frame.css");
  const fonts = readdirSync(abs("public/dhiinterviews/fonts"));

  test("covers AC-6: Mukta 400, 600 and 700 are hosted with their licence and a README, under versioned names", () => {
    expect(fonts.filter((f) => f.endsWith(".woff2")).sort()).toEqual(["mukta-400.v1.woff2", "mukta-600.v1.woff2", "mukta-700.v1.woff2"]);
    expect(fonts).toContain("OFL.txt");
    expect(fonts).toContain("README.md");
    expect(read("public/dhiinterviews/fonts/OFL.txt")).toMatch(/SIL Open Font License, Version 1\.1/);
    for (const f of fonts.filter((x) => x.endsWith(".woff2"))) expect(f, "a version in the file name").toMatch(/\.v\d+\.woff2$/);
  });

  test("covers AC-6: the stylesheet points at exactly those files, swaps in, and loads nothing from outside", () => {
    const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(urls.sort()).toEqual(["/dhiinterviews/fonts/mukta-400.v1.woff2", "/dhiinterviews/fonts/mukta-600.v1.woff2", "/dhiinterviews/fonts/mukta-700.v1.woff2"]);
    expect(css.match(/font-display:swap/g)).toHaveLength(3);
    expect(css).not.toMatch(/https?:\/\//);
    expect(css).not.toMatch(/@import/);
  });

  test("covers AC-6: the font rule in _headers is long and immutable, and the README says a changed font gets a new name", () => {
    expect(read("public/_headers")).toMatch(/\/dhiinterviews\/fonts\/\*\n\s+Cache-Control: public, max-age=31536000, immutable/);
    expect(read("public/dhiinterviews/fonts/README.md")).toMatch(/new name/);
  });
});

describe("readability (AC-9)", () => {
  const css = read("public/dhiinterviews/css/frame.css");
  const teamCss = read("public/dhiinterviews/css/team.css");
  const token = (name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

  // WCAG relative luminance and contrast ratio
  const rgb = (v) => {
    const hex = /^#([0-9a-f]{6})$/i.exec(v);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    const m = /rgba?\(([^)]+)\)/.exec(v);
    return m[1].split(",").slice(0, 3).map((x) => Number(x));
  };
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // the glass laid over the lightest gradient colour: the worst case behind any text
  const glassAlpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(token("glass"))[1]);
  const base = rgb(token("ink-top"));
  const glass = rgb(token("glass"));
  const behind = base.map((c, i) => Math.round(glass[i] * glassAlpha + c * (1 - glassAlpha)));

  test("covers AC-9: the lightest gradient colour is the one the test lays the glass over", () => {
    const stops = ["ink-top", "ink-mid", "ink-base"].map((n) => lum(rgb(token(n))));
    expect(stops[0]).toBeGreaterThanOrEqual(stops[1]);
    expect(stops[0]).toBeGreaterThanOrEqual(stops[2]);
  });

  test("covers AC-9: text, muted text and gold are at least 4.5 to 1 on the glass, and dark text on a gold button too", () => {
    for (const name of ["text", "muted", "gold"]) expect(ratio(rgb(token(name)), behind), name).toBeGreaterThanOrEqual(4.5);
    expect(ratio(rgb(token("on-gold")), rgb(token("gold")))).toBeGreaterThanOrEqual(4.5);
  });

  test("covers AC-9: the solid fallback (no blur) is no lighter than the glass over the lightest colour", () => {
    expect(lum(rgb(token("glass-solid")))).toBeLessThanOrEqual(lum(behind) + 1e-9);
    expect(ratio(rgb(token("muted")), rgb(token("glass-solid")))).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)/);
  });

  test("covers AC-9: no text is smaller than 16px in the frame or the team stylesheet", () => {
    for (const [name, text] of [["frame.css", css], ["team.css", teamCss]]) {
      for (const m of text.matchAll(/font(?:-size)?:\s*[^;}]*?(\d+(?:\.\d+)?)px/g)) {
        // `font:600 16px/1.3 var(--f)` and `font-size:15px` both land here; the first px value is the size
        expect(Number(m[1]), `${name}: ${m[0]}`).toBeGreaterThanOrEqual(16);
      }
    }
  });

  test("covers AC-9: buttons and links that are targets are at least 44px tall", () => {
    for (const sel of [".fr-brand", ".fr-back", ".fr-btn", ".fr-links a"]) {
      const rule = new RegExp(`${sel.replace(/[.\\]/g, "\\$&")}[^{]*\\{[^}]*min-height:(\\d+)px`).exec(css);
      expect(rule, sel).not.toBeNull();
      expect(Number(rule[1]), sel).toBeGreaterThanOrEqual(44);
    }
    expect(teamCss).toMatch(/\.tt-btn\{[^}]*min-height:44px/);
  });

  test("covers AC-9: nothing moves, and the keyboard focus is visible", () => {
    expect(css).not.toMatch(/@keyframes|animation:|transition:/);
    expect(css).toMatch(/:focus-visible\{outline:2px solid var\(--text\)/);
    expect(css).not.toMatch(/outline:\s*(none|0)\b/);
  });
});

describe("the headers and the check script", () => {
  test("covers AC-3: there is a `verify:pages` script that checks the built site with the real Pages rules", () => {
    expect(JSON.parse(read("package.json")).scripts["verify:pages"]).toBe("node scripts/verify-pages.mjs");
    const script = read("scripts/verify-pages.mjs");
    expect(script).toContain("abundant-caiman-975"); // refuses production
    expect(script).toContain("/?ref=ABC123");
  });
});
