# Changelog

## 2026-10-11 · Private report link and share buttons that send the report (spec 0010)

Deployed to production and switched on the same day by the owner: `PUBLIC_SHARE_ENABLED=true` on the server and `publicShare: true` in the deploy time `funnel-config.js` (not committed). The lawyer check for students under 18, the preview artwork and the real phone checks were still owed when it went live. To switch it off at once, unset `PUBLIC_SHARE_ENABLED` on production.

**What students will see once it is switched on**
- The three buttons under the Founding Card, and the report's own Share button, share the card picture with a text that holds the student's own private link. The first tap shows the notice "Before you share" (words `share-v1`). A student under 18 must also tick "I have checked with a parent or guardian." The first tap makes the link and asks for a second tap, because Safari spends the tap's permission on the wait.
- A fourth round button, "Copy link", sits beside WhatsApp, Instagram and Facebook, and the report's own card has a "Copy my report link" button under "Share with a friend". Both copy the student's own private link (the first time they show the notice, then ask for a second tap). Added 2026-10-11 after a student asked: before, there was no way to copy the link.
- Every picture share on a phone now also copies the link, and the toast says "Your report link is copied too. If the app left it out, paste it with your picture." Many apps (Facebook, Instagram and others) keep only the picture from the share sheet and drop the text, so the link is always on the clipboard to paste. Before, only Instagram did this.
- On a laptop, WhatsApp opens WhatsApp Web with the link, Facebook opens its sharer with the link, and Instagram saves the picture and shows a dialog with a QR code that opens the report on a phone, plus a copy button. If the QR file does not load, the dialog shows the words and the button only.
- Under the share row a line says "Your link is on until <date> (India time)." with a Stop sharing button. Stop sharing asks first, then ends the link. Sharing again makes a new link; the old one stays dead. A link lasts 90 days from the last Share tap and never more than 365 days from when it was made.
- A stranger who opens `/s/<code>` sees the report with the Founding Card on top, the banner "<first name> shared this DhiRise report with you." and a "Take your own check" button. There is no Download, join card, feedback box, week ticks, trophy link or picture row. The sharer's picture (or first initial) shows beside the title. Only the first name, the date and the result are sent: no last name, class, age, email or phone.
- The public page draws the radar and the learning style but no mood donut and no quoted answers. Both can give away the low mood and self doubt notes, so the server does not send them (found by the review, see below). The student's own report is unchanged.
- Every link that does not work (a changed character, off, ended, an old generation, a switched off server) shows the same "This link is off or has ended" message and gives the same 404, so nothing says why.
- Privacy page: new section 6, "Your report link", and the sections are numbered 1 to 10. This is live now. Owner approval of the `share-v1` words and of section 6 was given in chat on 2026-10-11 ("I approve things as of now").

**How it works**
- New `reportShares` table (one row for each student) and `convex/shares.ts`: `enable`, `status`, `disable`, and the internal `adminOff` and `publicRead`. The code is `<shareId>.<generation>.<signature>`, signed with HMAC SHA 256 by `SHARE_LINK_SECRET`, so nothing secret is stored. A new generation gives a new code. No function takes a student id.
- `GET /api/shared/payload` (a Pages forwarder in `functions/api/shared/`) takes the code in the `x-share-token` header, never in the address. Nothing is cached or indexed. `/s/*` is rewritten to one static page with its own strict policy in `public/_headers`.
- Two settings must both be present for any link to work: `SHARE_LINK_SECRET` (set on dev and production to the same value) and `PUBLIC_SHARE_ENABLED=true` (set on dev only). With the second one off, `enable` answers `unavailable`, `status` shows no code, and every code gets the one 404. Browsers also need `publicShare: true` in `funnel-config.js`.
- New `share` consent kind with the `share-v1` notice, recorded with the student's age and the under 18 tick.
- Limits: 20 links made or renewed an hour for each student; 600 reads a minute for each link; made up codes share one bucket of 600 a minute, so a flood never makes a key for each code. Both read buckets are in 16 shards that share one clock minute. When many readers lose the race on the limit rows, the route answers 429 `slow_down` and logs one fixed line, never a 500. The cap is a little under 600 a minute and never above.
- Stop sharing and the team's switch (`npx convex run shares:adminOff '{"email":"..."}'`, add `--prod` on purpose) also give the student's picture a new address, so the picture address in an old payload stops working (an image the edge already holds can last up to 50 minutes).
- The Pages forwarder answers 502 with the private headers when it cannot reach Convex.
- The QR maker is `qrcode-generator` 2.0.4 (MIT), kept in `public/dhiinterviews/js/vendor/` with its licence and loaded only when the Instagram dialog opens.

