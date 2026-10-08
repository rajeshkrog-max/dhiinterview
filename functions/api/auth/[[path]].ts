// Cloudflare Pages Function: forwards /api/auth/* (Google sign in, session, token) to the Convex deployment,
// so the browser only ever talks to the site's own address and sign in cookies stay first party
// (iPhone Safari and Firefox block cookies set across two addresses). Mirrors the forwarding that
// @convex-dev/better-auth ships for Next.js (nextjs/index.js). Needs CONVEX_SITE_URL (see wrangler.toml).
interface Env {
  CONVEX_SITE_URL?: string;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
  }
  if (!env.CONVEX_SITE_URL) {
    return new Response("Sign in is not configured", { status: 503 });
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, env.CONVEX_SITE_URL);

  const headers = new Headers(request.headers);
  headers.delete("transfer-encoding");
  headers.delete("content-length");
  headers.delete("connection");
  headers.set("accept-encoding", "identity");
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(/:$/, ""));
  headers.set("x-better-auth-forwarded-host", url.host);
  headers.set("x-better-auth-forwarded-proto", url.protocol.replace(/:$/, ""));

  const init: RequestInit = { method: request.method, headers, redirect: "manual" };
  if (request.method === "POST") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }
  return fetch(target, init);
};
