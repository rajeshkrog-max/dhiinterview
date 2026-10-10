# 0006. Report copy saved when seen, with Download

**Date**: 2026-10-09
**Status**: In Progress

## Summary

When a student opens their report, the server makes one PDF copy of it, once, and keeps it. The server draws the PDF itself, with Cloudflare's headless browser (Browser Run), from our own report page and the student's saved data. Nothing is ever uploaded from the student's phone, so the file can only be the real report. The report gets a Download button that gives that same PDF. Making the copy never slows or blocks the report, and the copy leaves out everything that comes from the sensitive flags. This replaces the "PDF made in the browser" design of spec 0002 (AC-13).

## Requirements

**User stories**:
- As a student, I want a PDF of my report, so that I can keep it or share it with a parent.
- As the team (from row 23), I want a saved copy of the report as it was drawn for the student, so that I can open it later without asking the student. The copy matches the screen except for the parts listed in AC-5.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: Opening the report of a finished check asks the server for a copy. Within about a minute one ready PDF exists for that check, even if the student never taps Download. A student whose check finished before this shipped gets their row the first time they open the report; one who never reopens it never gets a copy.
- **AC-2**: There is one copy per check. Reopening the report, opening it on two devices at once, or tapping Download repeatedly never makes a second row or leaves a second file.
- **AC-3**: A newer report version replaces the copy. The new file is attached first, then the old file is deleted and `replacedAt` is set. The same or an older version never replaces it.
- **AC-4**: The server draws the PDF from our own report page and the saved data only. No file, HTML or version number from the browser is accepted, and there is no upload route.
- **AC-5**: The copy shows the report cards and the Founding Card in their final state (no animation, no count up). It leaves out: the passages and the "Dhi room" card that come from flags, the blurred week 2 and 3 teasers, the week plan tick grid, the feedback form, every button (save, share, download), the WhatsApp join and trophy links, the challenge bar and invite, the music button and the falling leaves. The data sent to the render page has no flags (the flag fields are filled in as all false), no email and no phone.
- **AC-6**: The Download button gives that same PDF. If the copy is ready it downloads at once. If not, it asks for one (when none was asked for), shows "Getting your PDF ready", and checks every 3 seconds. If it is not ready after 60 seconds, or has failed, it shows a kind message and opens the browser's print dialog with a clean print layout.
- **AC-7**: Making the copy never blocks or slows the report. The report is on screen before the request is sent, the request is fire and forget, and a failure shows the student nothing. A failed try counts as one of five, retried after 30 seconds, 2 minutes, 10 minutes, 1 hour and 6 hours, then the copy is `failed`. Opening the report more than an hour after `failedAt` starts a fresh round. A Browser Run 429 or 5xx answer does not use up a try; it retries after the time Browser Run asks for, or after 1 minute.
- **AC-8**: Only the owner can fetch the copy. The page fetches it with the student's token (the same way the Founding Card download works), and signed out gets 401. The route carries no id, so another student's file cannot be named. No storage address is ever returned. The file is sent as a download only, with `nosniff`, `private, no-store` and a sandbox security policy, and a cleaned file name.
- **AC-9**: The render page works only with a valid short lived signed token. A missing, wrong or expired token gives a blank page with `data-error`, and the data route answers 401. The token is valid for 2 minutes and may be read more than once in that time.
- **AC-10**: Each student may start 10 copies an hour; the allowance is used only when a job is actually queued, so reopening the report costs nothing. Across all students only one job runs at a time, and at most 1500 start a day. A queued request is never lost while it waits for its turn.
- **AC-11**: Only a real PDF is kept: the reply starts with `%PDF-` and is under 5 MB, otherwise the try counts as failed. A stored file with no row for more than a day is deleted by the daily sweep.
- **AC-12**: Missing set up fails safe. If the Cloudflare token, account, render address or signing secret is not set, the job ends `failed` with `render_not_configured`, the report still works, and Download shows the print fallback.
- **AC-13**: A copy is never stamped with the wrong version. The render page compares its own report version with the one in the data and sets `data-error` if they differ, so a half finished deploy cannot produce a copy stamped with a version it does not match. The job then retries.

