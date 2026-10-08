// leads.submit and the lead fields of students.me (spec 0003). Each test names the criterion it covers.
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { CONSENT_TEXTS, CONSENT_VERSION, consentHash } from "./consentText";
import { finishedStudent, goodConsent, goodLeadConsent, makeBackend, profileInput, signInAs } from "../tests/convexTestUtils";

type Backend = ReturnType<typeof makeBackend>;

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return data?.code ?? `error:${String((e as Error).message).slice(0, 60)}`;
  }
};
const input = async (over: Record<string, unknown> = {}) => ({
  phone: "9876543210",
  wantsCommunity: true,
  guardianPresent: false,
  consent: await goodLeadConsent(),
  ...over,
});
const counts = (t: Backend) =>
  t.run(async (ctx) => ({
    leads: (await ctx.db.query("leads").collect()).length,
    leadConsents: (await ctx.db.query("consents").collect()).filter((c) => c.kind === "lead").length,
  }));

describe("leads.submit", () => {
  test("covers AC-1, AC-5: a finished check with a valid number saves one lead and one lead consent record", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    expect(await s.as.mutation(api.leads.submit, await input())).toEqual({ ok: true, alreadySaved: false });
    expect(await counts(t)).toEqual({ leads: 1, leadConsents: 1 });
    const row = await t.run(async (ctx) => {
      const lead = (await ctx.db.query("leads").collect())[0];
      return { lead, consent: await ctx.db.get(lead.consentId), text: await ctx.db.query("consentTexts").withIndex("by_version", (q) => q.eq("version", "lead-v1")).unique() };
    });
    expect(row.lead.whatsappStatus).toBe("new");
    expect(typeof row.lead.whatsappOptInAt).toBe("number");
    expect(row.consent?.kind).toBe("lead");
    expect(row.consent?.textVersion).toBe("lead-v1");
    expect(row.text?.hash).toBe((await goodLeadConsent()).hash);
  });

  test("covers AC-5: unticked WhatsApp stores neither the opt in time nor a status", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    await s.as.mutation(api.leads.submit, await input({ wantsCommunity: false }));
    const lead = await t.run(async (ctx) => (await ctx.db.query("leads").collect())[0]);
    expect(lead.wantsCommunity).toBe(false);
    expect(lead.whatsappOptInAt).toBeUndefined();
    expect(lead.whatsappStatus).toBeUndefined();
  });

  test("covers AC-2: a bad number, an unknown or swapped consent, an unfinished check and a minor with no guardian write nothing", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    for (const phone of ["987654321", "5876543210", "98765432100", "98765 43210", "+919876543210", ""]) {
      expect(await s.as.mutation(api.leads.submit, await input({ phone }))).toEqual({ ok: false, code: "invalid_input" });
    }
    const wrongHash = { version: "lead-v1", hash: "0".repeat(64) };
    const landingAsLead = { version: CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[CONSENT_VERSION]) };
    const unknown = { version: "lead-v9", hash: "0".repeat(64) };
    for (const consent of [wrongHash, landingAsLead, unknown]) {
      expect(await s.as.mutation(api.leads.submit, await input({ consent }))).toEqual({ ok: false, code: "consent_text_changed" });
    }
    expect(await counts(t)).toEqual({ leads: 0, leadConsents: 0 });

    const open = await signInAs(t);
    await open.as.mutation(api.students.createProfile, await profileInput());
    expect(await open.as.mutation(api.leads.submit, await input())).toEqual({ ok: false, code: "not_completed" });

    const minor = await finishedStudent(t, { age: 15, guardianPresent: true });
    expect(await minor.as.mutation(api.leads.submit, await input({ guardianPresent: false }))).toEqual({ ok: false, code: "guardian_required" });
    expect(await counts(t)).toEqual({ leads: 0, leadConsents: 0 });
    expect(await minor.as.mutation(api.leads.submit, await input({ guardianPresent: true }))).toEqual({ ok: true, alreadySaved: false });
    const consent = await t.run(async (ctx) => (await ctx.db.query("consents").collect()).find((c) => c.kind === "lead"));
    expect(consent?.guardianPresent).toBe(true);
    expect(consent?.ageAtConsent).toBe(15);
  });

  test("covers AC-2: a visitor with no session, and a signed in account with no profile, cannot call it", async () => {
    const t = makeBackend();
    expect(await code(t.mutation(api.leads.submit, await input()))).toBe("not_signed_in");
    const bare = await signInAs(t);
    expect(await code(bare.as.mutation(api.leads.submit, await input()))).toBe("no_profile");
  });

  test("covers AC-3: a second submit with another number changes nothing and says it was already saved", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    await s.as.mutation(api.leads.submit, await input());
    expect(await s.as.mutation(api.leads.submit, await input({ phone: "8765432109", wantsCommunity: false }))).toEqual({ ok: true, alreadySaved: true });
    expect(await counts(t)).toEqual({ leads: 1, leadConsents: 1 });
    const lead = await t.run(async (ctx) => (await ctx.db.query("leads").collect())[0]);
    expect(lead.phone).toBe("9876543210");
  });

  test("covers AC-3: two submits at once leave one lead and one consent record", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    const body = await input();
    const results = await Promise.all([s.as.mutation(api.leads.submit, body), s.as.mutation(api.leads.submit, body)]);
    expect(results.filter((r) => r.ok && !r.alreadySaved)).toHaveLength(1);
    expect(await counts(t)).toEqual({ leads: 1, leadConsents: 1 });
  });

  test("covers AC-4: the same number on two students is allowed, and the later lead is marked", async () => {
    const t = makeBackend();
    const a = await finishedStudent(t);
    const b = await finishedStudent(t);
    expect((await a.as.mutation(api.leads.submit, await input())).ok).toBe(true);
    expect((await b.as.mutation(api.leads.submit, await input())).ok).toBe(true);
    const leads = await t.run(async (ctx) => await ctx.db.query("leads").order("asc").collect());
    expect(leads.map((l) => l.phoneSeenBefore)).toEqual([false, true]);
  });

  test("covers AC-11: the 11th call in an hour is refused, and refused attempts used tokens", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    for (let i = 0; i < 10; i++) {
      expect(await s.as.mutation(api.leads.submit, await input({ phone: "123" }))).toEqual({ ok: false, code: "invalid_input" });
    }
    expect(await s.as.mutation(api.leads.submit, await input())).toEqual({ ok: false, code: "rate_limited" });
    expect(await counts(t)).toEqual({ leads: 0, leadConsents: 0 });
  });
});

describe("students.me and the landing consent", () => {
  test("covers AC-12: me says only whether and when a lead is saved, and never the number", async () => {
    const t = makeBackend();
    const s = await finishedStudent(t);
    const before = await s.as.query(api.students.me, {});
    expect(before.state === "ready" && before.check.leadSavedAt).toBeNull();
    await s.as.mutation(api.leads.submit, await input());
    const after = await s.as.query(api.students.me, {});
    expect(after.state === "ready" && typeof after.check.leadSavedAt).toBe("number");
    expect(JSON.stringify(after)).not.toContain("9876543210");
  });

  test("covers AC-14: the phone text cannot create a profile", async () => {
    const t = makeBackend();
    const s = await signInAs(t);
    expect(await code(s.as.mutation(api.students.createProfile, await profileInput({ consent: await goodLeadConsent() })))).toBe("consent_text_changed");
    expect(await code(s.as.mutation(api.students.createProfile, await profileInput({ consent: await goodConsent() })))).toBe("ok");
  });
});
