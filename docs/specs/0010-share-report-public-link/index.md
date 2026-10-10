# 0010. Share buttons that send the report, with a public link

**Date**: 2026-10-10
**Status**: In Progress

## Summary

The three share buttons under the Founding Card (WhatsApp, Instagram, Facebook) now send the card picture together with a private link that opens the student's whole report, read only, for anyone who has it. The link is a long signed address (`/s/<code>`) that the student can turn off at any time and that stops by itself after 90 days. Before the first share the student sees a short notice and agrees; a student under 18 must also tick that a parent or guardian has been asked. On a laptop, where Instagram cannot take a post from a web page, the Instagram button saves the picture, explains how to post it, and shows a QR code that opens the student's own report on their phone, where the real share sheet works. The public page never shows the sensitive notes, age, class, email, phone or last name. A deploy time switch hides the whole link feature until the legal check is done.

## Requirements

**User stories**:
- As a student, I want to tap WhatsApp, Instagram or Facebook and send my card picture with a link to my report, so my friends can see it.
- As a student, I want to switch my link off, so I can take my report back.
- As a friend with the link, I want to read the report on my phone without signing in.
- As a parent, I want to know what is shared and that it can be stopped.
- As the team, I want to be able to switch a link off after a complaint.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: On a phone that can share files, each of the three buttons opens the share sheet with the Founding Card story picture and a text that holds the student's public link. The Instagram button shares the picture and copies the link, with a toast that says so.
- **AC-2**: Where files cannot be shared (a laptop), WhatsApp opens its link with text that holds the public link and the picture is saved; Facebook opens its sharer with the public link; Instagram saves the picture, shows how to post it, and shows a dialog with a QR code that opens the student's own report page when scanned by their phone, a "Copy my report address" button and a Close button. If the QR file does not load, only the copy button shows. The dialog says the phone may ask to sign in first.
- **AC-3**: Before the first link is made, the student sees the share notice. A student under 18 also sees a required tick box ("I have checked with a parent or guardian") and cannot continue without it. "Not now" makes no link and records nothing. "Share" records a consent row (kind `share`, the notice version and hash, the student's age, `guardianPresent` equal to the tick) and makes the link. The dialog then says the link is ready and the student taps the platform button again (the first tap's permission to open a share sheet is spent on the agreement). The notice shows again only when its version changes; turning the link off and on does not ask again.
- **AC-4**: `/s/<code>` opens, for anyone and without sign in, the full report read only, with the Founding Card on top. It shows the first name and, if the student has one (spec 0011), their profile picture drawn from `/api/avatar/<key>`, with initials otherwise. It shows no class, age, email, phone or last name, no text that comes from a sensitive flag, no feedback box, no Download, no join card, no blurred week teasers and no week tick boxes. It carries `noindex`.
- **AC-5**: The student can stop sharing from a control under the share row, with a confirm step ("Anyone who has the link will no longer see your report"). After that the link shows the same "off or ended" page as any bad link. Sharing again makes a new link; the old one stays dead.
- **AC-6**: A link ends 90 days after the last explicit Share tap, and never later than 365 days after it was made. Tapping Share while the link is active moves the end date to 90 days from that tap (capped) and keeps the same link. Opening the page, reading the status or copying the link does not extend it. Tapping Share after it ended, or after the cap, makes a new link (new generation, `createdAt` reset, `offAt` cleared, `consentId` set to the latest share consent).
- **AC-7**: An unknown, altered, off, ended or old generation link all behave the same: the payload route answers 404 with the same body, and the page shows the "off or ended" message. Nothing tells the caller which of those it was.
- **AC-8**: Any `/s/<code>` address returns the same static page shell (a `_redirects` rewrite, status 200) with a fixed title, description and DhiRise brand picture for link previews. `og:image` is an absolute address on our own domain; `og:url` is not set and no tag holds the code. `/_headers` gives `/s/*` `noindex`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The shell holds no student data.
- **AC-9**: A failure to make the link (offline, rate limit, server error, switch off) never stops the picture from being shared. The student sees "We could not add your report link, so only your card was shared." and the text holds the landing page address (`new URL("landing.html", location.href)`, because `DHI_FUNNEL.shareUrl` is empty in the repo).
- **AC-10**: The report's own Share button uses the same flow as the buttons under the card.
- **AC-11**: Making or renewing a link is limited to 20 an hour for each student, counted before the consent check. Reading a public link is limited to 600 a minute for each link (keyed by the share id after the signature checks), and bad codes share one global bucket of 600 a minute that never creates a key per code. Above a limit the answer is 429 and the page asks the visitor to wait.
- **AC-12**: No flag, flag text, class, age, email, phone or last name can appear in the public payload. A test scans the payload builder and fails if it reads the flags table or those fields.
- **AC-13**: The public page loads nothing from a third party (no Google Fonts, no analytics, no outside images or scripts), sets no cookie and uses no `localStorage` or `sessionStorage`. Its headings use hosted fonts only.
- **AC-14**: A student can only make, renew or switch off their own link; no function takes a student id from the request. The team can switch a student's link off with an internal function.
- **AC-15**: A report version change never breaks a link. The public page draws the report with the words of the current page build, whatever `REPORT_VERSION` says, and no link state depends on a version.
- **AC-16**: A student whose check is not finished gets no link: `shares.status` says `ready: false`, the share row sends only the picture and the landing address, and no notice is shown.
- **AC-17**: When `DHI_FUNNEL.publicShare` is not `true` (a deploy time value), no notice, link or Stop sharing control appears, and the share row sends the picture and the landing address as it does today.
- **AC-18**: The Stop sharing control shows only while a link is active, under the share row on the report page. Its text is "Your link is on until 12 January 2027 (India time). Stop sharing" with the date written like that; on the last day it says "Your link ends today". After it is off the row shows "Sharing is off. Tap a button to make a new link."

