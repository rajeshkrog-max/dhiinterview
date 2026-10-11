# Scope: DhiRise live app

Turn the DhiRise student funnel (a finished frontend that keeps everything in the browser) into a live app: real sign in, real storage, a copy of the data in the team's Google Sheet, product analytics, and a working Founding Circle Challenge. For students from Class 8 to college in India, many under 18.

**Build approach:** Tracer Bullet (vertical slices, each built end to end through every layer, working). Prove one thin real thread first (sign in, save an answer, read it back), then thicken one strand at a time. (basis: tracer bullet practice, a thin end to end path first)
**Workflow:** GA (after develop: `/check verify`, `/test`, a fresh model `/check review`, then `/document`). The project default level of rigor, chosen because the app holds sign in and personal data of minors. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· Beta`) to do more or less. (basis: your `AGENTS.md` rules on sensitive data and parent consent)

**Data for now:** the challenge side runs on demo rows only (leaderboard, referral counts, admin lists). Sign in, checks, leads, reports and the Sheet copy stay real, as built. Rows 10 to 13 (live referrals and leaderboard) were left out of the first pass; on 2026-10-11 you asked for them to be designed (spec [0015](../specs/0015-live-challenge/index.md)), and the demo rows get replaced when they are built. The challenge ends 2026-10-30 23:59 IST, so build rows 10 to 12 first; row 13 is needed only after the deadline. (your calls, 2026-10-09 and 2026-10-11)

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Student funnel screens (landing to report) | Existing | existing |
| B | Challenge screens on a mock data layer | Existing | existing |
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Data model | Foundation | in-progress |
| 3 | Coding standards & tooling | Foundation | planned |
| 19 | Live smoke test and fixes | Prototype pass | planned |
| 20 | Site layout, root address and 404 | Prototype pass | in-progress |
| 21 | About page | Prototype pass | planned |
| 18 | Privacy page and grievance contact | Prototype pass | in-progress |
| 24 | Leaderboard on every screen size | Prototype pass | planned |
| 27 | Browser tests run clean | Prototype pass | planned |
| 29 | Funnel screens use our own fonts | Prototype pass | planned |
| 31 | Prize amount changed to up to ₹5,000 | Student polish | in-progress |
| 32 | Share buttons that really send the report | Student polish | in-progress |
| 30 | Google profile picture shown across the screens | Student polish | in-progress |
| 33 | Faster images and a blur fade between them | Student polish | in-progress |
| 4 | Real sign in and saved check | Slice 1 | in-progress |
| 5 | Leads and feedback saved | Slice 2 | in-progress |
| 6 | Results and report from saved data | Slice 2 | done |
| 7 | Sheet copy | Slice 3 | in-progress |
| 8 | Product analytics with consent | Slice 3 | planned |
| 9 | Error monitoring and alerts | Slice 3 | in-progress |
| 22 | Report copy saved when seen, with Download | Report copies | in-progress |
| 23 | Team link to the saved report, in the admin view and the Sheet | Report copies | in-progress |
| 25 | Privacy notice names Cloudflare Browser Run | Report copies | in-progress |
| 28 | Team list keeps its order when copies are replaced | Report copies | in-progress |
| 26 | Ship what is built to production | Go live | planned |
| 10 | Live referral codes and tracking | Slice 4 | in-progress |
| 11 | Challenge join with parent consent | Slice 4 | in-progress |
| 12 | Live leaderboard | Slice 4 | in-progress |
| 13 | Winner review tools | Slice 4 | in-progress |
| 14 | Team admin view | Slice 5 | in-progress |
| 15 | Data export and deletion | Slice 5 | in-progress |
| 16 | Share previews and SEO | Launch readiness | in-progress |
| 17 | Accessibility pass | Launch readiness | planned |

## Already built (for context)

### A. Student funnel screens (landing to report) · existing
The 18 question flow, reveal, teaser, "Who you are" story and full report with the Founding Card. Complete as screens; data lives only in the browser and "Continue with Gmail" is a stub. code in `landing.html`, `question*.html`, `done.html`, `who.html`, `report-student.html`, `js/`

### B. Challenge screens on a mock data layer · existing
`challenge.html`, `leaderboard.html`, `terms.html` and the report invite. The screens are complete; every read and write goes through `js/api.js`, which is a localStorage mock with demo rows. The live behavior is rows 10 to 13. code in `js/api.js`, `js/challenge*.js`, `js/leaderboard.js`

## Foundations

### 1. Stack & architecture · in-progress
Decide how data is stored, how sign in works, where the app is hosted, how the existing static pages are served, and how analytics and the sheet copy connect. Record it so every later slice builds on one answer.
**Done when:** the stack is recorded in a spec, the existing pages are served by it, and a deployed version boots with a health check.
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
  - [x] Astro static site on pnpm, the 11 funnel pages served from it with the same addresses
  - [x] Convex project created and linked, `_generated` types in place (dev deployment, region ap-southeast-2)
  - [x] Deployed on Cloudflare Pages by direct upload (dhirise.pages.dev), `/api/health` answers
- [x] Verify it: `/check verify stack & architecture`
- [ ] Test it: `/test stack & architecture`
- [ ] Review it (fresh model): `/check review stack & architecture`
- [ ] Document it: `/document stack & architecture`
Spec [0001](../specs/0001-adopt-astro-convex-cloudflare-stack/index.md) · code in `src/pages/`, `public/`, `convex/`, `functions/`, `astro.config.mjs`

### 2. Data model · in-progress
The core records every slice reads and writes: students, consent records (with the consent text version), checks and answers, saved results, leads, feedback, referral codes and uses, challenge entries.
**Done when:** the entities cover slices 1 to 4 without a breaking change, answers are kept as option ids, and sensitive flags are stored apart from anything public.
- [x] Design it (spec): `/architect data model` (designed as a map, not a rewrite: every table with its owning spec, what erase does, and how long it is kept, plus a test that fails when a table is not classified; a same model cross check ran and its gaps are closed)
- [ ] Build it: `/develop data model`
  - [ ] M1 The map and its guard: `convex/dataMap.ts`, `convex/dataMap.test.ts`, the `COMPONENT_DATA` list (AC-1, 3, 4)
  - [ ] M2 Tidy: the `reportViews` comment in `schema.ts` and the line in `convex/AGENTS.md` (AC-4, 5)
  - [ ] Later: the erase list from the map when row 15 is built; flip each planned table to built as it ships (AC-1, 2)
- [ ] Verify it: `/check verify data model`
- [ ] Test it: `/test data model`
- [ ] Review it (fresh model): `/check review data model`
- [ ] Document it: `/document data model`
Spec [0023](../specs/0023-data-model-map.md) · code will be in `convex/dataMap.ts`, `convex/dataMap.test.ts`, `convex/schema.ts`, `convex/AGENTS.md` · Owed: the lawyer's view on how long `consents` and `reportViews` are kept

### 3. Coding standards & tooling
Refresh `AGENTS.md` for the chosen stack, then add lint, format, type checks and a commit check from the real project.
**Done when:** root `AGENTS.md` matches the new stack, and lint, format and checks run clean.
- [ ] Capture conventions and tooling choices: `/audit`
- [ ] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`

## Prototype pass: make it work and finish the public pages
Added 2026-10-09. The site answers on the live address today (`/` already redirects to the landing page, `/api/health` is ok), but it never became a prototype you can walk through end to end. This pass checks it live, fixes it, and adds the public pages. Rows 19 and 20 come first; 21, 18 and 24 follow once row 20's shared page frame exists (24 does not need it).

### 19. Live smoke test and fixes · Alpha
Walk the whole student flow on the live address (sign in, form, 18 questions, done, who, report, challenge, leaderboard, terms) as a fresh student and on a second device, write down everything that fails, and fix it. Also closes what rows 4, 5 and 7 left open: the production check of AC-14 and their unticked test boxes.
**Done when:** a fresh student can go from the landing page to the report on the live address with no error, a second device resumes at the right place, a lead and a feedback note reach the Sheet, and the open production check from spec 0002 is ticked.
- [x] Check the live site and list what fails: `/check verify live prototype` (2026-10-09: found the live site was an old build, deployed it; then sign in, 18 answers, result, report, lead and feedback all reached production and the Sheet. Second device resume was confirmed by you, not recorded by the check. Staging alias of AC-14 not checked.)
- [ ] Fix what fails: `/debug`

