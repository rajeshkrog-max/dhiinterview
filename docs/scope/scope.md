# Scope: DhiRise live app

Turn the DhiRise student funnel (a finished frontend that keeps everything in the browser) into a live app: real sign in, real storage, a copy of the data in the team's Google Sheet, product analytics, and a working Founding Circle Challenge. For students from Class 8 to college in India, many under 18.

**Build approach:** Tracer Bullet (vertical slices, each built end to end through every layer, working). Prove one thin real thread first (sign in, save an answer, read it back), then thicken one strand at a time. (basis: tracer bullet practice, a thin end to end path first)
**Workflow:** GA (after develop: `/check verify`, `/test`, a fresh model `/check review`, then `/document`). The project default level of rigor, chosen because the app holds sign in and personal data of minors. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· Beta`) to do more or less. (basis: your `AGENTS.md` rules on sensitive data and parent consent)

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Student funnel screens (landing to report) | Existing | existing |
| B | Challenge screens on a mock data layer | Existing | existing |
| 1 | Stack & architecture | Foundation | in-progress |
| 2 | Data model | Foundation | planned |
| 3 | Coding standards & tooling | Foundation | planned |
| 4 | Real sign in and saved check | Slice 1 | in-progress |
| 5 | Leads and feedback saved | Slice 2 | in-progress |
| 6 | Results and report from saved data | Slice 2 | planned |
| 7 | Sheet copy | Slice 3 | in-progress |
| 8 | Product analytics with consent | Slice 3 | planned |
| 9 | Error monitoring and alerts | Slice 3 | planned |
| 10 | Live referral codes and tracking | Slice 4 | planned |
| 11 | Challenge join with parent consent | Slice 4 | planned |
| 12 | Live leaderboard | Slice 4 | planned |
| 13 | Winner review tools | Slice 4 | planned |
| 14 | Team admin view | Slice 5 | planned |
| 15 | Data export and deletion | Slice 5 | planned |
| 16 | Share previews and SEO | Launch readiness | planned |
| 17 | Accessibility pass | Launch readiness | planned |
| 18 | Privacy page and grievance contact | Launch readiness | planned |

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

### 2. Data model · needs a decision
The core records every slice reads and writes: students, consent records (with the consent text version), checks and answers, saved results, leads, feedback, referral codes and uses, challenge entries.
**Done when:** the entities cover slices 1 to 4 without a breaking change, answers are kept as option ids, and sensitive flags are stored apart from anything public.
- [ ] Design it (spec): `/architect data model`

### 3. Coding standards & tooling
Refresh `AGENTS.md` for the chosen stack, then add lint, format, type checks and a commit check from the real project.
**Done when:** root `AGENTS.md` matches the new stack, and lint, format and checks run clean.
- [ ] Capture conventions and tooling choices: `/audit`
- [ ] Install the tooling: `/develop tooling`
- [ ] Check it runs clean: `/test`

## Slice 1: the thinnest real thread

### 4. Real sign in and saved check · in-progress
A student signs in with Google, their name, age, class and consent are stored, and each answer is saved as they go. They can close the tab, come back on another device and resume. This is the walking skeleton: real sign in, real storage, real screens, narrow.
**Done when:** a new student can sign in, answer questions, refresh or switch device and resume at the same question; a wrong or repeated sign in does not start a second check.
- [x] Design it (spec): `/architect real sign in and saved check`
- [ ] Build it: `/develop real sign in and saved check`
  - [x] M1 The thin thread: tables, `me`, `createProfile`, `saveAnswers`, the browser bridge and guard, one question page saving and resuming on a second browser (AC-1, 2, 3, 4, 5, 6, 7, 9, 16)
  - [x] M2 The real landing page and the full check: Google button with notice, the form states, every page on the guard, offline queue, sign in problems (AC-1, 2, 3, 4, 5, 7, 12, 15)
  - [ ] M3 Safety and clean up: sign out and cache wipe, import of old browser answers, the purge cron, production refuses test sign in (AC-8, 10, 11, 14) · built; the production check of AC-14 is still open (spec task 13)
  - [ ] M4 Report PDF, after row 6: file table, upload and download route, the PDF made in the browser (AC-13)
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

### 6. Results and report from saved data · needs a decision
Keep the scored result with the version of the scoring that made it, and load the report from saved data, so it looks the same on any device and later changes to scoring do not rewrite old results.
**Done when:** the report opens from saved data on a second device with the same score, style and flags; the scoring version is stored with each result.
- [ ] Design it (spec): `/architect results and report from saved data`

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

### 9. Error monitoring and alerts · needs a decision
Know when sign in, saving or the sheet copy breaks, before students tell you.
**Done when:** a forced failure in sign in, saving and the sheet copy each raises an alert to the team; student personal data is kept out of error reports.
- [ ] Design it (spec): `/architect error monitoring and alerts`

## Slice 4: the challenge goes live

### 10. Live referral codes and tracking · needs a decision
Replace the mock in `js/api.js` with real codes and uses. A referral counts only when the friend is new, used the code at sign in, finished all 18 questions, reached the report and left real feedback. No self referrals.
**Done when:** the ten test scenarios in `BACKEND.md` section 15 pass against the real service; a wrong code never blocks sign in; the rules are enforced on the server, not the browser.
- [ ] Design it (spec): `/architect live referral codes and tracking`

### 11. Challenge join with parent consent · needs a decision
Joining the challenge records the student's rules acceptance and, for under 18s, a parent or guardian's consent, with proof kept.
**Done when:** a student under 18 cannot join without the consent step; the consent text version and time are stored; an adult joins without it.
- [ ] Design it (spec): `/architect challenge join with parent consent`

### 12. Live leaderboard · needs a decision
The podium and ranks 4 to 50 from real data, showing only first name plus last initial, class and style. Refreshes every few minutes and freezes at the end date.
**Done when:** ranks match valid referral counts; no email, phone, age or flags ever appear in the response; after the end date it stops changing.
- [ ] Design it (spec): `/architect live leaderboard`

### 13. Winner review tools · needs a decision
A private screen to review the top 10 referrers by hand (their valid and pending referrals) before a winner is announced.
**Done when:** a team member can open the top 10, inspect each referral's checks, mark one as removed with a reason, and the leaderboard reflects it.
- [ ] Design it (spec): `/architect winner review tools`

## Slice 5: team tools and privacy

### 14. Team admin view · needs a decision
A private screen for the team to see leads, feedback and referral counts without opening the sheet, with access limited to named team members.
**Done when:** only signed in team members can open it; it lists leads, feedback and referral totals; phone numbers are shown only to the roles that need them.
- [ ] Design it (spec): `/architect team admin view`

### 15. Data export and deletion · needs a decision
A student, or a parent, can ask for their data to be exported or erased, and the erase reaches the database, the sheet copy and analytics. (basis: India's data protection law on correction and erasure, a named practice)
**Done when:** a request produces a complete export or a full erase across every store; erased students no longer appear on the leaderboard or in the sheet.
- [ ] Design it (spec): `/architect data export and deletion`

## Launch readiness

### 16. Share previews and SEO · needs a decision · Beta
Proper titles, descriptions and share images for the landing page and referral links, so WhatsApp and social previews look right. (basis: Open Graph protocol)
**Done when:** the landing page and a `?ref=` link show the right title, description and image in WhatsApp, Instagram and Facebook previews; the landing page has metadata and a sitemap entry.
- [ ] Design it (spec): `/architect share previews and SEO`

### 17. Accessibility pass · Beta
Check keyboard use, focus, contrast and reduced motion across the funnel and the challenge against WCAG 2.2 AA, and fix what fails. (basis: WCAG 2.2 AA)
**Done when:** every screen can be used with a keyboard alone, text meets contrast, focus is visible, and motion respects the reduced motion setting.
- [ ] Build it: `/develop accessibility pass`

### 18. Privacy page and grievance contact · from spec 0001
A plain language privacy page for students and parents, written from the consent text in `BACKEND.md`, with a named grievance contact. Google's sign in consent screen needs its address to leave test mode (which caps users at 100). (basis: India's data protection law, a named practice)
**Done when:** the page is live on the site's own address, is linked from the landing consent and from Google's consent screen, and says where student data is stored and who to contact.
- [ ] Build it: `/develop privacy page and grievance contact`

## Deferred
Out of scope for this pass, kept so the plan stays honest.
- **WhatsApp welcome message**: send a welcome to students who opt in, through the business messaging service · needs a decision
- **Two way sheet sync**: edits in the sheet flowing back to the database · needs a decision
- **Real peer percentages**: replace the seeded "X% of students chose this" numbers with real totals · needs a decision
- **Regional languages**: the funnel in Hindi and other languages · needs a decision
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