## Decision

**Chosen option**: Option B: a signed private link that opens a read only report page, drawn by the existing report code in a public mode.

Add a small `reportShares` table, a signed link code that carries no secret in the database, one public read route, a static page shell served at `/s/<code>` by a rewrite, a consent step before the first link, and a rewired share row that sends the card picture with the link. Reuse the render payload rules from spec 0006 (flags removed on the server) and the report drawing of `report-student.js`, in a new public mode with its own flag.

**Implementation skills**: none installed for this area. Skill discovery was offered and declined; see Follow-up.

## Feature design

**Data model**:

`reportShares` (new, additive; one row per student, patched in place; `consents` stays append only)

| Field | Type | Notes |
|---|---|---|
| `studentId` | `id("students")` | indexed `by_studentId`; at most one row per student, found by that index |
| `checkId` | `id("checks")` | the one check; must be completed |
| `generation` | number | starts at 1; +1 each time a new link is made (turned off then on, or ended then on) |
| `consentId` | `id("consents")` | the share consent the current generation was made under |
| `createdAt` | number | when this generation started (reset on a new generation) |
| `expiresAt` | number | `min(now + 90 days, createdAt + 365 days)` at each Share tap |
| `offAt` | optional number | set by Stop sharing or by the team |

`consents.kind` gets a third value, `share`. `ConsentKind`, `CONSENT_TEXTS` and `CONSENT_KINDS` in `convex/consentText.ts` get `share` and a new frozen version `share-v1`; the phone sends `{ version, hash }` and the server stores the text in `consentTexts` if missing, as the lead step does. The under 18 tick is stored in `consents.guardianPresent`.

The link code is `<shareId>.<generation>.<signature>`. The signature is the first 16 bytes (128 bits) of HMAC SHA 256 over `<shareId>.<generation>` with `SHARE_LINK_SECRET`, written in base64url (22 characters). Convex ids hold no dots (a unit test checks this). Nothing secret is stored, and the code can always be made again for the same row. Changing the secret ends every link at once.

**State**: `none` → (first Share, agreed) → `active` (generation n) → `active` (renewed, same link) → `ended` (expiresAt passed) or `off` (Stop sharing or team) → (Share again) → `active` (generation n+1).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `shares.status` (query) | Convex | none | `{ ready, active, expiresAt, consented }` | signed in student | `not_signed_in`, `no_profile` |
| `shares.enable` (mutation) | Convex | `notice?: { version, hash }`, `guardianTick?` | `{ ok: true, code, expiresAt }` or `{ ok: false, code: "needs_consent" \| "needs_guardian" \| "rate_limited" \| "report_not_ready" }` | signed in student | `not_signed_in`, `no_profile` |
| `shares.disable` (mutation) | Convex | none | `{ ok: true }` | signed in student | `not_signed_in`, `no_profile` |
| `shares.adminOff` (internal mutation) | `npx convex run` | the student's email | `{ ok }` | the team, from a terminal | none |
| `GET /api/shared/payload` | HTTP action | header `x-share-token` | the report payload (below) | none; the code is the capability | `404 unavailable`, `429 slow_down` |
| `functions/api/shared/[[path]].ts` | Pages forwarder | header `x-share-token` | passes status and body through; GET only; no cookie in, `set-cookie` stripped out | none | `405`, `503` |
| `/s/*` | `_redirects` rewrite and `_headers` | the path | the static shell page, always 200 | none | none |

