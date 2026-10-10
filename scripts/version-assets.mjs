// Runs after `astro build` (see "build" in package.json). Gives every script and style address in the built pages a fingerprint of that
// file's own content: `js/card.js` becomes `js/card.js?v=1a2b3c4d5e`. The pages themselves revalidate on every load (public/_headers),
// so when a file changes its address changes, and a returning visitor's browser has to fetch it. Without this, Cloudflare let browsers keep
// our unversioned scripts for 4 hours, and a zone setting on the domain kept overriding the `no-cache` rule for .js and .css files.
// Only the plain relative or site rooted addresses under js/ and css/ are changed. A file that cannot be found is left alone.
// `node scripts/version-assets.mjs [dist]` is safe to run again: an address that already has `?v=` is not touched.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const dist = resolve(process.argv[2] ?? "dist");
if (!existsSync(dist)) throw new Error(`No ${dist}: run the Astro build first.`);

const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".html")) htmlFiles.push(p);
  }
})(dist);

const hashes = new Map();
const fingerprint = (file) => {
  if (!hashes.has(file)) hashes.set(file, createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 10));
  return hashes.get(file);
};

// href="css/x.css", src="js/x.js", src="../js/x.js", src="/dhiinterviews/js/x.js" (not an address with a query already, not another site)
const REF = /\b(src|href)="((?:\.\.\/|\.\/|\/dhiinterviews\/)?(?:js|css)\/[^"?#:]+\.(?:js|css))"/g;

let changed = 0;
let files = 0;
for (const html of htmlFiles) {
  const text = readFileSync(html, "utf8");
  const out = text.replace(REF, (whole, attr, ref) => {
    const candidates = ref.startsWith("/") ? [join(dist, ref)] : [resolve(dirname(html), ref), join(dist, "dhiinterviews", ref.replace(/^(\.\.\/|\.\/)+/, ""))];
    const file = candidates.find((c) => existsSync(c) && statSync(c).isFile());
    if (!file) return whole;
    changed += 1;
    return `${attr}="${ref}?v=${fingerprint(file)}"`;
  });
  if (out !== text) {
    writeFileSync(html, out);
    files += 1;
  }
}
console.log(`version-assets: ${changed} addresses fingerprinted in ${files} of ${htmlFiles.length} pages (${relative(process.cwd(), dist) || "."})`);
