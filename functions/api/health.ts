// Cloudflare Pages Function: GET /api/health. Answers "is the site up", and when CONVEX_SITE_URL is set
// (a Pages runtime variable, the deployment's .convex.site address) also "is the backend up".
// Returns no student data. Sign in forwarding (/api/auth/*) is added next to this file later (scope row 4).
interface Env {
  CONVEX_SITE_URL?: string;
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const onRequestGet = async ({ env }: { env: Env }): Promise<Response> => {
  if (!env.CONVEX_SITE_URL) {
    return json({ ok: true, site: "ok", backend: "not configured" }, 200);
  }
  try {
    const res = await fetch(new URL("/health", env.CONVEX_SITE_URL), {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok
      ? json({ ok: true, site: "ok", backend: "ok" }, 200)
      : json({ ok: false, site: "ok", backend: "down" }, 503);
  } catch {
    return json({ ok: false, site: "ok", backend: "down" }, 503);
  }
};
