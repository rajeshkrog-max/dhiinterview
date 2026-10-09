// The team link to the saved report: the database side (spec 0008). Named members of the DhiRise team (the `TEAM_EMAILS`
// setting) can list the students whose saved PDF copy is ready and open any of them. Rules:
//  - every function here is internal: only the two routes in teamHttp.ts call them, and each one runs the team check itself, on
//    every request, from the signed in session of that request (never from an input). Nothing is cached.
//  - the team functions take a student id (the reference code) as input. That is allowed only behind the team check;
//    student facing functions still never take one (convex/AGENTS.md).
//  - the list returns a name and a class and nothing else about a student: no phone, email, score or flag (AC-1)
//  - every PDF served adds one `reportViews` row, written after the stored file is confirmed to exist, and nothing else adds
//    one (AC-5). No code in this file edits or deletes a `reportViews` row.
// A refusal writes one console line with a reason and, for a team member, the team email. It never names a student, and the
// email of an account that is not on the list is not logged at all (it may be a student's).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { env, internalMutation, internalQuery } from "./_generated/server";
import { getSignedInUser, type Reader } from "./helpers";
import { rateLimiter } from "./limits";
import { classValidator } from "./schema";
import { LIST_PAGE, cleanCursor, cleanRef, mayEnterTeam } from "./teamCore";

type Gate = { ok: true; email: string } | { ok: false; code: "not_signed_in" | "not_team" };

// Who is calling, and may they use the team routes. The list is read from the setting on this very request.
async function teamGate(ctx: Reader): Promise<Gate> {
  const user = await getSignedInUser(ctx);
  if (!user) {
    console.log("team: refused not_signed_in");
    return { ok: false, code: "not_signed_in" };
  }
  if (!mayEnterTeam(user, env.TEAM_EMAILS, env.TEST_SIGNIN_ENABLED)) {
    console.log("team: refused not_team");
    return { ok: false, code: "not_team" };
  }
  return { ok: true, email: user.email };
}

const refusedValidator = v.object({ ok: v.literal(false), code: v.union(v.literal("not_signed_in"), v.literal("not_team")) });
const rowValidator = v.object({ studentId: v.id("students"), name: v.string(), class: classValidator, madeAt: v.number() });

// One list row for a report row that holds a file, or null (no file yet, or the student no longer exists).
async function listRow(ctx: Reader, file: Doc<"reportFiles">) {
  if (file.storageId === undefined || file.readyAt === undefined) return null;
  const student = await ctx.db.get("students", file.studentId);
  if (!student) return null;
  return { studentId: student._id, name: student.name, class: student.class, madeAt: file.readyAt };
}

// The students whose saved copy is ready, newest first, 50 at a time (AC-1). With `ref` it is the one student that code names,
// or nobody (AC-2): an empty, unknown or invalid code is just "no rows", never an error. A cursor that is not valid is
// `bad_request`. Browsing is not audited (only served PDFs are).
export const list = internalQuery({
  args: { cursor: v.optional(v.union(v.string(), v.null())), ref: v.optional(v.string()) },
  returns: v.union(
    refusedValidator,
    v.object({ ok: v.literal(false), code: v.literal("bad_request") }),
    v.object({ ok: v.literal(true), rows: v.array(rowValidator), next: v.union(v.string(), v.null()) }),
  ),
  handler: async (ctx, args) => {
    const gate = await teamGate(ctx);
    if (!gate.ok) return gate;

    if (args.ref !== undefined) {
      const ref = cleanRef(args.ref);
      const studentId = ref ? ctx.db.normalizeId("students", ref) : null;
      if (!studentId) return { ok: true as const, rows: [], next: null };
      const file = await ctx.db.query("reportFiles").withIndex("by_studentId", (q) => q.eq("studentId", studentId)).first();
      const row = file ? await listRow(ctx, file) : null;
      return { ok: true as const, rows: row ? [row] : [], next: null };
    }

    const cursor = cleanCursor(args.cursor);
    if (cursor === "bad") return { ok: false as const, code: "bad_request" as const };
    let page;
    try {
      page = await ctx.db
        .query("reportFiles")
        .withIndex("by_readyAt", (q) => q.gt("readyAt", 0))
        .order("desc")
        .paginate({ numItems: LIST_PAGE, cursor });
    } catch {
      return { ok: false as const, code: "bad_request" as const };
    }
    const rows = [];
    for (const file of page.page) {
      const row = await listRow(ctx, file);
      if (row) rows.push(row);
    }
    return { ok: true as const, rows, next: page.isDone ? null : page.continueCursor };
  },
});

// Opens one student's saved PDF for the team (AC-3, AC-5, AC-6, AC-7). In order: the team check, the student and their stored
// file (a missing or invalid code, an erased student and a student with no stored file are all `not_ready`), the stored file is
// confirmed to exist, the hourly allowance is used, and only then the `reportViews` row is written. A refusal of any kind
// changes nothing. It returns every expected refusal as a result (never throws), so the allowance count is never rolled back.
export const openFile = internalMutation({
  args: { ref: v.string() },
  returns: v.union(
    refusedValidator,
    v.object({ ok: v.literal(false), code: v.literal("not_ready") }),
    v.object({ ok: v.literal(false), code: v.literal("rate_limited"), retryAt: v.number() }),
    v.object({ ok: v.literal(true), storageId: v.id("_storage"), name: v.string() }),
  ),
  handler: async (ctx, args) => {
    const gate = await teamGate(ctx);
    if (!gate.ok) return gate;

    const notReady = () => {
      console.log(`team: ${gate.email} refused not_ready`);
      return { ok: false as const, code: "not_ready" as const };
    };
    const ref = cleanRef(args.ref);
    const studentId = ref ? ctx.db.normalizeId("students", ref) : null;
    if (!studentId) return notReady();
    const student = await ctx.db.get("students", studentId);
    const file = await ctx.db.query("reportFiles").withIndex("by_studentId", (q) => q.eq("studentId", studentId)).first();
    if (!student || !file || file.storageId === undefined || file.sha256 === undefined || file.reportVersion === undefined) return notReady();
    if (!(await ctx.db.system.get("_storage", file.storageId))) return notReady();

    const allowed = await rateLimiter.limit(ctx, "teamOpen", { key: gate.email });
    if (!allowed.ok) {
      console.log(`team: ${gate.email} refused rate_limited`);
      return { ok: false as const, code: "rate_limited" as const, retryAt: Date.now() + allowed.retryAfter };
    }

    await ctx.db.insert("reportViews", {
      studentId: student._id,
      reportFileId: file._id,
      sha256: file.sha256,
      reportVersion: file.reportVersion,
      teamEmail: gate.email,
      viewedAt: Date.now(),
    });
    return { ok: true as const, storageId: file.storageId, name: student.name };
  },
});