## Decision

**Chosen option**: the server draws the PDF with Cloudflare Browser Run, from a render page of our own site, opened with a short lived signed token.

A Convex action asks Browser Run (`/pdf`, REST) to open `/dhiinterviews/report-render.html#t=<token>`. That page fetches the student's saved data with the token, draws the report in print form with the same `report-student.js` and `reportText.js` the student sees, and marks itself ready. Browser Run prints it to a PDF, the action checks and stores it in Convex file storage, and one row records it.

## Feature design

**Data model sketch** (additive, one new table, nothing existing changes):

`reportFiles`, one row per check, created at the first request:

| Field | Type | Notes |
|---|---|---|
| `_id` | id | |
| `studentId` | id of `students` | owner |
| `checkId` | id of `checks` | **unique**, one copy per check |
| `resultId` | id of `results` | the saved result it was drawn from (spec 0005) |
| `state` | `"queued"` `"making"` `"ready"` `"failed"` | the latest job; a held copy can exist while a newer one is made |
| `wantedVersion` | number | the report version asked for |
| `storageId` | Convex file id, optional | the copy held. Never given to the browser |
| `size` | number, optional | bytes, under 5 MB |
| `sha256` | string, optional | hex, computed by the job |
| `reportVersion` | number, optional | the version of the held copy |
| `attempts` | number | counted tries in this round |
| `nextAttemptAt` | number, optional | when the next try may run |
| `leaseUntil` | number, optional | the job's lock, 90 seconds from the claim |
| `lastAttemptAt` | number, optional | when the last try started |
| `failedAt` | number, optional | when the round ended `failed` |
| `lastError` | string, optional | a short code only, never student data |
| `createdAt` | number | |
| `readyAt` | number, optional | when the held copy was attached |
| `replacedAt` | number, optional | when a newer version swapped the file |

Indexes: `by_checkId`, `by_studentId` (for erasure, row 15), `by_storageId`, `by_state_and_nextAttemptAt` (for the minute job).

There is no token table. The render token is stateless (see Security model).

Relationships: `students` 1 to many `reportFiles` (the model allows many). `checks` 1 to 1 `reportFiles`. `results` 1 to 1 `reportFiles`.

**State transitions** (`reportFiles.state`):
`queued` (asked, or a retry is due) → `making` (a job holds the lease) → `ready` (file attached) or back to `queued` with a later `nextAttemptAt` (a counted try failed, under five; or Browser Run asked to wait) or `failed` (five counted tries used, `failedAt` set). A `ready` row asked for a newer version goes `queued` again and keeps serving its held copy until the new one is attached. If the wanted version changes while a job is `making`, the job checks it before attaching and, if it moved, the row goes back to `queued`.

**Who runs a job**: `request` queues the row and schedules `reportCopy.runDue` once, straight away. A cron every minute also calls `runDue`. `runDue` is an internal action that handles one job at a time: it calls the internal mutation `claim` (takes the oldest `queued` row whose `nextAttemptAt` has passed, or a `making` row whose lease ran out, sets the 90 second lease and `lastAttemptAt`), then runs `make`. A scheduled action is not retried if the process dies, which is why the minute cron exists: a stuck `making` row is picked up when its lease ends.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `reportCopy.request` | public mutation | none | `{ ok, state }` | signed in, finished check, saved result | `{ ok: false, code }`: `not_signed_in`, `no_profile`, `not_completed`, `no_result`, `rate_limited`. On `no_result` the page does nothing |
| `reportCopy.status` | public query | none | `{ state: "none" or "queued" or "making" or "ready" or "failed", ready: boolean }` | owner (signed out gives `none`) | none |
| `reportCopy.runDue`, `claim`, `make`, `attach` | internal action and mutations | none or row id | none | internal only. They take a row id or an auth user id, which is allowed because nothing public can call them | retries per AC-7 |
| `GET /api/files/report` | HTTP action, forwarded by `functions/api/files/[[path]].ts` | `Authorization: Bearer <student token>` | the PDF, streamed | `ctx.auth` identity, then an internal lookup | 401, 404 |
| `GET /api/render/payload` | HTTP action, forwarded by `functions/api/render/[[path]].ts` | header `x-render-token` | the report data for the render page | the signed token | 401 |
| `/dhiinterviews/report-render.html` | static page | `#t=<token>` in the address fragment | the report drawn for print; `data-ready="1"` when done, `data-error` on failure | the token | blank page |
| `reportCopy.sweep` | internal mutation, daily cron | none | none | internal only | none |

