// The pure rules of the private report link (spec 0010): the signed code and the end date. No database.
import { describe, expect, test } from "vitest";
import { SHARE_DAYS, SHARE_MAX_DAYS, expiryFor, isWriteConflict, makeShareCode, verifyShareCode } from "./shareCore";

const SECRET = "a-long-random-test-secret";
const ID = "kh7c8m2n9p4q5r6s7t8v9w0x1y2z3a4b";
const DAY = 24 * 60 * 60 * 1000;

describe("the link code", () => {
  test("covers AC-7: a code made for a row and generation verifies, and gives back exactly that row and generation", async () => {
    const code = await makeShareCode(SECRET, ID, 3);
    expect(code.split(".")).toHaveLength(3);
    expect(code.split(".")[2]).toHaveLength(22); // 16 bytes in base64url
    expect(await verifyShareCode(SECRET, code)).toEqual({ shareId: ID, generation: 3 });
  });

  test("covers AC-7: a new generation is a different code, and the old code no longer matches its own generation", async () => {
    const one = await makeShareCode(SECRET, ID, 1);
    const two = await makeShareCode(SECRET, ID, 2);
    expect(one).not.toBe(two);
    // moving the generation inside an old code does not make a good code
    const [id, , sig] = one.split(".");
    expect(await verifyShareCode(SECRET, `${id}.2.${sig}`)).toBeNull();
  });

  test("covers AC-7: an altered code, another id, another secret, an unset secret and nonsense all verify as null", async () => {
    const code = await makeShareCode(SECRET, ID, 1);
    const [id, gen, sig] = code.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    const bad = [
      `${id}.${gen}.${flipped}`,
      `${id.slice(0, -1)}x.${gen}.${sig}`,
      `${id}.${gen}`,
      `${id}.${gen}.${sig}.extra`,
      `${id}.0.${sig}`,
      `${id}.01.${sig}`,
      `${id}.${gen}.${sig.slice(0, 20)}`,
      `${id}.${gen}.${"A".repeat(300)}`,
      `${id}.${gen}.${sig.slice(0, 21)}!`,
      "",
      ".",
      "..",
      "a.b.c",
    ];
    for (const b of bad) expect(await verifyShareCode(SECRET, b), b).toBeNull();
    expect(await verifyShareCode("another-secret", code)).toBeNull();
    expect(await verifyShareCode(undefined, code)).toBeNull();
    expect(await verifyShareCode("", code)).toBeNull();
    expect(await verifyShareCode(SECRET, null)).toBeNull();
    expect(await verifyShareCode(SECRET, undefined)).toBeNull();
  });

  test("covers AC-7: the code holds no secret, so it can be made again for the same row and generation", async () => {
    expect(await makeShareCode(SECRET, ID, 4)).toBe(await makeShareCode(SECRET, ID, 4));
  });
});

describe("how long a link lives (AC-6)", () => {
  test("a Share tap moves the end to 90 days from that tap", () => {
    const now = 1_000 * DAY;
    expect(expiryFor(now, now)).toBe(now + SHARE_DAYS * DAY);
    expect(expiryFor(now + 30 * DAY, now)).toBe(now + 120 * DAY);
  });

  test("it never goes past 365 days from when the link was made", () => {
    const created = 1_000 * DAY;
    expect(expiryFor(created + 300 * DAY, created)).toBe(created + SHARE_MAX_DAYS * DAY); // 300 + 90 would be 390
    expect(expiryFor(created + 364 * DAY, created)).toBe(created + 365 * DAY);
  });
});

describe("a lost write race (AC-11)", () => {
  const convexMessage =
    'Uncaught Error: Documents read from or written to the "rateLimits" table changed while this mutation was being run and on every subsequent retry. Another call to this mutation changed the document with ID "x". See https://docs.convex.dev/error#1';

  test("covers AC-11: the error Convex throws when a mutation loses its race on every retry is recognised, as an Error or as text", () => {
    expect(isWriteConflict(new Error(convexMessage))).toBe(true);
    expect(isWriteConflict(convexMessage)).toBe(true);
    expect(isWriteConflict(new Error("Documents changed while this mutation was being run"))).toBe(true);
  });

  test("covers AC-11: every other error, and anything that is not an error, stays a real fault", () => {
    for (const other of [new Error("Server Error"), new Error("rateLimits table is missing"), new Error("See https://docs.convex.dev/error#10"), "boom", null, undefined, 42, {}]) {
      expect(isWriteConflict(other)).toBe(false);
    }
  });
});
