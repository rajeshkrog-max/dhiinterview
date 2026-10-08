// Shared by every student facing function (spec 0002, security model). `requireStudent` is the one place the
// signed in student is found: it reads the identity from the session on the server. No function takes a
// student id, an email or an auth user id as input, so one student can never reach another's rows.
import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authComponent } from "./auth";

export const TOTAL_QUESTIONS = 18;
export const MIN_AGE = 10;
export const MAX_AGE = 25;
export const ADULT_AGE = 18;
export const MAX_NAME = 60;

// Errors the page can read: error.data.code. Never put personal data in a message.
export function fail(code: string): never {
  throw new ConvexError({ code });
}

export type Reader = QueryCtx | MutationCtx;

export type SignedInUser = { authUserId: string; email: string; name: string; emailVerified: boolean };

// The Better Auth user for this session, or null.
export async function getSignedInUser(ctx: Reader): Promise<SignedInUser | null> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) return null;
  return { authUserId: user._id, email: user.email.trim().toLowerCase(), name: user.name, emailVerified: user.emailVerified };
}

export async function requireSignedIn(ctx: Reader): Promise<SignedInUser> {
  const user = await getSignedInUser(ctx);
  if (!user) fail("not_signed_in");
  return user;
}

// Signed in and has finished the form: the student and their one check.
export async function requireStudent(ctx: Reader): Promise<{ student: Doc<"students">; check: Doc<"checks"> }> {
  const user = await requireSignedIn(ctx);
  const student = await ctx.db.query("students").withIndex("by_authUserId", (q) => q.eq("authUserId", user.authUserId)).unique();
  if (!student) fail("no_profile");
  const check = await ctx.db.query("checks").withIndex("by_studentId", (q) => q.eq("studentId", student._id)).unique();
  if (!check) fail("no_profile");
  return { student, check };
}

// "q7o3" for question 7 → true. The option must belong to the question it is sent for, and be written exactly
// `q<q>o<1 to 4>`: a padded id such as "q07o3" is refused, because the scoring and the report only know the exact ids.
export function optionBelongsTo(q: number, optionId: string): boolean {
  return validQuestion(q) && [1, 2, 3, 4].some((k) => optionId === `q${q}o${k}`);
}

export function validQuestion(q: number): boolean {
  return Number.isInteger(q) && q >= 1 && q <= TOTAL_QUESTIONS;
}

// Trim and collapse spaces. Empty or too long → null.
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= MAX_NAME ? name : null;
}

export function validAge(age: number): boolean {
  return Number.isInteger(age) && age >= MIN_AGE && age <= MAX_AGE;
}

// Every answer row of a check, in question order. At most 18 rows exist (one per question).
export async function answersOf(ctx: Reader, checkId: Doc<"checks">["_id"]): Promise<Doc<"answers">[]> {
  return await ctx.db.query("answers").withIndex("by_checkId_and_q", (q) => q.eq("checkId", checkId)).take(TOTAL_QUESTIONS + 1);
}
