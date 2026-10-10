// GET /api/avatar/<key> (spec 0011, AC-8): the stored profile picture to anyone who has the key. The key is random and made again
// whenever the image changes, so it is the only capability needed. An unknown, removed, blocked, erased or switched off key all give
// the same 404, so an answer never says which of them it was. The site's Pages forwarder (functions/api/avatar) sets the same headers.
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { KEY_RE, PICTURE_PATH } from "./avatarCore";

const SAFE = {
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex",
  "content-security-policy": "default-src 'none'; sandbox",
};

const notFound = () => new Response("Not found", { status: 404, headers: { ...SAFE, "content-type": "text/plain", "cache-control": "no-store" } });

export const avatarImage = httpAction(async (ctx, req) => {
  const key = new URL(req.url).pathname.slice(PICTURE_PATH.length);
  if (!KEY_RE.test(key)) return notFound();
  const hit = await ctx.runQuery(internal.avatars.byKey, { key });
  if (!hit) return notFound();
  // The key changes with the image, so it is a perfect ETag by itself.
  const etag = `"${key}"`;
  const headers = { ...SAFE, "cache-control": "public, max-age=3600", etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const blob = await ctx.storage.get(hit.storageId);
  if (!blob) return notFound();
  return new Response(blob, { status: 200, headers: { ...headers, "content-type": hit.contentType } });
});
