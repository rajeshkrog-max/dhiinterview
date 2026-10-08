// me and createProfile (spec 0002). Each test names the acceptance criterion it covers.
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { makeBackend, profileInput, signInAs } from "../tests/convexTestUtils";

// "ok", or the defined error code (error.data.code), or "error:<start of the message>" for anything else.
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `error:${String((e as Error).message).slice(0, 60)}`;
  }
};
const counts = (t: ReturnType<typeof makeBackend>) =>
  t.run(async (ctx) => ({
    students: (await ctx.db.query("students").collect()).length,
    consents: (await ctx.db.query("consents").collect()).length,
    checks: (await ctx.db.query("checks").collect()).length,
    texts: (await ctx.db.query("consentTexts").collect()).length,
  }));

describe("students.me", () => {
  test("covers AC-9: a visitor with no session is signedOut and sees nothing", async () => {
    const t = makeBackend();
    expect(await t.query(api.students.me, {})).toEqual({ state: "signedOut" });
  });

  test("covers AC-2: a signed in account with no form is needsProfile with the Google name cut to 60, and no student row exists", async () => {
    const t = makeBackend();
    const { as } = await signInAs(t, { name: "  " + "Long ".repeat(20) + " " });
    const me = await as.query(api.students.me, {});
    expect(me.state).toBe("needsProfile");
    if (me.state === "needsProfile") {
      expect(me.googleName.length).toBeLessThanOrEqual(60);
      expect(me.googleName).not.toMatch(/^\s|\s\s/); // trimmed and spaces collapsed; a cut may leave one trailing space, the form trims it
    }
    expect((await counts(t)).students).toBe(0);
  });

  test("covers AC-9 and AC-16: ready returns name, age, class and the check, and never the email", async () => {
    const t = makeBackend();
    const { as, email } = await signInAs(t);
    await as.mutation(api.students.createProfile, await profileInput());
    const me = await as.query(api.students.me, {});
    expect(me.state).toBe("ready");
    expect(JSON.stringify(me)).not.toContain(email);
    expect(JSON.stringify(me)).not.toContain("@");
    if (me.state === "ready") {
      expect(me.student).toEqual({ name: "Asha Rao", age: 20, class: "College" });
      expect(me.check.answers).toEqual({});
      expect(me.check.completedAt).toBeNull();
      expect(me.check.reportSeenAt).toBeNull();
      expect(me.check.seed).toMatch(/\S{8,}/);
    }
  });
});

