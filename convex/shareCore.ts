// The pure parts of the private report link (spec 0010): the link code, how long a link lives, and the one answer for a link that
// does not work. No database and no network here, so a test can run every rule directly.
// The code is `<shareId>.<generation>.<signature>`. The signature is the first 16 bytes (128 bits) of HMAC SHA 256 over
// `<shareId>.<generation>` with SHARE_LINK_SECRET, in base64url (22 characters). Nothing secret is stored: the code can always be
// made again for the same row, a new generation gives a new code, and changing the secret ends every link at once.
import { b64url, enc, fromB64url, hmacKey } from "./reportCore";

export const SHARE_DAYS = 90; // a link ends this long after the last explicit Share tap ...
export const SHARE_MAX_DAYS = 365; // ... and never later than this long after it was made
export const SHARE_MAKE_PER_HOUR = 20; // links made or renewed an hour, for each student (AC-11)
export const SHARE_READ_PER_MINUTE = 600; // reads a minute, for each link (key = the share id), and for all bad codes together (AC-11)
export const SHARE_READ_SHARDS = 16; // every read writes its link's bucket, so a busy link is spread over this many documents (see limits.ts)
export const SHARE_BAD_SHARDS = 16; // the same for the one bucket that every made up code writes

/**
 * The secret that signs and checks link codes, or undefined while the private link is switched off on the server. Everything that makes,
 * shows or opens a link reads the secret through this, so with `PUBLIC_SHARE_ENABLED` unset no link can be made, no code verifies and every
 * request gets the one 404 (AC-7, AC-17). Read the switch trimmed and ignoring case: `true`, `1`, `yes` or `on` turn it on.
 */
export function shareSecret(e: { SHARE_LINK_SECRET?: string; PUBLIC_SHARE_ENABLED?: string }): string | undefined {
  const on = ["true", "1", "yes", "on"].includes((e.PUBLIC_SHARE_ENABLED ?? "").trim().toLowerCase());
  return on && e.SHARE_LINK_SECRET ? e.SHARE_LINK_SECRET : undefined;
}

/**
 * True for the error Convex throws when a mutation lost its race on the same documents on every retry (the rate limit rows, when many
 * readers arrive at once). The public route turns it into 429 slow_down; any other error is a real fault and stays a 500.
 */
export function isWriteConflict(e: unknown): boolean {
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return /changed while this mutation was being run|docs\.convex\.dev\/error#1\b/.test(message);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SIG_BYTES = 16;
const SIG_CHARS = 22; // 16 bytes in base64url, without padding
const MAX_CODE = 120;

/** `min(now + 90 days, createdAt + 365 days)`: where a Share tap at `now` moves the end of a link made at `createdAt` (AC-6). */
export function expiryFor(now: number, createdAt: number): number {
  return Math.min(now + SHARE_DAYS * DAY_MS, createdAt + SHARE_MAX_DAYS * DAY_MS);
}

async function signature(secret: string, body: string): Promise<Uint8Array> {
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body));
  return new Uint8Array(mac).slice(0, SIG_BYTES);
}

export async function makeShareCode(secret: string, shareId: string, generation: number): Promise<string> {
  const body = `${shareId}.${generation}`;
  return `${body}.${b64url((await signature(secret, body)).buffer as ArrayBuffer)}`;
}

/** Same time whatever the bytes are, so the answer does not leak how many leading bytes were right. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** The share id and generation the code was made for, or null when it is missing, malformed or wrongly signed (AC-7). */
export async function verifyShareCode(
  secret: string | undefined,
  code: string | null | undefined,
): Promise<{ shareId: string; generation: number } | null> {
  if (!secret || !code || code.length > MAX_CODE) return null;
  const parts = code.split(".");
  if (parts.length !== 3) return null;
  const [shareId, gen, sig] = parts;
  if (!/^[A-Za-z0-9]{1,64}$/.test(shareId) || !/^[1-9]\d{0,8}$/.test(gen) || sig.length !== SIG_CHARS) return null;
  const given = fromB64url(sig);
  // 16 bytes use 128 of the 132 bits of 22 characters, so the last character has 4 spare bits that decode to nothing. Only the one
  // canonical spelling is a code, so an altered string whose spare bits differ is refused too, never read as the same link.
  if (!given || b64url(given.buffer) !== sig) return null;
  const expected = await signature(secret, `${shareId}.${gen}`);
  return sameBytes(given, expected) ? { shareId, generation: Number(gen) } : null;
}

/** The one body every unusable link gets, whatever the reason (AC-7): the caller learns nothing about which it was. */
export const UNAVAILABLE_BODY = { code: "unavailable" } as const;
