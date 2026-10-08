// Two kinds of unit tests (spec 0001 testing decision):
//  - "convex": the Convex functions, in memory with convex-test (edge runtime, like Convex itself)
//  - "pages": the plain browser scripts (js/engine/*), run in Node
// Browser flow tests live in e2e/ and run with Playwright (see playwright.config.ts).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test", "@convex-dev/better-auth"] } },
        },
      },
      {
        test: {
          name: "pages",
          include: ["tests/**/*.test.js"],
          environment: "node",
        },
      },
    ],
  },
});
