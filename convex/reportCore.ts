// The pure parts of the saved report copy (spec 0006): the retry rules, the signed render token, the PDF check and the
// download file name. No database and no network here, so a test can run every rule directly.
// The token is stateless (no table): HMAC SHA 256 over the student id, the check id and an expiry, so it covers one check
// for 2 minutes and may be read more than once in that time (AC-9).

export const RENDER_TOKEN_MS = 2 * 60 * 1000;
export const LEASE_MS = 90 * 1000; // a job holds its lock this long at most
export const MAX_TRIES = 5; // counted tries in one round
// The wait after counted failure 1, 2, 3 and 4. The fifth counted failure ends the round as `failed`.
export const RETRY_DELAYS_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000, 60 * 60 * 1000];
export const FRESH_ROUND_AFTER_MS = 60 * 60 * 1000; // opening the report this long after `failedAt` starts a new round
export const DEFAULT_WAIT_MS = 60 * 1000; // a Browser Run 429 or 5xx without a Retry-After
// Browser Run on the Workers Free plan allows one quick action request every 10 seconds and 10 minutes of browser time a day.
// A job starts this long after the last one ended (the job itself takes a few seconds, so starts are about 11 seconds apart).
export const NEXT_JOB_GAP_MS = 8 * 1000;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const UNATTACHED_FILE_MS = 24 * 60 * 60 * 1000;

export type Outcome = { state: "queued"; attempts: number; nextAttemptAt: number } | { state: "failed"; attempts: number };

// What happens after a counted failure: the number of tries used so far, and either the next time to try or the end.
export function afterCountedFailure(attemptsSoFar: number, now: number): Outcome {
  const attempts = attemptsSoFar + 1;
  if (attempts >= MAX_TRIES) return { state: "failed", attempts };
  return { state: "queued", attempts, nextAttemptAt: now + RETRY_DELAYS_MS[attempts - 1] };
}

// ---------- the signed render token ----------

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null; // a cut off signature (length 1 more than a multiple of 4) is not valid base64
  }
}

const hmacKey = (secret: string, usage: "sign" | "verify") =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);

// `<studentId>.<checkId>.<expiryMs>.<signature>`. Convex ids contain no dots.
export async function signRenderToken(secret: string, studentId: string, checkId: string, now: number): Promise<string> {
  const body = `${studentId}.${checkId}.${now + RENDER_TOKEN_MS}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

// The ids the token was made for, or null when it is missing, malformed, wrongly signed or expired.
export async function verifyRenderToken(
  secret: string | undefined,
  token: string | null | undefined,
  now: number,
): Promise<{ studentId: string; checkId: string } | null> {
  if (!secret || !token || token.length > 400) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [studentId, checkId, expiry, sig] = parts;
  const sigBytes = fromB64url(sig);
  const exp = Number(expiry);
  if (!sigBytes || !studentId || !checkId || !/^\d+$/.test(expiry) || !Number.isFinite(exp)) return null;
  // verify() compares in constant time
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), sigBytes, enc.encode(`${studentId}.${checkId}.${expiry}`));
  if (!ok || exp <= now) return null;
  return { studentId, checkId };
}

// ---------- the PDF ----------

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Only a real PDF under 5 MB is kept (AC-11).
export function isPdf(bytes: ArrayBuffer): boolean {
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_PDF_BYTES) return false;
  return String.fromCharCode(...new Uint8Array(bytes, 0, 5)) === "%PDF-";
}

// `DhiRise-report-<first word, letters and digits only>.pdf`, else `DhiRise-report.pdf` (AC-8).
export function downloadName(studentName: string): string {
  const word = (studentName.trim().split(/\s+/)[0] ?? "").normalize("NFKD").replace(/[^A-Za-z0-9]/g, "");
  return word ? `DhiRise-report-${word.slice(0, 30)}.pdf` : "DhiRise-report.pdf";
}

// Browser Run says "Browser time limit exceeded for today" with a 429 when a Free plan account has used its 10 minutes.
// That does not clear until the next UTC day, so asking again every minute only wastes calls.
export function isDayLimit(body: string): boolean {
  return /time limit exceeded for today/i.test(body);
}

// How long until a minute after the next UTC midnight, when the day's browser time starts again.
export function msUntilNextUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 1) - now;
}

// The seconds in a Retry-After header as milliseconds, or the default wait.
export function waitFromRetryAfter(header: string | null): number {
  const secs = header === null ? NaN : Number(header);
  return Number.isFinite(secs) && secs > 0 ? Math.min(secs, 3600) * 1000 : DEFAULT_WAIT_MS;
}
