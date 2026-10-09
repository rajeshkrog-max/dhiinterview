// The consent text and its fingerprint (spec 0002, AC-3 and AC-6): the page and the server must agree.
import { describe, expect, test } from "vitest";
import { CONSENT_KINDS, CONSENT_LINES, CONSENT_LINES_V1, CONSENT_TEXTS, CONSENT_VERSION, CONSENT_VERSION_V1, consentHash } from "./consentText";

describe("consent text", () => {
  test("the current version is known and is exactly the lines joined by a blank line", () => {
    expect(CONSENT_TEXTS[CONSENT_VERSION]).toBe(CONSENT_LINES.join("\n\n"));
  });

  test("the fingerprint is a stable 64 character hex string", async () => {
    const a = await consentHash(CONSENT_TEXTS[CONSENT_VERSION]);
    const b = await consentHash(CONSENT_TEXTS[CONSENT_VERSION]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  test("line endings do not change the fingerprint (page and server may differ)", async () => {
    const text = CONSENT_TEXTS[CONSENT_VERSION];
    expect(await consentHash(text.replace(/\n/g, "\r\n"))).toBe(await consentHash(text));
  });

  test("any change of wording changes the fingerprint", async () => {
    const text = CONSENT_TEXTS[CONSENT_VERSION];
    expect(await consentHash(text + " ")).not.toBe(await consentHash(text));
  });

  test("covers scope row 25: v1 is frozen (its fingerprint never changes), because saved consent rows point at it", async () => {
    expect(CONSENT_VERSION_V1).toBe("v1");
    expect(await consentHash(CONSENT_TEXTS[CONSENT_VERSION_V1])).toBe("9c4e755e3ab8dcc1e04b7bba0b71010291eb8a75c2ab1d6293c7685231d0610b");
    expect(CONSENT_KINDS[CONSENT_VERSION_V1]).toBe("landing");
  });

  test("covers scope row 25: the current version is v2, is v1 plus exactly one line, and names Cloudflare Browser Run", () => {
    expect(CONSENT_VERSION).toBe("v2");
    expect(CONSENT_KINDS[CONSENT_VERSION]).toBe("landing");
    expect(CONSENT_LINES).toHaveLength(CONSENT_LINES_V1.length + 1);
    expect(CONSENT_LINES.filter((l) => !CONSENT_LINES_V1.includes(l))).toHaveLength(1);
    expect(CONSENT_LINES.filter((l) => CONSENT_LINES_V1.includes(l))).toEqual([...CONSENT_LINES_V1]); // every v1 line, same order
    expect(CONSENT_TEXTS[CONSENT_VERSION]).toContain("Cloudflare Browser Run");
    expect(CONSENT_LINES.at(-1)).toMatch(/^By tapping I agree/); // the agree line stays last
  });
});
