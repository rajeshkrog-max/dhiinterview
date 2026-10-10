# 0011. Google profile picture across the screens

**Date**: 2026-10-10
**Status**: In Progress

## Summary

Each student's Google profile picture, and nothing else from their Google profile, is copied once into DhiRise's own storage at a small size and shown next to their name on their own screens, the leaderboard, the report PDF copy, the public shared report (spec 0010) and the team pages. Screens load it from DhiRise's own address, so Google learns nothing each time a screen opens. **Owner decision of 2026-10-10: the picture is on by default and nobody is asked.** There is no notice and no agree step; every student's picture is fetched and shown. Whether students must agree first is now a server setting, `PICTURE_CONSENT_REQUIRED`: when it is `true` the original flow comes back (a new consent text, v4, new students agree on the landing page, existing students agree once in a notice, with a 14 day reminder if they say not now). The picture is refreshed at each Google sign in and by one quiet check when the app opens after 7 days, with no always running job. A student can remove their picture at any time, which becomes their only way out in the default mode. You chose to show the picture wherever the student appears, including to other students and on public links, so the spec adds controls around that choice. A server switch, `PROFILE_PICTURE_ENABLED` (on unless it is `false`), can hold the whole feature off, and leaderboard pictures stay off until the team has a way to review them.

## Requirements

**User stories**:
- As a student, I want my Google picture next to my name, so DhiRise feels like it knows me.
- As a student, I want to remove my picture and see initials instead, so I can take it back.
- As a parent, I want to know the picture is stored, where it shows, and that it can be removed.
- As the team, I want to remove a picture after a complaint, and keep it removed.

