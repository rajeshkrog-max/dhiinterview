// The database tables: students, consent, checks and answers (spec 0002), leads and feedback (spec 0003) and the
// queue that copies them to the team's Google Sheet (spec 0004).
// Every invariant below is checked in code inside the mutations (Convex has no database constraints), and
// uniqueness holds only because those mutations look rows up by index. Later slices add tables that point at
// `students` and `checks` by id, so nothing here changes. Nothing may be renamed or removed in the same release
// as the code that stops using it (spec 0001, deploys and environments).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const classValidator = v.union(
  v.literal("Class 8"),
  v.literal("Class 9"),
  v.literal("Class 10"),
  v.literal("Class 11"),
  v.literal("Class 12"),
  v.literal("College"),
);

export default defineSchema({
  // One row per Google account. Personal data of minors: never returned by a public function except through `me`.
  students: defineTable({
    authUserId: v.string(), // the Better Auth user id
    email: v.string(), // lowercase copy of the Google email
    name: v.string(),
    age: v.number(),
    class: classValidator,
    referralCodeEntered: v.optional(v.string()),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_email", ["email"]),

  // The exact consent text of each version. Added the first time a version is used, never edited.
  consentTexts: defineTable({
    version: v.string(),
    hash: v.string(),
    text: v.string(),
  }).index("by_version", ["version"]),

  // Only ever added to. The audit trail for what a student (and a guardian) agreed to.
  consents: defineTable({
    studentId: v.id("students"),
    kind: v.union(v.literal("landing"), v.literal("lead")),
    textVersion: v.string(),
    ageAtConsent: v.number(),
    guardianPresent: v.boolean(),
    acceptedAt: v.number(),
  }).index("by_studentId", ["studentId"]),

  // At most one per student in this spec. The start time is the row's _creationTime.
  checks: defineTable({
    studentId: v.id("students"),
    seed: v.string(), // made on the server, used for the per student option shuffle
    source: v.union(v.literal("fresh"), v.literal("imported")),
    completedAt: v.optional(v.number()),
    reportSeenAt: v.optional(v.number()),
  }).index("by_studentId", ["studentId"]),

  // One row per (checkId, q), changed in place until the check is complete.
  answers: defineTable({
    checkId: v.id("checks"),
    q: v.number(),
    optionId: v.string(),
    answeredAt: v.number(),
  }).index("by_checkId_and_q", ["checkId", "q"]),

  // What a student gave on the phone step (spec 0003). One per check, the first one kept. Never returned to a browser.
  leads: defineTable({
    studentId: v.id("students"),
    checkId: v.id("checks"),
    phone: v.string(), // 10 digits, first digit 6 to 9
    wantsCommunity: v.boolean(),
    whatsappOptInAt: v.optional(v.number()), // set only when wantsCommunity is true
    whatsappStatus: v.optional(v.union(v.literal("new"), v.literal("added"), v.literal("opted_out"))), // same rule; changed by hand
    phoneSeenBefore: v.boolean(),
    consentId: v.id("consents"),
  })
    .index("by_checkId", ["checkId"])
    .index("by_phone", ["phone"]),

  // The report feedback (spec 0003). One per check, the first one kept. Never returned to a browser.
  feedback: defineTable({
    studentId: v.id("students"),
    checkId: v.id("checks"),
    rating: v.number(), // 1 to 5
    text: v.string(),
    chars: v.number(),
    genuine: v.boolean(),
    canShare: v.boolean(),
  }).index("by_checkId", ["checkId"]),

  // The copy queue (spec 0004): one row per (kind, refId). `key` is the Sheet's reference code, stored so a delete
  // still works after the source row is gone. `lastError` is a short Google reason, never record content.
  sheetSync: defineTable({
    kind: v.union(v.literal("lead"), v.literal("feedback")),
    refId: v.string(),
    key: v.string(),
    op: v.union(v.literal("upsert"), v.literal("delete")),
    status: v.union(v.literal("pending"), v.literal("sending"), v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    rowHash: v.optional(v.string()), // fingerprint of the last row sent
  })
    .index("by_kind_and_refId", ["kind", "refId"])
    .index("by_status_and_nextAttemptAt", ["status", "nextAttemptAt"]),

  // One row: the one at a time lease of the copy job, and the numbers the Sync status tab shows.
  sheetStatus: defineTable({
    lastRunAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    pruneNote: v.optional(v.string()), // one short line about the last prune: counts only, never a code or a name
  }),
});
