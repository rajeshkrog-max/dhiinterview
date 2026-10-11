# 0012. Faster question pictures and a blur fade between screens

**Date**: 2026-10-11
**Status**: Proposed

## Summary

The 18 question pictures are 1.5 to 2.1 MB each (about 30 MB in all), so a phone on mobile data waits on every question. We shrink them to small WebP files (29 to 91 KB each in a measured test), keep serving them from Cloudflare Pages (not R2), load the next question's picture quietly ahead of time, and show a tiny blurred copy at once that sharpens into the real picture. When a student moves from one screen to the next, the picture melts into the next one through a soft blur (about 0.4 seconds), using the browser's own page transition, with a plain swap where a browser cannot do it.

## Context

> ⚠️ Premise note: the ask was to put the pictures in R2 so they load faster. Location is not the cause. The site is already served from Cloudflare's edge, so the same 2 MB file from R2 would arrive no faster. The cause is file size. Moving to R2 would add a public address, cache rules, a content policy change and an upload step for no speed gain, so this spec shrinks the files and leaves them on Pages. The R2 bucket `dhi-interviews` (empty, public access off) stays untouched.

- Questions 1 and 2 are their own pages (`question.astro`, `question2.astro`); questions 3 to 18 share `questions.html?q=N` (`js/questions.js`). Each Next press loads a new page (`location.href`), so a picture can only change across a page load, never inside one page.
- The picture is a CSS background on `.qscreen` (`css/question.css` for Q1 and Q2) or set by script (`js/questions.js` for Q3 to Q18). `meet.astro` also shows Q1. All 18 are 941 by 1672 PNG files in `public/dhiinterviews/assets/interview bg/` (the space in the folder name forces `%20` in every address).
- Pages serves everything in `public/` to the world, so the 30 MB of originals ship and can be fetched by anyone who guesses the address.
- `_headers` already treats scripts and styles as `no-cache` and hosted fonts as long cached with versioned names (spec 0009). Pictures have no rule yet.
- The "Who you are" story (`js/who.js`) swaps `report/web/slideN.webp` inside one page. The report slides and card pictures already have WebP copies, and are out of this pass (you chose the question backgrounds only for shrinking).

## Requirements

**User stories**:
- As a student on mobile data, I want each question to appear quickly so that I do not wait or stop.
- As a student, I want one screen to melt softly into the next so that the check feels calm, not jumpy.
- As the team, I want the originals kept safe but not served, so that nothing large ships to every visitor.