Both forwarding functions copy `functions/api/auth/[[path]].ts`: GET only, no caching, and they pass the `Authorization` header and the body through. Pages Function responses are not touched by `public/_headers`, so the forwarders and the Convex actions set `no-store` themselves.

The `make` action calls `POST https://api.cloudflare.com/client/v4/accounts/<id>/browser-run/pdf` with `url`, `gotoOptions.waitUntil: "networkidle0"`, a `waitForSelector` on `#report[data-ready="1"]` or `[data-error]`, an A4 page with print backgrounds, and a 45 second timeout. Milestone 1 checks the exact request shape against a real call (the selector and print option names).

**Value sourcing** (where each value comes from):

| Action | Value produced or displayed | Source |
|---|---|---|
| `request` | studentId, checkId | the session, through `requireStudent` (no input) |
| `request` | resultId | the `results` row found by `by_checkId` |
| `request` | wantedVersion | `REPORT_VERSION` in `convex/reportVersion.ts`, held equal to `DhiReportText.VERSION` by a test that reads the text of `reportText.js` (it is a `window` script and cannot be imported) |
| `make` | the render address | `REPORT_RENDER_BASE_URL` plus `/dhiinterviews/report-render.html#t=<token>` |
| `make` | token | HMAC (SHA 256, key `REPORT_RENDER_SECRET`) over studentId, checkId and an expiry 2 minutes ahead |
| `make` | sha256, size | computed from the returned bytes (`crypto.subtle`, no Node runtime needed) |
| `payload` | `completedAt` | the `checks` row, as an ISO string the browser's `Date` accepts |
| `payload` | `seed` | the `checks` row |
| `payload` | first name, class | the `students` row |
| `payload` | the result | the `results` row, flattened on the server to the shape `src/lib/result.ts` makes, with every flag set to false (never `resultFlags`) |
| `payload` | wantedVersion | the `reportFiles` row, so the page can compare it (AC-13) |
| render page | the header date | formatted with the time zone `Asia/Kolkata`, so a server in another zone cannot shift the day |
| render page | the Founding Card image | `DhiCardExport.create(...).card()` (the card, not the story), from the payload's style and first name and the share address in `DHI_FUNNEL`; `identity.js` is not loaded, so no founding id is made or read |
| `status` | `ready` | the row has a `storageId` |
| download | file name | `DhiRise-report-<first word of the name, letters and digits only>.pdf`, else `DhiRise-report.pdf` |

**The render page** (`src/pages/dhiinterviews/report-render.astro`): loads only `reportText.js`, `questions.js`, the card export files, `report-student.js` and its own small `render-boot.js`. It does not load `session.ts`, a Guard, the Convex client, analytics, `leaves.js`, `identity.js`, `challenge-ui.js` or `card.js`. `render-boot.js` reads the token from `location.hash`, fetches the payload with a plain `fetch`, sets `window.DHI_RENDER`, and stubs `DhiStore.get`, `DhiStore.seed`, `DhiStore.requireLead`, `DhiSession.result` and `DhiSession.markReportSeen`. `report-student.js` gets one explicit print flag (`DHI_RENDER` present) that skips animations and count ups (it does not rely on the reduced motion setting), the flag passages and room, the teasers, ticks, feedback form and links. The page sets `data-ready="1"` only after the data has loaded, the report has drawn, `document.fonts.ready` has resolved with the report fonts present, and the logo and card image are decoded. Any failure sets `data-error` instead, so the job fails fast and does not wait out the 45 seconds. The fonts load from Google Fonts today; if Browser Run cannot reach them the page sets `data-error` rather than printing in the wrong font.

