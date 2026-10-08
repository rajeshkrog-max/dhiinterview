// Sign in: Google only (spec 0001). The browser talks to the site's own address (/api/auth/*), which forwards
// to this deployment (functions/api/auth/[[path]].ts), so sign in cookies stay on one address.
// Needs env vars (per deployment): BETTER_AUTH_URL (the site address), BETTER_AUTH_SECRET,
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. TEST_SIGNIN_ENABLED=true (dev only) also turns on a fake
// email and password sign in for automated tests. Leave it unset in production.
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { env, query } from "./_generated/server";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = env.BETTER_AUTH_URL;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !siteUrl) {
    throw new Error("Sign in is not configured: set BETTER_AUTH_URL, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on this deployment.");
  }
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        // always show the account chooser, so a shared phone does not silently reuse the last account
        prompt: "select_account",
      },
    },
    emailAndPassword: {
      enabled: env.TEST_SIGNIN_ENABLED === "true",
      requireEmailVerification: false,
    },
    plugins: [convex({ authConfig })],
  });
};

// The signed in student, or null. The spike page uses it to show who is signed in.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    return user ? { id: user._id, name: user.name, email: user.email } : null;
  },
});