Expected refusals in `shares.enable` return `{ ok: false, code }` so the rate limit count stays, as in specs 0003 and 0006. `enable` counts the rate limit first, then checks the notice, then the tick. The HTTP action checks the signature itself, then calls an internal mutation with the share id and generation to take the rate limit and read the payload (a query cannot use the rate limiter).

The payload has the shape of the render payload of spec 0006 without the PDF copy: `{ completedAt, seed, profile: { name, avatar? }, result }` (`avatar` is the picture path of spec 0011, present only when the student agreed, has not removed it and the feature is on). It does not need a `reportFiles` row. `profile.class` is left out (the report draws `[class, date].filter(Boolean)`, so a missing class just disappears). No `wantedVersion` is sent. The result is flattened with `NO_FLAGS` and the flags table is never read. A missing result or unfinished check gives 404.

**Public mode of the report**: a new `public/dhiinterviews/js/shared-boot.js` (the counterpart of `render-boot.js`) reads the code from `location.pathname`, fetches the payload, stubs `DhiStore` and `DhiSession` fully (no `markReportSeen`, no storage), sets `window.DHI_SHARED`, and loads `report-student.js`. In that file `DHI_SHARED` hides what print mode hides (Download, join card, feedback box, teasers, week ticks) but keeps the normal animation (respecting the reduced motion setting) and skips the fonts check. The Founding Card image helper is moved out of `render-boot.js` into a file both pages load, and the existing drift test keeps them in step. The shell adds a banner ("<First name> shared this DhiRise report with you"), a "Take your own check" button to the landing page, and the "off or ended" message.

**Value sourcing** (every value names where it comes from):