**Download protocol** (in `src/lib/session.ts`, exposed as `DhiSession.reportCopy`): `request()` calls `reportCopy.request`; `status()` calls `reportCopy.status`; `download()` fetches `/api/files/report` with the student's token, turns the reply into a file and saves it. The Download button polls `status()` every 3 seconds for up to 60 seconds.

**Key invariants**:
- One `reportFiles` row per check; a `storageId` belongs to one row; a held file is replaced only by a higher `reportVersion`, and the old file is deleted only after the new one is attached.
- No public function takes a student id, check id or auth user id. The only public input that is not the session is the render token on `GET /api/render/payload`.
- `payload` never selects `resultFlags` and never returns email or phone.
- The job never writes student data into a log line or `lastError`, only codes and counts.
- At most one job runs at a time across all students.

**Security model**:
- The copy is personal data of minors (name, class, scores, style). It is private to the student. Team access arrives with row 23: the team page fetches the same file with the team member's token, so a Sheet link opens that page, not a raw file address.
- The render token is the only way in for the headless browser. It is stateless and signed, valid for 2 minutes, readable more than once in that time, and covers one check. The token sits in the address fragment, which our servers and Cloudflare's site logs do not receive; it is also in the request to Cloudflare's own Browser Run service, which is the same vendor.
- The render page and payload route send `noindex` and `no-store`. The static page gets them from a rule in `public/_headers` for its path.
- Browser Run always identifies itself as bot traffic. If Bot Fight Mode or a security rule challenges it, milestone 1 falls back to a WAF skip rule keyed on a secret header sent with `setExtraHTTPHeaders`.
- The copy still holds mood adjacent numbers (the index and area scores), because those are the student's own report. The flag derived text is out. This is stated in the spec so the team knows what a stored copy contains.
- Compliance: India's data protection law on children's data. Report data of minors is sent to Cloudflare Browser Run, a new sub processor: the privacy notice and consent text (`convex/consentText.ts`, which is versioned) must say so before launch. The file is deleted with the student on erasure (row 15).

**Configuration required** (per deployment, declared in `convex/convex.config.ts`):
- `CLOUDFLARE_ACCOUNT_ID`: the account that runs Browser Run.
- `CLOUDFLARE_API_TOKEN`: a custom API token with only the `Browser Rendering - Edit` permission. A secret, set in the Convex dashboard, never in the repo.
- `REPORT_RENDER_SECRET`: a long random key that signs render tokens. A secret, different on dev and production.
- `REPORT_RENDER_BASE_URL`: the public address Browser Run opens. Production `https://dhirise.com`. Dev needs the Pages preview address, whose site already points at the dev Convex deployment (`wrangler.toml`), because Browser Run cannot reach `localhost`. It must not be behind a login gate, and production must never be given a preview address.
- The Cloudflare account needs the Workers Paid plan for real volume (see Consequences).

