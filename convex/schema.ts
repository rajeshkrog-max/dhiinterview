// The database tables: students, consent, checks and answers (spec 0002), leads and feedback (spec 0003), the
// queue that copies them to the team's Google Sheet (spec 0004) and the saved results (spec 0005).
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

export const styleKeyValidator = v.union(v.literal("v"), v.literal("p"), v.literal("k"));
export const confidenceValidator = v.union(v.literal("clear"), v.literal("leaning"), v.literal("blended"));

// What the public leaderboard shows for one student (spec 0018, AC-2). Built only by `rowFor` in challengeBoard.ts.
export const boardRowValidator = v.object({
  rank: v.number(),
  displayName: v.string(), // first name and last initial, or "Anonymous <Style>"
  cls: v.optional(v.string()), // omitted when the name is hidden
  style: v.string(), // Builder, Achiever or Explorer
  valid: v.number(),
  avatar: v.optional(v.string()),
});

export default defineSchema({
  // One row per Google account. Personal data of minors: never returned by a public function except through `me`.
  students: defineTable({
    authUserId: v.string(), // the Better Auth user id
    email: v.string(), // lowercase copy of the Google email
    name: v.string(),
    age: v.number(),
    class: classValidator,
    referralCodeEntered: v.optional(v.string()),
    pictureNoticeDeclinedAt: v.optional(v.number()), // when the student tapped Not now on the picture notice (spec 0011); asked again after 14 days
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
    kind: v.union(v.literal("landing"), v.literal("lead"), v.literal("share"), v.literal("challenge")),
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

  // The scored result of a finished check (spec 0005). One per check, written once at Finish and never edited or
  // deleted by any function. `detail` is made by the server from fixed code (never from user input) and holds no flags.
  results: defineTable({
    checkId: v.id("checks"),
    studentId: v.id("students"),
    engineVersion: v.number(), // DhiScore.ENGINE_VERSION when it was scored
    scoredAt: v.number(),
    dhiStart: v.number(), // 0 to 100
    styleKey: styleKeyValidator,
    confidence: confidenceValidator,
    detail: v.any(), // areas, state, style percents, styleGap, top, bottom, lowest, indices, subject
  })
    .index("by_checkId", ["checkId"])
    .index("by_studentId", ["studentId"]), // by_studentId is for erasing a student's data (scope row 15)

  // The sensitive flags of a result, kept apart so a normal read of `results` can never hand one out (spec 0005).
  // One per result, never edited. Only the owner's `results.mine` and `results.ensure` return them.
  resultFlags: defineTable({
    resultId: v.id("results"),
    studentId: v.id("students"),
    keepsFeelingsInside: v.boolean(),
    lowCareerClarity: v.boolean(),
    heavyExpectations: v.boolean(),
    selfDoubt: v.boolean(),
    sleepStrain: v.boolean(),
    lowMood: v.boolean(),
    lowConsistency: v.boolean(),
  })
    .index("by_resultId", ["resultId"])
    .index("by_studentId", ["studentId"]), // for erasing a student's data (scope row 15)

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
    genuineAt: v.optional(v.number()), // when the note became genuine (spec 0016): set at save for a genuine note; read by the challenge job
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

  // The saved PDF copy of a student's report (spec 0006). One row per check, made by the server only (Cloudflare Browser
  // Run draws our own render page); nothing is ever uploaded from a browser. `storageId` is never given to a browser:
  // the owner downloads through GET /api/files/report. `lastError` is a short code, never student data.
  reportFiles: defineTable({
    studentId: v.id("students"),
    checkId: v.id("checks"),
    resultId: v.id("results"),
    state: v.union(v.literal("queued"), v.literal("making"), v.literal("ready"), v.literal("failed")), // the latest job
    wantedVersion: v.number(),
    storageId: v.optional(v.id("_storage")), // the copy held (can exist while a newer one is made)
    size: v.optional(v.number()),
    sha256: v.optional(v.string()),
    reportVersion: v.optional(v.number()), // the version of the held copy
    attempts: v.number(), // counted tries in this round
    nextAttemptAt: v.optional(v.number()),
    leaseUntil: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    readyAt: v.optional(v.number()),
    replacedAt: v.optional(v.number()),
  })
    .index("by_checkId", ["checkId"])
    .index("by_studentId", ["studentId"]) // for erasing a student's data (scope row 15)
    .index("by_storageId", ["storageId"])
    .index("by_state_and_nextAttemptAt", ["state", "nextAttemptAt"])
    .index("by_readyAt", ["readyAt"]), // the team list, newest copy first (spec 0008)

  // One row for every PDF the team route served (spec 0008). Only ever added to: no app code edits or deletes a row, and
  // only the erasure of a student (scope row 15) may delete them. Ids, a fingerprint and a team email only; no student data.
  reportViews: defineTable({
    studentId: v.id("students"), // whose report was opened
    reportFileId: v.id("reportFiles"),
    sha256: v.string(), // the fingerprint of the exact file that was served
    reportVersion: v.number(),
    teamEmail: v.string(), // lowercase, from the signed in account
    viewedAt: v.number(),
  })
    .index("by_studentId", ["studentId"])
    .index("by_teamEmail_and_viewedAt", ["teamEmail", "viewedAt"]),

  // The student's Google profile picture, copied once into our own storage (spec 0011). One row per student, patched in place.
  // `sourceUrl`, `storageId` and `etag` are never given to a browser: a browser gets only `/api/avatar/<key>`. `key` is random and
  // made again whenever the image changes, so an old address stops working. `lastError` is a short code, never a URL or a name.
  avatars: defineTable({
    studentId: v.id("students"),
    key: v.string(), // 22 chars, base64url
    storageId: v.optional(v.id("_storage")), // absent after a removal, or when Google has no photo
    contentType: v.optional(v.string()), // image/jpeg, image/png or image/webp, taken from the file's own first bytes
    size: v.optional(v.number()),
    sha256: v.optional(v.string()), // tells a changed image from the same one
    sourceUrl: v.string(), // the Google address last used (host checked)
    etag: v.optional(v.string()),
    checkedAt: v.number(), // the last time it was compared with Google (0 until the first fetch lands)
    updatedAt: v.number(), // when the image last changed
    removedAt: v.optional(v.number()), // set by the student's Remove
    blockedAt: v.optional(v.number()), // set by the team; cleared only by the team
    leaseUntil: v.optional(v.number()), // one fetch at a time for a student
    leaseToken: v.optional(v.string()), // checked when the fetch lands
    lastError: v.optional(v.string()),
  })
    .index("by_studentId", ["studentId"])
    .index("by_key", ["key"]),

  // The private link to a student's report (spec 0010). One row per student, patched in place; the link code is made from `_id` and
  // `generation` and signed with SHARE_LINK_SECRET, so nothing secret is stored here. A new link is a new generation, and the old
  // code stops working. Deleting the row ends the link at once (the erase request, scope row 15, must delete it).
  reportShares: defineTable({
    studentId: v.id("students"),
    checkId: v.id("checks"),
    generation: v.number(), // starts at 1; +1 each time a new link is made
    consentId: v.optional(v.id("consents")), // the share consent this generation was made under; set from M2 on (spec 0010 says required, see shares.ts)
    createdAt: v.number(), // when this generation started
    expiresAt: v.number(), // min(last Share tap + 90 days, createdAt + 365 days)
    offAt: v.optional(v.number()), // set by Stop sharing or by the team
  }).index("by_studentId", ["studentId"]), // at most one row per student; also for erasing a student's data (scope row 15)

  // A student who joined the Founding Circle Challenge (spec 0015, children 0016 and 0017). One row per student; a leave deletes it (M2) and
  // the `challenge` consent row stays. `code` is the referral code. `validCount` and `lastValidAt` are written only by the job and the team
  // commands, always through `recount` in challengeCore.ts. `rank`, `toNext` and `nextRank` are written by the job (spec 0018, M3).
  challengeEntries: defineTable({
    studentId: v.id("students"),
    code: v.string(), // 7 chars, CODE_RE
    joinedAt: v.number(),
    consentId: v.id("consents"), // the `challenge` consent row made at join
    hideName: v.boolean(),
    validCount: v.number(),
    lastValidAt: v.optional(v.number()),
    rank: v.optional(v.number()),
    toNext: v.optional(v.number()),
    nextRank: v.optional(v.number()),
  })
    .index("by_studentId", ["studentId"])
    .index("by_code", ["code"])
    .index("by_validCount", ["validCount"]) // the job ranks every entry above 0 (spec 0018); spec 0022's Challenge tab reads it too
    .index("by_rank", ["rank"]), // entries that hold a rank: the job clears stale ones, and a removal after the freeze moves those below up

  // The public leaderboard (spec 0018). One row, written only by the 5 minute job (and the one row removal after the freeze). A row holds
  // exactly these keys and no id, email, phone, age, flag or last name; `convex/challenge.test.ts` scans them. `avatar` is a same origin
  // picture path, only while LEADERBOARD_PICTURES_ENABLED is on and the student did not hide their name.
  leaderboardSnapshots: defineTable({
    rows: v.array(boardRowValidator),
    computedAt: v.number(),
    frozen: v.boolean(), // true after the final run at the deadline; later runs change nothing
  }),

  // One row per friend who signed up with a referrer's code (spec 0016). Made by `students.createProfile`; settled by the 5 minute job
  // from the friend's own step times (`checks.completedAt`, `checks.reportSeenAt`, `feedback.genuineAt`). Never written by a browser call.
  referrals: defineTable({
    referrerId: v.id("students"),
    friendId: v.id("students"),
    code: v.string(),
    usedAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("valid"), v.literal("rejected")),
    validAt: v.optional(v.number()), // the latest of the three step times, when the referral became valid
    rejectReason: v.optional(v.union(v.literal("deadline"), v.literal("review"))),
    reviewNote: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
  })
    .index("by_friendId", ["friendId"]) // at most one referral per friend, kept by createProfile looking here first
    .index("by_referrerId_and_status", ["referrerId", "status"])
    .index("by_status", ["status"]),

  // One row: the one at a time lease of the copy job, and the numbers the Sync status tab shows.
  sheetStatus: defineTable({
    lastRunAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    leaseUntil: v.optional(v.number()),
    pruneNote: v.optional(v.string()), // one short line about the last prune: counts only, never a code or a name
  }),
});
