// The pure rules of the saved report copy (spec 0006): the signed render token, the retry schedule, the PDF check and the
// download name. Each test names the criterion it covers.
import { describe, expect, test } from "vitest";
import reportText from "../public/dhiinterviews/js/engine/reportText.js?raw";
import {
  DEFAULT_WAIT_MS,
  MAX_PDF_BYTES,
  RENDER_TOKEN_MS,
  RETRY_DELAYS_MS,
  afterCountedFailure,
  NEXT_JOB_GAP_MS,
  downloadName,
  isDayLimit,
  isPdf,
  msUntilNextUtcDay,
  sha256Hex,
  signRenderToken,
  verifyRenderToken,
  waitFromRetryAfter,
} from "./reportCore";
import { REPORT_VERSION } from "./reportVersion";

const SECRET = "a-long-random-test-secret";
const NOW = 1_700_000_000_000;

describe("render token", () => {
  test("covers AC-9: a fresh token opens the check it was made for, and may be read more than once", async () => {
    const token = await signRenderToken(SECRET, "stu1", "chk1", NOW);
    expect(await verifyRenderToken(SECRET, token, NOW + 1000)).toEqual({ studentId: "stu1", checkId: "chk1" });
    expect(await verifyRenderToken(SECRET, token, NOW + 60_000)).toEqual({ studentId: "stu1", checkId: "chk1" });
  });

  test("covers AC-9: an expired token is refused (valid for 2 minutes)", async () => {
    const token = await signRenderToken(SECRET, "stu1", "chk1", NOW);
    expect(await verifyRenderToken(SECRET, token, NOW + RENDER_TOKEN_MS - 1)).not.toBeNull();
    expect(await verifyRenderToken(SECRET, token, NOW + RENDER_TOKEN_MS)).toBeNull();
  });

  test("covers AC-9: a wrong secret, a changed id, a changed expiry, a cut off or empty token are all refused", async () => {
    const token = await signRenderToken(SECRET, "stu1", "chk1", NOW);
    const [s, c, e, sig] = token.split(".");
    expect(await verifyRenderToken("another-secret", token, NOW)).toBeNull();
    expect(await verifyRenderToken(SECRET, `stu2.${c}.${e}.${sig}`, NOW)).toBeNull();
    expect(await verifyRenderToken(SECRET, `${s}.chk2.${e}.${sig}`, NOW)).toBeNull();
    expect(await verifyRenderToken(SECRET, `${s}.${c}.${Number(e) + 600000}.${sig}`, NOW)).toBeNull();
    for (const bad of [token.slice(0, -4), `${s}.${c}.${e}`, "", "a.b.c.d", `${s}.${c}.${e}.${sig}.x`, "x".repeat(500)]) {
      expect(await verifyRenderToken(SECRET, bad, NOW)).toBeNull();
    }
    expect(await verifyRenderToken(SECRET, null, NOW)).toBeNull();
    expect(await verifyRenderToken(undefined, token, NOW)).toBeNull(); // no secret set: nothing is valid
    expect(await verifyRenderToken("", token, NOW)).toBeNull();
  });
});

describe("retry schedule", () => {
  test("covers AC-7: five counted tries, waiting 30 seconds, 2 minutes, 10 minutes and 1 hour, then failed", () => {
    let attempts = 0;
    const waits: number[] = [];
    for (let i = 0; i < 4; i++) {
      const next = afterCountedFailure(attempts, NOW);
      if (next.state !== "queued") throw new Error("ended too early");
      waits.push(next.nextAttemptAt - NOW);
      attempts = next.attempts;
    }
    expect(waits).toEqual(RETRY_DELAYS_MS);
    expect(waits).toEqual([30_000, 120_000, 600_000, 3_600_000]);
    expect(afterCountedFailure(attempts, NOW)).toEqual({ state: "failed", attempts: 5 });
  });

  test("covers AC-7: a Retry-After of N seconds waits N seconds, else 1 minute", () => {
    expect(waitFromRetryAfter("30")).toBe(30_000);
    expect(waitFromRetryAfter(null)).toBe(DEFAULT_WAIT_MS);
    expect(waitFromRetryAfter("soon")).toBe(DEFAULT_WAIT_MS);
    expect(waitFromRetryAfter("0")).toBe(DEFAULT_WAIT_MS);
    expect(waitFromRetryAfter("999999")).toBe(3_600_000); // capped at an hour
  });
});

describe("the PDF check", () => {
  const bytes = (s: string, pad = 0) => {
    const b = new Uint8Array(s.length + pad);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b.buffer;
  };

  test("covers AC-11: only bytes that start with %PDF- and are under 5 MB are kept", () => {
    expect(isPdf(bytes("%PDF-1.7 rest"))).toBe(true);
    expect(isPdf(bytes("<html>not a pdf</html>"))).toBe(false);
    expect(isPdf(bytes('{"success":false}'))).toBe(false);
    expect(isPdf(new ArrayBuffer(0))).toBe(false);
    expect(isPdf(bytes("%PDF-", MAX_PDF_BYTES - 5))).toBe(true);
    expect(isPdf(bytes("%PDF-", MAX_PDF_BYTES - 4))).toBe(false); // one byte over
  });

  test("covers AC-11: the stored fingerprint is the SHA 256 of the bytes", async () => {
    expect(await sha256Hex(bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("download name", () => {
  test("covers AC-8: the first word, letters and digits only, else a plain name", () => {
    expect(downloadName("Asha Rao")).toBe("DhiRise-report-Asha.pdf");
    expect(downloadName("  Mary-Anne  Smith ")).toBe("DhiRise-report-MaryAnne.pdf");
    expect(downloadName('A"sha\r\nX-Evil: 1')).toBe("DhiRise-report-Asha.pdf");
    expect(downloadName("../../etc")).toBe("DhiRise-report-etc.pdf");
    expect(downloadName("")).toBe("DhiRise-report.pdf");
    expect(downloadName("???")).toBe("DhiRise-report.pdf");
    expect(downloadName("Ananya".repeat(20))).toMatch(/^DhiRise-report-[A-Za-z]{30}\.pdf$/);
  });
});

describe("Browser Run free plan pacing", () => {
  test("covers AC-7: jobs start at least 10 seconds apart (the Free plan allows one request every 10 seconds), counting the job itself", () => {
    expect(NEXT_JOB_GAP_MS).toBeGreaterThanOrEqual(8000);
  });

  test("covers AC-7: the daily browser time answer is recognised, and waits for a minute after the next UTC midnight", () => {
    expect(isDayLimit("Error processing the request: Unable to create new browser: code: 429: message: Browser time limit exceeded for today")).toBe(true);
    expect(isDayLimit("{}")).toBe(false);
    expect(isDayLimit("Too many requests")).toBe(false);
    const noon = Date.UTC(2026, 9, 9, 12, 0, 0);
    expect(msUntilNextUtcDay(noon)).toBe(12 * 3600_000 + 60_000);
    const justBefore = Date.UTC(2026, 11, 31, 23, 59, 59);
    expect(msUntilNextUtcDay(justBefore)).toBe(1000 + 60_000); // across the new year
  });
});

describe("report version", () => {
  test("covers AC-13: the server's REPORT_VERSION equals the VERSION the page carries in reportText.js", () => {
    const m = /^\s*VERSION:\s*(\d+)\s*,/m.exec(reportText);
    expect(m, "no `VERSION: <number>,` line in reportText.js").not.toBeNull();
    expect(Number(m?.[1])).toBe(REPORT_VERSION);
  });
});
