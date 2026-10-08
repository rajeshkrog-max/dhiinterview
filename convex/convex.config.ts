// Registers the Better Auth component, which keeps its own tables (users, sessions, accounts) inside Convex.
// Also declares the app's own environment variables (read through `env` from ./_generated/server).
// BETTER_AUTH_SECRET is read by Better Auth itself, so it is not declared here.
import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";

const app = defineApp({
  env: {
    BETTER_AUTH_URL: v.optional(v.string()),
    GOOGLE_CLIENT_ID: v.optional(v.string()),
    GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    TEST_SIGNIN_ENABLED: v.optional(v.string()),
  },
});
app.use(betterAuth);

export default app;
