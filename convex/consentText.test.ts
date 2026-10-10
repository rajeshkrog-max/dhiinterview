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
  CONSENT_VERSION_V3,
  CONSENT_LINES_V3,
  PICTURE_CONSENT_VERSIONS,
  PICTURE_LINE_MARK,
  SHARE_CONSENT_LINES,
  SHARE_CONSENT_VERSION,
  SHARE_GUARDIAN_TICK,
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

  test("covers spec 0008 AC-11: v3 is frozen (its fingerprint never changes), is v2 plus exactly one line, and says the team can open a report and each open is recorded", async () => {
    expect(CONSENT_VERSION_V3).toBe("v3");
    expect(await consentHash(CONSENT_TEXTS[CONSENT_VERSION_V3])).toBe("b14f67e8b5006d18dcd5cca65db37c86bc9d07479e2f670bb6eb667317d476d7");
    expect(CONSENT_KINDS[CONSENT_VERSION_V3]).toBe("landing");
    expect(CONSENT_LINES_V3).toHaveLength(CONSENT_LINES_V2.length + 1);
    expect(CONSENT_LINES_V3.filter((l) => !CONSENT_LINES_V2.includes(l))).toEqual([
      "Named members of the DhiRise team can open your report to help you. Each time one does, we record who opened it and when.",
    ]);
    expect(CONSENT_LINES_V3.filter((l) => CONSENT_LINES_V2.includes(l))).toEqual([...CONSENT_LINES_V2]); // every v2 line, same order
    expect(CONSENT_TEXTS[CONSENT_VERSION_V3]).toContain("Cloudflare Browser Run");
    expect(CONSENT_LINES_V3.at(-1)).toMatch(/^By tapping I agree/); // the agree line stays last
  });

  test("covers spec 0011 AC-2: the current version is v4, is v3 plus exactly one line placed before the team line, and the agree line stays last", () => {
    expect(CONSENT_VERSION).toBe("v4");
    expect(CONSENT_KINDS[CONSENT_VERSION]).toBe("landing");
    expect(CONSENT_LINES).toHaveLength(CONSENT_LINES_V3.length + 1);
    const added = CONSENT_LINES.filter((l) => !CONSENT_LINES_V3.includes(l));
    expect(added).toHaveLength(1);
    expect(CONSENT_LINES.filter((l) => CONSENT_LINES_V3.includes(l))).toEqual([...CONSENT_LINES_V3]); // every v3 line, same order
    expect(CONSENT_LINES.indexOf(added[0])).toBe(CONSENT_LINES.findIndex((l) => l.startsWith("Named members of the DhiRise team")) - 1);
    expect(CONSENT_TEXTS[CONSENT_VERSION]).toBe(CONSENT_LINES.join("\n\n"));
    expect(CONSENT_LINES.at(-1)).toMatch(/^By tapping I agree/);
  });

  test("covers spec 0011 AC-15: every version in PICTURE_CONSENT_VERSIONS names the saved picture and where it shows, and no older version is in the list", () => {
    expect(PICTURE_CONSENT_VERSIONS).toContain(CONSENT_VERSION); // the current text always names the picture
    for (const version of PICTURE_CONSENT_VERSIONS) {
      const text = CONSENT_TEXTS[version];
      expect(text, version).toContain(PICTURE_LINE_MARK);
      expect(text, version).toMatch(/next to your name/);
      expect(text, version).toMatch(/leaderboard/);
      expect(text, version).toMatch(/report link you share/);
      expect(text, version).toMatch(/remove it at any time/);
      expect(CONSENT_KINDS[version], version).toBe("landing");
    }
    for (const old of [CONSENT_VERSION_V1, CONSENT_VERSION_V2, CONSENT_VERSION_V3]) {
      expect(PICTURE_CONSENT_VERSIONS).not.toContain(old);
      expect(CONSENT_TEXTS[old]).not.toContain(PICTURE_LINE_MARK); // the frozen texts never mention it
    }
  });

  test("covers spec 0011 AC-15: a later landing version fails here unless it keeps the picture line and is listed", () => {
    // A landing version after v3 must carry the picture line. Any new key in CONSENT_TEXTS of kind landing that is not v1 to v3 has to be listed.
    for (const [version, kind] of Object.entries(CONSENT_KINDS)) {
      if (kind !== "landing" || [CONSENT_VERSION_V1, CONSENT_VERSION_V2, CONSENT_VERSION_V3].includes(version)) continue;
      expect(CONSENT_TEXTS[version], version).toContain(PICTURE_LINE_MARK);
      expect(PICTURE_CONSENT_VERSIONS, version).toContain(version);
    }
  });
});

describe("the share notice (spec 0010, AC-3)", () => {
  test("covers AC-3: share-v1 is its own kind, is the lines joined by a blank line, and its draft words are pinned until the owner approves them", async () => {
    expect(SHARE_CONSENT_VERSION).toBe("share-v1");
    expect(CONSENT_KINDS[SHARE_CONSENT_VERSION]).toBe("share");
    expect(CONSENT_TEXTS[SHARE_CONSENT_VERSION]).toBe(SHARE_CONSENT_LINES.join("\n\n"));
    expect(await consentHash(CONSENT_TEXTS[SHARE_CONSENT_VERSION])).toBe("27854eb502790b316a2dbc1d5019210c580acc3e84ae8f59d54aaa18f3d01663");
  });

  test("covers AC-3: the notice says who can see what, how to turn it off, and that it ends; the tick for under 18s is the spec's words", () => {
    const text = CONSENT_TEXTS[SHARE_CONSENT_VERSION];
    expect(text).toMatch(/private link to your report/);
    expect(text).toMatch(/Anyone who has the link can read your whole report/);
    expect(text).toMatch(/first name and your profile picture/);
    expect(text).toMatch(/copy the link to others/);
    expect(text).toMatch(/cannot see your age, class, email, phone number or your private notes/);
    expect(text).toMatch(/Stop sharing/);
    expect(text).toMatch(/90 days/);
    expect(SHARE_GUARDIAN_TICK).toBe("I have checked with a parent or guardian.");
  });

  test("covers AC-3: no other kind's text can be used as the share notice, and the share text is not a picture or landing version", () => {
    expect(PICTURE_CONSENT_VERSIONS).not.toContain(SHARE_CONSENT_VERSION);
    expect(Object.entries(CONSENT_KINDS).filter(([, k]) => k === "share").map(([v]) => v)).toEqual([SHARE_CONSENT_VERSION]);
  });
});
