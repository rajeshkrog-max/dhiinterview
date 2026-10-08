// The consent text and its fingerprint (spec 0002, AC-3 and AC-6): the page and the server must agree.
import { describe, expect, test } from "vitest";
import { CONSENT_LINES, CONSENT_TEXTS, CONSENT_VERSION, consentHash } from "./consentText";

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
});
