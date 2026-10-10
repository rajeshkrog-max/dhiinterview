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
    expect(page).toContain("PRIVACY_CONTACT");
    expect(page).toMatch(/from "\.\.\/\.\.\/lib\/frame"/); // the page takes the address from the frame's constants...
    expect(read("src/lib/frame.ts")).toContain("convex/consentText"); // ...which read it from the consent text (spec 0009)
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

  test("covers spec 0008 AC-11: it says named members of the DhiRise team can open a report, and that each open is recorded", () => {
    expect(words).toMatch(/Named members of the DhiRise team can also open your report/);
    expect(words).toMatch(/we record who opened it and when/);
    expect(words).not.toMatch(/only you can open your report/i); // no longer true
  });

  test("covers spec 0011 AC-15: the picture section says it is on for everyone, who sees it, how to remove it, and what a removal cannot reach", () => {
    expect(words).toMatch(/5\. Your Google profile picture/);
    expect(words).toMatch(/nothing else from your Google profile/i);
    expect(words).toMatch(/There is no separate question about it\. It is on for every student/);
    expect(words).toMatch(/If you joined before the picture was added, the words you agreed to when you began did not mention it/);
    expect(words).not.toMatch(/the ticks you gave when you began cover it/); // not true for students who joined under v1 to v3
    for (const who of ["You, on your own screens", "Other students, if the leaderboard shows pictures", "Anyone you give a report link to", "Named members of the DhiRise team"]) expect(words, who).toContain(who);
    expect(words).toMatch(/Remove my picture/);
    expect(words).toMatch(/Use my Google picture/);
    expect(words).toMatch(/browser copies for up to an hour/);
    expect(words).toMatch(/PDF copies of your report and report links that were already made may keep the picture they drew/);
    expect(words).toMatch(/made very early, before your picture was saved, may have no picture/);
    expect(words).toMatch(/the team can also take it off/);
  });

  test("covers spec 0011 AC-15: 'what we keep' and the Google bullet name the picture, and the sections are numbered in order", () => {
    expect(words).toMatch(/profile picture from your Google account/);
    expect(words).toMatch(/We get your name, email and profile picture from it/);
    const numbers = [...page.matchAll(/<h2>(\d+)\. /g)].map((m) => Number(m[1]));
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(words).toMatch(/Last updated: 10 October 2026/);
  });
});