CORS is not needed: everything the browser calls goes through the site's own address. Do not add it.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: finish a check, open the report, a ready PDF appears and Download gives it, verifies **AC-1**, **AC-6**.
- Two devices open the report at once: one row, one file, verifies **AC-2**.
- Report version goes up: the copy is replaced, the old file deleted; a render by an older page build sets `data-error` and retries, verifies **AC-3**, **AC-13**.
- A source scan finds no upload route and no code that stores a request body as a PDF, verifies **AC-4**.
- The render page DOM holds no flag text, room card, teaser, tick grid, form, button or link; the payload has no flag values, email or phone, verifies **AC-5**.
- Download polls every 3 seconds and falls back at 60 seconds or on `failed`; a lost first request is made again by Download, verifies **AC-6**.
- The report is on screen before `request` is sent; a 429 does not use up a try; five counted failures give `failed`, and an hour later a fresh round starts, verifies **AC-7**.
- Signed out and another student's token get 401 and 404; the response has the download only headers, verifies **AC-8**.
- Wrong, expired and missing tokens get 401 and a blank page with `data-error`, verifies **AC-9**.
- An eleventh queued copy in an hour gets `rate_limited` while reopening costs nothing; two jobs never run at once; the day's budget stops the 1501st, verifies **AC-10**.
- A reply that is not a PDF, or is over 5 MB, counts as a failed try; the sweep deletes an unattached file after a day, verifies **AC-11**.
- Missing Cloudflare or secret settings end `failed` with `render_not_configured`, verifies **AC-12**.

## Build plan

Build approach: Tracer Bullet. Prove one thin real thread first (Browser Run opens our own live page and a real PDF comes back), then thicken it.

**Milestone 1. The thin thread**
1. [x] Add the `reportFiles` table, `REPORT_VERSION` in `convex/reportVersion.ts` with its version test, the `request` mutation and `status` query with the rate limit, satisfies **AC-1**, **AC-2**, **AC-10**.
2. [x] Add the signed token, the `payload` route and `GET /api/files/report`, the two Pages forwarding functions, the `_headers` rule, and a bare `report-render.astro` with `render-boot.js` that shows only the first name and sets `data-ready` or `data-error`. Check that the `#t` fragment survives, satisfies **AC-8**, **AC-9**.
3. [x] Add `runDue`, `claim`, `make` and `attach`: call Browser Run, check `%PDF-` and size, store, attach. Run it on dev (a public dev address) and on a production preview. Prove the headless browser is not blocked (use the WAF skip rule fallback if it is) and confirm the exact request shape, satisfies **AC-1**, **AC-4**, **AC-11**. _Done 2026-10-09: ran live from the dev deployment and a Pages preview with no WAF rule needed; a real PDF came back in about 3 to 7 seconds. On the Workers Free plan Browser Run allows one request every 10 seconds and 10 minutes of browser time a day, so jobs now start about 11 seconds apart and a "browser time used up" answer waits for the next UTC day without using a try._

**Milestone 2. The real report on paper**
4. [x] Add the print flag to `report-student.js` and the render page set up: final state with no animation, none of the parts AC-5 lists, the Kolkata date, fonts and image checks before `data-ready`, satisfies **AC-5**, **AC-13**.
5. [x] Put the Founding Card in as an image from `card-export.js`, add the print stylesheet and page breaks, and check the look on a production preview, satisfies **AC-5**. _Done 2026-10-09: checked on a production preview with a real Browser Run copy. The Founding Card is drawn a little smaller (44 percent wide, 300 px at most) so the header and score ring fit on page 1 (6 pages, down from 7), and the week 1 line for the achiever style says "finish it before the day ends" in the copy, since the copy has no tick grid._

**Milestone 3. The Download button**
6. [x] Add `DhiSession.reportCopy` (`request`, `status`, `download`), and send `request` after the report has drawn, fire and forget, satisfies **AC-1**, **AC-6**, **AC-7**.
7. [x] Add the Download button under the title with its states (ready, getting ready with the 3 second poll and 60 second limit, failed), the kind messages in `reportText.js`, and the print fallback with `@media print`, satisfies **AC-6**.

