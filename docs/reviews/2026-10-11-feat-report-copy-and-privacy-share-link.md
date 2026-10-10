# Review, feat/report-copy-and-privacy (share link work only), 2026-10-11

**Reviewed by**: opus (author on sonnet)
**Scope**: 52 files, branch vs ea5800c (commits 1774afc and 95808d9 plus the uncommitted test and scope edits; pnpm lock, the vendored QR file and the png skipped)
**Verdict**: Blocked

## Summary

This adds the private report link from spec 0010: a signed `/s/<code>` address, a public payload route, the notice with the under 18 tick, Stop sharing, the team switch, and the AC-11 fix for many readers at once. The server side is careful and well tested: the code is HMAC signed with a constant time compare, every dead link gets the same 404 and body, no public function takes an id, the payload builder is small and scanned by a test, and the race fix is sound. The headline problem is that the public page still shows two things that give away the sensitive flags, even though the flags object itself is zeroed: the mind state "Low" percentage (which is exactly how `lowMood` is computed) and the student's own answer quoted under "Next to grow" (which, for emotions, is the very option that sets `selfDoubt` or `lowMood`). Second, the only thing holding the feature back in production is a front end switch, while the server already accepts `shares.enable` from anyone signed in, so a child's report and picture can be made public before the legal check is done. Third, Stop sharing does not end access to the picture.

## Blockers

### 🔴 The public page reveals selfDoubt and lowMood through the mind state and the quoted answers, `convex/sharePayload.ts:31`
**Problem**: The payload strips only `flags` (it passes `NO_FLAGS`), but sends the rest of the result in full. Two parts of it carry the flags in plain sight:
1. `state.low`. In `public/dhiinterviews/js/engine/score.js:146` the rule is `lowMood: has("lowMood") || state.low >= 35`. The public page draws this number as a donut and a legend ("Low 40%") and may lead with it as the dominant state (`public/dhiinterviews/js/report-student.js:250` to `276`). So a stranger reads the lowMood flag straight off the page.
2. `bottom[].said` (and `top[].said`). Each holds the question text and the exact words of the option the student chose that pulled the area down most (`score.js:65` to `66`, `113` to `122`). The flagged options carry the lowest emotions values: "A fear that I am not good enough." (`selfDoubt`, `questions.js:191`, emotions −2), "A quiet sadness that stays for days." (`lowMood`, `questions.js:53`, emotions −2), "Monsoon clouds, heavy and slow." (`lowMood`, `questions.js:63`). When emotions is a bottom area, which it usually is for such a student, the page prints that answer under "What we noticed" in the "Next to grow" card (`report-student.js:316` to `324`). Even when it is not drawn, it is in the JSON any visitor can read.
**Why it matters**: AGENTS.md says flags like `selfDoubt` and `lowMood` are sensitive and never public, and AC-4 says the public page shows no text that comes from a sensitive flag. A student under 18 who said they fear they are not good enough, or feel a sadness that stays for days, would have that line shown to anyone the link reaches, and forwarded on. The notice tells them strangers "cannot see ... your private notes", which suggests the opposite. The AC-12 test (`convex/shares.test.ts:198`) only checks that `flags` are false, so it passes while the signal is still there.
**Suggested fix**: Build a separate public view in `buildSharePayload` instead of reusing `flatten` as is. Leave out `state` (or send only the dominant state when it is not `low`), and leave out every `said` (or drop any `said` whose option carries a flag, and drop the emotions and sleep quotes entirely, which is simpler and safer). Have the public mode in `report-student.js` skip the donut and the "What we noticed" lines when those fields are missing. Then extend the AC-12 test: a student who picked every flagged option must produce a payload with no `state.low`, no flagged option id or text, and nothing at all from which `state.low >= 35` can be read. If the owner truly wants these parts public, that is a decision for the spec and the notice words, and it needs to be written down, because today it contradicts both the AGENTS rule and AC-4.

## Major

