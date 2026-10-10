// The pure rules of the profile picture (spec 0011), with no database and no Convex imports, so a test can run every one of them
// with a stubbed `fetch`. Owns: which Google address may be fetched (AC-7), the size suffix, the file type check from the first
// bytes, the size and time limits, the random key, the rules for when a fetch is due (AC-6), and the one safe fetch.
// `fetchPicture` never throws: it always answers with an outcome the mutation `avatars.apply` can store.

export const MAX_BYTES = 200 * 1024; // AC-7: the largest picture we keep
export const FETCH_TIMEOUT_MS = 5000; // AC-7: one fetch, headers and body
export const RECHECK_MS = 7 * 24 * 60 * 60 * 1000; // AC-6: the quiet check after 7 days
export const LEASE_MS = 60 * 1000; // one fetch at a time for a student; a lost one is free after a minute
export const NOTICE_AGAIN_MS = 14 * 24 * 60 * 60 * 1000; // AC-2: after "Not now", the picture notice is shown again no sooner than this
export const SIZE_PX = 192; // the stored size: sharp at 64 CSS pixels on a 3x phone
export const KEY_RE = /^[A-Za-z0-9_-]{22}$/;
export const PICTURE_PATH = "/api/avatar/";

// Only these hosts: lh3.googleusercontent.com and its numbered siblings. A host such as lh3.googleusercontent.com.evil.com does not match.
const HOST_RE = /^lh[0-9]\.googleusercontent\.com$/;

export type Reason = "first" | "changed" | "recheck" | "clear";

/** The Google address as we keep it (https, host, path; no query and no fragment), or null when it may not be fetched. */
export function pictureAddress(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 2048 || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password || url.port) return null;
  if (!HOST_RE.test(url.hostname)) return null;
  // Google's own placeholder avatar counts as no photo (AC-3).
  if (url.pathname.includes("default-user")) return null;
  return url.origin + url.pathname;
}

/** The address with its size suffix replaced (`=s96-c` or `=w96-h96-c` → `=s192-c`) or added. */
const SIZE_SUFFIX = /=(s\d+|w\d+-h\d+)(-[a-z0-9]+)*$/;
export function sizedAddress(address: string, px: number = SIZE_PX): string {
  const suffix = `=s${px}-c`;
  return SIZE_SUFFIX.test(address) ? address.replace(SIZE_SUFFIX, suffix) : address + suffix;
}

/** The type from the file's own first bytes, never from a header. */
export function sniffType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  // RIFF....WEBP
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** 16 random bytes as 22 base64url characters. Made in the action, where the randomness is real; a new one for every changed image. */
export function newKey(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("");
}

type RowFacts = { sourceUrl: string; checkedAt: number; storageId?: unknown } | null;

/**
 * What a fetch is due for, without reading the clock (so a query can use it): `first` (no picture has ever landed), `changed` (the
 * account's address differs from the one we used), `clear` (the account has no photo now but we hold one), or null.
 */
export function immediateReason(row: RowFacts, address: string | null): Reason | null {
  if (!address) return row && row.storageId ? "clear" : null;
  if (!row || row.checkedAt === 0) return "first";
  if (row.sourceUrl !== address) return "changed";
  return null;
}

/** When the quiet weekly check falls due, or null when there is none to plan (no photo, or nothing has landed yet). */
export function recheckAt(row: RowFacts, address: string | null): number | null {
  if (!address || !row || row.checkedAt === 0 || row.sourceUrl !== address) return null;
  return row.checkedAt + RECHECK_MS;
}

/** The full rule for a mutation, which may read the clock. */
export function reasonNow(row: RowFacts, address: string | null, now: number): Reason | null {
  const immediate = immediateReason(row, address);
  if (immediate) return immediate;
  const at = recheckAt(row, address);
  return at !== null && now >= at ? "recheck" : null;
}

export type FetchOutcome =
  | { kind: "stored"; bytes: Uint8Array; contentType: string; sha256: string; key: string; etag?: string }
  | { kind: "unchanged"; etag?: string }
  | { kind: "failed"; code: string; permanent: boolean };

const failed = (code: string, permanent: boolean): FetchOutcome => ({ kind: "failed", code, permanent });

/** A 4xx other than 429 will not get better by asking again. */
const statusFailure = (status: number): FetchOutcome => failed(`http_${status}`, status >= 400 && status < 500 && status !== 429);

async function readLimited(res: Response, max: number): Promise<Uint8Array | "too_big"> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return "too_big";
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    return all.length > max ? "too_big" : all;
  }
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return "too_big";
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * The one request we ever make to Google for a picture (AC-7). The address is checked again here, whatever the caller did. No
 * redirect is followed (a 3xx is the code `redirect`), the whole fetch is cut off after 5 seconds, the body is read only up to 200 KB,
 * and the type must be JPEG, PNG or WebP by its first bytes. Never throws. `knownSha` is the hash of the picture we already hold: the
 * same image is answered `unchanged` and nothing is stored.
 */
export async function fetchPicture(
  address: string,
  opts: { etag?: string; knownSha?: string },
  fetchFn: typeof fetch = fetch,
): Promise<FetchOutcome> {
  const clean = pictureAddress(address);
  if (!clean) return failed("bad_host", true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: "image/jpeg,image/png,image/webp" };
    if (opts.etag) headers["if-none-match"] = opts.etag;
    const res = await fetchFn(sizedAddress(clean), { method: "GET", headers, redirect: "manual", signal: controller.signal });
    const etag = res.headers.get("etag")?.slice(0, 200) || undefined;
    if (res.status === 304) return { kind: "unchanged", etag: opts.etag };
    // 3xx, or a runtime that followed a redirect anyway (or one that hides it): either way we refuse.
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400) || res.redirected) {
      await res.body?.cancel().catch(() => undefined);
      return failed("redirect", true);
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return statusFailure(res.status);
    }
    const bytes = await readLimited(res, MAX_BYTES);
    if (bytes === "too_big") return failed("too_big", true);
    if (bytes.length === 0) return failed("empty", true);
    const contentType = sniffType(bytes);
    if (!contentType) return failed("bad_type", true);
    const sha256 = await sha256Hex(bytes);
    if (opts.knownSha && sha256 === opts.knownSha) return { kind: "unchanged", etag: etag ?? opts.etag };
    return { kind: "stored", bytes, contentType, sha256, key: newKey(), etag };
  } catch {
    return failed(controller.signal.aborted ? "timeout" : "network", false);
  } finally {
    clearTimeout(timer);
  }
}

/** The path a page uses for a picture. Always same origin. */
export const picturePath = (key: string): string => PICTURE_PATH + key;