**Review and fixes**
- An independent review (`docs/reviews/2026-10-11-feat-report-copy-and-privacy-share-link.md`, by a second model) found that the public payload still gave the sensitive notes away through the mood split and the quoted answers, that the only switch was in the browser, and that the picture address outlived the link. All three are fixed and tested. The smaller items are fixed except the two noted below.
- The first live check (40 readers at once) gave 500 errors on the limit rows. After sharding and the shared minute, 700 reads in about 11 seconds gave 599 answers then 429, another link was not affected, and 700 made up codes made one key.

**Tests**
- 697 unit tests pass. `e2e/shared.spec.ts` (12) and `e2e/share-row.spec.ts` (17) pass against the dev deployment.
- New unit tests cover the lost race, the shared window (the test fails without `start: 0`), 300 reads started together, the server switch, the stripped fields and the picture address change.

**Owed before it is switched on**
- A lawyer's check on public sharing for students under 18.
- The 1200 by 630 preview picture (a stand in logo is live).
- The live check on a real Android phone and an iPhone, and on a real Pages preview (the headers were seen on `dhirise.com`).
- To switch on: set `PUBLIC_SHARE_ENABLED=true` on production, add `publicShare: true` to `funnel-config.js` and deploy again.
- Row 15 must delete `reportShares` rows. Not done: an edge limit for anonymous reads (a Cloudflare rule per address would cap the cost of a flood), and the shell's own address `/dhiinterviews/shared` still has only `noindex`.
- Dev holds a few fake load test students and links.

## 2026-10-10 · Google profile picture across the screens (spec 0011)

**What students see**
- Each student's Google profile picture, and nothing else from their Google profile, is copied once into DhiRise's own storage at a small size and shown next to their name. It shows on the landing "Continue as" state and the report heading (64px), and on the done, who and challenge pages and the leaderboard "you" card (40px). With no picture, a picture that fails to load, or a removed one, an initial in a coloured circle of the same size shows instead. Test accounts always show the initial.
- No picture on the question pages, the meet page, the Founding Card, the Sheet copy or analytics.
- The saved PDF copy draws the picture (64px) when the student has one. The render page waits for it at most 3 seconds, then keeps the initial. A student with no picture keeps the old heading. `REPORT_VERSION` is unchanged, so existing copies are not redrawn.
- Team pages: each list row has a 28px circle, and the report viewer shows a 40px circle with the name and class above the PDF. The strict policy of those pages is unchanged.
- Leaderboard rows can carry an `avatar` (28px in the list, 40px on the podium), only while `LEADERBOARD_PICTURES_ENABLED` is on, which is off by default. Today's board has only demo rows, which keep their owls. The live board is scope row 12.
- Report page: a new "Your picture" row. "Remove my picture" asks first, and the confirm text says the picture can stay in browser copies for up to an hour and in report copies and share links already made. "Use my Google picture" brings it back with a new key.
- Privacy page: new section 5, "Your Google profile picture" (who sees it, how to remove it, what a removal cannot reach, and that a copy made very early may have no picture). Sections 6 to 9 are renumbered. Last updated 10 October 2026.

**How it works**
- New `avatars` table and `convex/avatars.ts` (`ensure`, `sync`, `apply`, `remove`, `restore`, and the internal `adminBlock` and `adminUnblock`). The only request to Google is the `sync` action: https, a `lh[0-9].googleusercontent.com` host, no redirects, a 5 second limit, a 200 KB limit, and the file type read from the first bytes. Nothing a browser can call takes an id, an email or an address.
- The picture is refreshed at each Google sign in (`overrideUserInfoOnSignIn`) and by one quiet check when the app opens after 7 days. No scheduled job. Limits: one check per student every 10 minutes, 5000 fetches a day (4000 for rechecks), and 3 restores an hour.
- `GET /api/avatar/<key>` with a Pages forwarder (`functions/api/avatar/`). The key is random and new whenever the image changes. An unknown, removed, blocked or switched off key all answer the same 404. A 200 is cached for one hour.
- Consent text v4 adds a line that names the saved picture (draft words, not yet approved by the owner).
- Owner decision, 2026-10-10: the picture is on by default and nobody is asked. `PICTURE_CONSENT_REQUIRED=true` brings back the asked flow (a one time notice, with a 14 day reminder after "Not now"). `PROFILE_PICTURE_ENABLED=false` holds the whole feature off, and `profilePicture: false` in `funnel-config.js` hides it in the browser.
- The team can take a picture off after a complaint: `npx convex run avatars:adminBlock '{"email":"..."}'`, and `avatars:adminUnblock` to clear it.

