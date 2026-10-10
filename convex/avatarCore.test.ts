// The pure rules of the profile picture (spec 0011): the address check, the file check, the safe fetch and the due rules.
// A stubbed `fetch` stands in for Google; the host rule is never widened for tests (AC-7).
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  FETCH_TIMEOUT_MS,
  KEY_RE,
  MAX_BYTES,
  RECHECK_MS,
  fetchPicture,
  immediateReason,
  newKey,
  pictureAddress,
  reasonNow,
  recheckAt,
  sizedAddress,
  sniffType,
} from "./avatarCore";

const GOOD = "https://lh3.googleusercontent.com/a/ACg8ocJ-abc123=s96-c";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50, 1]);

const respond = (body: BodyInit | null, init: ResponseInit & { redirected?: boolean } = {}) => {
  const r = new Response(body, init);
  if (init.redirected) Object.defineProperty(r, "redirected", { value: true });
  return r;
};

afterEach(() => vi.useRealTimers());

describe("pictureAddress (AC-7: only Google picture hosts, https, no user info, no port)", () => {
  test("accepts the numbered Google picture hosts and keeps only origin and path", () => {
    expect(pictureAddress(GOOD)).toBe("https://lh3.googleusercontent.com/a/ACg8ocJ-abc123=s96-c");
    expect(pictureAddress("https://lh6.googleusercontent.com/a/x?sz=50#frag")).toBe("https://lh6.googleusercontent.com/a/x");
  });

  test.each([
    ["plain http", "http://lh3.googleusercontent.com/a/x"],
    ["another host", "https://example.com/a/x"],
    ["a look alike suffix", "https://lh3.googleusercontent.com.evil.com/a/x"],
    ["a look alike prefix", "https://evil-lh3.googleusercontent.com/a/x"],
    ["a letter instead of a digit", "https://lhx.googleusercontent.com/a/x"],
    ["two digits", "https://lh33.googleusercontent.com/a/x"],
    ["user info", "https://user:pw@lh3.googleusercontent.com/a/x"],
    ["a port", "https://lh3.googleusercontent.com:8443/a/x"],
    ["google's default avatar", "https://lh3.googleusercontent.com/a/default-user=s96-c"],
    ["whitespace", "https://lh3.googleusercontent.com/a/x y"],
    ["not an address", "not a url"],
    ["a data address", "data:image/png;base64,AAAA"],
    ["empty", ""],
  ])("refuses %s", (_name, raw) => {
    expect(pictureAddress(raw)).toBeNull();
  });

  test("refuses null, undefined and a very long address", () => {
    expect(pictureAddress(null)).toBeNull();
    expect(pictureAddress(undefined)).toBeNull();
    expect(pictureAddress("https://lh3.googleusercontent.com/" + "a".repeat(3000))).toBeNull();
  });
});

describe("sizedAddress", () => {
  test("replaces a trailing size suffix, or appends one", () => {
    expect(sizedAddress("https://lh3.googleusercontent.com/a/x=s96-c")).toBe("https://lh3.googleusercontent.com/a/x=s192-c");
    expect(sizedAddress("https://lh3.googleusercontent.com/a/x=s400")).toBe("https://lh3.googleusercontent.com/a/x=s192-c");
    expect(sizedAddress("https://lh3.googleusercontent.com/a/x=s64-c-mo")).toBe("https://lh3.googleusercontent.com/a/x=s192-c");
    expect(sizedAddress("https://lh3.googleusercontent.com/a/x")).toBe("https://lh3.googleusercontent.com/a/x=s192-c");
    // a width and height suffix is replaced, not left in front of a second one
    expect(sizedAddress("https://lh3.googleusercontent.com/a/ACg8ocJ_x-y=w96-h96-c")).toBe("https://lh3.googleusercontent.com/a/ACg8ocJ_x-y=s192-c");
    expect(sizedAddress("https://lh3.googleusercontent.com/a/x=w400-h400")).toBe("https://lh3.googleusercontent.com/a/x=s192-c");
  });
});