describe("students.createProfile", () => {
  test("covers AC-3: creates exactly one student, one consent record, one check and stores the consent text", async () => {
    const t = makeBackend();
    const { as, email } = await signInAs(t, { email: "Mixed.Case@Example.com" });
    const { studentId } = await as.mutation(api.students.createProfile, await profileInput({ name: "  Asha    Rao  " }));
    expect(await counts(t)).toEqual({ students: 1, consents: 1, checks: 1, texts: 1 });
    await t.run(async (ctx) => {
      const s = await ctx.db.get("students", studentId);
      expect(s?.name).toBe("Asha Rao");
      expect(s?.email).toBe(email.toLowerCase());
      const consent = (await ctx.db.query("consents").collect())[0];
      expect(consent).toMatchObject({ studentId, kind: "landing", textVersion: "v1", ageAtConsent: 20, guardianPresent: false });
      expect(consent.acceptedAt).toBeLessThanOrEqual(Date.now());
    });
  });

  test("covers AC-4: signing in again, or two devices at once, never makes a second student or check", async () => {
    const t = makeBackend();
    const { as } = await signInAs(t);
    const input = await profileInput();
    const [a, b] = await Promise.all([
      as.mutation(api.students.createProfile, input),
      as.mutation(api.students.createProfile, { ...input, name: "Other Tab" }),
    ]);
    expect(a.studentId).toBe(b.studentId);
    const again = await as.mutation(api.students.createProfile, { ...input, age: 11, name: "Changed" });
    expect(again.studentId).toBe(a.studentId);
    expect(await counts(t)).toEqual({ students: 1, consents: 1, checks: 1, texts: 1 });
    const me = await as.query(api.students.me, {});
    if (me.state === "ready") expect(me.student.name).toBe("Asha Rao"); // the later form values are ignored
  });

  test("covers AC-6: an age outside 10 to 25, or not a whole number, is refused and nothing is written", async () => {
    const t = makeBackend();
    const { as } = await signInAs(t);
    for (const age of [9, 26, 15.5, -1]) {
      expect(await code(as.mutation(api.students.createProfile, await profileInput({ age, guardianPresent: true })))).toBe("invalid_input");
    }
    expect(await counts(t)).toEqual({ students: 0, consents: 0, checks: 0, texts: 0 });
  });

  test("covers AC-6: the age limits 10 and 25 themselves are accepted", async () => {
    const t = makeBackend();
    for (const age of [10, 25]) {
      const { as } = await signInAs(t);
      expect(await code(as.mutation(api.students.createProfile, await profileInput({ age, guardianPresent: true })))).toBe("ok");
    }
  });

  test("covers AC-6: an unknown class is refused", async () => {
    const t = makeBackend();
    const { as } = await signInAs(t);
    expect(await code(as.mutation(api.students.createProfile, await profileInput({ class: "Class 7" })))).toMatch(/^error:/);
    expect((await counts(t)).students).toBe(0);
  });

  test("covers AC-6 and AC-3: under 18 needs the guardian tick, 18 does not, and the tick is recorded", async () => {
    const t = makeBackend();
    const minor = await signInAs(t);
    expect(await code(minor.as.mutation(api.students.createProfile, await profileInput({ age: 17 })))).toBe("guardian_required");
    expect((await counts(t)).students).toBe(0);
    expect(await code(minor.as.mutation(api.students.createProfile, await profileInput({ age: 17, guardianPresent: true })))).toBe("ok");
    const adult = await signInAs(t);
    expect(await code(adult.as.mutation(api.students.createProfile, await profileInput({ age: 18 })))).toBe("ok");
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("consents").collect();
      expect(rows.map((r) => `${r.ageAtConsent}:${r.guardianPresent}`).sort()).toEqual(["17:true", "18:false"]);
    });
  });

  test("covers AC-6: a consent version or fingerprint the server does not know is refused", async () => {
    const t = makeBackend();
    const { as } = await signInAs(t);
    const good = await profileInput();
    expect(await code(as.mutation(api.students.createProfile, { ...good, consent: { ...good.consent, hash: "abc" } }))).toBe("consent_text_changed");
    expect(await code(as.mutation(api.students.createProfile, { ...good, consent: { ...good.consent, version: "v99" } }))).toBe("consent_text_changed");
    expect((await counts(t)).students).toBe(0);
  });

  test("covers AC-6: an empty name, a blank name and a name over 60 characters are refused", async () => {
    const t = makeBackend();
    const { as } = await signInAs(t);
    for (const name of ["", "   ", "x".repeat(61)]) {
      expect(await code(as.mutation(api.students.createProfile, await profileInput({ name })))).toBe("invalid_input");
    }
    expect(await code(as.mutation(api.students.createProfile, await profileInput({ name: "x".repeat(60) })))).toBe("ok");
  });

  test("covers AC-4: the same Google email under another sign in account is an account_conflict, not a second student", async () => {
    const t = makeBackend();
    const first = await signInAs(t, { email: "same@example.com" });
    const second = await signInAs(t, { email: "SAME@example.com" });
    await first.as.mutation(api.students.createProfile, await profileInput());
    expect(await code(second.as.mutation(api.students.createProfile, await profileInput()))).toBe("account_conflict");
    expect((await counts(t)).students).toBe(1);
  });

  test("covers AC-3: an email Google has not verified is refused outside the test sign in", async () => {
    const t = makeBackend();
    const { as } = await signInAs(t, { emailVerified: false });
    expect(await code(as.mutation(api.students.createProfile, await profileInput()))).toBe("invalid_input");
  });

  test("covers AC-3: a referral code is kept in capitals when the format is right, and dropped (never an error) when it is not", async () => {
    const t = makeBackend();
    const good = await signInAs(t);
    const bad = await signInAs(t);
    await good.as.mutation(api.students.createProfile, await profileInput({ referralCode: " raj7k2q " }));
    expect(await code(bad.as.mutation(api.students.createProfile, await profileInput({ referralCode: "abc12345x" })))).toBe("ok");
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("students").collect();
      expect(rows.map((r) => r.referralCodeEntered ?? "none").sort()).toEqual(["RAJ7K2Q", "none"]);
    });
  });

  test("covers AC-6: the consent text of a version is stored once, with its fingerprint, even for many students", async () => {
    const t = makeBackend();
    for (let i = 0; i < 3; i++) {
      const { as } = await signInAs(t);
      await as.mutation(api.students.createProfile, await profileInput());
    }
    await t.run(async (ctx) => {
      const texts = await ctx.db.query("consentTexts").collect();
      expect(texts).toHaveLength(1);
      expect(texts[0].hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  test("covers AC-9: a visitor with no session cannot create a profile", async () => {
    const t = makeBackend();
    expect(await code(t.mutation(api.students.createProfile, await profileInput()))).toBe("not_signed_in");
  });
});