**Tests**
- 584 unit tests pass (plus one expected failure that pins a known defect, see below). `pnpm test:e2e` passes in full, with a new `e2e/picture.spec.ts` (the circle on each own screen, the fallback to the initial, a late picture and a Remove, the browser switch, the leaderboard rows) and new cases in the team and render page specs.
- Older browser specs were brought up to date: they accept the clean address (`/landing`), read the consent version and line count from `convex/consentText.ts` (v4, 8 lines), expect the 9 section privacy page, and click the phone step through the page because the Astro dev toolbar blocks a real click.

**Owed before production**
- Keep `PROFILE_PICTURE_ENABLED=false` on production until the v4 words are approved, a lawyer has checked showing a child's picture to others with no separate agreement, and the privacy wording is settled (the review found it says the sign up ticks cover the picture, which is not true for students who agreed under v1 to v3).
- Not built yet: the public shared report banner (spec 0010), live leaderboard rows (row 12) and the erase of a student's picture (row 15).
- Known defects: the Restore button is not marked busy while it waits, and the cleanup of held pictures after a switch to the asked mode never runs from a real browser (see `docs/reviews/2026-10-10-feat-report-copy-and-privacy.md`).
- Still to check by hand: a real Google account on a phone and a laptop.

## 2026-10-07 · Founding Circle Challenge (referrals)

**Step 1: Config and data layer**
- `js/challenge-config.js`: name, end date (30 Oct 2026, 11:59 pm IST), prize, minimum feedback length, leaderboard size, milestones, how often the invite shows.
- `js/api.js`: the only challenge data layer. 9 async functions (+ `isGenuine`, `isOver`), each with a `// BACKEND:` note; a localStorage mock with 30 demo rows.
- `assets/challenge/prize.svg`: gold gift-box placeholder until `prize.png` is added.

**Step 2: Referral code at sign-in**
- `landing.html`: optional "Referral code" field (Age and Class now share a row). `?ref=CODE` pre-fills it; checked on blur ("Invited by …" or a muted note); recorded on sign-in only if valid and not your own. Never blocks sign-in.

**Step 3: Challenge on the report**
- Feedback needs 30+ real characters (live counter, junk check). A valid submit records feedback and report completion, then opens a full-screen invite (countdown, Join, Maybe later; Esc closes; max 2 shows), then a slim sticky bar.
- A pill under the card's share buttons; joined and closed states. `challengeJoined` / `joinedAt` added to lead and feedback rows (sheet script updated).

**Step 4: `challenge.html`**
- Hero (floating prize, countdown), why, how it works, rules, join (rules + parent consent under 18) → scratch-to-join gold foil card revealing the code; copy code/link, WhatsApp / Instagram / Facebook, leaderboard link. Reduced motion: tap to reveal.

**Step 5: `leaderboard.html`**
- Countdown chip, prize strip, podium with crown and owl avatars, ranks 4–50, your row in gold, sticky "you" card (rank, valid · pending, progress to the next rank, milestone badges, Share), join link if not joined, 5-minute refresh, frozen after the end.

**Step 6: Finish**
- `terms.html`: plain-language rules, prize, eligibility, valid referrals, review, winner contact, data use, contact.
- Navigation: Report → Challenge → Leaderboard → back to Report; trophy in the report header opens the leaderboard.
- `INTEGRATION.md`: new "Referral challenge" section (api functions, tables, validation rules, ranking). Needs real Google sign-in and a backend before going live.

**Story slides and handover**
- `who.html`: each of the 6 slides has its own photo (`assets/report/slide1–6.png`, served as WebP + JPG from `assets/report/web/`), with a dark gradient for readability, a crossfade and a slow 8 s zoom; the next photo is preloaded. Static with reduced motion.
- Challenge pages load `assets/challenge/prize.webp` (800 px copy of `prize.png`).
- `BACKEND.md`: full handover for the backend developer (flow, storage keys, scoring, API contract, database, auth, challenge rules, TODO, test cases). README points to it.

**Also today**
- Consent sheet: dropped the advertising sentence; "I agree" muted until read, then lit gold with one pulse; the last line highlighted.
- `meet.html`: dark navy background with a soft gold glow. Tip cards stay visible until Next / Back. The card's share row is now three round WhatsApp / Instagram / Facebook buttons.

## 2026-10-07 · Founding Card, reveal, music, join and DhiRise naming

**Meet screen** (`meet.html`)
- New copy: the DhiRise logo, a "Founding batch · Student trial" card ("Grow in marks. Grow in mind."), three rows (Productivity app,
  Mentorship, Community), the trial-batch line and "18 questions · about 5 minutes". The old tracker / short film / AI desk text is gone.
  The button reads "Start the check".

**Join screen** (`done.html`)
- Mobile number with a fixed "+91" prefix, grouped 3-3-4 while typing (works with backspace and paste). Valid = 10 digits starting 6–9.
  Only the digits are saved, as before.