**Acceptance criteria** (the contract, each one independently checkable). Two modes, set by the server setting `PICTURE_CONSENT_REQUIRED` (owner decision, 2026-10-10): the **default mode** (the setting is not `true`) asks nobody, and the **asked mode** (`true`) is the original flow. AC-1, AC-2 and AC-16 below say what each mode does.
- **AC-1**: One helper, `isPictureAgreed`, answers "may this student's picture be fetched and shown" everywhere. In the default mode it is true for every student, so their Google picture is fetched once by the server at a small size, checked, and kept in DhiRise's own storage with no step by the student. In the asked mode a student has *agreed* only when their newest `landing` consent row (by `acceptedAt`) is a version in `PICTURE_CONSENT_VERSIONS`; before that, nothing is fetched or shown. In both modes no screen contacts Google for the picture.
- **AC-2**: The current consent version becomes v4 (v3 plus the picture line; v1 to v3 stay frozen). `createProfile` and `students.acceptPicture` accept only the current version with a matching hash; a page still holding v3 gets `consent_text_changed`. New students see v4 on the landing page (in the default mode the picture line is information, not a separate question). **In the default mode nobody sees the picture notice:** `students.me` returns `pictureNotice: "none"` and `students.acceptPicture` returns `{ ok: true }` and writes nothing (the feature switch is checked first: with the feature off it returns `{ ok: false, code: "off" }`, AC-16). **In the asked mode** an existing student sees the notice once, and it records one new consent row (kind `landing`, version v4, `ageAtConsent` from `students.age`, `guardianPresent` equal to the tick, which is required for under 18s and returns `needs_guardian` as a result when missing). A repeat tap records no second row. "Not now" sets `pictureNoticeDeclinedAt`, carries on with initials, never blocks the check or the report, and asks again after 14 days, no sooner. A query must not read the clock, so `students.me` returns `pictureNotice` as `ask`, `later` (after Not now, with `pictureAskAt`, the 14 day mark) or `none`, and the browser compares `pictureAskAt` with its own clock.
- **AC-3**: The student's own picture shows, at the sizes in the table below, on: the landing welcome back state, the report heading, the done page, the who page, the challenge page and the leaderboard "you" card. When there is no picture, it failed, it was removed, the student has not agreed, the account has no photo (Google's default avatar address counts as none), the feature is off, or it is a test account, an initials circle shows instead, at the same size.
- **AC-4**: Wherever else the student appears, their picture appears too, if they agreed, have not removed it and are not blocked: the leaderboard rows (once scope row 12 supplies an `avatar` field per row, and only while `LEADERBOARD_PICTURES_ENABLED` is on), the report PDF copy (frozen at the time the copy is made), the public shared report banner (spec 0010), and the team list rows and the team report viewer.
- **AC-5**: The picture is not on the question pages, the Founding Card image, the shared story picture, the Sheet, analytics, or the demo leaderboard rows.
- **AC-6**: The picture is refreshed in two ways only. First, when the student signs in with Google, the new address is fetched at once if it differs from the stored one. Second, when the app opens and the last check was more than 7 days ago, the stored address is checked again and the picture is replaced only if its content changed. No scheduled job runs. A student is checked at most once every 10 minutes. At most 5000 checks run a day across everyone, and a first fetch is allowed before a weekly re-check when the cap is close.
- **AC-7**: Only addresses that parse to `https` on a host matching `^lh[0-9]\.googleusercontent\.com$`, with no user info and no port, are fetched. There are no redirects (a 3xx is the code `redirect`), a 5 second limit, a file type check from the first bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF....WEBP`), and a size limit of 200 KB. Anything else is refused. A failure keeps the existing picture, records a short code, and shows nothing to the student.
- **AC-8**: `GET /api/avatar/<key>` returns the stored image to anyone who has the key. The key is random, and a new one is made whenever the image changes. An unknown, removed, blocked or deleted key gives the same 404, and so does the key of a student who has not agreed when `PICTURE_CONSENT_REQUIRED` is on (so a later switch to the asked mode hides every picture whose student never agreed, at once). The response carries `nosniff`, `noindex`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cache-Control: public, max-age=3600` on a 200 and `no-store` on a 404, and an `ETag`. The Pages forwarder sets all of this in code.
- **AC-9**: A student can remove their picture from its own control on the report page, after a confirm step that says it can stay in browser caches for up to an hour. Remove is a control over the picture, not a consent row (in the default mode, where nobody is asked, it is the student's only way out, so it must ship before launch): the stored file is deleted, `removedAt` is set, nothing is fetched again, and initials show everywhere at once. `removedAt` is authoritative: agreeing to a notice, a change of `PICTURE_CONSENT_REQUIRED` or a sign in never clears it; only the student's own Restore does, and Restore always fetches again and makes a new key (so a cached 404 on the old key cannot hide it). Remove does not purge a picture already drawn into a saved PDF copy or a shared payload (only the erase of scope row 15 does, AC-12); the confirm text and the privacy page say so. "Use my Google picture" works only while the student has agreed (in the asked mode, otherwise the notice opens; in the default mode every student has) and is not blocked. The team can block a student's picture with an internal function; `blockedAt` is cleared only by the team, and the student's Restore does not clear it.
- **AC-10**: Only the signed in student's own picture address is read, from the session; no function takes a student id from the request; the Google address, the storage id and the ETag never reach a browser.
- **AC-11**: DhiRise keeps no Google profile field other than the picture address and the picture image. No other Google data is fetched.
- **AC-12**: Erasing a student (scope row 15) deletes their `avatars` row and stored file and, with the report copies, any picture that a copy holds; their consent rows stay.
- **AC-13**: The picture loads under the strict content security policy of the team pages and the public page (`img-src 'self'`) with no change to either policy.
- **AC-14**: The picture is decorative when the name is written beside it (`aria-hidden`), the initials meet a 4.5 to 1 contrast on a fixed palette, the circle has a fixed size so nothing shifts when it loads, and there is no motion for it.
- **AC-15**: The v4 consent text and the privacy page name the saved profile picture and where it shows. A test fails if any later consent version drops the picture line. In the default mode nobody is asked, so the privacy page is the only notice an existing student gets (they agreed to v3, which has no picture line), and it must say: the picture is on for everyone with no separate question, who sees it (the student, other students on the leaderboard, anyone with a report link the student shares, the team), how to remove it, that a removed picture can stay in browser copies for up to an hour, that saved PDF copies and shared links may keep what they drew, and the note that a copy made very early may have no picture (AC-17). The landing ticks (and the guardian tick for under 18) cover the profile data; they are not a separate question about the picture.
- **AC-16**: The feature is **on by default**. When `PROFILE_PICTURE_ENABLED` is exactly `false` on the server (or `DHI_FUNNEL.profilePicture` is exactly `false` in the browser), no notice, picture, control or fetch happens: `ensure` does nothing, `me.picture` is null, the notice is `none`, `students.acceptPicture` returns `{ ok: false, code: "off" }`, and the image route answers 404. Unset, empty, or any other value means on.
- **AC-17**: A PDF copy made before a new student's first fetch finishes may have no picture; this is accepted and written in the privacy page notes. The render page loads the picture eagerly, waits for it for at most 3 seconds, and then marks the report ready with initials if it has not arrived.

## Decision

**Chosen option**: Option B: copy the Google picture into DhiRise storage at sign in, serve it from our own address by a random key, and refresh it only at sign in and by a weekly check when the app opens.

**Owner decision, 2026-10-10:** the picture is on by default and nobody is asked. This replaces the original rule that nothing is fetched until the student agrees to the v4 text. The original flow is kept, behind `PICTURE_CONSENT_REQUIRED=true`, so it can be brought back without a rebuild if the lawyer check or a complaint requires it. The v4 text stays the current text, and new students still see its picture line.

Add a small `avatars` table, a server action that fetches, checks and stores the picture, one public image route with a Pages forwarder, a picture field in `me` and in the payloads that already carry the student's name, one tiny browser helper (`DhiAvatar`) that draws a picture or initials, consent text v4, a remove control, and two switches.

**Implementation skills**: none installed in the project (`AGENTS.md` says none). Two skills on your machine apply: `better-auth-best-practices` (the `overrideUserInfoOnSignIn` option) and `convex` (file storage and HTTP routes). `convex/_generated/ai/guidelines.md` must be read first, as `CLAUDE.md` says.

## Feature design

**Data model**:

`avatars` (new, additive; one row per student, patched in place)

| Field | Type | Notes |
|---|---|---|
| `studentId` | `id("students")` | indexed `by_studentId`; at most one row per student |
| `key` | string (22 chars, random, base64url) | indexed `by_key`; made again whenever the image changes |
| `storageId` | optional `id("_storage")` | absent after a removal or when Google has no photo |
| `contentType` | optional string | `image/jpeg`, `image/png` or `image/webp`, from the file's own bytes |
| `size` | optional number | bytes, at most 200 KB |
| `sha256` | optional string | to tell a changed image from the same one |
| `sourceUrl` | string | the Google address last used (host checked); never sent to a browser |
| `etag` | optional string | Google's ETag for the conditional re-check |
| `checkedAt` | number | the last time it was compared with Google |
| `updatedAt` | number | when the image last changed |
| `removedAt` | optional number | set by the student's Remove; no fetch and no display while set |
| `blockedAt` | optional number | set by the team; cleared only by the team |
| `leaseUntil`, `leaseToken` | optional number, string | one fetch at a time for a student; the token is checked when the fetch lands |
| `lastError` | optional string | a short code, never a URL or a name |

`students` gets one new optional field, `pictureNoticeDeclinedAt` (number): when the student tapped Not now. Remove does not change it. `consents` is unchanged in shape: a v4 consent is a row of kind `landing`. `consentText.ts` gets the current version `v4` and a list `PICTURE_CONSENT_VERSIONS` of the versions that name the picture. `isPictureAgreed(ctx, studentId)` is true at once in the default mode; in the asked mode it takes the newest few `landing` consent rows by `acceptedAt` and checks the first one's version is in that list (version strings are never compared by order).

**State**: `no picture` → (agreed, Google has a photo) → `stored` (key k1) → (photo changed) → `stored` (key k2, old file deleted) → (Remove) → `removed` → (Use my Google picture, agreed and not blocked) → `stored`. A team block moves any state to `blocked` until the team clears it.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `students.me` (query, extended) | Convex | none | adds `picture: { url } \| null`, `pictureDue: boolean`, `pictureRecheckAt: number \| null`, `pictureNotice: "none" \| "ask" \| "later"` and `pictureAskAt: number \| null` | signed in | as today |
| `students.acceptPicture` (mutation) | Convex | `notice: { version, hash }`, `guardianTick?` | `{ ok: true }` or `{ ok: false, code: "consent_text_changed" \| "needs_guardian" \| "off" }`; in the default mode `{ ok: true }` and nothing written | signed in student | `not_signed_in`, `no_profile` |
| `students.declinePicture` (mutation) | Convex | none | `{ ok: true }` | signed in student | `not_signed_in`, `no_profile` |
| `avatars.ensure` (mutation) | Convex | none | `{ ok: true, scheduled: boolean }`; reads the account `image` with the session, checks the host, and schedules `avatars.sync` with that address only when one is due | signed in student | `not_signed_in`, `no_profile` |
| `avatars.sync` (internal action) | scheduled | student id, address, lease token | fetches, checks, stores the blob, then calls `avatars.apply` | internal | none |
| `avatars.apply` (internal mutation) | from the action | student id, lease token, blob facts | swaps the row, deletes the old file; re-checks agreed, `removedAt`, `blockedAt` and the token; if refused the action deletes the new blob | internal | none |
| `avatars.remove` / `avatars.restore` (mutations) | Convex | none | `{ ok: true }` or `{ ok: false, code: "needs_consent" \| "blocked" }` | signed in student | `not_signed_in`, `no_profile` |
| `avatars.adminBlock` / `avatars.adminUnblock` (internal mutations) | `npx convex run` | the student's email | `{ ok }` | the team, from a terminal | none |
| `GET /api/avatar/<key>` | HTTP action (path prefix) | the key in the path | the image bytes | none; the key is the capability | `404` |
| `functions/api/avatar/[[path]].ts` | Pages forwarder | the path | passes the image through | none | `404`, `405`, `503` |

`me` sets `pictureDue` when `isPictureAgreed` is true, the feature is on, the student is not removed or blocked, and the row is missing or has never landed, or its `sourceUrl` differs from the account `image`, or the account has no photo but we hold one. `me` does not read the clock (a query must not), so the weekly check is `pictureRecheckAt` (the row's `checkedAt` plus 7 days) and the browser compares it with its own time. The browser bridge calls `avatars.ensure` once per page load, only when `pictureDue` is true or `pictureRecheckAt` has passed, and `ensure` decides again on the server with its own clock. `ensure` takes the per student limit first, then the lease, and takes the daily token only when it is about to schedule, never on a no-op. It never throws after taking a token.

`avatars.sync` sets the size suffix (replace a trailing `=s…-c`, or append `=s192-c`), fetches with no redirects, a 5 second limit and `If-None-Match` when it has an ETag, checks the type from the first bytes and the size, stores the blob, and calls `avatars.apply`. A 304, or the same hash, only moves `checkedAt` (the new blob, if any, is deleted). No photo, or the Google default avatar address (a path that contains `default-user`), deletes any stored picture and leaves the row with no storage (`ensure` does this itself, with no fetch and no token). A permanent failure (a bad file, a redirect, a 4xx other than 429) moves `checkedAt` so it is not asked again until the next check is due. A short lived failure (a timeout, a network error, a 429 or a 5xx) leaves the check due, so the next page load tries again, bounded by the 10 minute student limit and the daily cap.

Sign in must update the address: `convex/auth.ts` gets `overrideUserInfoOnSignIn: true` on the Google provider (checked in the installed Better Auth source: it rewrites the user record's `name` and `image` at each sign in; `students.name` is separate and never changes).

**The image forwarder** (`functions/api/avatar/[[path]].ts`): GET only; checks the key against `^[A-Za-z0-9_-]{22}$` before forwarding; sends no cookies and no `Authorization`; strips `set-cookie`; passes `accept-encoding: identity` and keeps `content-type` and `content-length`; streams the body; sets `Cache-Control: public, max-age=3600` on a 200 and `no-store` on a 404; adds `X-Content-Type-Options: nosniff`, `X-Robots-Tag: noindex` and `Content-Security-Policy: default-src 'none'; sandbox`; supports `ETag` and `If-None-Match`; and uses the Cache API (`caches.default`) for 200 answers for the same one hour, and for 404 answers for 60 seconds, so a 100 row board does not run 100 Convex calls. Pages Functions ignore `_headers`, so all of this is in code. The unknown key route has no per request rate limit; the edge cache is the cost control.

**Where the picture is delivered** (always as the path `/api/avatar/<key>`, same origin):

| Place | Size | How the path reaches the page |
|---|---|---|
| Landing welcome back | 64 | `students.me` → `DhiSession.picture()` |
| Report heading | 64 | same |
| Done and who pages | 40 | same |
| Challenge page | 40 | same |
| Leaderboard "you" card | 40 | same |
| Leaderboard rows | 28 | the live leaderboard rows (scope row 12) get an optional `avatar`, only while `LEADERBOARD_PICTURES_ENABLED` is on |
| Report PDF copy | 64 | the render payload (spec 0006) gets `profile.avatar`; the relative path resolves against `REPORT_RENDER_BASE_URL`; the render page loads it eagerly |
| Public shared report banner | 40 | the shared payload (spec 0010) gets `profile.avatar` |
| Team list rows | 28 | the team list rows (spec 0008) get `avatar` |
| Team report viewer | 40 | same |

The path is included only when the student has agreed, has not removed it, is not blocked, a stored picture exists and the feature is on. The path is kept in memory in `DhiSession` and never in `localStorage`. `DhiSession` re-reads `me` once, a few seconds after an `ensure` that scheduled a fetch, so the first picture appears without a reload; own screen images load eagerly so they do not flicker.

**Browser helper**: `public/dhiinterviews/js/avatar.js` (`window.DhiAvatar.make({ url, name, size })`) returns a fixed size circle. It draws the picture when there is a path, with `decoding="async"`, explicit width and height and `referrerpolicy="no-referrer"` (`loading="lazy"` only for leaderboard and team rows, eager elsewhere and in print), and the initials when there is none or the image fails to load. Initials are the first grapheme of the first word of the name (`Array.from`, upper cased with `toLocaleUpperCase`); an emoji, digit or empty name shows a neutral person glyph. The palette is fixed and tested for 4.5 to 1 contrast. Styles are in `css/avatar.css` with sizes 28, 40 and 64. It sets no storage and loads nothing from a third party.

**The picture control**: its own row on the report page, shown whenever the student has agreed and has a stored picture ("Your picture is shown across DhiRise. Remove my picture"), and, after a removal and while not blocked, "Your picture is off. Use my Google picture". The confirm text is "Your picture will be taken off every screen and deleted from DhiRise. It can stay in browser copies for up to an hour, and in reports already made."

**The one time notice** (asked mode only; in the default mode it never shows): shown on the landing welcome back state and the report page, never on the question pages or during the check. It uses the existing consent sheet pattern: the new picture line first, then the full v4 text, then I agree (with the guardian tick for under 18s) and Not now. With two devices open, the first device to agree wins; the other sees `pictureNotice: "none"` on its next `me` read.

**Value sourcing** (every value names where it comes from):

| Action | Value produced or displayed | Source |
|---|---|---|
| `avatars.ensure` | the Google picture address | the signed in user's `image` from the Better Auth user record (`authComponent.safeGetAuthUser`), refreshed at sign in by `overrideUserInfoOnSignIn`; passed to the action as an argument |
| `avatars.sync` | the sized address fetched | the address with its size suffix replaced or appended as `=s192-c` |
| `me` / `ensure` | whether a sync is due | `avatars.sourceUrl` vs the account `image`; `checkedAt` + 7 days; the per student limit and the daily cap |
| `avatars.sync` | image type, size, hash | the fetched bytes (type from the first bytes, never the header alone) |
| `avatars.sync` | the key | 16 random bytes from `crypto.getRandomValues`, base64url, new whenever the hash changes |
| `students.me` | `picture.url` | `/api/avatar/` + `avatars.key`, only if agreed, not removed, not blocked, `storageId` set and the feature on |
| `students.me` | `pictureNotice`, `pictureAskAt` | `ask` when `isPictureAgreed` is false (so only in the asked mode) and `pictureNoticeDeclinedAt` is missing; `later` with `pictureAskAt` = `pictureNoticeDeclinedAt` + 14 days after a Not now (the browser turns `later` into `ask` once its clock passes it); `none` otherwise, and always `none` in the default mode or with the feature off |
| `students.me` | `pictureRecheckAt` | `avatars.checkedAt` + 7 days when a picture has landed for the account's current address, else null |
| `students.acceptPicture` | consent row | `students.age` (as fixed at sign up); the sent `{ version, hash }` checked against `CONSENT_VERSION`; `guardianPresent` = the tick |
| initials | the letter | first grapheme of the first word of `students.name`, or of the payload name |
| report PDF, shared report, team rows | the path | the same rule as `students.me`, read for that student |
| leaderboard rows | the path | `avatar` on each row from the live leaderboard (scope row 12), only while `LEADERBOARD_PICTURES_ENABLED` |
| feature switches | on or off | `PROFILE_PICTURE_ENABLED` (Convex, on unless `false`), `DHI_FUNNEL.profilePicture` (deploy time, on unless `false`), `PICTURE_CONSENT_REQUIRED` (Convex, off unless `true`), `LEADERBOARD_PICTURES_ENABLED` (Convex, default off) |

**Key invariants**:
- A picture is fetched and shown only for a student who has agreed (every student, in the default mode), has not removed it, is not blocked, and while the feature is on.
- One `avatars` row per student; `ensure` and `apply` are lease and token guarded, so two tabs or a repeat make one fetch, and a Remove that lands mid fetch wins.
- A key answers only while its row has a `storageId`, no `removedAt` and no `blockedAt`, the feature is on, and the student has agreed (every student, in the default mode); a new image always has a new key.
- The Google address, the storage id and the ETag are never returned by any function a browser can call.
- The only outgoing request to Google is `avatars.sync`; no page script and no HTML points at a Google host.
- A removal deletes the file in the same step that sets `removedAt`.

**Security model**: The picture is personal data of minors. In the asked mode it is private to the signed in student until they agree; in the default mode (the owner's decision of 2026-10-10) nobody is asked, and it appears wherever the student appears from their first fetch. In both modes that is by decision of the owner. The image route is public by key, like a capability: the key appears only in places where the student already appears (their own `me`, the public report link they made, the leaderboard once live and switched on, the PDF render payload and the team list). The fetch from Google is the one server side request to an outside address, so it is limited to the Google picture hosts over `https`, with no redirects, a time limit, a size limit and a content check. Cached for at most one hour so a removal or an erase takes effect within the hour at the longest; report copies and shared payloads keep what they drew. Compliance scope: India's Digital Personal Data Protection Act, 2023, on children's data; see the premise note in `rationale.md`.

**Configuration required**:
- `PROFILE_PICTURE_ENABLED` (Convex, per deployment, declared in `convex/convex.config.ts`): **on unless it is exactly `false`** (owner decision, 2026-10-10). Set `false` on production to hold the feature off until the legal check is done.
- Setting values are read trimmed and ignoring case, so `False`, ` false` and `TRUE` mean what they say. `PROFILE_PICTURE_ENABLED` is off for `false`, `0`, `no` or `off`, and on for anything else including unset. `PICTURE_CONSENT_REQUIRED` is not required when unset or empty, required for `true`, `1`, `yes` or `on`, and **any other value also counts as required** (a typo fails towards asking, never towards dropping consent). The browser's `DHI_FUNNEL.profilePicture` follows the same off rule.
- `PICTURE_CONSENT_REQUIRED` (Convex): `true` brings back the asked flow (the picture waits for a v4 consent and existing students get the notice). Unset means nobody is asked.
- `LEADERBOARD_PICTURES_ENABLED` (Convex): `true` lets live leaderboard rows carry pictures. Leave it off until the team can review pictures.
- `profilePicture: false` in `js/funnel-config.js` at deploy time (format in `funnel-config.example.js`) hides the picture, notice and control in the browser. Leaving it out means on.
- The Google sign in settings already exist; their default scopes (`openid email profile`) already include the picture.
- Limits in `convex/limits.ts`: `avatarCheck` (token bucket, 1 per 10 minutes, key = student id), `avatarDay` (fixed window, 5000 a day, key "all") and `avatarRecheckDay` (fixed window, 4000 a day, key "all", taken only by weekly re-checks so a first fetch is never crowded out).

**Critical test scenarios**:
- Happy path (default mode): a student signs in with Google; with no consent step for the picture, the picture is stored once and the report heading shows it from `/api/avatar/<key>`, verifies **AC-1, AC-3**. Happy path (asked mode): a new student agrees to v4 and signs in; the same result, verifies **AC-1, AC-2, AC-3**.
- Consent (asked mode): a v3 page gets `consent_text_changed`; an under 18 existing student cannot agree without the tick; a double tap records one row; "Not now" asks again only after 14 days; version strings are never compared by order, verifies **AC-1, AC-2**.
- Default mode: a student who agreed only to v3 is not asked, gets their picture, and no consent row is made; accepting is a no op; setting `PICTURE_CONSENT_REQUIRED=true` brings the notice back for the same student, verifies **AC-1, AC-2**.
- Refresh: a changed address at sign in fetches at once; a quiet check after 7 days replaces only a changed image; two opens in 10 minutes make one fetch; the daily cap holds and first fetches go first; no token is taken on a no-op, verifies **AC-6**.
- Safe fetch: a non Google host, `lhX.googleusercontent.com.evil.com`, a redirect, an HTML file named `.jpg`, a 300 KB image and a slow server are all refused and leave the old picture; a new blob is deleted when the swap is refused, verifies **AC-7**.
- Route and forwarder: a valid key returns the image with the right headers and an `ETag`; an unknown, removed, blocked and erased key all return the same 404; an old key after a change returns 404; a bad shaped key never reaches Convex, verifies **AC-8**.
- Remove, restore and block: Remove deletes the file and the key; Restore needs agreement; Restore does not clear a team block; Remove during a fetch wins, verifies **AC-9**.
- No leaks: `me`, payloads and lists never carry the Google address, storage id or ETag, verifies **AC-10, AC-11**.
- Elsewhere: the PDF render page, the shared report, the team list and the leaderboard rows draw the picture; the render page waits at most 3 seconds; the strict team policy still passes, verifies **AC-4, AC-13, AC-17**.
- Not elsewhere: question pages, the card image, the Sheet and the demo rows carry none, verifies **AC-5**.
- Switch off: with `PROFILE_PICTURE_ENABLED=false` there is no fetch, no picture, no notice, and the route answers 404; unset it is on, verifies **AC-16**.
- Consent text: v4 contains the picture line, v1 to v3 are unchanged, a later version cannot drop it, verifies **AC-15**.
- Accessibility: fixed size, `aria-hidden` beside a name, initials contrast, glyph for emoji names, verifies **AC-14**.
- Erase: the deletion function removes the row and file, verifies **AC-12**.
- Test accounts: email and password test users have no image and show initials; tests use a stubbed fetch and seeded rows, and the host rule is never widened for tests.

## Build plan

Approach: Tracer Bullet (the project default). Prove one real Google picture is stored and shown on one screen first, then widen to the other screens and places.

1. **M1 The thin thread.** Consent text v4, `PICTURE_CONSENT_VERSIONS`, `isPictureAgreed` and the current version rule in `createProfile`; the `avatars` table; `overrideUserInfoOnSignIn`; `avatars.ensure`, `sync` and `apply` with all their checks and the lease; the limits; `GET /api/avatar/<key>` and its forwarder; `students.me` with `picture` and `pictureDue`; `DhiAvatar` and `avatar.css`; the report heading shows the picture; `PROFILE_PICTURE_ENABLED` and the switch checks. Prove it on dev with a real Google account (the browser tests use fake accounts). Satisfies **AC-1, AC-2 (new students), AC-7, AC-8, AC-10, AC-11, AC-15, AC-16**.
2. **M2 The student's own screens.** The landing welcome back, done, who, challenge and leaderboard "you" card draw the picture or initials at the sizes above; the one time notice for existing students (asked mode only; built first as a card on the report page) with the under 18 tick, `acceptPicture`, `declinePicture` and the 14 day reminder; the bridge calls `ensure` once per load when `pictureDue`, and re-reads `me` once. Satisfies **AC-2, AC-3, AC-6, AC-14**.
3. **M3 The other places.** The render payload and the render page (eager load, 3 second wait); the team list and viewer; the leaderboard `avatar` contract in `api.js` and `leaderboard.js` behind `LEADERBOARD_PICTURES_ENABLED` (demo rows stay without pictures); the shared report banner and payload once spec 0010 is built. Satisfies **AC-4, AC-5, AC-13, AC-17**.
4. **M4 Control and clean up.** `avatars.remove` and `restore` with their own row on the report page and the confirm step, `adminBlock` and `adminUnblock`, the privacy page lines and the early copy note, the approved v4 words, and the note for the erase function. Satisfies **AC-9, AC-12, AC-15**.
5. **M5 Proof.** Convex tests for every refusal and state, source scans (the only Google request is the sync action, no page points at a Google host), browser tests for the notice and the fallbacks, and a live check on a Pages preview with a real account on a phone and a laptop. Satisfies **AC-1 to AC-17**.

## Changes to other specs

- **Spec 0010 (public share link)**: its public report shows the first name **and the Google picture**; the payload gets `profile.avatar`; its notice line must say "your first name and profile picture"; its AC-4 and Value sourcing say so. These are edited in place in spec 0010 now that this spec is accepted.
- **Spec 0006 (report copy)**: the render payload gets `profile.avatar`; the render page waits for it. `REPORT_VERSION` is not bumped (the picture is not report content), so existing copies are not redrawn.
- **Spec 0008 (team link)**: the list rows and viewer get the picture.
- **Scope row 12 (live leaderboard)**: each row gets an optional `avatar` path, only while `LEADERBOARD_PICTURES_ENABLED` is on. Row 15 deletes `avatars` rows and files, and the picture held in report copies.

## Consequences

**Positive**:
- Screens feel personal and consistent, with a quiet fallback to initials.
- The picture is served from our own address, so Google is not told each time a student opens a screen, and the strict policies of the team and public pages need no change.
- A student or parent can take it back with one control, which also withdraws the picture consent, and the team can block one after a complaint.
- No scheduled job; cost is a handful of small fetches and files, and edge caching for the image route.

**Negative / tradeoffs**:
- A minor's face becomes visible to other students and to anyone with a report link, and since 2026-10-10 with no consent step for the picture at all. You chose this over an opt in switch (the recommended option) and then over asking. A profile photo can be unsuitable, because the student picks it and we do not check it. The remove control and the team block are reactive; the leaderboard stays off until a review exists.
- Refresh is limited: without standing Google access we learn of a new photo only at the next Google sign in, or when the same address starts returning a new image. The weekly check rarely changes anything and could be dropped if you want it simpler.
- Asked mode only: existing students must agree again, and those who say not now see initials for at least 14 days. In the default mode there is nothing to agree to, and existing students (who agreed to v3, which has no picture line) get their picture with no notice.
- After a removal or an erase the picture can persist in browser and edge caches for up to an hour, and in report copies and shared payloads already made. After a switch of `PICTURE_CONSENT_REQUIRED` the same applies to students whose picture the switch hides.
- More places to keep consistent: any new place that shows a student needs the helper.
- A new student's first PDF copy can be made before the first picture fetch finishes and carry no picture.

**Neutral**:
- One new table, one new field on `students`, one HTTP route, one forwarder, one internal action and two internal mutations, one browser helper and its style file, a consent version, three Convex settings (`PROFILE_PICTURE_ENABLED`, `PICTURE_CONSENT_REQUIRED`, `LEADERBOARD_PICTURES_ENABLED`) and a deploy time value.
- The Founding Card, shared story picture and question pages are unchanged.

## Follow-up

- [ ] **Launch blocker (since the 2026-10-10 decision)**: the picture is on by default, so deploying to production starts copying every student's Google picture, minors included, at their next page load. Before any production deploy, either set `PROFILE_PICTURE_ENABLED=false` on production, or accept the risk below on purpose. The Remove control (milestone M4) must ship before the picture is on in production.
- [ ] **Launch blocker**: the v4 consent words are a draft until you approve them. They are information now, not a question, but they still go to every new student. Draft line, inserted before the line about the DhiRise team: "DhiRise also saves the small profile picture from your Google account, and shows it next to your name on your screens, on your report, on the leaderboard and on any report link you share. You can remove it at any time." The privacy page needs a matching section and a line that a report copy made very early may have no picture.
- [ ] **Launch blocker**: ask a lawyer whether showing a child's picture to other students and on public links is allowed under the Data Protection Act 2023 **with no separate agreement for the picture** (it may need a parent or guardian to agree for the picture itself, and the consent text only informs). Add it to the legal items of scope row 26. If the answer is no, set `PICTURE_CONSENT_REQUIRED=true`; the asked flow is built and tested.
- [ ] Built in milestone M1 and recorded here (not new decisions): `ensure` returns `{ ok, scheduled }` so the bridge can re-read `me` once; `me` returns `pictureRecheckAt` instead of reading the clock; short lived fetch failures stay due; the bridge calls `ensure` in M1 so the first picture can be proven; the `avatarRecheckDay` limit was added.
- [ ] Moderation: nothing checks what a student's Google photo shows. `LEADERBOARD_PICTURES_ENABLED` stays off until the team can review pictures (scope row 13 could carry that review).
- [ ] Scope row 15 (data export and deletion) must delete `avatars` rows and their stored files, and cover report copies that hold a picture.
- [ ] Scope row 12 (live leaderboard) must send an optional `avatar` path per row, only for students who agreed, have not removed it and are not blocked, and only while the switch is on.
- [ ] Spec 0010, 0006 and 0008 edits listed in "Changes to other specs".
- [ ] Code to catch up with this spec (found by the cross check of 2026-10-10): (1) `avatars.byKey` and `students.me` apply `isPictureAgreed`, and `avatars.ensure` deletes the held file of a student who has not agreed, so a later switch to the asked mode hides and clears pictures; (2) the setting values are read trimmed, ignoring case, with a typo in `PICTURE_CONSENT_REQUIRED` counting as required; (3) Restore (M4) clears `removedAt`, fetches again and makes a new key, and agreeing never clears `removedAt`; (4) the confirm text for Remove names the copies it does not purge. Tests for each.
- [ ] Before any production deploy: print the resolved values of `PROFILE_PICTURE_ENABLED`, `PICTURE_CONSENT_REQUIRED` and `LEADERBOARD_PICTURES_ENABLED` on the target deployment, and read them back to the owner. Preview, dev and test deployments are also on by default. Keep the production hold (`PROFILE_PICTURE_ENABLED=false`) until the picture notice, the privacy page text and the Remove control (M2 and M4) are all merged; milestone M1 must never be deployed to production on its own.
- [ ] Moderation intake: with minors' pictures visible on team and public pages, name a complaint channel (the grievance address `privacy@dhirise.com` already in the consent text) and a response target for removing a picture after a complaint. The owner sets the target. The team block (`avatars.adminBlock`) is a terminal command only, so someone on the team must be able to run it.
- [ ] Verify at build time, against the Convex documentation, `ctx.storage.store` for the action and how a stored file is deleted (the link check opened the file serving page only).
- [ ] The daily cap of 5000 and the one hour cache are guesses; watch the first launch week and adjust. In the default mode every existing student triggers a first fetch at their next page load, so the first days are a burst: when a daily cap is reached `ensure` answers `{ ok: true, scheduled: false }` quietly, the check stays due, and the next page load tries again (bounded by the 10 minute student limit).
- [ ] Skills: `better-auth-best-practices` and `convex` are relevant and sit in your user level skills, not in the project; `/sync` can list them in `AGENTS.md` `## Agent skills` if you want the team to rely on them.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
