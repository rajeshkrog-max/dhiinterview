// Browser side of sign in. Talks to the site's own address (/api/auth/*), never to Convex directly for auth,
// so cookies stay first party. Used by pages that need to know who is signed in.
import { createAuthClient } from "better-auth/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { ConvexClient } from "convex/browser";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [convexClient()],
});

// A Convex client that sends the signed in student's token with every call.
export function createConvexClient(): ConvexClient {
  const client = new ConvexClient(import.meta.env.PUBLIC_CONVEX_URL as string);
  client.setAuth(async () => {
    const { data } = await authClient.convex.token({ fetchOptions: { throw: false } });
    return data?.token ?? null;
  });
  return client;
}