- Submit swaps the form for a gold tick and "Thank you! Our team will message you soon.", then opens the story after 2.5 s.
- "Skip" removed. The WhatsApp early-access tick is unchanged.
- Wherever a number is shown later it is masked: `+91 ••• ••• 3210`.

**Background music** (`js/music.js`, `assets/music/hero.mp3`)
- Plays from the landing page through question 18: soft loop (0.35), fades in, starts on the first tap if autoplay is blocked,
  carries its position across pages (sessionStorage), fades out on Finish. No music on done.html or the report.
- Round mute button top-right, remembered in localStorage (`dhirise.music.muted`). Hidden if the file fails to load.

**Constellation reveal** (`done.html`)
- Replaces the loading bar: the 18 answers appear as points on the 7-area shape, join up, glow in the style colour, then
  "You are <style>" with `reveal.mp3` (silent when muted). Reduced motion shows the finished shape with a fade.

**Founding ID**
- `DR-` + 4 characters (A–Z, 2–9, no O/0/I/1), made once per student (`localStorage "dhirise.founding.v1"`) and added to the lead as `foundingId`.
  Not printed on the card. The Google Sheet script stores it as a new last column.

**Founding Card** (`js/card.js`, `css/card.css`, top of `report-student.html`)
- Built from `assets/cards/card-mockup (1).html`: ivory card with gold rims, a colour window with the style's owl breaking out of it,
  the style tag, the first name in caps (Cinzel, shrinks to fit), a gold rule, the community line (first name in Title Case) and the Founding Batch seal.
- Builder = red owl, Achiever = green, Explorer = blue; blends use the main style.
- Enters as the card back and flips (`flip.mp3`), with a subtle shine and a 6° tilt; none of these with reduced motion.

**Save and share** (`js/card-export.js`)
- The card is drawn on a canvas from the PNGs (not a screenshot): "Save card" downloads `DhiRise_<FirstName>.png` (1080×1620).
- "Share to Instagram" shares a 1080×1920 story image (story background, the card, "Take your DhiRise check" and `shareUrl`)
  through the share sheet, or downloads it with a hint where file sharing isn't supported.

**DhiRise naming**
- Every student-visible "Dhirise" is now "DhiRise" (titles, page text, tip cards, report). File names, classes and storage keys are unchanged.

**Housekeeping**
- Retired card art (frames, heroes, the first seal) moved to `assets/cards/_unused/`, which is git-ignored. `tools/prepare_cards.py` built it.

## 2026-10-06 · Funnel revamp

**Part 1: Scoring engine**
- One source for all 18 questions and 72 options (`js/engine/questions.js`), each option scored from its on-screen wording.
- Pure scoring in `js/engine/score.js`: learning style with confidence, mind state, 7 areas with bands and tie-breaks, 4 indices, Dhi starting score, top/bottom areas with the answer that moved them, subject profile, flags.
- Options are shuffled per student (seeded by name + date); answers are stored as option ids.
- One store, `localStorage "dhirise.check.v1"`, which survives a refresh. The question screens render from the engine.

**Part 2: Flow and lead capture**
- The landing gate opens the new `meet.html`, and the "Preview question" link is gone.
- `done.html`: the wait animation is kept, followed by a teaser and the join (mobile + WhatsApp early-access tick, or Skip).
- Leads are kept locally and POSTed to `leadEndpoint` when it's set. Added `js/funnel-config.js` and the Google Sheet script in `tools/`.

**Part 3: Tip cards**
- All 72 tip cards rewritten: a mirror line, a gold "In Dhi · Room" pill, how that room helps, and "X% of students chose this too". Card timing and animation are unchanged.

**Part 4A/4B: New report**
- `report-student.html`: Dhi starting score ring, KPI 2×2, 7-axis radar, mind-state donut, learning style, what's working / next to grow, gentle signals, study blueprint, 21-day path with saved ticks, Dhi rooms, join card. Inline SVG; animates once; respects reduced motion.
- Full report text (`js/engine/reportText.js`): three styles plus blends, 7 areas × 3 bands quoting the student's own answer, plans per area tied to Dhi rooms, with variants chosen per student.

**Part 5: Flow check and docs**
- Verified the new flow loads none of the legacy files. Added `README-FUNNEL.md`.

**Part 6: Story and report additions**
- `who.html`: a 6-card "Who you are" story from the answers (`js/engine/storyText.js`), between the join and the report.
- Report: soft "self-reflection only" chip; food, sports & hobbies, and career cards per style and blend; a feedback card (stars, note, share opt-in) POSTed to `feedbackEndpoint`. The sheet script gained a Feedback tab.

**Cleanup**
- `.gitignore` now covers student data, test outputs, local settings and OS clutter. Added `js/funnel-config.example.js`.
- New `README.md`, `INTEGRATION.md` and this changelog.
