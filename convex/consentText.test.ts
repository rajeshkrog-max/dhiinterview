// The consent text and its fingerprint (spec 0002, AC-3 and AC-6): the page and the server must agree.
import { describe, expect, test } from "vitest";
import {
  CONSENT_KINDS,
  CONSENT_LINES,
  CONSENT_LINES_V1,
  CONSENT_LINES_V2,
  CONSENT_TEXTS,
  CONSENT_VERSION,
  CONSENT_VERSION_V1,
  CONSENT_VERSION_V2,
  consentHash,
} from "./consentText";

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

  test("covers scope row 25: v2 is frozen (its fingerprint never changes), is v1 plus exactly one line, and names Cloudflare Browser Run", async () => {
    expect(CONSENT_VERSION_V2).toBe("v2");
    expect(await consentHash(CONSENT_TEXTS[CONSENT_VERSION_V2])).toBe("38c9de99590d3f10ef15e4ac9e8c797a8212c5fb2fec577c3992d757cebafea3");
    expect(CONSENT_KINDS[CONSENT_VERSION_V2]).toBe("landing");
    expect(CONSENT_LINES_V2).toHaveLength(CONSENT_LINES_V1.length + 1);
    expect(CONSENT_LINES_V2.filter((l) => !CONSENT_LINES_V1.includes(l))).toHaveLength(1);
    expect(CONSENT_LINES_V2.filter((l) => CONSENT_LINES_V1.includes(l))).toEqual([...CONSENT_LINES_V1]); // every v1 line, same order
    expect(CONSENT_TEXTS[CONSENT_VERSION_V2]).toContain("Cloudflare Browser Run");
  });

  test("covers spec 0008 AC-11: the current version is v3, is v2 plus exactly one line, and says the team can open a report and each open is recorded", () => {
    expect(CONSENT_VERSION).toBe("v3");
    expect(CONSENT_KINDS[CONSENT_VERSION]).toBe("landing");
    expect(CONSENT_LINES).toHaveLength(CONSENT_LINES_V2.length + 1);
    expect(CONSENT_LINES.filter((l) => !CONSENT_LINES_V2.includes(l))).toEqual([
      "Named members of the DhiRise team can open your report to help you. Each time one does, we record who opened it and when.",
    ]);
    expect(CONSENT_LINES.filter((l) => CONSENT_LINES_V2.includes(l))).toEqual([...CONSENT_LINES_V2]); // every v2 line, same order
    expect(CONSENT_TEXTS[CONSENT_VERSION]).toContain("Cloudflare Browser Run");
    expect(CONSENT_LINES.at(-1)).toMatch(/^By tapping I agree/); // the agree line stays last
  });
});
