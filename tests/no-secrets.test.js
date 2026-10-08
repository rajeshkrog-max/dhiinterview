// No key or Sheet id in the page code or the repo, and the old browser post to a Sheet is gone
// (spec 0003 AC-13 and spec 0004 AC-13, AC-15). Reads the source files as text and looks for what must not be there.
import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|ts|astro|html|css)$/.test(name)) out.push(p);
  }
  return out;
}
const read = (p) => readFileSync(p, "utf8");
const pageFiles = [...walk("public"), ...walk("src")];

describe("nothing secret reaches the browser", () => {
  test("covers spec 0004 AC-13: the page code never names the Sheet settings, a key or a Sheet address", () => {
    for (const file of pageFiles) {
      const text = read(file);
      expect(text, file).not.toMatch(/SHEET_ID|GOOGLE_SERVICE_ACCOUNT_KEY|BEGIN (RSA )?PRIVATE KEY|private_key|docs\.google\.com\/spreadsheets/);
    }
  });

  test("covers spec 0004 AC-13: only the Convex code reads the Sheet settings, and only through env", () => {
    const users = walk("convex").filter((f) => !f.includes("_generated") && /SHEET_ID|GOOGLE_SERVICE_ACCOUNT_KEY/.test(read(f)));
    const allowed = ["convex/convex.config.ts", "convex/sheetFlush.ts", "convex/sheetSync.ts"];
    for (const f of users.map((u) => u.replace(/\\/g, "/"))) expect(allowed, f).toContain(f);
    for (const f of users) expect(read(f), f).not.toMatch(/process\.env\.(SHEET_ID|GOOGLE_SERVICE_ACCOUNT_KEY)/);
  });
});

describe("the old browser post is gone", () => {
  test("covers spec 0003 AC-13: no endpoint setting, no old local copy, no post to a Sheet address in the pages", () => {
    for (const file of pageFiles) {
      expect(read(file), file).not.toMatch(/leadEndpoint|feedbackEndpoint|dhirise\.lead\.v1|dhirise\.reportFeedback\.v1|script\.google\.com/);
    }
  });

  test("covers spec 0004 AC-15: the Apps Script receiver is removed and the setup note describes the service account", () => {
    expect(existsSync("tools/lead-sheet.gs")).toBe(false);
    const note = read("tools/LEAD-SHEET-SETUP.md");
    expect(note).toMatch(/service account/i);
    expect(note).not.toMatch(/lead-sheet\.gs|leadEndpoint|Web app URL/);
  });
});
