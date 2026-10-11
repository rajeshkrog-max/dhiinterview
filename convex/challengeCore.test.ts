// The pure rules of the challenge (spec 0016, AC-1, AC-5, AC-6): the code letters, the code characters and when a referral is valid.
import { describe, expect, test } from "vitest";
import { codeLetters, decideReferral, randomChars, type StepTimes } from "./challengeCore";
import { CODE_CHARS, CODE_RE, ENDS_AT_ISO, ENDS_AT_MS, hasEnded, isLive } from "./challengeRules";

describe("the deadline and the switch", () => {
  test("covers AC-4: the deadline is 23:59 India time on 30 October 2026, which is 18:29 UTC", () => {
    expect(ENDS_AT_MS).toBe(Date.parse("2026-10-30T18:29:00Z"));
    expect(ENDS_AT_ISO).toBe("2026-10-30T23:59:00+05:30");
    expect(hasEnded(ENDS_AT_MS)).toBe(false); // 23:59:00 exactly is still on time
    expect(hasEnded(ENDS_AT_MS + 30_000)).toBe(true); // 23:59:30 is late
  });

  test("covers AC-3: the switch is on only for true, 1, yes or on, in any case with spaces; unset or anything else is off", () => {
    for (const on of ["true", "1", "yes", "on", " True ", "ON"]) expect(isLive({ CHALLENGE_LIVE: on }), on).toBe(true);
    for (const off of [undefined, "", "false", "0", "no", "off", "enabled", "tru"]) expect(isLive({ CHALLENGE_LIVE: off }), String(off)).toBe(false);
  });
});

describe("codeLetters", () => {
  test("covers AC-1: the first word of the name, accents removed, only A to Z, in capitals", () => {
    expect(codeLetters("Ananya Rao")).toBe("ANA");
    expect(codeLetters("  asha  rao ")).toBe("ASH");
    expect(codeLetters("Éloïse")).toBe("ELO");
    expect(codeLetters("Zoë")).toBe("ZOE");
    expect(codeLetters("O'Brien")).toBe("OBR"); // the apostrophe is dropped, the letters after it kept
  });

  test("covers AC-1: a short name is padded with X", () => {
    expect(codeLetters("Al")).toBe("ALX");
    expect(codeLetters("Jo Smith")).toBe("JOX");
    expect(codeLetters("A")).toBe("AXX");
  });

  test("covers AC-1: a name with no Latin letters, or an empty name, gives DHI", () => {
    expect(codeLetters("प्रिया")).toBe("DHI");
    expect(codeLetters("李雷")).toBe("DHI");
    expect(codeLetters("   ")).toBe("DHI");
    expect(codeLetters("1234")).toBe("DHI");
  });

  test("covers AC-1: letters on the blocklist give DHI", () => {
    expect(codeLetters("Assam")).toBe("DHI");
    expect(codeLetters("Sexton")).toBe("DHI");
    expect(codeLetters("Titus")).toBe("DHI");
  });

  test("covers AC-1: the letters always fit the shared pattern", () => {
    for (const name of ["Ananya", "Al", "प्रिया", "Éloïse", "Assam", ""]) expect(codeLetters(name) + "AAAA").toMatch(CODE_RE);
  });
});

describe("randomChars", () => {
  test("covers AC-1: every character comes from the allowed set and the length is right", () => {
    for (let i = 0; i < 300; i++) {
      const s = randomChars(4);
      expect(s).toHaveLength(4);
      for (const ch of s) expect(CODE_CHARS).toContain(ch);
    }
  });

  test("covers AC-1: the set has no O, 0, I or 1, and a whole code matches CODE_RE", () => {
    expect(CODE_CHARS).toHaveLength(32);
    expect(CODE_CHARS).not.toMatch(/[O0I1]/);
    for (let i = 0; i < 300; i++) expect(codeLetters("Asha") + randomChars(4)).toMatch(CODE_RE);
  });

  test("covers AC-1: no character is likelier than another (every byte value maps to its character exactly 8 times)", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const counts = new Map<string, number>();
    const s = randomChars(256, () => all);
    // 256 bytes feed 256 characters here; the first pass is the whole table
    for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect([...counts.keys()].sort().join("")).toBe([...CODE_CHARS].sort().join(""));
    for (const n of counts.values()) expect(n).toBe(8);
  });
});

describe("decideReferral", () => {
  const T = ENDS_AT_MS;
  const steps = (over: Partial<StepTimes> = {}): StepTimes => ({ source: "fresh", completedAt: T - 3000, reportSeenAt: T - 2000, genuineAt: T - 1000, ...over });

  test("covers AC-5: all three steps on a fresh check, by the deadline, make it valid, with the latest time as validAt", () => {
    expect(decideReferral(steps(), T - 500)).toEqual({ kind: "valid", validAt: T - 1000 });
    expect(decideReferral(steps({ completedAt: T - 100, reportSeenAt: T - 2000, genuineAt: T - 3000 }), T - 50)).toEqual({ kind: "valid", validAt: T - 100 });
  });

  test("covers AC-5: a missing step leaves it pending before the deadline", () => {
    expect(decideReferral(steps({ genuineAt: null }), T - 500)).toEqual({ kind: "pending" });
    expect(decideReferral(steps({ reportSeenAt: null, genuineAt: null }), T - 500)).toEqual({ kind: "pending" });
    expect(decideReferral(steps({ completedAt: null, reportSeenAt: null, genuineAt: null }), T - 500)).toEqual({ kind: "pending" });
  });

  test("covers AC-5: a note that is not genuine has no genuineAt, so it stays pending", () => {
    expect(decideReferral(steps({ genuineAt: null }), T - 1)).toEqual({ kind: "pending" });
  });

  test("covers AC-6: a step after the deadline rejects it, whenever the job runs", () => {
    expect(decideReferral(steps({ genuineAt: T + 1 }), T + 60_000)).toEqual({ kind: "rejected", reason: "deadline" });
    expect(decideReferral(steps({ completedAt: T + 5000 }), T + 60_000)).toEqual({ kind: "rejected", reason: "deadline" });
  });

  test("covers AC-6: a step still missing once the deadline has passed rejects it", () => {
    expect(decideReferral(steps({ genuineAt: null }), T + 1)).toEqual({ kind: "rejected", reason: "deadline" });
    expect(decideReferral(steps({ source: null, completedAt: null, reportSeenAt: null, genuineAt: null }), T + 1)).toEqual({ kind: "rejected", reason: "deadline" });
  });

  test("covers AC-6: all steps by the deadline still count when the job only runs after it (decided as of the deadline)", () => {
    expect(decideReferral(steps(), T + 3_600_000)).toEqual({ kind: "valid", validAt: T - 1000 });
  });

  test("covers AC-6: a step at exactly the deadline is on time; one millisecond later is late", () => {
    expect(decideReferral(steps({ genuineAt: T }), T)).toEqual({ kind: "valid", validAt: T });
    expect(decideReferral(steps({ genuineAt: T + 1 }), T)).toEqual({ kind: "rejected", reason: "deadline" });
  });

  test("covers AC-5, AC-6: an imported check never counts, even with every step, and ends rejected after the deadline", () => {
    expect(decideReferral(steps({ source: "imported" }), T - 500)).toEqual({ kind: "pending" });
    expect(decideReferral(steps({ source: "imported" }), T + 500)).toEqual({ kind: "rejected", reason: "deadline" });
  });
});
