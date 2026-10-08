// Browser side of sign in. Talks to the site's own address (/api/auth/*), never to Convex directly for auth,
// so cookies stay first party. Used by pages that need to know who is signed in.
import { createAuthClient } from "better-auth/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { ConvexClient } from "convex/browser";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [convexClient()],
});

// A Convex client that sends the signed in student's token with every call. `onChange` hears whether Convex
// accepted the token. `unsavedChangesWarning` is off on purpose: answers wait safely in the device queue
// (src/lib/session.ts), so the browser's "Leave site?" prompt would only worry the student for nothing.
export function createConvexClient(onChange?: (isAuthenticated: boolean) => void): ConvexClient {
  const client = new ConvexClient(import.meta.env.PUBLIC_CONVEX_URL as string, { unsavedChangesWarning: false });
  client.setAuth(async () => {
    try {
      const { data } = await authClient.convex.token({ fetchOptions: { throw: false } });
      return data?.token ?? null;
    } catch {
      return null;
    }
  }, onChange);
  return client;
}
