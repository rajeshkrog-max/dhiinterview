// `pnpm verify:pages` (spec 0009). Serves the BUILT site the way Cloudflare Pages does (the real _redirects, _headers, 404.html and
// functions, through `wrangler pages dev dist`) and checks what the Astro dev server cannot show: the status of the 404 page, the
// root redirect and its query string, the headers on the 404, the fonts and the team pages, and the old addresses.
// It points the Pages functions at the Convex DEV deployment from .env.local and refuses to run against production.
// It starts and stops its own server on port 8788 (not 4321, so it never clashes with `pnpm dev`) and makes no sign in.
import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const PORT = 8788;
const BASE = `http://localhost:${PORT}`;
const PRODUCTION = "abundant-caiman-975";

function devSite() {
  const fromEnv = process.env.CONVEX_SITE_URL;
  const fromFile = existsSync(".env.local") ? readFileSync(".env.local", "utf8").match(/^CONVEX_SITE_URL=(\S+)/m)?.[1] : undefined;
  const url = fromEnv ?? fromFile;
  if (!url) throw new Error("No CONVEX_SITE_URL in the environment or .env.local (run `pnpm exec convex dev --once` first).");
  if (url.includes(PRODUCTION)) throw new Error("Refusing to run against the production Convex deployment.");
  return url;
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
};
const get = (path, opts = {}) => fetch(BASE + path, { redirect: "manual", ...opts });

async function waitUp() {
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(BASE + "/api/health", { redirect: "manual" });
      if (r.status < 600) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("The local Pages server did not start in 90 seconds.");
}

async function run() {
  // a page and the assets it points at
  const page404 = async (path) => {
    const r = await get(path);
    const text = await r.text();
    return { status: r.status, text, headers: r.headers };
  };

  // 1. the 404 page, at several depths
  for (const path of ["/nope", "/dhiinterviews/nope", "/a/b/c/d", "/api/nope"]) {
    const r = await page404(path);
    check(`404 page at ${path}: status 404`, r.status === 404, `status ${r.status}`);
    check(`404 page at ${path}: the approved words and the Go to DhiRise button`, r.text.includes("We could not find that page") && r.text.includes("Go to DhiRise"));
    check(`404 page at ${path}: noindex meta tag, no script`, r.text.includes('<meta name="robots" content="noindex, nofollow">') && !/<script\b/i.test(r.text));
  }
  const nope = await page404("/nope");
  check("404 page: nosniff and frame-ancestors 'none' still apply", nope.headers.get("x-content-type-options") === "nosniff" && /frame-ancestors 'none'/.test(nope.headers.get("content-security-policy") ?? ""));
  const links = [...nope.text.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  for (const l of [...new Set(links)].filter((l) => !l.startsWith("/dhiinterviews/landing") && !l.includes("mailto"))) {
    const r = await get(l);
    check(`404 page asset or link resolves: ${l}`, r.status === 200 || (r.status >= 300 && r.status < 400), `status ${r.status}`);
  }

  // 2. addresses served by a Pages Function are not the 404 page
  const fn = await get("/api/team/list");
  check("/api/team/list is answered by its function (401), not the 404 page", fn.status === 401, `status ${fn.status}`);

  // 3. the root and the two /dhiinterviews addresses
  for (const [path, want] of [["/", "/dhiinterviews/landing"], ["/dhiinterviews", "/dhiinterviews/landing"], ["/dhiinterviews/", "/dhiinterviews/landing"]]) {
    const r = await get(path);
    check(`${path} redirects (302) to the landing page`, r.status === 302 && (r.headers.get("location") ?? "").startsWith(want), `status ${r.status}, location ${r.headers.get("location")}`);
  }
  const ref = await get("/?ref=ABC123");
  check("/?ref=ABC123 keeps its query string through the redirect", /[?&]ref=ABC123\b/.test(ref.headers.get("location") ?? ""), `location ${ref.headers.get("location")}`);
  const landing = await fetch(BASE + "/?ref=ABC123", { redirect: "follow" });
  check("/?ref=ABC123 ends at the landing page with a 200", landing.status === 200 && landing.url.includes("ref=ABC123"), `status ${landing.status}, url ${landing.url}`);

  // 4. the fonts
  const font = await get("/dhiinterviews/fonts/mukta-400.v1.woff2");
  check("font file is served with the long immutable cache rule", font.status === 200 && /max-age=31536000/.test(font.headers.get("cache-control") ?? "") && /immutable/.test(font.headers.get("cache-control") ?? ""), `status ${font.status}, ${font.headers.get("cache-control")}`);

  // 5. the team pages keep their policy, and their addresses
  for (const path of ["/dhiinterviews/team", "/dhiinterviews/team-report"]) {
    const r = await get(path);
    const csp = r.headers.get("content-security-policy") ?? "";
    check(`${path}: 200, noindex, no store, script-src 'self' only`, r.status === 200 && r.headers.get("x-robots-tag") === "noindex" && r.headers.get("cache-control") === "private, no-store" && /script-src 'self'(;|$)/.test(csp), `status ${r.status}`);
  }
  const sheet = await get("/dhiinterviews/team-report.html?s=abc123");
  check("the Sheet link address redirects once to the clean address and keeps ?s=", sheet.status === 308 && (sheet.headers.get("location") ?? "") === "/dhiinterviews/team-report?s=abc123", `status ${sheet.status}, location ${sheet.headers.get("location")}`);

  // 6. old addresses still end at a page
  for (const path of ["/dhiinterviews/landing", "/dhiinterviews/landing.html", "/dhiinterviews/privacy", "/dhiinterviews/privacy.html", "/dhiinterviews/privacy/", "/dhiinterviews/terms.html"]) {
    const r = await fetch(BASE + path, { redirect: "follow" });
    check(`${path} ends at a page (200)`, r.status === 200, `status ${r.status}`);
  }
}

const dev = devSite();
console.log(`Serving dist with the real Pages rules on ${BASE}, functions pointed at ${dev}\n`);
execSync("pnpm build", { stdio: "inherit" });
const child = spawn("pnpm", ["exec", "wrangler", "pages", "dev", "dist", "--port", String(PORT), "--binding", `CONVEX_SITE_URL=${dev}`], { shell: true, stdio: "ignore" });
let failed = true;
try {
  await waitUp();
  await run();
  failed = results.some((r) => !r.ok);
} catch (e) {
  console.error(String(e));
} finally {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    else child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
