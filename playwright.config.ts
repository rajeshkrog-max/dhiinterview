// Browser flow tests (spec 0001 testing decision, spec 0002 verify steps). They run the local site (`pnpm dev`) against
// the Convex DEV deployment, and sign in with the fake test sign in (needs TEST_SIGNIN_ENABLED=true on dev).
// Every run creates a few throwaway students on dev (emails like test.studente2e...@example.com). They are never
// created on production: the run refuses to start when PUBLIC_CONVEX_URL is the production deployment.
import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

const PRODUCTION_CONVEX = "abundant-caiman-975";
function convexUrl(): string {
  for (const f of [".env", ".env.local"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(/^(?:PUBLIC_CONVEX_URL|CONVEX_URL)=(\S+)/m);
    if (m) return m[1];
  }
  return process.env.PUBLIC_CONVEX_URL ?? "";
}
if (convexUrl().includes(PRODUCTION_CONVEX)) {
  throw new Error("Refusing to run browser tests against the production Convex deployment. Point .env at the dev deployment.");
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4321",
    viewport: { width: 390, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:4321/dhiinterviews/landing.html",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