**Milestone 4. Safety and clean up**
8. [x] Add the five try schedule, the 90 second lease, the minute cron with one job at a time and the daily budget, replace on a newer version, and the daily `sweep` (stale leases and unattached files, using the file system table with a creation time cap), satisfies **AC-3**, **AC-7**, **AC-10**, **AC-11**.
9. [x] Add the missing settings case and the tests in the list above, satisfies **AC-4**, **AC-12**, **AC-13**.
10. [x] Update spec 0002 (AC-13 and milestone 4 now point here) and spec 0005's follow up, and note for `/sync` that `html2pdf.js` stays legacy only and that Cloudflare Browser Run is a new service and sub processor, satisfies **AC-4**.

## Consequences

**Positive**:
- The file can only be the true report: nothing is uploaded from a phone, so there is nothing to forge and nothing to check beyond "is it a PDF".
- A real text PDF (selectable text, small, about 100 to 500 KB) that looks like the screen, made on Cloudflare's machines, so a weak phone is never slowed.
- Flag derived text never reaches the render data, so it cannot end up in a stored file or, later, in the Sheet.
- Row 23 gets a file the team page can fetch with the same rules.

**Negative / tradeoffs**:
- A new paid service, a new sub processor of minors' data, and three new settings. Free allows 10 browser minutes a day (about 40 to 75 PDFs) and 1 request every 10 seconds, which is too little for the challenge launch. Workers Paid includes 10 browser hours a month, then $0.09 an hour (roughly $0.0003 a PDF).
- One job at a time keeps within Cloudflare's rate limit but makes a launch spike wait in a queue: roughly 6 copies a minute at 10 seconds each, so a rush of hundreds of students means copies arrive over tens of minutes. The report is never delayed; only the PDF.
- If Browser Run is down or blocked by a bot rule, no copies are made until it recovers (retries cover short outages; the print fallback covers the student).
- The server constant `REPORT_VERSION` and the page's `DhiReportText.VERSION` must move together; the test fails loudly if they differ and the render page refuses a mismatch. The bump rule covers print styles and report layout too, not only words.
- The copy differs from the screen in the parts AC-5 lists (the flag room card, teasers, ticks and links).
- A dev copy needs a public dev address, so local `pnpm dev` alone cannot make real PDFs (tests stub the call).

**Neutral**:
- The signed token removes a table and its sweep, at the cost of single use, which the 2 minute life already covers.
- The "who made it" field from the first draft is dropped, since students no longer make files.
- The challenge invite is not in the copy: it is an overlay with a referral code that changes when the challenge goes live (rows 10 to 13).

## Follow-up

- [ ] Changed by spec [0011](../0011-google-profile-picture/index.md): the render payload gets `profile.avatar` (a same origin path); the render page loads it eagerly and waits at most 3 seconds, then marks the report ready with initials. `REPORT_VERSION` is not bumped.
- [ ] **Needs your wording:** add Cloudflare Browser Run as a sub processor to the privacy notice and consent text in `convex/consentText.ts`. Consent text is versioned, so this is a new text version, and it should ship before real students use the report. Students who already consented would see the new version where the app asks for it.
- [ ] You chose "everything on the page"; this spec reads that as the report cards plus the Founding Card, and leaves out the parts AC-5 lists. Say so if you wanted anything else in the file.
- [ ] Scope row 22's "done when" mentions team members fetching a copy; this spec makes it the student only, and row 23 adds the team. Reword row 22 now that this spec is written.
- [ ] Spec 0002 AC-13 and its milestone 4 note are replaced by this spec; spec 0001's "report PDF is made in the browser" line needs a pointer here.
- [ ] Decide the Cloudflare plan before the 30 Oct launch: Workers Paid (about $5 a month) or accept 40 to 75 copies a day.
- [ ] Create the API token (`Browser Rendering - Edit` only), a signing secret, and set the settings on dev and production. Do not paste the token or secret into chat.
- [ ] Check the site's Bot Fight Mode and security rules do not challenge Browser Run (milestone 1 proves it and has the fallback).
- [ ] Row 15 (export and erasure) must delete `reportFiles` rows and their stored files.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