### 20. Site layout, root address and 404 · in-progress
Settle how the one domain is organised: `/` sends visitors to the DhiRise interview landing page now, and stays a reserved slot so a different product (an invitation style page) can take over the root later without moving anything under `/dhiinterviews`. A shared page frame (header, footer, fonts, colours) so 404, About and Privacy look like the funnel. Any unknown address on the domain shows a friendly 404.
**Done when:** `/` and `/dhiinterviews` open the landing page; any unknown address shows the styled 404 with a link home (and answers with a 404 status); the two team pages (row 23) move into the frame without breaking the Sheet link `/dhiinterviews/team-report.html?s=`; changing what the root does is a one place change that leaves `/dhiinterviews` untouched; About, Privacy and 404 all use the same frame.
- [x] Design it (spec): `/architect site layout, root address and 404`
- [x] Build it: `/develop site layout, root address and 404`
  - [x] M1 The thin thread: the shared frame (layout, stylesheet, hosted Mukta fonts, 64px logo) and the root 404 page, proved on the built site (AC-3, 4, 5, 6, 9, 10)
  - [x] M2 The root address: one commented `/` redirect line, query string kept, the `verify:pages` script (AC-1, 2)
  - [x] M3 Privacy and terms in the frame, old stylesheet, Google Fonts links and logo handler removed (AC-5, 8, 10, 11)
  - [x] M4 The two team pages in the frame, their strict policy and tests kept (AC-7, 9, 11) (last move, droppable if risky)
  - [x] M5 Proof: source scans, contrast and layout tests, the live check on the built site with the real headers and the old links (AC-1 to 11)
- [ ] Verify it: `/check verify site layout, root address and 404`
- [ ] Test it: `/test site layout, root address and 404`
- [ ] Review it (fresh model): `/check review site layout, root address and 404`
- [ ] Document it: `/document site layout, root address and 404`
Code in `src/layouts/Frame.astro`, `src/lib/frame.ts`, `src/pages/404.astro`, `src/pages/dhiinterviews/` (privacy, terms, team, team-report), `public/dhiinterviews/css/frame.css` and `team.css`, `public/dhiinterviews/fonts/`, `public/_redirects`, `scripts/verify-pages.mjs` · Spec [0009](../specs/0009-site-frame-root-and-404/index.md) · the 404 words and the footer content are approved; About joins the footer in row 21 (add its entry to `FOOTER_LINKS`)

### 21. About page · Alpha
A short About page in the shared frame: what DhiRise is, who it is for, and who is behind it, in the same kind and plain words as the funnel. You will need to supply or approve the wording; a draft can be written for you to edit.
**Done when:** the About page opens at its own address in the shared frame, is linked from the landing page footer, and reads well on phone and desktop.
- [ ] Build it: `/develop about page` (after row 20)

