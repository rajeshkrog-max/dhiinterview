# Verify: Google profile picture across the screens · spec 0011 · updated 2026-10-10
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This first batch covers milestone M1 (the thin thread). Later milestones append their own steps._

Setup for the live steps: on the Convex DEV deployment run `pnpm exec convex env set PROFILE_PICTURE_ENABLED true`, set `profilePicture: true` in your local `public/dhiinterviews/js/funnel-config.js` (do not commit it), then serve the built site with the recipe in memory (`wrangler pages dev dist --port 4321 --binding CONVEX_SITE_URL=<dev site>`). Use a real Google account that has a profile photo.

## UI / manual
- [ ] New student: sign in with Google, tick the v4 consent (it shows the picture line), finish the form, finish the check, open the report → the heading shows the Google photo in a 64px circle, and the image address is `/api/avatar/<22 characters>` on the site's own host, not a Google host (open DevTools, Network)   → AC-1, AC-3, AC-8
- [ ] Reload the report within an hour → the picture loads from cache with no new Convex call (response has `Cache-Control: public, max-age=600`; the edge copy keeps 3000 seconds, so a Remove is gone within an hour)   → AC-8
- [x] Same account with no photo, or sign in with an email test account → initials circle at the same size, no layout jump   → AC-3, AC-14
- [x] Block the image request (DevTools, block `/api/avatar/*`) and reload → initials show, no broken image icon   → AC-3
- [x] Open the image address in a private window (no sign in) → image shows; change one character of the key → 404 with the plain "Not found" body   → AC-8
- [x] Set `profilePicture: false` (or remove it) and reload → the report heading is exactly as before, no circle   → AC-16
- [ ] Change the photo in your Google account, sign out, sign in with Google again, open the report → after a few seconds the new photo appears without a reload; the old image address now gives 404   → AC-6, AC-8
- [ ] Source of values (picture address): the stored address is the one on the signed in account, never one typed in a request; with `PROFILE_PICTURE_ENABLED` off nothing is fetched (Convex dashboard, logs show no `avatars.sync`)   → AC-10, AC-16

## Commands
- [x] `pnpm exec tsc --noEmit` → no errors   → all
- [x] `pnpm test` → all suites pass (507 on 2026-10-10, including `convex/avatars.test.ts`, `convex/avatarCore.test.ts`, `tests/avatar.test.js`, `tests/avatar-forwarder.test.js`)   → AC-1, 2, 6, 7, 8, 10, 11, 14, 15, 16
- [x] `pnpm build` → completes; `grep -r googleusercontent dist` finds nothing   → AC-11
- [x] `curl -s -o /dev/null -w "%{http_code}" https://<dev site>/api/avatar/AAAAAAAAAAAAAAAAAAAAAA` with the switch off → 404   → AC-16
- [x] `curl -sI https://<dev site>/api/avatar/<a real key>` → `x-content-type-options: nosniff`, `x-robots-tag: noindex`, `content-security-policy: default-src 'none'; sandbox`, `etag`, `cache-control: public, max-age=3600`, no `set-cookie`   → AC-8

