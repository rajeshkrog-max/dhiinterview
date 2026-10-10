// scripts/version-assets.mjs: after the build, every script and style address in a page carries a fingerprint of that file, so a deploy
// reaches a returning visitor whatever the browser or the Cloudflare zone caches. Run on a small fake dist, never the real one.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

const SCRIPT = fileURLToPath(new URL("../scripts/version-assets.mjs", import.meta.url));
const sha = (s) => createHash("sha1").update(s).digest("hex").slice(0, 10);
let dist;
const run = () => execFileSync(process.execPath, [SCRIPT, dist], { encoding: "utf8" });

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), "dhi-dist-"));
  mkdirSync(join(dist, "dhiinterviews", "js", "engine"), { recursive: true });
  mkdirSync(join(dist, "dhiinterviews", "css"), { recursive: true });
  writeFileSync(join(dist, "dhiinterviews", "js", "card.js"), "card v1");
  writeFileSync(join(dist, "dhiinterviews", "js", "engine", "score.js"), "score");
  writeFileSync(join(dist, "dhiinterviews", "css", "card.css"), "css v1");
  writeFileSync(
    join(dist, "dhiinterviews", "page.html"),
    '<link rel="stylesheet" href="css/card.css"><script src="js/card.js"></script><script src="js/engine/score.js"></script>' +
      '<script src="js/missing.js"></script><script src="https://other.example/js/x.js"></script><script src="/_astro/a.abc123.js"></script>' +
      '<link href="/dhiinterviews/css/card.css">',
  );
});
afterEach(() => rmSync(dist, { recursive: true, force: true }));

describe("version-assets", () => {
  test("gives each script and style address in a page the fingerprint of its own file, and leaves every other address alone", () => {
    run();
    const html = readFileSync(join(dist, "dhiinterviews", "page.html"), "utf8");
    expect(html).toContain(`href="css/card.css?v=${sha("css v1")}"`);
    expect(html).toContain(`src="js/card.js?v=${sha("card v1")}"`);
    expect(html).toContain(`src="js/engine/score.js?v=${sha("score")}"`);
    expect(html).toContain(`href="/dhiinterviews/css/card.css?v=${sha("css v1")}"`);
    expect(html).toContain('src="js/missing.js"');                 // a file that is not there is left as it was
    expect(html).toContain('src="https://other.example/js/x.js"'); // another site is never touched
    expect(html).toContain('src="/_astro/a.abc123.js"');           // already a hashed name
  });

  test("a changed file gets a new fingerprint and an unchanged one keeps its own, so only what changed is fetched again", () => {
    run();
    const before = readFileSync(join(dist, "dhiinterviews", "page.html"), "utf8");
    const page = join(dist, "dhiinterviews", "page.html");
    writeFileSync(page, before.replace(/\?v=[0-9a-f]{10}/g, "")); // as a fresh build gives it
    writeFileSync(join(dist, "dhiinterviews", "js", "card.js"), "card v2");
    run();
    const after = readFileSync(page, "utf8");
    expect(after).toContain(`src="js/card.js?v=${sha("card v2")}"`);
    expect(after).toContain(`href="css/card.css?v=${sha("css v1")}"`);
    expect(sha("card v2")).not.toBe(sha("card v1"));
  });

  test("running it twice does not pile up a second fingerprint", () => {
    run();
    const once = readFileSync(join(dist, "dhiinterviews", "page.html"), "utf8");
    run();
    expect(readFileSync(join(dist, "dhiinterviews", "page.html"), "utf8")).toBe(once);
    expect(once).not.toMatch(/\?v=[0-9a-f]+\?v=/);
  });
});
