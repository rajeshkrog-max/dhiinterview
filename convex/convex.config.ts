// Registers the Better Auth component, which keeps its own tables (users, sessions, accounts) inside Convex.
// Also declares the app's own environment variables (read through `env` from ./_generated/server).
// BETTER_AUTH_SECRET is read by Better Auth itself, so it is not declared here.
import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp({
  env: {
    BETTER_AUTH_URL: v.optional(v.string()),
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    TEST_SIGNIN_ENABLED: v.optional(v.string()),
    // The copy to the team's Google Sheet (spec 0004). Both optional: a deployment with no Sheet still deploys.
    // Each deployment has its own pair, so a dev deployment can never write to the production Sheet.
    GOOGLE_SERVICE_ACCOUNT_KEY: v.optional(v.string()),
    SHEET_ID: v.optional(v.string()),
    // The saved report PDF (spec 0006). All optional: a deployment without them still deploys, and the copy ends
    // `failed` with `render_not_configured` while the report itself keeps working. Secrets are set per deployment.
    CLOUDFLARE_ACCOUNT_ID: v.optional(v.string()),
    CLOUDFLARE_API_TOKEN: v.optional(v.string()), // custom token with only "Browser Rendering - Edit"
    REPORT_RENDER_SECRET: v.optional(v.string()), // signs the 2 minute render tokens; different on dev and production
    REPORT_RENDER_BASE_URL: v.optional(v.string()), // the public site address Browser Run opens (never localhost)
  },
});
app.use(betterAuth);
app.use(rateLimiter);

export default app;