## Value sourcing rows (M1)
- [ ] `avatars.ensure` address → change the account image (Google sign in) and confirm the fetch uses the new address; confirm a look alike host is never fetched (unit tests cover; spot check the dev logs)   → AC-7, AC-10
- [ ] `avatars.sync` sized address → the request goes to `...=s192-c` (dev log or stubbed test)   → AC-7
- [ ] `me` / `ensure` whether a sync is due → fresh picture is not due; due again after 7 days (change the clock or the row's `checkedAt` on dev)   → AC-6
- [ ] image type, size, hash → upload nothing: an HTML file named .jpg, a 300 KB image and a slow server are refused (unit tests cover)   → AC-7
- [ ] the key → new key whenever the image changes; same image keeps its key   → AC-8
- [ ] `students.me` picture.url → present only when agreed, not removed, not blocked, file stored, switch on   → AC-1, AC-9, AC-16
- [ ] feature switches → server `PROFILE_PICTURE_ENABLED` and browser `profilePicture` must both be on to see anything   → AC-16

## M2 (first part): the one time notice and the report heading
- [ ] Existing student (agreed to v1 to v3, finished check): open the report with the switch on → a card "Show your Google picture?" sits under the heading, with the picture line and a "Read the full notice" toggle; initials circle shows meanwhile   → AC-2, AC-3
- [ ] Tap "I agree, show my picture" → "Thank you" for a few seconds, then within about 10 seconds the Google photo replaces the initials, no reload; the dev `consents` table has exactly one new `landing` row with `textVersion` v4   → AC-1, AC-2
- [ ] Tap it again, or open the report on a second device → no second consent row, no second notice   → AC-2
- [ ] Under 18 student: "I agree" without the tick → the kind message and no row; with the tick → ok and the row has `guardianPresent` true   → AC-2
- [ ] "Not now" → the card goes, initials stay, the report works; reload → no card; the card returns only after 14 days (set `pictureNoticeDeclinedAt` back on dev to check)   → AC-2
- [ ] Narrow phone width (360px) and desktop: one 64px circle, the DhiRise label, the name, class and date, the style pill and the trophy; no overlap, no jump when the photo loads   → AC-14

## M2 (finished): the student's own screens
Modes: the default mode has `PICTURE_CONSENT_REQUIRED` unset; the asked mode has it set to `true`.
- [x] Landing, signed in with a profile: a 64px circle (photo or initials) sits above "Continue as"   → AC-3, AC-14
- [x] Done page, "See your result": a 40px circle sits above "{Name}, here is your start."   → AC-3
- [x] Who page: a 40px circle sits at the left of the top bar beside the name; no overlap at 360px   → AC-3, AC-14
- [x] Challenge page: a 40px circle sits top right of the header   → AC-3
- [x] Leaderboard, joined: the "you" card shows rank, then the circle, then "You"   → AC-3
- [x] Question pages and the meet page: no circle anywhere   → AC-5
- [x] `profilePicture: false` in `funnel-config.js`: all pages above are exactly as before, no circle   → AC-16
- [x] Block `/api/avatar/*` in DevTools and reload each page: initials show, no broken image icon   → AC-3
- [ ] Fresh sign in, stay on the landing: the first picture is fetched without opening the report and shows after about 10 seconds   → AC-6
- [ ] Asked mode, existing student on the landing: the notice appears under "Not you"; Agree and Not now behave as on the report   → AC-2
- [x] Default mode: no notice on the landing or the report   → AC-2

## Backend catch-up (M2)
- [x] `pnpm exec vitest run convex/avatars.test.ts` → passes, including trimmed and case insensitive settings and the later switch to the asked mode   → AC-1, AC-8, AC-16
- [ ] With a picture stored, set `PICTURE_CONSENT_REQUIRED=true` → its `/api/avatar/<key>` answers 404 at once; after the student's next `ensure` the stored file is gone   → AC-8

## Value sourcing rows (M2)
- [ ] Circle initials → from the signed in student's name; a name that starts with an emoji shows the person shape   → AC-3
- [ ] Circle picture path → from `students.me.picture` and kept in memory only; `localStorage` holds no `/api/avatar/` string   → AC-10

## M4 (built): Remove, Restore, the team block and the privacy page
Run in either mode. Commands that need an email use the student's own address.
- [x] `pnpm exec vitest run convex/avatars.test.ts tests/picture-control.test.js tests/privacy-page.test.js` → passes   → AC-9, AC-15
- [x] Report page, signed in with a stored picture: a "Your picture" row sits just above the footer with "Your picture is shown across DhiRise." and a "Remove my picture" button   → AC-9
- [x] Tap "Remove my picture": nothing is removed yet; the confirm text names the one hour browser copies and the report copies and share links already made; "Keep my picture" has the focus and puts the row back   → AC-9
- [x] Tap "Yes, remove my picture": "Done. Your picture is removed." shows, initials appear on the report heading at once, and the row now offers "Use my Google picture"   → AC-9
- [ ] After a Remove, open `/api/avatar/<the old key>` in a private window → 404; reload the report, landing, done, who and challenge pages → initials everywhere, and no fetch to Google is made (DevTools network)   → AC-9, AC-1
- [ ] After a Remove, sign out and sign in again with Google, and wait over a week of clock (set `checkedAt` back on dev) → the picture stays off   → AC-9
- [ ] Tap "Use my Google picture": the button shows as busy, "Getting your picture…" shows for about 6 seconds, then the photo appears with a different `/api/avatar/<key>` than before the Remove   → AC-9
- [ ] Restore twice more within an hour, then a fourth Remove and Restore → the fourth does not fetch straight away (3 an hour); the next page load fetches it   → AC-9
- [ ] Asked mode, a student who has not agreed: no picture row on the report (only the notice)   → AC-2, AC-9
- [ ] `profilePicture: false` in `funnel-config.js`: no picture row on the report   → AC-16
- [x] Saved PDF copy (the render page): no picture row   → AC-9
- [x] `npx convex run avatars:adminBlock '{"email":"<student>"}'` → `{ ok: true }`; the picture goes from every screen, its key answers 404, and the student's report shows no picture row   → AC-9
- [x] After a block, the student's Restore (before the row hides, via a second tab) answers `blocked` and clears nothing   → AC-9
- [x] `npx convex run avatars:adminUnblock '{"email":"<student>"}'` → the student's next page load fetches a new picture with a new key, unless they had removed it   → AC-9
- [x] An email nobody has → `{ ok: false }` for both team commands, and no row is written   → AC-9
- [x] Privacy page: section 5 "Your Google profile picture" names who sees it, how to remove it, the one hour browser copies, the saved copies and links that may keep what they drew, and the early copy note; sections 6 to 9 follow it in order; reads well at 360px   → AC-15

## Value sourcing rows (M4)
- [ ] `pictureControl` → from `students.me.picture` and `students.me.pictureRemoved` (removed and not blocked); the row is hidden when either the feature is off, nothing is stored, the student has not agreed, or the team blocked it   → AC-9
- [ ] Restore's fetch address → the signed in account's `image` at that moment (never sent by the page); its new key → made in `restore` and again when the fetch lands   → AC-9, AC-10
- [ ] The team commands' student → found by the email given (trimmed, lower case) in `students`; no browser can call them   → AC-9, AC-10

## M3 (built): the other places
Not built here: the public shared report banner (spec 0010 is not built). Run in either mode.
- [x] `pnpm exec vitest run convex/avatars.test.ts convex/reportCopy.test.ts convex/team.test.ts tests/avatar-places.test.js tests/team-surface.test.js tests/render-boot.test.js` → passes   → AC-4, AC-5, AC-13, AC-17
- [ ] Open a report on a deployed preview as a student with a stored picture, wait for the saved copy, and download the PDF → the heading shows the 64px picture beside the name (not the DhiRise mark), and the PDF opens without a network image   → AC-4
- [ ] Same for a student with no picture → the PDF looks as before (the DhiRise mark in the heading), no empty circle   → AC-4
- [x] Make a copy while `/api/avatar/<key>` is slow or blocked (DevTools throttling on the render page, or a key that answers 404) → the copy is still made, with the initial in the circle, and the job takes about 3 seconds longer, not more   → AC-17
- [ ] A brand new student whose first fetch has not landed asks for the copy straight away → the copy is made with no circle and no error (the privacy page already says so)   → AC-17
- [ ] Remove the picture, then make a new copy → no picture in the new copy; the old saved copy keeps what it drew (said on the privacy page and in the confirm text)   → AC-9, AC-4
- [x] Team list (`team.html`) as a team member → each row has a 28px circle (picture or initial) before the name, no layout jump when pictures load, and the list still shows no phone, email, score or flag   → AC-4
- [ ] Team viewer (`team-report.html?s=<code>`) → a 40px circle with the name and class sits above the PDF; if the lookup fails the PDF still opens   → AC-4
- [ ] Open the browser console on both team pages → no content security policy error, and the Network tab shows the picture coming from the site's own `/api/avatar/<key>` only   → AC-13
- [ ] A student the team blocked, or who removed the picture → their team row and viewer show the initial   → AC-4, AC-9
- [x] Leaderboard with the demo rows (today's mock) → every row keeps its owl, no circle   → AC-5
- [ ] With the live board (row 12) and `LEADERBOARD_PICTURES_ENABLED` unset → rows carry `avatar: null`; set to `true` → a row of a student who agreed shows a 28px circle in the list and a 40px one on the podium; removed or blocked students keep the owl   → AC-4
- [ ] Question pages, the Founding Card image, the shared story picture, the Sheet and analytics → no picture anywhere   → AC-5

## Value sourcing rows (M3)
- [ ] PDF copy `profile.avatar`, team row `avatar` and leaderboard row `avatar` → each from `pictureFor` in `convex/avatarState.ts` (the same rule as `students.me`); the leaderboard also needs `LEADERBOARD_PICTURES_ENABLED`   → AC-4
- [ ] Viewer header (name, class, picture) → the one row `/api/team/list?ref=<code>` answers for that code   → AC-4
- [ ] Circle initials in these places → the first letter of the name in the row or payload (the first name only in the PDF copy)   → AC-4, AC-14

## M5 (browser tests): the circle on each own screen
Fake accounts have no Google photo, so these specs show the initial for real and give the page a picture path through the one seam `DhiSession.picture()`, with `/api/avatar/*` answered by the test. The server half is in `convex/avatars.test.ts`.
- [x] `pnpm exec playwright test e2e/picture.spec.ts` → 34 pass: landing welcome back, report heading (64px), done, who, challenge and leaderboard "you" card (40px) each show the initial in a fixed box   → AC-3, AC-14
- [x] Same screens with a stored picture → one same origin `<img>` with empty alt, `no-referrer`, fixed width and height, really loaded, no motion, no request to a Google host   → AC-3, AC-14, AC-1
- [x] Same screens when the image answers 404 → the circle turns into the initial, no broken image, same size   → AC-3
- [x] A picture that lands after the page drew, then a Remove → initial, picture, initial, and the circle keeps its size and place inside its parent   → AC-3, AC-9, AC-14
- [x] `DHI_FUNNEL.profilePicture` false → no circle and no picture request on any of the six screens   → AC-16
- [x] Question pages and the meet page → no circle and no picture request   → AC-5
- [x] `pnpm test:e2e` → all 135 pass (the older specs now accept the clean address, read the consent version and line count from `convex/consentText.ts`, and expect the 9 section privacy page)   → AC-15
- [ ] A real Google account on a phone and a laptop: sign in, see the real photo on all six screens, Remove, Restore, and the PDF copy   → AC-1 to AC-17

## Acceptance-criteria coverage
- Covered in M3 (all but the public banner): AC-4 (PDF copy, team list and viewer, leaderboard row contract), AC-5 (the demo rows and the pages that carry none), AC-13 (team policy unchanged), AC-17 (the 3 second wait).
- Covered in M4: AC-9 (Remove, Restore, block, unblock, removedAt authoritative), AC-15 (privacy page section; the v4 words still need your approval).
- Covered in M1: AC-1 (agreement, newest consent), AC-2 for new students (v4 only), AC-3 (own report heading only so far), AC-6 (sign in refresh and weekly check, lease, limits), AC-7, AC-8, AC-10, AC-11, AC-15 (consent v4 and its test), AC-16.
- Covered in M2: AC-2 (existing student notice, report and landing), AC-3 (every own screen), AC-6 (first fetch from the landing), AC-14 on the own screens.
- Not yet built: the public shared report banner of AC-4 (waits for spec 0010), AC-12 erase (row 15).
