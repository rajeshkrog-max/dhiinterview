// Backend health check, callable from the app (api.health.ping) and from tests.
// Needs: nothing else. The public HTTP version is in http.ts.
import { query } from "./_generated/server";
import { v } from "convex/values";

export const ping = query({
  args: {},
  returns: v.object({ ok: v.boolean() }),
  handler: async () => ({ ok: true }),
});