| Action | Value produced or displayed | Source |
|---|---|---|
| `shares.enable` | the link code | `reportShares._id`, `generation`, signed with `SHARE_LINK_SECRET` |
| `shares.enable` | the full link shown and shared | `location.origin` of the page + `/s/` + code (not `DHI_FUNNEL.shareUrl`, which is empty in the repo) |
| `shares.enable` | `expiresAt` | server time + `SHARE_DAYS` (90), capped at `createdAt` + `SHARE_MAX_DAYS` (365), both in `shareCore.ts` |
| `shares.enable` | consent row | `students.age`; the sent `{ version, hash }` checked against `SHARE_CONSENT_VERSION` in `consentText.ts`; `guardianPresent` = the tick |
| `shares.status` | `ready` | `checks.completedAt` is set |
| `shares.status` | `consented` | a `share` consent row with the current version exists |
| Stop sharing control | the end date text | `expiresAt` in India time (`Asia/Kolkata`), written "12 January 2027"; "ends today" when it falls on the current India date |
| payload | first name | first word of `students.name` |
| payload | result, completed date, seed | `findResult(check)` flattened with `NO_FLAGS`; `checks.completedAt`; `checks.seed` |
| shared page | Founding Card picture | `result.styleKey` mapped by the same table as `render-boot.js`, first name from the payload |
| shared page banner | the sharer's name | `profile.name` of the payload |
| share row text | style name in "I'm a ..." | the saved result's style tag, as `card.js` does today |
| share row | link kept for the buttons | in memory in `DhiSession`, fetched once per page load after consent (not in `localStorage`) |
| QR code | the address it holds | `new URL("report-student.html", location.href).href` (the student's own report) |
| link preview | title, description, picture | fixed values in the shell page (`assets/` brand picture, 1200 by 630) |
| feature switch | link feature on or off | `DHI_FUNNEL.publicShare === true`, a deploy time value in `funnel-config.js` |

**Key invariants**:
- A public read needs a valid signature, a row with the same generation, no `offAt`, `expiresAt` in the future and a completed check. Any miss gives the same 404.
- The public payload is built in one function that never reads `resultFlags`, `leads`, `feedback`, email, age or class.
- One share row per student; `enable` is transactional, so a double tap or two tabs make one row and one link. A tab that holds a dead link sees the next Share make a new one.
- A consent row for a `share` version is added only under that version's kind and never edited.
- No student is ever deleted without their `reportShares` row; deleting the row ends the link at once.

**Security model**: The code is a capability: whoever has the link can read the report, nobody else. It carries 128 bits of signature, so it cannot be guessed. The shell is a static page for every code, so a preview crawler learns nothing. The payload route has no cookies and no CORS (same origin through the Pages forwarder). Owner functions find the student from the session only. The code never goes into a log line, an analytics event or the Sheet, and is passed on to Convex in a header, not in a URL. Compliance scope: India's Digital Personal Data Protection Act, 2023, on children's data; see the premise note in `rationale.md` and the Follow-up.

**Configuration required**:
- `SHARE_LINK_SECRET` (Convex, a different value on dev and production, declared in `convex/convex.config.ts`; tests set a fixed value): signs link codes.
- `publicShare: true` in `js/funnel-config.js` at deploy time (format in `funnel-config.example.js`): turns the link feature on.

**Critical test scenarios**:
- Happy path: a signed in student with a finished check agrees, gets a link, and a signed out reader opens the report with the first name and picture only, verifies **AC-3, AC-4**.
- Under 18: the notice cannot be accepted without the tick; the stored consent holds the tick, verifies **AC-3**.
- Phone share: the share sheet gets the story picture and a text with the link; Instagram also copies the link; the link comes from memory so the share runs right after the tap, verifies **AC-1**.
- Laptop: the three fallbacks and the QR dialog, including the dialog with the QR file blocked, verifies **AC-2**.
- Off, ended, cap and renewal: switch off then open gives the "off" page; share again gives a new link and the old one is still dead; an ended or capped link behaves the same; Open and status calls do not extend the date, verifies **AC-5, AC-6, AC-7**.
- Tampered code, another student's id, wrong generation, verifies **AC-7, AC-14**.
- No sensitive data: scan the payload builder and compare the payload with a student who has every flag set, verifies **AC-12**.
- Third parties and storage: load the shared page and list every request and every storage write, verifies **AC-13**.
- Rate limits: 21 enables in an hour; 601 reads of one link in a minute; many bad codes create no keys, verifies **AC-11**.
- Link failure and switch off: with the server unreachable, and with `publicShare` off, the picture still shares with the landing address, verifies **AC-9, AC-17**.
- Report version bump: change `REPORT_VERSION` and the same link still opens, verifies **AC-15**.
- Unfinished check, verifies **AC-16**. Stop sharing text, including the last day, verifies **AC-18**.
- Previews: `curl` a `/s/<anything>` address and see the tags, absolute image address, no `og:url` and the three headers, verifies **AC-8**.
- Team switch off: run `shares.adminOff` and the link answers 404, verifies **AC-14**.

## Build plan

Approach: Tracer Bullet (the project default). Prove a signed out reader can open a student's report through a link first, then add the share row, then the laptop fallbacks, then the safety rules.

1. **M1 The thin thread.** Add the `reportShares` table, `convex/shareCore.ts` (sign and verify the code, `SHARE_DAYS`, `SHARE_MAX_DAYS`), a first `shares.enable` without the notice, the internal public read mutation with its rate limits, the `GET /api/shared/payload` route, the Pages forwarder, the `_redirects` rewrite and `_headers` for `/s/*` (proving Pages applies the headers to a rewritten address), the shell page `shared.astro`, `shared-boot.js` and `DHI_SHARED` in `report-student.js`, the Founding Card helper moved out of `render-boot.js`, and `SHARE_LINK_SECRET`. Prove it on dev: a signed out browser opens the report. Satisfies **AC-4, AC-7, AC-8, AC-11, AC-12, AC-13, AC-14, AC-15**.
2. **M2 The share row.** Add `DhiSession.shareStatus`, `shareLink` and `shareOff` in `src/lib/session.ts`, with the link kept in memory and fetched once per page load; the notice dialog with the under 18 tick, the hash proof and the consent row (`share-v1`, `consents.kind` `share`); rewire the three buttons in `card.js` (file share sheet, Instagram copies the link, WhatsApp and Facebook links carry the public link); move the report's own Share button onto the same flow; the failure fallback; the `publicShare` switch; the unfinished check case. Satisfies **AC-1, AC-3, AC-9, AC-10, AC-16, AC-17**.
3. **M3 The laptop fallbacks.** Keep the QR maker as `public/dhiinterviews/js/vendor/qrcode-generator.min.js` (version and licence file named in its filename and header), the QR dialog with its copy button and its missing library case, the saved picture and hint. Satisfies **AC-2**.
4. **M4 Safety and clean up.** `shares.disable`, `shares.adminOff`, the Stop sharing control with its text and confirm step, the 90 day renewal, the 365 day cap and the ended rules with new generations, the brand preview picture, the privacy page section and the approved notice words, and removal of the old report-level Share code. Satisfies **AC-5, AC-6, AC-14, AC-18**.
5. **M5 Proof.** Convex tests for every state and refusal, source scans (flags, third parties, no code in logs, no storage), browser tests for the dialog and fallbacks, and a live check on a Pages preview with a real Android phone and an iPhone. Satisfies **AC-1 to AC-18**.

## Consequences

**Positive**:
- Sharing does what students expect: the picture and a link, in one tap after the first agreement, on the phone's own share sheet.
- Friends can read the report without signing in, which is the growth path the challenge needs.
- The student stays in control: a notice, a switch, an end date and a cap; the team can switch a link off.
- Reuses the flag removal and the report drawing already proven in spec 0006, so there is no second copy of the sensitive rules.
- The shell is a static page, so a link that spreads widely costs only the payload calls, not a Pages Function run for every page view.

**Negative / tradeoffs**:
- The whole report becomes readable by anyone with the link, including for under 18s. This was the owner's choice over the card only page (the recommended option). A tick for under 18s is weaker than a verified parent step; see the Follow-up.
- The code sits in the address path, so Cloudflare's edge logs, browser history and chat apps hold it. The fragment form (`/s#code`) would avoid the logs and was the recommended option.
- The link preview shows one fixed brand picture for everyone; a personal card in the preview would need a server made picture.
- The first time a student agrees, they tap a platform button a second time, because the first tap's permission is used by the agreement.
- Anyone who has the link can copy it onward and screenshot the report; the notice says so.
- `reportShares` rows are personal data tied to a student; the erase request (scope row 15) must delete them.
- A link opened in an in app browser (Instagram, WhatsApp) is a normal web page: it needs the public page to be light and fully hosted by us.

**Neutral**:
- One new table, three Convex functions plus one internal, one HTTP route, one forwarder, one page, one vendored file, one rewrite and two settings.
- The challenge and leaderboard share buttons (referral codes) are unchanged.
- The spec 0009 404 page and the root address are not affected: `/s/*` is handled by its own rewrite.

## Follow-up

- [ ] Changed by spec [0011](../0011-google-profile-picture/index.md): the public report banner shows the student's profile picture. The `/api/avatar/<key>` path is same origin, so AC-13 (nothing from a third party) still holds. Keep the notice and the privacy page in step with spec 0011.
- [ ] The notice words (`share-v1`) are a draft until you approve them. Draft: "When you share, DhiRise makes a private link to your report. Anyone who has the link can read your whole report and see your first name and your profile picture, and they can copy the link to others. They cannot see your age, class, email, phone number or your private notes. You can turn the link off at any time with Stop sharing, and it ends by itself after 90 days." For students under 18 the tick reads "I have checked with a parent or guardian." The privacy page needs a matching section.
- [ ] Ask a lawyer about public sharing for under 18s under the Data Protection Act 2023. It may need a parent or guardian to agree before the link is made, not only a tick. Treat this as a launch blocker: leave `publicShare` off in production until it is settled. Add it to the legal items of scope row 26.
- [ ] Scope row 15 (data export and deletion) must delete `reportShares` rows (index `by_studentId`); that also ends the link at once.
- [ ] The public page must use hosted fonts only. Spec 0009 hosts Mukta; the report's heading font (Playfair Display) is still on Google's servers until scope row 29 hosts it. Build this page after row 29, or draw its headings in a hosted fallback font first.
- [ ] Make the 1200 by 630 DhiRise brand preview picture (owner's artwork or the existing logo on the brand colour).
- [ ] Choose and pin the QR library version at build time (a small MIT licensed one, named in its file header), keep its licence file beside it.
- [ ] Agent Skill and MCP discovery was run and you declined all of it (the open graph and QR skills, and two QR MCP servers). `/audit` or `/sync` can record this in the `Declined:` line of `AGENTS.md` so nothing offers them again.
- [ ] Scope row 16 (share previews and SEO) now has a first working piece (the fixed preview on `/s/<code>`); keep the two consistent.
- [ ] Check at M1 that Cloudflare Pages applies `_headers` rules to an address rewritten by `_redirects` (status 200). If it does not, add the headers to the shell page with a meta tag and a small Pages Function.
- [ ] Decided against for now: a count of how many times a link was opened (it would track readers).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
