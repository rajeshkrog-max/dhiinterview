// The privacy page (spec 0007): what can be checked from the source without a browser. The real page is in e2e/privacy.spec.ts.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CONSENT_LINES } from "../convex/consentText";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const page = read("src/pages/dhiinterviews/privacy.astro");
// the words a student reads: the part after the front matter, without tags
const words = page.replace(/^---[\s\S]*?---/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("privacy page", () => {
  test("covers AC-2: it names every service that handles student data, including Cloudflare Browser Run", () => {
    for (const name of ["Google", "Convex", "Cloudflare", "Cloudflare Browser Run", "PDF copy"]) expect(words).toContain(name);
    expect(words).toMatch(/do not sell your data/i);
    expect(words).toMatch(/erase/i);
    expect(words).toMatch(/under 18/i);
  });

  test("covers AC-3: the contact address comes from the consent text, so the two cannot differ", () => {
    expect(page).toContain("convex/consentText");
    const fromConsent = /([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(CONSENT_LINES.join(" "))?.[1];
    expect(fromConsent).toBe("privacy@dhirise.com");
    expect(words).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i); // no address typed into the words; it is filled in from the consent text
  });

  test("covers AC-4: it never names a flag, and promises no retention period or storage region", () => {
    const block = /NO_FLAGS[^{]*\{([^}]*)\}/.exec(read("convex/resultsCore.ts"));
    expect(block, "NO_FLAGS not found").not.toBeNull();
    const flagNames = [...block[1].matchAll(/(\w+):\s*false/g)].map((m) => m[1]);
    expect(flagNames.length).toBeGreaterThanOrEqual(7);
    for (const f of flagNames) expect(page, f).not.toContain(f);
    expect(words).not.toMatch(/\b(days|weeks|months|years)\b/i);
    expect(words).not.toMatch(/\b(region|sydney|singapore|mumbai|india only|data centre|data center)\b/i);
  });

  test("covers AC-4: plain words, and no dash or hyphen used as punctuation", () => {
    expect(words).not.toMatch(/[–—]| - /);
    expect(words).not.toMatch(/\b(GDPR|DPDP|controller|processor|sub[ -]?processor|pursuant|hereby)\b/i);
  });

  test("covers AC-5: the landing consent sheet and the phone step notice both link to it, in a new tab", () => {
    for (const p of ["src/pages/dhiinterviews/landing.astro", "src/pages/dhiinterviews/done.astro"]) {
      expect(read(p), p).toMatch(/<a href="privacy\.html" target="_blank" rel="noopener">Read our privacy page<\/a>/);
    }
  });
});