**Acceptance criteria**:
- **AC-1**: Every question background (Q1 to Q18) exists as two WebP files: a phone file 640 wide and a desktop file 941 wide. Each file is at most 200 KB (the measured test gave 29 to 91 KB at quality 72). Both keep the original shape (941 by 1672 becomes 640 by 1137, resized with Lanczos); the make script checks the ratio.
- **AC-2**: The files have versioned names (`Q5.v1.640.webp`, `Q5.v1.941.webp`) in a folder with no space (`assets/interview-bg/`), and `_headers` gives that folder `Cache-Control: public, max-age=31536000, immutable`. The picture a page loads is chosen by viewport width: 600 CSS pixels or narrower gets the phone file, wider gets the desktop file. The crop, position and darkening match today's screens: they stay in CSS on `.qscreen` (`center 14%`, and `center 12%` on wide screens), not baked into the files. Accepted: a 390 pixel phone at 3x gets the 640 file and looks slightly soft, and a screen wider than 941 stretches the desktop file, as today.
- **AC-3**: The original PNGs are moved out of the served folder (to `tools/source-art/interview-bg/`). The built `dist/` holds no `Q*.png`, and no page, style, script or test refers to `interview bg` or `Q*.png` any more.
- **AC-4**: At first paint of any page that shows a question picture (question pages and `meet`), a tiny blurred copy of that question's picture is already on screen (it is inside the stylesheet, with no extra download). The real picture replaces it with a fade once it has loaded and decoded. If the real picture fails to load, the blurred copy stays; a student never sees a broken image or the bare dark page. A decode error on a picture that did load counts as loaded. A page restored by the Back button already shows the sharp picture.
- **AC-5**: After a question page has shown its own picture, the next question's picture starts loading quietly (the same file the next page would pick, chosen with the same 600 pixel width rule through `matchMedia`). This does not happen when the browser reports `saveData` on or a `slow-2g` or `2g` connection (only Chromium reports these, so other browsers always preload), and does not happen on Q18. It never blocks or slows the current page.
- **AC-6**: Moving between question pages (Q1 to Q18, either direction) blur fades the picture: about 0.4 seconds, up to 12px of blur, picture only (the question text and buttons do the browser's plain quick fade). Chromium and Safari 18.2 or newer run it; a browser that cannot (Firefox today) shows a plain swap and nothing breaks. The browser itself skips first loads, reloads and the cross site Google sign in; the Back button does animate.
- **AC-7**: The same page transition switch applies between the other funnel pages (landing, meet, done, who, report, challenge, leaderboard) through one shared rule that each page links, not a copy per page. Only question pages and `meet` have the named picture layer, so only they get the picture blur; the other pages get the browser's default quick fade.
- **AC-8**: The "Who you are" story slides (`js/who.js`) change with the same blur fade and timing inside the page, using a different transition name from the page to page one so the two never clash, and a plain swap where the browser cannot do it.
- **AC-9**: When the student's device asks for reduced motion, the page transition is switched off completely (the switch lives inside the `prefers-reduced-motion: no-preference` rule), and AC-8's slide change is a plain swap with no blur.
- **AC-10**: Nothing else changes: the page guard, saving answers, resume on another device, offline queue, the back button and the music all behave as before, and the existing browser tests pass.
- **AC-11**: No screen loads a picture, script or font from a third party because of this change.

## Options considered

### Option 1: Shrink on Pages, preload, stand in, browser page transition
Resize and recompress to WebP in two widths, keep serving from Pages, add a blurred stand in and next picture preload, and use cross document view transitions (the browser's page to page transition) for the fade.

**Pros**:
- Fixes the real cause (size) and keeps one host and one deploy.
- The fade needs a few lines of CSS; the back button, guard and saving stay untouched.
- Measured: 29 to 91 KB files against 1.5 to 2.1 MB.

**Cons**:
- Browsers without cross document transitions get a plain swap.
- A generated stylesheet and a build script are one more thing to remember when a picture changes.

### Option 2: Move the pictures to R2
Upload to the bucket, serve from a custom domain on it.

**Pros**:
- Pictures leave the deploy bundle.

**Cons**:
- Not faster than Pages for the same file.
- Needs a public address, cache rules, a content policy change and an upload step; a second place to break.

### Option 3: One page for all 18 questions
Rebuild Q1 to Q18 as a single page that swaps in place, so a script controls the fade everywhere.

**Pros**:
- Same fade in every browser.

**Cons**:
- A large rewrite touching the guard, saving, resume and the back button, for a fade that Option 1 gives in almost every current browser.

## Decision

**Chosen option**: Option 1: Shrink on Pages, preload, stand in, browser page transition

Keep the pictures on Cloudflare Pages as two small WebP widths with versioned names and long caching, and add a tiny blurred stand in, a quiet preload of the next picture, and a shared blur fade for page changes.
## Rationale

The slowness comes from 1.5 to 2.1 MB files, so cutting them to under 100 KB fixes it for every host. Pages already sits on Cloudflare's edge near students in India, so R2 adds setup and a second address without speed. Versioned names with a year of caching follow the rule you already use for fonts, so a returning student never downloads a picture twice, and a changed picture gets a new name instead of waiting out a cache. The browser's page transition fits because each question is its own page load; the single page rewrite (Option 3) would risk the guard and saving, which are the most important parts of the app. Where the transition is missing, a plain swap is a graceful fallback, so the feature adds polish without ever being required.

## Feature design

**Files and where they live**

| Thing | Where |
|---|---|
| Small pictures | `public/dhiinterviews/assets/interview-bg/Qn.v1.640.webp` and `Qn.v1.941.webp` (n = 1 to 18) |
| Originals (not served) | `tools/source-art/interview-bg/Qn.png` |
| Make script | `tools/prepare_question_backgrounds.py` (Pillow, same family as `prepare_cards.py`): reads the originals, writes both widths (WebP, quality 72, method 6, Lanczos, ratio checked), the stand ins, the generated stylesheet and the generated name list |
| Generated name list | `public/dhiinterviews/js/question-bg-map.js`: the 18 file names with their version, the one place scripts read names from (the preload uses it) |
| Generated stylesheet | `public/dhiinterviews/css/question-bg.css`: per question (`html[data-q="5"]`), the tiny stand in (16 by 28 pixels, cut from the same crop, WebP, 150 to 210 bytes, inline as a data address) and the two real files chosen by a width rule at 600px. Loaded only by the question pages and `meet`. It sits in `public/` and gets its `?v=` fingerprint from `scripts/version-assets.mjs` like every style |
| Shared fade rule | `public/dhiinterviews/css/fade.css`: the page transition switch, the picture's transition name, the 0.4 second blur keyframes, the reduced motion version |

**How a question page works**
- The page has one picture layer (`<div class="qbg" id="qbg">`, plain HTML in the page, not made by script) behind the content. It shows the stand in first: the stand in layer is slightly larger than the screen and blurred about 8px, so the blur has no visible edge. `js/questions.js` (and the Q1 and Q2 pages) then loads the real picture through a hidden `Image()`, waits for `decode()` (or `onload` if decode rejects), and adds a class that fades it in. A failed load leaves the stand in as is.
- The darkening stays a CSS layer on `.qscreen` above the picture, as today.
- The question number for the stand in and the picture comes from the page (`question.astro` is 1, `question2.astro` is 2, `?q=N` for 3 to 18, `meet` is 1). A small inline script in the page head (before the page guard's deferred scripts) sets `data-q` on `<html>` before first paint, so the right stand in shows at once. A missing or bad `q` sets nothing, and `js/questions.js` keeps today's redirect to `question.html`.
- After the real picture has decoded, the page starts a low priority load (`Image()` with `fetchPriority` low) of question n + 1's file from `question-bg-map.js`, using `matchMedia('(max-width: 600px)')` for the width so it hits the same cached file, unless `navigator.connection.saveData` is true or `effectiveType` is `slow-2g` or `2g`. Nothing for n = 18.
- Each question page and `meet` carries `<link rel="expect" href="#qbg" blocking="render">`, so the first render waits for the picture layer and the transition always has a target. The layer is plain HTML so the page guard cannot hold it back.

**The fade**
- `fade.css` switches on cross document view transitions (`@view-transition { navigation: auto }`) only inside `@media (prefers-reduced-motion: no-preference)`, names the picture layer `qbg` so only the picture blur fades (0.4 second, blur 0 to 12px and back, opacity crossfade), and leaves everything else on the default quick fade. The old picture blurs out and the new page starts on its blurred stand in, which sharpens (a blur up); if the next picture was preloaded the stand in is rarely seen.
- Story slides in `js/who.js` use the same timing through a same page transition (`document.startViewTransition`, feature checked, with its own transition name) on the slide change, and a plain swap when it is not available or reduced motion is on.

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Choose phone or desktop file | viewport width | CSS width rule at 600px in `question-bg.css` |
| Show the right stand in at first paint | question number | the page itself (1 and 2 fixed; `q` from the address for 3 to 18) |
| Preload the next picture | next number and file name | n + 1, names read from the generated `question-bg-map.js`, width chosen with `matchMedia` at the same 600px as `question-bg.css` |
| Skip preload on weak links | data saver and speed | `navigator.connection.saveData` and `effectiveType` (absent, as in Safari and Firefox, means preload) |
| Which question the stand in is for | `data-q` on `<html>` | inline head script from the page's fixed number or `?q=N` |
| File version | `v1` | a constant in the make script, which writes it into both `question-bg.css` and `question-bg-map.js` (no second copy anywhere) |
| Cache lifetime | one year, immutable | `_headers` rule for `/dhiinterviews/assets/interview-bg/*` |
| Blur strength and time | 12px, 0.4s (0.1s, no blur on reduced motion) | decided here (your choice) |

**Key invariants**
- The stand in and the real picture are the same artwork, so the swap reads as one picture sharpening.
- The page never waits on the real picture to become usable; the question, options and buttons work while the picture loads.
- No student data is in any of these files, names or requests.

**Security model**: static public art; no sign in, no personal data, nothing new to protect. The pages with a strict content policy (team pages) show no question pictures and are untouched.

**Configuration required**: none. A `_headers` rule is added; no secrets.

**Critical test scenarios**
- Source scan: every `Q*.webp` is at most 200 KB and both widths share the original ratio; no `Q*.png` under `public/`; no reference to `interview bg` in pages, styles, scripts, tests, docs or `tools/AGENTS.md`; the `_headers` rule path matches the built `dist/dhiinterviews/assets/interview-bg/`, verifies **AC-1, AC-2, AC-3**.
- Browser test with the real picture delayed: the stand in is visible at first paint, the real picture fades in later, verifies **AC-4**.
- Browser test with the real picture blocked: the stand in stays, no broken image, verifies **AC-4**.
- Browser test (Chromium, Playwright request listener on a 390 pixel viewport counting the 640 file): on Q3 the next picture is requested once; not requested with `saveData` on, a `2g` connection, or on Q18, verifies **AC-5**.
- Browser test in Chromium: moving Q3 to Q4 runs a view transition on the picture layer; with reduced motion on, no transition runs; the Back button and a page restored from the back cache still show the sharp picture; a sign in return and a reload do not glitch, verifies **AC-4, AC-6, AC-9**.
- Browser test: the same transition rule is on each funnel page and the story slides, verifies **AC-7, AC-8**.
- The full existing browser suite and unit tests pass, plus a before and after screenshot of Q1, Q9 and Q18 at phone and desktop width that show the same crop, verifies **AC-10, AC-2**.
- Source scan: no new external address in pages, styles or scripts, verifies **AC-11**.

## Build plan

Build approach: Tracer Bullet (the project default). One thin thread through every layer first, then the rest.

1. **M1 The thin thread**: write `tools/prepare_question_backgrounds.py`, move the originals to `tools/source-art/interview-bg/`, make the files and `question-bg.css` for Q1 only, switch `question.astro` to the picture layer with the stand in and decode fade, add the `_headers` rule, and prove on the built site that a throttled load shows the stand in first, satisfies **AC-1, AC-2, AC-4**.
2. **M2 All 18 questions and the loading ahead**: run the script for Q1 to Q18, move `question2.astro`, `questions.astro` (with `js/questions.js`) and `meet.astro` onto the picture layer, remove the old `interview bg` references from `question.css` and the script, add the quiet next picture load with the data saver and slow link checks, satisfies **AC-1, AC-2, AC-3, AC-4, AC-5**.
3. **M3 The fade between pages**: add `fade.css` with the page transition, name the picture layer, link it from the question pages first, prove it in Chromium and with reduced motion, then link it from the other funnel pages, satisfies **AC-6, AC-7, AC-9**.
4. **M4 Pictures inside a page and clean up**: the story slide change in `js/who.js`, delete `dist` leftovers of the old PNGs by rebuilding, update `tools/AGENTS.md` and `public/dhiinterviews/AGENTS.md` notes, write the tests, run the whole suite, satisfies **AC-8, AC-9, AC-10, AC-11**.

## Consequences

**Positive**:
- Question pictures drop from about 30 MB to about 1 to 1.5 MB in total (phone files), roughly 30 to 55 KB each in practice.
- Returning students download nothing again for a year; a changed picture is picked up at once through its new name.
- Nothing large is served to the world any more.

**Negative / tradeoffs**:
- Changing a picture means rerunning a script and committing the new files (the originals are in the repo, not served).
- A browser without cross document transitions shows a plain swap, not the blur fade.
- Compression is lossy; a very fine detail in the art may look slightly softer on a large desktop screen (941 wide is the widest we have, as today).

**Neutral**:
- The old `interview%20bg/Qn.png` addresses stop working at the next deploy. The pages revalidate on every visit, so only a tab already open at deploy time can show an empty picture until it reloads. No redirect is added.
- Cross page transitions run in Chromium and Safari 18.2 or newer; the iPhone look goes on the owed real phone check. Firefox gets a plain swap.
- R2 stays available for later, for large files that change without a deploy.

## Migration plan

**Strategy**: no migration needed beyond a rename; each milestone ships on its own.
**Phases**:
1. M1 proves the chain on Q1.
2. M2 moves all 18 and removes the old addresses in the same change, so nothing refers to a missing file.
3. M3 and M4 add the fade; if a browser or a page misbehaves, removing the `fade.css` link turns the fade off without touching the pictures.
**Rollback**: revert the commit; the originals are kept in `tools/source-art/interview-bg/` and in git history.
**Risks**: the page guard might delay the first render and stop the transition from having a target (checked in M3); a crop that differs from today (checked by screenshots in M2).

## Follow-up

- [ ] The report slides, card pictures, landing hero, story background and prize still ship as large PNG fallbacks beside WebP copies. Not in this pass (your choice); a later row can shrink them with the same script.
- [ ] Row 29 (own fonts) pairs with this: the question pages still load Google's font servers until it is built.
- [ ] Cross check (same model, 2026-10-11) gaps are closed in this spec; its suggestion to use one 941 wide file for every device was declined (you kept two widths).
- [ ] Consider an R2 bucket later for files that change without a deploy.