### 🟠 Production can make public links today; the only gate is a browser setting, `convex/shares.ts:42`
**Problem**: `publicShare` is a front end flag only (`src/lib/session.ts`, `shareEnabled`). The server has no matching switch: with `SHARE_LINK_SECRET` set on production, `shares.enable` is a public mutation that any signed in student can call from the browser console with the `share-v1` hash and `guardianTick: true`, and `GET /api/shared/payload` then serves the report and the picture to anyone. The comment in `convex/convex.config.ts:36` even says to leave the secret unset on production until the work has shipped, and the scope row says a lawyer must check public sharing for under 18s before it is turned on.
**Why it matters**: The legal and wording gates (owner approval of `share-v1`, the lawyer check for minors, and spec 0011's own owed approval for the picture) are not enforced where it counts. A consent row recorded now is recorded against draft words the owner has not approved. Combined with the blocker above, a curious student can publish their own sensitive answers.
**Suggested fix**: Add a server side switch (for example `SHARE_LINKS_ENABLED`, off unless an explicit yes, read the same way as the picture switches) that `enable` checks first and that `publicRead` also checks, answering `unavailable` and the same 404 when it is off. Or unset `SHARE_LINK_SECRET` on production until the owner and the lawyer sign off. Add a test for each.

### 🟠 Stop sharing and the end date do not end access to the picture, `convex/sharePayload.ts:26`
**Problem**: The payload hands out `/api/avatar/<key>`. That route serves the picture to anyone who has the key, cached publicly for an hour (`convex/avatarHttp.ts:22`), and the key changes only when the image changes or the student removes it. Stop sharing, the 90 day end, and the team's `adminOff` touch only the `reportShares` row. Anyone who opened the link once (or any crawler or chat preview that fetched it) keeps a working address to the student's photo.
**Why it matters**: The confirm text says "Anyone who has the link will no longer see your report", and the privacy page says the old link only says it is off. For a child's photo that is not true for the most identifying part. It also lasts past erasure of the link.
**Suggested fix**: Serve the public page's picture through the share route itself (for example `GET /api/shared/avatar` with the same `x-share-token`, checked like the payload and `no-store`), so it dies with the link. Or rotate the avatar key when a link is stopped, ends or is switched off by the team. Add a test that after `disable` the picture address from the payload no longer answers.

## Minor

### 🟡 A lost race is answered 429 and never logged, so a real contention bug would be invisible, `convex/shareHttp.ts:24`
**Problem**: The conversion is correct and limited to the Convex conflict message, and it cannot be used by a stranger to hurt another link (bad codes write only the `bad` shards). But it is silent: if some later change makes every read conflict (for example a write to the share row on read), visitors would see "Lots of people are opening this" forever and nothing would show in the error logs. The match is also on Convex's message text, which can change between versions (then it falls back to a 500, which is safe).
**Suggested fix**: Log one line with a fixed tag and no code or id (for example `share_read_conflict`) each time it converts, so it can be counted. Keep the shareCore test that pins the message.

### 🟡 Every anonymous request runs a Convex mutation that writes, with no edge limit, `convex/shares.ts:162`
**Problem**: A made up or missing code still runs `publicRead` and writes a rate limit row; above the limit it still runs the mutation. A flood costs a Pages Function call plus a Convex mutation each time. This is by design for AC-7, but nothing in front of it caps volume.
**Suggested fix**: Add a Cloudflare rate limiting rule on `/api/shared/*` per IP, or note the cost risk in the spec and the runbook.

### 🟡 The tick is hidden from a minor whose cached profile is missing, then they are asked to tick it, `src/lib/session.ts:1148`
**Problem**: `isMinor` falls back to age 99 when there is no cached profile, so the notice shows no tick box. The server then answers `needs_guardian` and the dialog says "Please tick the box to continue." with no box to tick.
**Suggested fix**: Read the age from `students.me` (or treat unknown as a minor and show the tick), and test the no cache case.

### 🟡 The Pages forwarder has no error handling for the upstream call, `functions/api/shared/[[path]].ts:31`
**Problem**: If the fetch to Convex throws (network, DNS), the Function throws and Cloudflare answers its own error page rather than a JSON 5xx with the private headers.
**Suggested fix**: Wrap the fetch and answer a 502 `{"code":"unavailable_upstream"}` with the same `no-store` and `noindex` headers; the page already shows "We could not open this report" for any non 404 and non 429.

## Nits
- ⚪ `public/_headers:51`, `/dhiinterviews/shared` and `/dhiinterviews/shared.html` get `noindex` but not the strict CSP, `no-referrer` or `no-store` that `/s/*` has; the page shows only "off or ended" there, but giving them the same rules costs nothing.
- ⚪ `convex/shares.ts:22`, `currentConsent` looks only at the newest 50 consent rows; fine today, but a `by_studentId_kind` index would make it exact.
- ⚪ `convex/schema.ts:216`, `consentId` stays optional although every row is now made after a consent; tighten it once dev rows are cleaned.
- ⚪ `convex/consentText.ts:68`, the notice words are still marked DRAFT while consent rows can already be written against them on production (see the major above).

## Strengths
- The link code is done well: HMAC SHA 256 cut to 128 bits, a canonical base64url check that refuses the spare bit variants, a constant time compare, nothing secret stored, and a new generation kills the old code.
- AC-7 is held carefully: the same 404 body for unknown, altered, off, ended, old generation, missing header and no secret, and the 429 for a lost race is the same for good and bad codes. Bad codes share one sharded bucket, so a flood never makes a key per code and never touches a real link's budget.
- The AC-11 fix is right: 16 shards with `start: 0` so all shards reset on the same minute, a test that fails without `start: 0`, and the conversion to 429 only for the conflict error while every other error still throws.
- No public function takes an id, `adminOff` is internal, and a source scan test enforces both. The public page loads only same origin files under a strict CSP, writes no storage, and writes every value with `textContent`.

## Test coverage
Ran `pnpm exec vitest run` on `convex/shareCore.test.ts`, `convex/shares.test.ts`, `tests/shared-page.test.js` and `tests/share-flow.test.js`: 94 tests, all pass. Coverage of the server rules is strong (every enable branch, every AC-7 case, both buckets, the shared window, the lost race, consent and the tick, status, Stop sharing, the team switch). Gaps: the AC-12 test checks only the `flags` object and never a student who chose the flagged options, so it misses the blocker; nothing tests that the picture address stops working after Stop sharing; nothing tests a server side off switch because there is none; the minor with no cached profile case is untested in `share-flow`; the forwarder's failure path is untested. The real race is proven only by the live run recorded in `verify.md`, which is reasonable given `convex-test` runs one mutation at a time.