### 18. Privacy page and grievance contact · in-progress · from spec 0001
A plain language privacy page for students and parents, written from the consent text in `BACKEND.md`, with a named grievance contact, in the shared frame from row 20. Google's sign in consent screen needs its address to leave test mode (which caps users at 100). (basis: India's data protection law, a named practice)
**Done when:** the page is live on the site's own address in the shared frame, is linked from the landing consent and from Google's consent screen, and says where student data is stored and who to contact.
- [x] Build it: `/develop privacy page and grievance contact` (built 2026-10-09 as a standalone page like the terms page, on an assumed spec because row 20's shared frame is not decided yet: [0007](../specs/0007-privacy-page-and-grievance-contact.md), owes ratification. Still owed from you: a named grievance person, the page's address in Google's consent screen, and a decision on what to say about where data is stored)
Code in `src/pages/dhiinterviews/privacy.astro`, the links in `landing.astro` and `done.astro`, `tests/privacy-page.test.js`, `e2e/privacy.spec.ts`

### 24. Leaderboard on every screen size · Beta
The leaderboard only has a phone layout today (no width breakpoints in `leaderboard.css`). Make the podium, the list and the sticky "you" card work on phone, tablet and desktop. Stays on demo rows.
**Done when:** at phone, tablet and desktop widths the podium and list use the space well, nothing scrolls sideways or looks stretched, the "you" card still works, and motion respects the reduced motion setting.
- [ ] Build it: `/develop leaderboard on every screen size`

### 27. Browser tests run clean · Alpha
Three older browser tests fail on a clean checkout (the Astro dev toolbar sits on top of the phone step's Submit button at phone width), and the first test of a file sometimes times out when two files start together. Found while checking row 23.
**Done when:** `pnpm test:e2e` and `pnpm test` each pass three runs in a row.
- [ ] Fix what fails: `/debug browser tests that fail on a clean checkout`

### 29. Funnel screens use our own fonts · Alpha · from spec 0009
The landing page, question pages, report and the other funnel screens still load their fonts from Google's font servers, which tells Google a student's address on every visit. Spec 0009 hosts Mukta for the frame pages; this row moves the funnel screens to hosted files too (including the heading fonts they use).
**Done when:** no funnel screen loads anything from Google's font servers, the screens look the same, and the font files carry their licence files and versioned names.
- [ ] Build it: `/develop funnel screens use our own fonts` (after row 20)

## Student polish: prize, sharing and profile picture
Added 2026-10-10, from three asks you gave in one go. Order: 31 (a copy change, quick), then 32, then 30 (the one with a privacy decision). None of them blocks row 26, but 31 changes the terms students agree to, so it should land before the 30 October launch.

### 31. Prize amount changed to up to ₹5,000 · in-progress · Alpha
The prize is "a gift hamper worth ₹2,999" today. You want it to say up to 5000. The amount is written in five places: `challenge-config.js` (`prize.title`), the challenge page, the leaderboard line, the pill in `challenge-ui.js` ("Win ₹2,999"), and section 4 of the terms. Make it one value so it cannot drift again. **Check with you first:** does "up to ₹5,000" mean the hamper is worth up to that much (words like "worth up to ₹5,000"), or is there a bigger prize or more than one winner? The terms say the top referrer wins one hamper and the prize cannot be swapped for cash, so the wording there should stay true.
**Done when:** every place a student can read the prize shows the same new amount, from one setting; the terms (section 4) match the other screens; no old ₹2,999 remains anywhere in the site or the tests.
- [x] Build it: `/develop prize amount up to 5000` (built 2026-10-10 on the reading "gift hamper worth up to ₹5,000", one hamper, one winner; no spec, it is wording. Still owed from you: confirm those words are what you meant. The static pages could not be built on this machine, see below)
- [ ] Verify it: `/check verify prize amount up to 5000`
Code in `public/dhiinterviews/js/challenge-config.js` (`prize.amount`, `prize.title`), `challenge-ui.js`, `src/lib/prize.ts`, `terms.astro`, `leaderboard.astro`, `tests/prize.test.js`; `BACKEND.md` and `INTEGRATION.md` updated · `pnpm build` is blocked on this machine by a Windows Application Control policy on the Astro native file, so the built `terms.html` and `leaderboard.html` have not been seen with the new amount yet

### 32. Share buttons that really send the report · in-progress · Beta
Make the share buttons on the report work as students expect, on WhatsApp, Instagram and Facebook. Today the Founding Card has the three buttons (`card.js`), but the report's own Share button (`report-student.js`) only uses the phone's share sheet or copies a link, and Instagram has no web link that can post for you, so the Instagram button only saves the picture and shows a hint. The honest limit: on a phone the share sheet can hand an image or a file to Instagram; on a laptop nothing can open Instagram with the report ready, so there it should save or copy and say so plainly. Decide what "send the report" means here (a link, the card picture, or the saved PDF copy from row 22), and that the sensitive parts of the report stay out of anything shared.
**Done when:** on an Android and an iPhone, tapping Share on the report reaches WhatsApp, Instagram and Facebook with the chosen thing attached or linked; where a platform cannot take it directly (a laptop, Instagram links), the student gets a clear, kind message and a working fallback (save or copy); a failed share never shows an error page; nothing from sensitive flags is in the shared text or picture.
- [x] Design it (spec): `/architect share buttons that send the report` (you chose the whole report as the public view, with a signed `/s/<code>` link, a notice, an under 18 tick, a Stop sharing switch and a 90 day end)
- [ ] Build it: `/develop share buttons that send the report`
  - [x] M1 The thin thread: the `reportShares` table, signed link code, public payload route, `/s/*` rewrite and shell, the report in public mode (AC-4, 7, 8, 11, 12, 13, 14, 15) · built 2026-10-10, pushed to dev: 648 unit tests pass, 11 browser specs pass (also against the built site with its real headers), and a real dev student's link opened in a browser that never signed in; the sharer's profile picture (or initial) is on the public banner, so spec 0011's AC-4 for the public report is met; owed: the `_headers` rules on a real Cloudflare Pages preview (only the local Pages emulation was checked), and the hosted heading fonts from row 29 (until then the page uses Mukta for headings and the card text is drawn in a fallback font); `SHARE_LINK_SECRET` stays unset on production until M2 to M4 ship, so no link can be made there yet; `consentId` is optional on the table until M2 makes the notice
  - [x] M2 The share row: notice and consent, under 18 tick, the three buttons with the link, the report's own Share button, the `publicShare` switch (AC-1, 3, 9, 10, 16, 17) · built 2026-10-11, pushed to dev: the `share` consent kind and `share-v1` notice (draft words, owed: your approval), `shares.enable` with the notice and the tick, `shares.status`, `DhiSession.share`, `js/share-flow.js` (one flow for the three buttons and the report's own Share button), `js/engine/shareText.js`; 17 browser specs pass with a pretend share sheet; owed: the real phones (M5)
  - [x] M3 The laptop fallbacks: the vendored QR maker and the QR dialog (AC-2) · built 2026-10-11: `qrcode-generator` 2.0.4 (MIT) vendored with its licence in `public/dhiinterviews/js/vendor/`, loaded only when the Instagram dialog opens; the dialog has the QR, Copy my report address and Close, and shows only the copy button if the file does not load
  - [x] M4 Safety and clean up: Stop sharing, renewal and cap, team switch off, preview picture, privacy page and approved notice words (AC-5, 6, 14, 18) · built 2026-10-11 except the approval: `shares.disable`, `shares.adminOff`, the Stop sharing line with its confirm step, the renewal and the 365 day cap (in `enable`), the old report level Share code removed, privacy page section 6 (draft words) and the stand in preview picture; owed from you: approve the notice words (`share-v1`) and the privacy section, and the artwork for the preview picture
  - [ ] M5 Proof: tests, source scans, browser tests, a live check on an Android phone and an iPhone (AC-1 to 18) · tests and browser specs are written (697 unit tests, `e2e/shared.spec.ts` 12 and `e2e/share-row.spec.ts` 17); the race under 40 readers at once was fixed and checked live on dev (AC-11); an independent review (`docs/reviews/2026-10-11-feat-report-copy-and-privacy-share-link.md`) found three problems (the mood split and quoted answers on the public page, no server switch, a picture address that outlived the link), all fixed and tested; deployed to production 2026-10-11 (commits 1774afc, 95808d9, 224319a, from this machine) and switched ON the same day by the owner: `SHARE_LINK_SECRET` is the same value on dev and production, `PUBLIC_SHARE_ENABLED=true` on both, `publicShare: true` set at deploy time only (not committed), and `dhirise.com` showed health ok, the `/s/` headers and the one 404 for a bad code (to switch off at once: unset `PUBLIC_SHARE_ENABLED` on production); owed, though it is live without them (the owner's choice): the live check on a real Android phone and iPhone on a Pages preview
- [ ] Verify it: `/check verify share buttons that send the report`
- [x] Test it: `/test share buttons that send the report` (2026-10-11: 693 unit tests pass; added the lost race and shared window tests for AC-11, and checked the window test fails without `start: 0`)
Spec [0010](../specs/0010-share-report-public-link/index.md) · code in `convex/share*.ts`, `convex/consentText.ts`, `functions/api/shared/`, `src/pages/dhiinterviews/shared.astro`, `src/lib/session.ts` (`DhiSession.share`), `public/dhiinterviews/js/` (`share-flow.js`, `shared-boot.js`, `card-image.js`, `card.js`, `report-student.js`, `engine/shareText.js`, `vendor/qrcode-generator.2.0.4.min.js`), `css/share.css`, `css/shared.css`, `public/_redirects` and `_headers`, `e2e/shared.spec.ts`, `e2e/share-row.spec.ts` · Before it ships: you approve the notice words, a lawyer checks public sharing for under 18s (leave `publicShare` off in production until then), and the privacy page gets its section · Also owed elsewhere: row 15 must delete `reportShares` rows, and row 26's legal list gets this item · Best built after row 29 (the page must not use Google's fonts)

### 30. Google profile picture shown across the screens · in-progress · GA
Take each student's Google profile picture, and only that picture (no other Google details beyond what sign in already keeps), and show it wherever the student sees themselves: the top bar, the report, the Founding Card and the challenge screens. Falls back to initials when there is no picture or it fails to load. **Decisions owed:** whether the picture may appear on the leaderboard, where other students (many under 18) see it, since today it shows only a first name plus last initial, class and style; whether the picture is copied into our own storage or loaded straight from Google (a straight load tells Google every time a student opens a screen); and the consent text, which is versioned and would need a new version plus a privacy page line. The report PDF copy (row 22) and the team page (row 23) also need a say on whether the picture appears there.
**Done when:** a signed in student sees their own Google picture at every agreed place and a clean fallback otherwise; the picture is read only at sign in and kept only as the owner decides; nobody else's picture shows anywhere the decision rules out; the consent text and privacy page say it; the data export and delete work (row 15) covers it.
- [x] Design it (spec): `/architect google profile picture across the screens` (you chose: copy into our own storage, shown wherever the student appears, consent text v4, refresh at sign in plus a weekly check when the app opens, a Remove control; not on the Founding Card or the question pages)
- [ ] Build it: `/develop google profile picture across the screens`
  - [ ] M1 The thin thread: consent v4, the `avatars` table, the safe fetch and store, the image route, `me.picture`, the helper, the report heading (AC-1, 2, 7, 8, 10, 11, 15, 16) · built, 469 unit tests pass, pushed to dev; owed: the live proof with a real Google account · code in `convex/avatar*.ts`, `functions/api/avatar/`, `public/dhiinterviews/js/avatar.js`, `src/lib/session.ts`
  - [x] M2 The student's own screens: landing, done, who, challenge, leaderboard "you" card, the one time notice for existing students, the weekly check (AC-2, 3, 6, 14) · built, 507 unit tests pass, pushed to dev; the notice shows in the asked mode only; owed: the browser look with a real Google account (M5) · code in `public/dhiinterviews/js/avatar.js` (`DhiAvatar.mine`), `gate.js`, `done.js`, `who.js`, `challenge.js`, `leaderboard.js`, `picture-notice.js`, `src/lib/session.ts`
  - [x] M3 The other places: PDF copy, team pages, leaderboard rows (behind a switch), the public report banner (AC-4, 5, 13, 17) · built, including the public report banner (done in row 32, deployed 2026-10-11 with the share link switched off): the PDF copy (render payload and the 3 second wait), the team list rows and viewer, the leaderboard row contract and drawing behind `LEADERBOARD_PICTURES_ENABLED`; 572 unit tests pass, pushed to dev; owed: the look on a deployed preview with a real account (M5), the live board waits for row 12 · code in `convex/avatarState.ts` (`pictureFor`, `leaderboardPictureFor`), `convex/reportCopy.ts`, `convex/team.ts`, `public/dhiinterviews/js/render-boot.js`, `report-student.js`, `leaderboard.js`, `api.js`, `src/lib/team.ts`, `src/pages/dhiinterviews/team*.astro`, `report-render.astro`
  - [ ] M4 Control and clean up: Remove and Restore, team block, privacy page, approved v4 words (AC-9, 12, 15) · built except two parts: Remove and Restore on the report page with the confirm step, `adminBlock` and `adminUnblock`, the privacy page section and the two spec catch up items; 540 unit tests pass, pushed to dev; owed: you approve the v4 words, and the erase of AC-12 waits for row 15 · code in `convex/avatars.ts` (`remove`, `restore`, `adminBlock`, `adminUnblock`), `convex/limits.ts` (`avatarRestore`), `public/dhiinterviews/js/picture-control.js`, `src/lib/session.ts`, `src/pages/dhiinterviews/privacy.astro`
  - [ ] M5 Proof: tests, source scans, browser tests, a live check with a real Google account (AC-1 to 17) · browser tests done: the whole `pnpm test:e2e` suite passes (135 specs), including the old specs now fixed for clean addresses, the v4 consent text and the 9 section privacy page, and the new `e2e/picture.spec.ts` (34 specs: the circle on each own screen, the fallback to the initial, a late picture and a Remove, the browser switch, and the pages with no circle); owed: the live check with a real Google account on a phone and a laptop · code in `e2e/picture.spec.ts`, `e2e/helpers.ts`
- [ ] Verify it: `/check verify google profile picture across the screens`
- [x] Test it: `/test google profile picture across the screens` · checked 2026-10-10: 592 unit tests pass, and the browser specs for the pictures (34) and the privacy page pass; every acceptance criterion that can be automated has a test; not covered: AC-12 (the erase waits for row 15), the public report banner (waits for spec 0010), and everything that needs a real Google photo (left to `/check verify`)
- [x] Review it (fresh model): `/check review google profile picture across the screens` · ran 2026-10-10 on opus, verdict Changes requested (2 major, 7 minor), findings in `docs/reviews/2026-10-10-feat-report-copy-and-privacy.md`; all findings fixed 2026-10-10 with tests (both majors and all seven minors and the five nits): the asked mode clean up now runs from the browser, the privacy page no longer claims earlier ticks cover the picture, Better Auth `/update-user` is off, no orphaned file when the swap fails, a returning photo is fetched at once, a lost photo drops the lease, the browser keeps an image 10 minutes and the edge 50 so a Remove is gone within an hour, the daily limits are sharded, the picture row keeps focus and a live status line. re-reviewed 2026-10-10 on opus: Approve with nits (0 blockers, 0 major, 2 minor, 5 nits), findings in `docs/reviews/2026-10-10-feat-report-copy-and-privacy-recheck.md`
- [x] Document it: `/document google profile picture across the screens` · changelog entry written 2026-10-10 in `CHANGELOG.md`
Spec [0011](../specs/0011-google-profile-picture/index.md) · code is in `convex/avatars*.ts`, `convex/auth.ts`, `convex/consentText.ts`, `functions/api/avatar/`, `public/dhiinterviews/js/avatar.js` and `css/avatar.css`, and the pages that show a student · Before it ships: you approve the v4 words, a lawyer checks showing a child's picture to others, `PROFILE_PICTURE_ENABLED` stays off in production until then, and leaderboard pictures stay off until the team can review them · Also owed elsewhere: row 15 deletes `avatars` rows and files, row 12 sends an optional `avatar` per row, row 26's legal list gets this item · Specs 0006, 0008 and 0010 were updated to carry the picture

### 33. Faster images and a blur fade between them · in-progress · Beta
Added 2026-10-11. Make every picture load fast and change softly. Today the 18 question backgrounds are PNG files of 1.5 to 2.1 MB each (about 30 MB in all, `public/dhiinterviews/assets/interview bg/`), and the page script swaps the next one in with a hard cut (`js/questions.js`), so a phone on mobile data waits on every question. The plan: resize and recompress the pictures into small modern formats, load the next question's picture before the student taps Next, show a small blurred stand in that sharpens into the real picture, and when one picture changes to another (question to question, and the report, story and card screens) fade through a blur instead of a hard cut, with plain quick swaps when the student asks for reduced motion. Pairs with row 29 (own fonts): both are about what loads and from where.
**Where the files live is the decision.** My recommendation is to keep them on Cloudflare Pages, not move them to R2. The slowness is the file size, not the location: Pages already serves from Cloudflare's edge near the student, so the same big file from R2 would load no faster, and R2 would add a second address to set up (public access or a custom domain, cache rules, the content security policy, a deploy step to upload) for no gain. Shrinking the files does most of the work (roughly 30 MB down to a few MB). Your bucket `dhi-interviews` is empty today and has public access off; it stays ready for later, where it fits better: large files that change without a deploy, or files people add. If you still want R2 now, say so and the spec will design it that way.
**Done when:** no question background is more than about 200 KB on a phone; on a normal connection the next question's picture is already loaded when the student taps Next; a change from one picture to another is a blur fade, and with reduced motion it is a quick plain swap; the screens look the same as today; no screen loads a picture from a third party; and the spec records the host choice (Pages or R2) with the sizes and timings behind it.
- [x] Design it (spec): `/architect faster images and a blur fade between them` (you chose: stay on Pages, WebP in two widths, question backgrounds only, versioned names kept a year, tiny blurred stand in, preload the next picture, browser page transition at 0.4 seconds and 12px; a same model cross check ran and its gaps are closed in the spec)
- [ ] Build it: `/develop faster images and a blur fade between them`
  - [ ] M1 The thin thread: the make script, originals moved out of the served folder, Q1 as two WebP files with the stand in, the `_headers` rule, proved on the built site with a throttled load (AC-1, 2, 4)
  - [ ] M2 All 18 questions and the loading ahead: every question page and `meet` on the picture layer, old `interview bg` addresses gone, next picture preload with the data saver check (AC-1, 2, 3, 4, 5)
  - [ ] M3 The fade between pages: `fade.css`, the named picture layer, the render wait, reduced motion off switch, then the other funnel pages (AC-6, 7, 9)
  - [ ] M4 Slides inside a page and clean up: the story slides in `js/who.js`, tests, notes in `AGENTS.md` files (AC-8, 9, 10, 11)
- [ ] Verify it: `/check verify faster images and a blur fade between them`
- [ ] Test it: `/test faster images and a blur fade between them`
Spec [0012](../specs/0012-faster-images-and-blur-fade.md) · code will be in `tools/prepare_question_backgrounds.py`, `public/dhiinterviews/assets/interview-bg/`, `css/question-bg.css`, `css/fade.css`, `js/question-bg-map.js`, `js/questions.js`, `question*.astro`, `meet.astro`, `public/_headers` · Owed: the iPhone look (Safari) on the real phone check; the report slides, card pictures, hero and prize PNGs are left for a later row


### 4. Real sign in and saved check · in-progress
A student signs in with Google, their name, age, class and consent are stored, and each answer is saved as they go. They can close the tab, come back on another device and resume. This is the walking skeleton: real sign in, real storage, real screens, narrow.
**Done when:** a new student can sign in, answer questions, refresh or switch device and resume at the same question; a wrong or repeated sign in does not start a second check.
- [x] Design it (spec): `/architect real sign in and saved check`
- [ ] Build it: `/develop real sign in and saved check`
  - [x] M1 The thin thread: tables, `me`, `createProfile`, `saveAnswers`, the browser bridge and guard, one question page saving and resuming on a second browser (AC-1, 2, 3, 4, 5, 6, 7, 9, 16)
  - [x] M2 The real landing page and the full check: Google button with notice, the form states, every page on the guard, offline queue, sign in problems (AC-1, 2, 3, 4, 5, 7, 12, 15)
  - [ ] M3 Safety and clean up: sign out and cache wipe, import of old browser answers, the purge cron, production refuses test sign in (AC-8, 10, 11, 14) · built; the production check of AC-14 is still open (spec task 13)
  - [ ] M4 Report PDF, after row 6: file table, upload and download route, the PDF made in the browser (AC-13) · now planned as row 22
- [ ] Verify it: `/check verify real sign in and saved check`
- [ ] Test it: `/test real sign in and saved check`
- [ ] Review it (fresh model): `/check review real sign in and saved check`
- [ ] Document it: `/document real sign in and saved check`
Spec [0002](../specs/0002-google-sign-in-and-saved-check/index.md) · code in `convex/` (students, checks, helpers, purge, crons, consentText), `src/lib/session.ts`, `src/components/Guard.astro`, `public/dhiinterviews/js/gate.js`, `js/engine/store.js`

## Slice 2: leads, feedback and results

### 5. Leads and feedback saved · in-progress
The mobile number and WhatsApp opt in from `done.html`, and the report feedback, are stored for real, with checks on what is accepted and limits on abuse.
**Done when:** a valid lead and a valid feedback note are stored once each; a bad phone number, a rating out of range, or a flood of posts is refused; empty config no longer silently keeps data only in the browser.
- [x] Design it (spec): `/architect leads and feedback saved`
- [x] Build it: `/develop leads and feedback saved`
  - [x] M1 The lead thread: tables, rate limiter, `leads.submit`, `me` additions, the phone step on `done.html` waiting for the server (AC-1, 2, 3, 4, 5, 6, 11, 12, 14)
  - [x] M2 The feedback thread and the report gate: `feedback.submit`, the shared note rules, the report feedback card, `who.html` and `report-student.html` sending students with no lead back (AC-7, 8, 9, 10, 11, 12)
  - [x] M3 Clean up: remove the browser post to the Sheet and its settings and local keys (AC-13)
- [x] Verify it: `/check verify leads and feedback saved`
- [ ] Test it: `/test leads and feedback saved`
- [ ] Review it (fresh model): `/check review leads and feedback saved`
- [ ] Document it: `/document leads and feedback saved`
Spec [0003](../specs/0003-leads-and-feedback-saved/index.md) · code in `convex/` (leads, feedback, feedbackRules, limits, consentText, schema, students), `src/lib/session.ts`, `src/pages/dhiinterviews/done.astro`, `public/dhiinterviews/js/done.js`, `js/report-student.js`, `js/who.js`, `js/engine/store.js`

### 6. Results and report from saved data · done
Keep the scored result with the version of the scoring that made it, and load the report from saved data, so it looks the same on any device and later changes to scoring do not rewrite old results. The saved report copy and the Download button are row 22, not this row.
**Done when:** the report opens from saved data on a second device with the same score, style and flags; the scoring version is stored with each result.
- [x] Design it (spec): `/architect results and report from saved data`
- [x] Build it: `/develop results and report from saved data`
  - [x] M1 The thin thread: prove Convex can run `score.js`, the `results` and `resultFlags` tables, `complete` saving the result, `mine` and `ensure`, the report reading it on a second browser (AC-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14)
  - [x] M2 Every other screen and the Finish message: done, who, card and the style label read the saved result, device copy wipe, the try again message, `REPORT_VERSION` (AC-3, 6, 7, 10, 12, 13)
  - [x] M3 Lock it and prove it: the locked scoring test, concurrency, auth and flag isolation tests, a check on an older student (AC-1, 4, 5, 7, 8, 9, 10, 11, 13, 14) (built and passing; the older student check on dev is done, see `verify.md`)
- [x] Verify it: `/check verify results and report from saved data`
- [x] Test it: `/test results and report from saved data`
- [x] Review it (fresh model): `/check review results and report from saved data`
- [x] Document it: `/document results and report from saved data`
Spec [0005](../specs/0005-results-and-report-from-saved-data/index.md) · code in `convex/` (schema, checks, results, resultsCore, scoring, score.lock.test), `src/lib/session.ts`, `public/dhiinterviews/js/` (report-student, done, who, card, api), `public/dhiinterviews/js/engine/` (score, store, reportText, screen), `tests/fixtures/score-lock.json`, `e2e/results.spec.ts`

## Slice 3: team copy and tracking

### 7. Sheet copy · in-progress
The database stays the source of truth. Leads and feedback are copied into the team's Google Sheet, with retries, so a sheet failure never loses data and a gap can be refilled.
**Done when:** every new lead and feedback row appears in the sheet shortly after saving; a failed copy is retried and visible; a full refill from the database is possible.
- [x] Design it (spec): `/architect sheet copy`
- [x] Build it: `/develop sheet copy` (built in the same pass as row 5, interleaved: row 5 lead thread, then M1 here, then row 5 feedback thread, then M2 here, then both clean ups)
  - [x] M1 A lead reaches the Sheet: queue tables, Google module, lead row builder, the copy job with its lease and cron, `leads.submit` queuing, status tab (AC-1, 2, 3, 4, 7, 10, 11, 12, 13, 14) · proven on dev against the real Sheet on 2026-10-08
  - [x] M2 Feedback, rebuild and housekeeping: feedback tab and queuing, delete, retry failed, refill, CSV export, the daily change check (AC-1, 4, 5, 6, 8, 9, 10, 11)
  - [x] M3 Clean up: remove the Apps Script receiver, rewrite the setup note, confirm per deployment Sheets and no keys in the repo (AC-13, 15)
  - [x] M4 Keep team notes beside their students (found by `/check verify`): `prune` replaces `clear` with the guards, a dry run, a status line, and delete removes every copy of a row (AC-5, 9, 14, 16)
- [ ] Verify it: `/check verify sheet copy`
- [ ] Test it: `/test sheet copy`
- [ ] Review it (fresh model): `/check review sheet copy`
- [ ] Document it: `/document sheet copy`
Spec [0004](../specs/0004-sheet-copy-of-leads-and-feedback/index.md) · code in `convex/` (sheetSync, sheetRows, sheetRowsCore, sheetFlush, sheetFlushCore with `runPrune`, sheetsGoogle, sheetAdmin, crons), `tools/LEAD-SHEET-SETUP.md`

### 8. Product analytics with consent · needs a decision
Measure drop off per step, lead conversion, referral growth and report feedback quality, only after the student has made an analytics choice. Many are under 18, so tracking waits for consent. (basis: India's data protection law on children's data, a named practice)
**Done when:** events cover each funnel step and the referral steps; nothing is sent before the analytics choice; no names, phone numbers or sensitive flags go into events.
- [ ] Design it (spec): `/architect product analytics with consent`

### 9. Error monitoring and alerts · in-progress
Know when sign in, saving or the sheet copy breaks, before students tell you.
**Done when:** a forced failure in sign in, saving and the sheet copy each raises an alert to the team; student personal data is kept out of error reports.
- [x] Design it (spec): `/architect error monitoring and alerts` (you chose PostHog, built in another session: our own small reporters send errors to a new PostHog EU project, on by default for everyone with no personal data in a report; alerts to a Slack or Discord channel; works on the free Convex plan; a same model cross check ran and its gaps are closed)
- [ ] Build it: `/develop error monitoring and alerts`
  - [ ] M1 The thin thread: `redact`, the forwarder, `js/errors.js` on one page, the PostHog EU project and first alert (AC-1, 2, 3, 6, 7)
  - [ ] M2 Every page and forwarder: `errors.js` everywhere it belongs, 5xx reports from the forwarders, settings and environment values (AC-1, 5, 8)
  - [ ] M3 The health check: `monitor.claim`, `report`, `check`, the heartbeat and the `/api/health` 503 (AC-4, 11, 12)
  - [ ] M4 Words and setup: privacy page section, `tools/MONITORING.md`, the outside ping, the `AGENTS.md` line (AC-7, 10, 11)
  - [ ] M5 Proof: tests and the three forced failures on dev ending in an alert (AC-9)
- [ ] Verify it: `/check verify error monitoring and alerts`
- [ ] Test it: `/test error monitoring and alerts`
- [ ] Review it (fresh model): `/check review error monitoring and alerts`
- [ ] Document it: `/document error monitoring and alerts`
Spec [0021](../specs/0021-error-monitoring-and-alerts.md) · code will be in `public/dhiinterviews/js/errors.js`, `functions/api/report-error.ts`, `functions/api/_lib/report.ts`, `convex/monitor.ts`, `convex/redact.ts`, `convex/health.ts`, `tools/MONITORING.md` · Owed: the lawyer check (monitoring by default for minors), your PostHog EU project and team channel, approval of the privacy words

## Report copies: saved when seen, linked for the team
Added 2026-10-09. Needs row 6 (saved results with a report version) first. Row 22 is the same work as milestone 4 of row 4 (spec 0002, AC-13), now with its own row so it is not lost.

### 22. Report copy saved when seen, with Download · in-progress
When a student opens their report, the server makes one PDF copy of it with Cloudflare Browser Run, from our own report page and the saved data (nothing is uploaded from the phone), and keeps it. The copy looks as the student saw it, except the parts that come from sensitive flags (replaced only when a newer report version exists). The report gets a Download button that gives that same PDF. Saving never blocks or slows the report.
**Done when:** opening the report saves one copy even if the student never taps Download; reopening does not make duplicates; the Download button gives a PDF of that same report; a failed save never stops the report from showing; only the student can fetch a copy (the team gets access in row 23).
- [x] Design it (spec): `/architect report copy saved when seen, with download` (builds on spec [0002](../specs/0002-google-sign-in-and-saved-check/index.md) AC-13, which this replaces)
- [x] Build it: `/develop report copy saved when seen, with download`
  - [x] M1 The thin thread: `reportFiles` table, `request` and `status`, the signed token, the payload and file routes with their Pages forwarders, a bare render page, and the job proving Browser Run can open our live page (AC-1, 2, 4, 8, 9, 10, 11) _proven live on 2026-10-09 (dev plus a Pages preview, no WAF rule needed)_
  - [x] M2 The real report on paper: the print mode of `report-student.js`, the Founding Card as an image, print styles (AC-5, 13) _checked on a real Browser Run copy on 2026-10-09_
  - [x] M3 The Download button: `DhiSession.reportCopy`, the request after the report draws, button states, the print fallback (AC-1, 6, 7)
  - [x] M4 Safety and clean up: retries, lease, the minute job and daily budget, replace on a newer version, the sweep, tests, pointers in specs 0001, 0002 and 0005 (AC-3, 7, 10, 11, 12, 13)
- [ ] Verify it: `/check verify report copy saved when seen, with download`
- [x] Test it: `/test report copy saved when seen, with download`
- [ ] Review it (fresh model): `/check review report copy saved when seen, with download`
- [ ] Document it: `/document report copy saved when seen, with download`
Code in `convex/report*.ts`, `functions/api/files`, `functions/api/render`, `src/pages/dhiinterviews/report-render.astro`, `public/dhiinterviews/js/render-boot.js` and `report-download.js` · Spec [0006](../specs/0006-report-copy-saved-when-seen/index.md) · runs on the Cloudflare Workers Free plan for roughly 150 to 200 copies a day (one request every 10 seconds, 10 minutes of browser time a day), so a paid plan is needed for launch volume; needs three new Convex settings (see the spec's Follow up)

### 23. Team link to the saved report, in the admin view and the Sheet · in-progress
A private team page (named Google accounts only, as you chose) lists students whose report was seen, each with a link that opens the frozen copy in the same look. The same link goes into the Sheet row for that student, filled in once the report is seen. This starts the team sign in that row 14 widens later.
**Done when:** a signed in team member opens a student's saved report from the admin list and from the Sheet link; a signed out visitor or a non team account is refused; a student who has not seen their report shows an empty link; the Sheet link appears shortly after the report is first seen.
- [x] Design it (spec): `/architect team link to the saved report` (after rows 22, 7)
- [ ] Build it: `/develop team link to the saved report`
  - [x] M1 The thin thread: the `TEAM_EMAILS` gate, the Pages forwarder and headers, `reportViews` and the PDF route with its hourly limit, the viewer page with Google sign in (AC-3, 4, 5, 6, 7, 9, 10)
  - [x] M2 The list: the list route and page, Load more, the reference code box (AC-1, 2, 7, 10)
  - [x] M3 The Sheet link: column N filled from the saved copy, queued again when a copy is first ready, refill for older copies (AC-8)
  - [x] M4 The notice: privacy page sentence and consent text v3, after you approve the words (AC-11)
  - [ ] M5 Proof: tests for the gate, limit and audit, browser tests, a live check that the Sheet cell is clickable (AC-1 to 10)
- [ ] Verify it: `/check verify team link to the saved report`
- [x] Test it: `/test team link to the saved report`
- [x] Review it (fresh model): `/check review team link to the saved report`
- [ ] Document it: `/document team link to the saved report`
Code in `convex/team*.ts`, `functions/api/team`, `src/lib/team.ts`, `src/pages/dhiinterviews/team*.astro`, `public/dhiinterviews/css/team.css` and `convex/sheetRows*.ts` · Spec [0008](../specs/0008-team-link-to-saved-report/index.md) · needs the `TEAM_EMAILS` setting on each deployment (the consent v3 wording is approved and built) · M5 still owes the live check that the Sheet cell is clickable, because dev has no Sheet

### 25. Privacy notice names Cloudflare Browser Run · in-progress · from spec 0006
The report copy (row 22) sends a student's report data to Cloudflare Browser Run to draw the PDF. Students, many under 18, and their parents should be told, in the consent text and the privacy page. Consent text is versioned, so this is a new text version; you supplied the wording.
**Done when:** the consent text and the privacy page (row 18) name Cloudflare Browser Run as a service that handles report data, a new consent text version is live, and it ships before real students open the report copy.
_Reconciled 2026-10-09: built. Consent v2 names Cloudflare Browser Run (v1 frozen), the privacy page names it in section 3, and the current consent is now v3 (it also names the team access, row 23; v1 and v2 stay frozen, and new students can only agree under the current text). Only shipping to production is left, in row 26._
- [x] Design it (spec): skipped on purpose, you approved the wording in chat and it was built inside specs [0006](../specs/0006-report-copy-saved-when-seen/index.md), [0007](../specs/0007-privacy-page-and-grievance-contact.md) and [0008](../specs/0008-team-link-to-saved-report/index.md)
- [x] Ship it to production: done in row 26 (consent v3 and the privacy page are live on dhirise.com)

### 28. Team list keeps its order when copies are replaced · in-progress · from the review of spec 0008
The team list pages by the time a copy was made, and that time moves when a copy is replaced (a report version change replaces every copy over days), so Load more can skip or repeat a student. Also the spec's AC-4 still says the fake test sign in skips Google's verified check on dev, but the code now allows that only for fake `@example.com` addresses.
**Done when:** Load more never skips or repeats a student when a copy is replaced between clicks (the code box already finds anyone); spec 0008's words match the narrower dev rule.
- [x] Design it (spec): `/architect team list order and gate wording` (you chose: order and show the date a student's first copy became ready, which never changes; spec 0008's wording was corrected in the same pass; a same model cross check ran and its gaps are closed)
- [ ] Build it: `/develop team list order and gate wording`
  - [ ] M1 The date is written, not yet read: `firstCopyAt` and its index, set in `attach`, the repeatable backfill, run on dev (AC-5)
  - [ ] M2 Switch the list: list by `firstCopyAt`, `madeAt` kept one release as deprecated, the Refresh message for old cursors, paging on empty pages, tests (AC-1, 2, 3, 4, 7)
  - [ ] M3 Proof and ship: push M1, run the backfill with your consent, push M2, on dev then production (AC-5)
- [ ] Verify it: `/check verify team list order and gate wording`
- [ ] Test it: `/test team list order and gate wording`
- [ ] Review it (fresh model): `/check review team list order and gate wording`
- [ ] Document it: `/document team list order and gate wording`
Spec [0013](../specs/0013-team-list-stable-order.md) · code will be in `convex/schema.ts`, `convex/reportCopy.ts`, `convex/team.ts`, `src/lib/team.ts`, `convex/team.test.ts`, `e2e/team.spec.ts` · spec [0008](../specs/0008-team-link-to-saved-report/index.md) was corrected · a later release drops the deprecated `madeAt` field and the `by_readyAt` index

## Go live: ship what is built

### 26. Ship what is built to production · Alpha
Rows 4, 7, 22, 23 and 25 are built and checked on dev but each waits on production: settings, a real Sheet, a real report copy and the Google consent screen. Deploy Convex first, then Pages, set what each row needs, and run the checks dev could not show. Launch is planned for 30 October.
**Done when:** production runs the current code and settings (`TEAM_EMAILS`, the report copy settings, the Sheet settings, consent v3); `sheetAdmin:refill` has run once; the team link in column N is clickable in the real Sheet; a real report copy is made and the team opens it; the open production checks of rows 4 (AC-14), 7, 22 and 23 are ticked.
Owner decisions this row needs (from the specs' follow ups): move Google's consent screen from Testing to Production, and add each team member as a test user until then · Cloudflare Workers Paid (about 5 dollars a month) or accept 40 to 75 report copies a day · the paid Convex plan, backups and export · who owns the Sheet and who may see it · a named grievance contact on the privacy page · the legal check on a guardian tick and a required phone number for under 18s under the Data Protection Act · which Convex region, recorded in the privacy page.
- [x] Deploy and set production settings: `pnpm run deploy:pages` (done 2026-10-09: Convex production `abundant-caiman-975` and the Pages project `dhirise`, from commit 302b5ea; `TEAM_EMAILS` set to `subs.dhi@gmail.com`; still to do by you: the Google owner items above, and `sheetAdmin:refill` once for the Sheet links, which I did not run because it writes to the real Sheet)
- [x] Deploy the picture release (done 2026-10-10: you ran the Convex deploy and `wrangler pages deploy` for commit e6333e6 from your side, because Smart App Control blocked the site build on the usual machine; I then checked `https://dhirise.com`: `/api/health` ok, an unknown `/api/avatar/<key>` answers 404 with `no-store`, the new picture scripts and privacy section 5 are live. All three picture switches are unset on production, so the picture is ON for everyone, nobody is asked, and leaderboard pictures are off, as you chose. I ran `sheetAdmin:refill` once with `--prod` (it started; the result in the real Sheet, and column N being clickable, are not confirmed yet))
- [ ] Check it live: `/check verify ship what is built to production`

## Slice 4: the challenge goes live

### 10. Live referral codes and tracking · in-progress
Replace the mock in `js/api.js` with real codes and uses. A referral counts only when the friend is new, used the code at sign in, finished all 18 questions, reached the report and left real feedback. No self referrals.
**Done when:** the ten test scenarios in `BACKEND.md` section 15 pass against the real service; a wrong code never blocks sign in; the rules are enforced on the server, not the browser; an imported check never counts and a feedback note counts only when it is genuine.
- [x] Design it (spec): `/architect live referral codes and tracking` (child [0016](../specs/0015-live-challenge/0016-referral-codes-and-tracking.md) of the live challenge umbrella; a same model cross check ran and its gaps are closed; you kept the BACKEND.md section 8 rules, and chose the 5 minute job to decide validity, no device marker for now, and a genuine note may replace a weak one)
- [ ] Build it: `/develop live referral codes and tracking`
  - [x] M1 The thin thread (shared with row 11): tables, `challengeRules.ts`, `CHALLENGE_LIVE`, a pending referral at profile creation, `feedback.genuineAt`, the job's settle and recount (AC-3, 5, 7) · built 2026-10-11, pushed to dev only (`CHALLENGE_LIVE=true` on dev; unset on production): 763 unit tests pass and `e2e/challenge.spec.ts` (3 specs) passes against dev with two fake test accounts: join, the friend signs up through the landing form with the code, finishes, sees the report, leaves a genuine note, and after the job the referrer's count goes from 0 valid, 1 pending to 1 valid, 0 pending; owed: the same with two real Google accounts
  - [x] M2 Checks and edges: the public code check route with its limit, code rules, the weak note replacement, deadline rejection, scenarios 1 to 9 (AC-1, 2, 4, 6, 8, 9, 10) · built 2026-10-11, pushed to dev only: `GET /api/referral/validate` (`convex/referral.ts`, `referralHttp.ts`, the Pages forwarder `functions/api/referral/`, 28 a minute for each visitor), the landing hint now real ("Invited by <name>" or "a friend", no self answer), a genuine note replaces a weak one before the deadline and queues the Sheet row again; scenarios 1 to 9 and 11 are tests named by number; 808 unit tests pass; owed: the forwarder on a real Pages preview (the site cannot be built on this machine), the line "An invite counts when you are new to DhiRise" is draft words you approve
- [ ] Verify it: `/check verify live referral codes and tracking`
- [ ] Test it: `/test live referral codes and tracking`
- [ ] Review it (fresh model): `/check review live referral codes and tracking`
- [ ] Document it: `/document live referral codes and tracking`
Spec [0015](../specs/0015-live-challenge/index.md) (umbrella) · code in `convex/challengeRules.ts`, `challengeCore.ts`, `challengeBoard.ts`, `students.ts`, `feedback.ts`, `src/lib/session.ts`, `js/api.js`, `js/gate.js`, `convex/referral.ts`, `convex/referralHttp.ts`, `functions/api/referral/`, `e2e/challenge.spec.ts` · the words and the lawyer check are owed before the switch `CHALLENGE_LIVE` is turned on

### 11. Challenge join with parent consent · in-progress
Joining the challenge records the student's rules acceptance and, for under 18s, a parent or guardian's consent, with proof kept.
**Done when:** a student under 18 cannot join without the consent step; the consent text version and time are stored; an adult joins without it.
- [x] Design it (spec): `/architect challenge join with parent consent` (child [0017](../specs/0015-live-challenge/0017-challenge-join-with-parent-consent.md); the guardian is a tick recorded as a `challenge` consent; hide my name and a leave function are in)
- [ ] Build it: `/develop challenge join with parent consent`
  - [x] M1 The thin thread: `challenge.join` for an adult, the `challenge` consent and `challenge-v1` text, the switch, the bridge for join and `me` (AC-1, 3, 4) · built 2026-10-11 with the shared M1 above; `join` already checks the rules tick, the parent tick under 18, a finished check and the 5 an hour limit (so M2 is mostly the join form words, hide my name and leave); the `challenge-v1` words are a draft you approve
  - [x] M2 The rest: the rules and parent ticks, no result check, rate limit, hide my name, leave, the join form (AC-2, 5, 6, 7, 8, 9) · built 2026-10-11, pushed to dev only: `setHideName` and `leave` (leave keeps the consent and the referral rows; joining again gives a new code and counts the valid referrals already earned), the join form on `challenge.html` shows the `challenge-v1` words, the rules, parent and hide my name ticks, and after joining a hide my name switch and a two tap Leave; the privacy and terms lines for the challenge are still not written (you approve the words first)
- [ ] Verify it: `/check verify challenge join with parent consent`
- [ ] Test it: `/test challenge join with parent consent`
- [ ] Review it (fresh model): `/check review challenge join with parent consent`
- [ ] Document it: `/document challenge join with parent consent`
Spec [0015](../specs/0015-live-challenge/index.md) (umbrella) · code in `convex/challenge.ts`, `convex/consentText.ts`, `src/lib/session.ts`, `js/challenge.js` (the spec's `js/done.js` `#join` is the phone step, not the challenge; the challenge form is on `challenge.html`, so it needs no change there) · the `challenge-v1` words are a draft you approve

### 12. Live leaderboard · in-progress
The podium and ranks 4 to 50 from real data, showing only first name plus last initial, class and style. Refreshes every few minutes and freezes at the end date.
**Done when:** ranks match valid referral counts; no email, phone, age or flags ever appear in the response; after the end date it stops changing.
- [x] Design it (spec): `/architect live leaderboard` (child [0018](../specs/0015-live-challenge/0018-live-leaderboard.md); a 5 minute job writes ranks and one snapshot, signed in students only, first name and last initial or Anonymous with no class, frozen at the deadline)
- [x] Build it: `/develop live leaderboard` (built 2026-10-11, pushed to dev only; `CHALLENGE_LIVE` stays unset on production)
  - [x] M1 Ranking and the snapshot: `rowFor`, the job's rank step, `challenge.leaderboard`, the cron (AC-1, 2, 3) · `rowFor` is the one function that builds a public row (rank, displayName, cls, style, valid, avatar); the order is more valid referrals, then the earlier last valid time, then the earlier join, then creation order, so it is total; the `leaderboardSnapshots` table and the indexes `by_validCount` and `by_rank` are added (additive); a student with no valid referral is not ranked
  - [x] M2 Freeze and own rank: the final run, the removal for erase and leave, `rank`/`toNext`/`nextRank` on `me` (AC-4, 5, 7) · the first run that began after 23:59 on 30 October settles from the stored step times, writes the final board with `frozen: true`, and later runs do nothing; `dropEntry` takes a student who leaves off the board at once (before or after the freeze) and closes the ranks up without re-ranking from live counts; hiding or showing a name also changes the board at once; the erase request (spec 0014) must call `dropEntry`
  - [x] M3 The page: `js/leaderboard.js` and `js/api.js` on the bridge, demo rows removed, "Challenge ended", then pictures behind their switch (AC-6, 8, 9, 10) · `DhiSession.challenge.leaderboard`, the footer line uses `computedAt` and says "Final board" once frozen, the page keeps polling until the server says final; all twelve scenarios of BACKEND.md section 15 are tests (10 and 12 in `convex/challengeBoard.test.ts`); 888 unit tests pass; `e2e/leaderboard.spec.ts` passes against dev; owed: real Google accounts, a real picture on the board; the words "Your first valid friend puts you on the board.", "No one is on the board yet. The first friend to finish counts." and "Challenge ended" were approved by the owner on 2026-10-11
- [ ] Verify it: `/check verify live leaderboard`
- [ ] Test it: `/test live leaderboard`
- [ ] Review it (fresh model): `/check review live leaderboard`
- [ ] Document it: `/document live leaderboard`
Spec [0015](../specs/0015-live-challenge/index.md) (umbrella) · code in `convex/challengeBoard.ts`, `convex/challengeCore.ts`, `convex/challenge.ts`, `convex/schema.ts`, `src/lib/session.ts`, `js/leaderboard.js`, `js/api.js`, `e2e/leaderboard.spec.ts`, `convex/challengeBoard.test.ts`

### 13. Winner review tools · in-progress
A private screen to review the top 10 referrers by hand (their valid and pending referrals) before a winner is announced.
**Done when:** a team member can open the top 10, inspect each referral's checks, mark one as removed with a reason, and the leaderboard reflects it.
- [x] Design it (spec): `/architect winner review tools` (child [0019](../specs/0015-live-challenge/0019-winner-review-tools.md); checked terminal commands and a CSV, not a screen, built last since it is needed only after 30 October)
- [x] Build it: `/develop winner review tools` (built 2026-10-11, pushed to dev only; the deadline in code is unchanged)
  - [x] M1 Read side: `top10`, `ranking`, the CSV and the warnings (AC-1, 2, 4) · all internal, so `npx convex run` only; the warnings are `burst` (more than 5 sign ups in one hour), `same_text` and `fast_finish` (under 3 minutes from the first answer); `tools/winner-csv.mjs` writes the real file because the CLI prints a string as JSON; a cell that would run as a spreadsheet formula is made safe
  - [x] M2 Change side and the procedure: `reject`, `restore`, `tools/WINNER-REVIEW.md`, tests (AC-3, 5, 6, 7) · `reject` and `restore` count the referrer again through `recount` and keep the words and time on the referral; `restore` settles the referral itself at once (the job does nothing once the board is frozen); 62 unit tests for rows 12 and 13 together with `e2e/leaderboard.spec.ts` (top 10, the CSV, a reject and a restore on dev); the public board does not change after the freeze, so the winner is the first line of `challengeAdmin:ranking`
- [ ] Verify it: `/check verify winner review tools`
- [ ] Test it: `/test winner review tools`
- [ ] Review it (fresh model): `/check review winner review tools`
- [ ] Document it: `/document winner review tools`
Spec [0015](../specs/0015-live-challenge/index.md) (umbrella) · code in `convex/challengeAdmin.ts`, `convex/challengeAdminCore.ts`, `tools/WINNER-REVIEW.md`, `tools/winner-csv.mjs`, `convex/challengeAdmin.test.ts`, `tests/winner-review.test.js`, `e2e/leaderboard.spec.ts` · the procedure is for the owner to read before 30 October

## Slice 5: team tools and privacy

### 14. Team admin view · in-progress
A private screen for the team to see leads, feedback and referral counts without opening the sheet, with access limited to named team members.
**Done when:** only signed in team members can open it; it lists leads, feedback and referral totals; phone numbers are shown only to the roles that need them. (Row 23 builds the team sign in and the report list first; this row widens it into roles, audits who reads phone numbers and decides whether browsing the list is audited, and replaces the hand edits to the WhatsApp status.)
- [x] Design it (spec): `/architect team admin view` (you chose: two levels, team and phone viewers; totals, students, leads, feedback and challenge screens; WhatsApp status, block picture and switch off share link as phone viewer actions; everything audited including browsing; a same model cross check ran and its gaps are closed, with a lower reveal cap and an Access log added)
- [ ] Build it: `/develop team admin view`
  - [ ] M1 The thin thread: `TEAM_PHONE_EMAILS`, `phoneGate`, `teamAudit`, POST through the forwarder, the Leads tab with an audited Reveal (AC-1, 2, 3, 9, 13)
  - [ ] M2 The other tabs and audit on reads: Totals and its hourly job, Feedback, the audited Students list, the reference code box (AC-4, 5, 6, 9)
  - [ ] M3 The actions: WhatsApp status with the Sheet queue, picture block, share off, limits (AC-7, 8, 12)
  - [ ] M4 Access log, retention and words: the panel, the 2 year sweep, `tools/TEAM-ACCESS.md`, consent and privacy lines (AC-10, 11, 14)
  - [ ] M5 Proof: tests and a live check on dev with two accounts (AC-15)
  - [ ] Later with row 12: the Challenge tab and challenge totals once spec 0015's tables exist (AC-1, 4, 9)
- [ ] Verify it: `/check verify team admin view`
- [ ] Test it: `/test team admin view`
- [ ] Review it (fresh model): `/check review team admin view`
- [ ] Document it: `/document team admin view`
Spec [0022](../specs/0022-team-admin-view.md) · code will be in `convex/team*.ts`, `convex/teamAudit.ts`, `convex/limits.ts`, `convex/leads.ts`, `convex/feedback.ts`, `convex/avatars.ts`, `convex/shares.ts`, `functions/api/team/`, `src/lib/team.ts`, `src/pages/dhiinterviews/team.astro`, `tools/TEAM-ACCESS.md` · Owed: who is on `TEAM_PHONE_EMAILS`, your approval of the consent and privacy lines, the lawyer check on the team reading children's phone numbers

### 15. Data export and deletion · in-progress
A student, or a parent, can ask for their data to be exported or erased, and the erase reaches the database, the sheet copy and analytics. (basis: India's data protection law on correction and erasure, a named practice)
**Done when:** a request produces a complete export or a full erase across every store, including the saved report PDF and its record, the sign in account and the Sheet rows; erased students no longer appear on the leaderboard or in the sheet. What stays by your decision (spec 0014): the consent proof, the team's access log (`reportViews`, ids and a team email only), a receipt of the erase, and a 30 day hashed email block after a student's own erase; no code deletes the consent or access log rows.
- [x] Design it (spec): `/architect data export and deletion` (you chose: a Your data page for students, parents by email to the team with a two fact check, immediate erase after a clear confirm, a readable file plus the PDF for export, flags left out of a parent's export, and a 30 day email block for a student's own erase; a same model cross check ran and its gaps are closed)
- [ ] Build it: `/develop data export and deletion`
  - [ ] M1 The thin thread: `erasures` and `erasedEmails` tables, `eraseMine` for the core rows, the Your data page with Delete, the wipe of the browser copy, the updated source scan (AC-2, 4, 6, 11)
  - [ ] M2 Everything else erased: leads, feedback, report copy and file, picture and file, share, Sheet delete queue, sign in rows, late jobs, the 30 day block and the daily sweep (AC-2, 3, 5, 7, 10)
  - [ ] M3 Export and team commands: `exportMine`, the download button, `adminExport` and `adminErase` with the two fact check, `tools/DATA-REQUESTS.md` (AC-1, 8, 9, 12)
  - [ ] M4 Words and links: privacy page section, footer and report links, the Your data wording (draft, you approve) (AC-11, 14)
  - [ ] M5 Proof: tests, browser specs, a live check on dev with a real Google account, a production dry run (AC-1 to 14)
- [ ] Verify it: `/check verify data export and deletion`
- [ ] Test it: `/test data export and deletion`
- [ ] Review it (fresh model): `/check review data export and deletion`
- [ ] Document it: `/document data export and deletion`
Spec [0014](../specs/0014-data-export-and-erasure/index.md) · code will be in `convex/dataRights.ts`, `convex/schema.ts`, `convex/students.ts`, `convex/crons.ts`, `src/pages/dhiinterviews/your-data.astro`, `src/lib/session.ts`, `tools/DATA-REQUESTS.md` · Owed: the lawyer check (under 18s erasing alone, keeping consent proof, the block, the 3 year receipts), your approval of the words, and `ERASURE_HASH_SECRET` set on each deployment · Specs 0006, 0008, 0010 and 0011 point here for their owed erase work

## Launch readiness

### 16. Share previews and SEO · in-progress · Beta
Proper titles, descriptions and share images for the landing page and referral links, so WhatsApp and social previews look right. (basis: Open Graph protocol)
**Done when:** the landing page and a `?ref=` link show the right title, description and image in WhatsApp, Instagram and Facebook previews; the landing page has metadata and a sitemap entry.
- [x] Design it (spec): `/architect share previews and SEO` (you chose: list only the landing, privacy and terms pages, your own 1200 by 630 artwork with the stand in until it arrives, and one invitation preview for every ?ref= link; a same model cross check ran and its gaps are closed, including dropping the /s/ block from robots.txt)
- [ ] Build it: `/develop share previews and SEO`
  - [ ] M1 The thin thread: `src/lib/site.ts`, the full tag set on the landing page, the stand in picture under a versioned name (AC-1, 5, 6)
  - [ ] M2 The other pages and the files: `Frame.astro` props for privacy and terms, noindex in `Guard.astro`, the `pages.dev` rule in `_headers`, `robots.txt`, `sitemap.xml` (AC-2, 3, 4, 7)
  - [ ] M3 Proof: the `tests/` file over `dist/`, the added `verify:pages` checks, the live checks on Facebook's debugger and a real phone (AC-8, 9)
- [ ] Verify it: `/check verify share previews and SEO`
- [ ] Test it: `/test share previews and SEO`
Spec [0020](../specs/0020-share-previews-and-seo.md) · code will be in `src/lib/site.ts`, `src/layouts/Frame.astro`, `src/components/Guard.astro`, `src/pages/dhiinterviews/landing.astro`, `public/robots.txt`, `public/sitemap.xml`, `public/_headers` · Owed from you: the 1200 by 630 artwork (under 300 KB) and approval of the draft words

### 17. Accessibility pass · Beta
Check keyboard use, focus, contrast and reduced motion across the funnel and the challenge against WCAG 2.2 AA, and fix what fails. (basis: WCAG 2.2 AA)
**Done when:** every screen can be used with a keyboard alone, text meets contrast, focus is visible, and motion respects the reduced motion setting.
- [ ] Build it: `/develop accessibility pass`

## Deferred
Out of scope for this pass, kept so the plan stays honest.
- **WhatsApp welcome message**: send a welcome to students who opt in, through the business messaging service · needs a decision
- **Two way sheet sync**: edits in the sheet flowing back to the database · needs a decision
- **Real peer percentages**: replace the seeded "X% of students chose this" numbers with real totals · needs a decision
- **Regional languages**: the funnel in Hindi and other languages · needs a decision
- **Deliberate rescore tool**: add a new result for a student under newer scoring while keeping the old one (from spec 0005) · needs a decision
- **Retire the legacy interviewer tool**: remove `index.html`, `panel.html`, `report.html`, `result.html`, their scripts and `backup-before-parent-report/`

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` after `/develop`; `Alpha` after `/check verify`; `Beta` and `GA` after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned`, `in-progress`, `done`, plus `existing` (before the workflow) and `dropped` (de scoped, kept for history).
- **Workflow tier tag** beside a heading (e.g. `· Beta`) sets that one feature's rigor above or below the project default; no tag inherits the default (GA).
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.

## References

**Project sources**
- Root `AGENTS.md` (rules on sensitive data, parent consent, and what the funnel must never load)
- `BACKEND.md` and `INTEGRATION.md` (flow, payloads, challenge rules, the ten test scenarios in section 15)
- `js/api.js` (the mock data layer and its `// BACKEND:` notes)

**Practices & standards**
- Tracer bullets, a thin end to end path first (from The Pragmatic Programmer)
- Foundations before features, and the data model is the costliest thing to redo
- India's Digital Personal Data Protection Act, 2023, on children's data, parental consent, correction and erasure

**Links** (web verified only)
- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [The Open Graph protocol](https://ogp.me/)
- Not verified, so no link: the Digital Personal Data Protection Act, 2023 (the official PDF would not load) and the tracer bullets page
