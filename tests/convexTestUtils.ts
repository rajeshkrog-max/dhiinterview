/// <reference types="vite/client" />
// Helpers for the convex-test suites (convex/*.test.ts). Not application code. It lives outside convex/ on purpose:
// Convex bundles every other file in convex/ when it pushes, and import.meta is not allowed there.
// Builds an in memory backend with the Better Auth component registered, and signs fake students in
// the way a real session does (a user row, a session row, and an identity pointing at both).
import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { api, components } from "../convex/_generated/api";
import schema from "../convex/schema";
import { CONSENT_TEXTS, CONSENT_VERSION, LEAD_CONSENT_VERSION, consentHash } from "../convex/consentText";

const modules = import.meta.glob("../convex/**/*.ts");

export function makeBackend() {
  const t = convexTest(schema, modules);
  betterAuthTest.register(t, "betterAuth");
  rateLimiterTest.register(t, "rateLimiter");
  return t;
}
export type Backend = ReturnType<typeof makeBackend>;

type Created = { _id: string };

// Makes a Better Auth user and a live session for it. Returns a handle that calls functions as that student.
export async function signInAs(
  t: Backend,
  opts: { email?: string; name?: string; emailVerified?: boolean; createdAt?: number; sessionUpdatedAt?: number } = {},
) {
  const email = opts.email ?? `student${Math.random().toString(36).slice(2, 8)}@example.com`;
  const createdAt = opts.createdAt ?? Date.now();
  const { userId, sessionId } = await t.run(async (ctx) => {
    const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: { model: "user", data: { name: opts.name ?? "Test Student", email, emailVerified: opts.emailVerified ?? true, createdAt, updatedAt: createdAt } },
    })) as Created;
    const session = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: { userId: user._id, token: "tok" + user._id, expiresAt: Date.now() + 7 * 86400000, createdAt, updatedAt: opts.sessionUpdatedAt ?? createdAt },
      },
    })) as Created;
    return { userId: user._id, sessionId: session._id };
  });
  const as = t.withIdentity({ subject: userId, sessionId });
  return { as, userId, sessionId, email };
}

// A consent block the server accepts.
export async function goodConsent() {
  return { version: CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[CONSENT_VERSION]) };
}

// A phone step consent block the server accepts.
export async function goodLeadConsent() {
  return { version: LEAD_CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[LEAD_CONSENT_VERSION]) };
}

// A valid createProfile input, with any field overridden.
export async function profileInput(over: Record<string, unknown> = {}) {
  return { name: "Asha Rao", age: 20, class: "College" as const, guardianPresent: false, consent: await goodConsent(), ...over };
}

// The option id the page would send for question n (option k).
export const opt = (n: number, k = 1) => `q${n}o${k}`;

// A signed in student with a profile and a finished check (all 18 answers, complete). Set `age` and `class` through `over`.
export async function finishedStudent(t: Backend, over: Record<string, unknown> = {}) {
  const s = await signInAs(t);
  await s.as.mutation(api.students.createProfile, await profileInput(over));
  await s.as.mutation(api.checks.saveAnswers, {
    answers: Array.from({ length: 18 }, (_, i) => ({ q: i + 1, optionId: opt(i + 1, 2), answeredAt: Date.now() })),
  });
  await s.as.mutation(api.checks.complete, {});
  return s;
}