describe("sniffType (AC-7: the type comes from the first bytes)", () => {
  test("knows JPEG, PNG and WebP", () => {
    expect(sniffType(JPEG)).toBe("image/jpeg");
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(WEBP)).toBe("image/webp");
  });
  test("refuses HTML, SVG, GIF, a short file and an empty file", () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(sniffType(text("<!doctype html><html>"))).toBeNull();
    expect(sniffType(text("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffType(text("GIF89a......"))).toBeNull();
    expect(sniffType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffType(new Uint8Array([]))).toBeNull();
    expect(sniffType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // RIFF WAVE
  });
});

describe("newKey (AC-8: random, 22 base64url characters)", () => {
  test("is 22 URL safe characters and is different each time", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(KEY_RE);
  });
});

describe("fetchPicture (AC-7: the one safe request to Google)", () => {
  test("fetches the sized address with no redirects, no cookies and no credentials, and returns the type, hash and a new key", async () => {
    const stub = vi.fn(async () => respond(JPEG, { status: 200, headers: { etag: '"abc"' } }));
    const out = await fetchPicture(GOOD, {}, stub as unknown as typeof fetch);
    expect(out.kind).toBe("stored");
    if (out.kind === "stored") {
      expect(out.contentType).toBe("image/jpeg");
      expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(out.key).toMatch(KEY_RE);
      expect(out.etag).toBe('"abc"');
      expect(Array.from(out.bytes)).toEqual(Array.from(JPEG));
    }
    const [url, init] = stub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://lh3.googleusercontent.com/a/ACg8ocJ-abc123=s192-c");
    expect(init.redirect).toBe("manual");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBeUndefined();
    expect(JSON.stringify(init.headers).toLowerCase()).not.toMatch(/cookie|authorization/);
  });

  test("never calls fetch for an address that fails the host rule", async () => {
    const stub = vi.fn();
    for (const bad of ["https://evil.example/a=s96-c", "https://lh3.googleusercontent.com.evil.com/a", "http://lh3.googleusercontent.com/a", "https://lh3.googleusercontent.com:444/a"]) {
      expect(await fetchPicture(bad, {}, stub as unknown as typeof fetch)).toEqual({ kind: "failed", code: "bad_host", permanent: true });
    }
    expect(stub).not.toHaveBeenCalled();
  });

  test("a 3xx, an opaque redirect and a followed redirect are all the code redirect", async () => {
    for (const make of [
      () => respond(null, { status: 302, headers: { location: "https://evil.example/x" } }),
      () => respond(null, { status: 301 }),
      () => respond(JPEG, { status: 200, redirected: true }),
    ]) {
      const out = await fetchPicture(GOOD, {}, (async () => make()) as unknown as typeof fetch);
      expect(out).toEqual({ kind: "failed", code: "redirect", permanent: true });
    }
  });

  test("a 304 is unchanged and keeps the etag", async () => {
    const out = await fetchPicture(GOOD, { etag: '"abc"' }, (async () => respond(null, { status: 304 })) as unknown as typeof fetch);
    expect(out).toEqual({ kind: "unchanged", etag: '"abc"' });
  });

  test("sends If-None-Match only when it has an etag", async () => {
    const stub = vi.fn(async () => respond(JPEG, { status: 200 }));
    await fetchPicture(GOOD, { etag: '"abc"' }, stub as unknown as typeof fetch);
    expect((stub.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ "if-none-match": '"abc"' });
    const stub2 = vi.fn(async () => respond(JPEG, { status: 200 }));
    await fetchPicture(GOOD, {}, stub2 as unknown as typeof fetch);
    expect((stub2.mock.calls[0] as unknown as [string, RequestInit])[1].headers).not.toHaveProperty("if-none-match");
  });

  test("the same image as the one we hold is unchanged and is not returned for storing", async () => {
    const first = await fetchPicture(GOOD, {}, (async () => respond(JPEG, { status: 200 })) as unknown as typeof fetch);
    expect(first.kind).toBe("stored");
    const sha = first.kind === "stored" ? first.sha256 : "";
    const again = await fetchPicture(GOOD, { knownSha: sha }, (async () => respond(JPEG, { status: 200 })) as unknown as typeof fetch);
    expect(again.kind).toBe("unchanged");
  });

  test("a 4xx is permanent, a 429 and a 5xx are not", async () => {
    const code = async (status: number) => fetchPicture(GOOD, {}, (async () => respond("x", { status })) as unknown as typeof fetch);
    expect(await code(404)).toEqual({ kind: "failed", code: "http_404", permanent: true });
    expect(await code(403)).toEqual({ kind: "failed", code: "http_403", permanent: true });
    expect(await code(429)).toEqual({ kind: "failed", code: "http_429", permanent: false });
    expect(await code(503)).toEqual({ kind: "failed", code: "http_503", permanent: false });
  });

  test("an HTML file named .jpg is refused by its bytes, whatever the header says", async () => {
    const html = new TextEncoder().encode("<!doctype html><title>no</title>");
    const out = await fetchPicture(GOOD, {}, (async () => respond(html, { status: 200, headers: { "content-type": "image/jpeg" } })) as unknown as typeof fetch);
    expect(out).toEqual({ kind: "failed", code: "bad_type", permanent: true });
  });

  test("an empty body is refused", async () => {
    const out = await fetchPicture(GOOD, {}, (async () => respond(new Uint8Array(), { status: 200 })) as unknown as typeof fetch);
    expect(out).toEqual({ kind: "failed", code: "empty", permanent: true });
  });

  test("a 300 KB image is refused, by its declared length and by counting a body that lies", async () => {
    const big = new Uint8Array(300 * 1024);
    big.set(JPEG);
    const declared = await fetchPicture(GOOD, {}, (async () => respond(big, { status: 200, headers: { "content-length": String(big.length) } })) as unknown as typeof fetch);
    expect(declared).toEqual({ kind: "failed", code: "too_big", permanent: true });
    // no content-length: the stream is counted and cut off
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(64 * 1024).fill(0xff));
      },
    });
    const counted = await fetchPicture(GOOD, {}, (async () => new Response(stream, { status: 200 })) as unknown as typeof fetch);
    expect(counted).toEqual({ kind: "failed", code: "too_big", permanent: true });
  });

  test("an image of exactly 200 KB is kept", async () => {
    const edge = new Uint8Array(MAX_BYTES);
    edge.set(JPEG);
    const out = await fetchPicture(GOOD, {}, (async () => respond(edge, { status: 200 })) as unknown as typeof fetch);
    expect(out.kind).toBe("stored");
  });

  test("a server that never answers is cut off after 5 seconds and is a short lived failure", async () => {
    vi.useFakeTimers();
    const slow = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const pending = fetchPicture(GOOD, {}, slow as unknown as typeof fetch);
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ kind: "failed", code: "timeout", permanent: false });
  });

  test("a network error is a short lived failure and never throws", async () => {
    const out = await fetchPicture(GOOD, {}, (async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch);
    expect(out).toEqual({ kind: "failed", code: "network", permanent: false });
  });
});

describe("when a fetch is due (AC-6)", () => {
  const row = (over: Record<string, unknown> = {}) => ({ sourceUrl: pictureAddress(GOOD)!, checkedAt: 1000, storageId: "s", ...over });
  const address = pictureAddress(GOOD);

  test("first: no row yet, or a row that has never landed", () => {
    expect(immediateReason(null, address)).toBe("first");
    expect(immediateReason(row({ checkedAt: 0, storageId: undefined }), address)).toBe("first");
  });
  test("changed: the account's address differs from the one we used", () => {
    expect(immediateReason(row(), "https://lh3.googleusercontent.com/a/other=s96-c")).toBe("changed");
  });
  test("clear: the account has no photo now but we hold one; with nothing held there is nothing to do", () => {
    expect(immediateReason(row(), null)).toBe("clear");
    expect(immediateReason(row({ storageId: undefined }), null)).toBeNull();
    expect(immediateReason(null, null)).toBeNull();
  });
  test("recheck: only after 7 days, and the clock is passed in", () => {
    expect(reasonNow(row(), address, 1000 + RECHECK_MS - 1)).toBeNull();
    expect(reasonNow(row(), address, 1000 + RECHECK_MS)).toBe("recheck");
    expect(recheckAt(row(), address)).toBe(1000 + RECHECK_MS);
  });
  test("there is no weekly check to plan with no photo, before the first fetch lands, or at a changed address", () => {
    expect(recheckAt(row(), null)).toBeNull();
    expect(recheckAt(row({ checkedAt: 0 }), address)).toBeNull();
    expect(recheckAt(row(), "https://lh3.googleusercontent.com/a/other=s96-c")).toBeNull();
    expect(recheckAt(null, address)).toBeNull();
  });
});
