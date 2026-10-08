# 0003. Leads and feedback saved in Convex

**Date**: 2026-10-08
**Status**: In Progress

## Summary

The phone number and WhatsApp tick from `done.html`, and the star rating and note from the report, are saved in Convex for the signed in student instead of being posted from the browser to a Sheet address that is empty today. A student gets one lead and one feedback per check, the first one is kept, and the server checks every input. The phone step needs the exact consent text the student saw, and a parent or guardian tick again for anyone under 18. The Google Sheet copy is a separate, later step (scope row 7) that reads from these tables.

## Requirements

**User stories**:
- As a student, I want to give my mobile number and see my full report, so that the team can contact me about it.
- As a student who joined the early access list, I want my choice saved properly, so that I am added to the WhatsApp group and nobody else is.
- As a student under 18, I want my parent or guardian to agree to my number being used, so that the app treats me safely.
- As a student, I want my report feedback saved, so that my opinion counts toward the challenge.
- As the team, I want one clean lead and one feedback per student with the exact consent text recorded, so that we can show it if asked and copy it to the Sheet later.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: A signed in student whose check is finished, who sends a valid mobile number (10 digits, the first digit 6 to 9), the WhatsApp tick and the agreement to the phone text, gets exactly one saved lead and one consent record of kind `lead` carrying the text version and fingerprint. The phone text shows inline under the number field, and tapping Submit is the agreement (there is no scroll to the end sheet on this step). The thank you shows only after the server has confirmed.
- **AC-2**: The server refuses, and writes nothing for: a number that is not 10 digits starting 6 to 9; a consent version or fingerprint it does not recognise, or one that belongs to the landing text instead of the phone text; a student under 18 without the guardian tick (`guardian_required`); a check that is not finished (`not_completed`). A visitor with no session cannot call it at all.
- **AC-3**: One lead per check, and the first one is kept. A second submit (reload, a second device, a different number, a double tap, or two at once) changes nothing, adds no second consent record, and answers that the lead was already saved.
- **AC-4**: The same number on two students is allowed. The later lead is marked `phoneSeenBefore`, and neither student is blocked.
- **AC-5**: The WhatsApp tick starts ticked, as it does today. Ticked, the lead stores the opt in time (server clock) and the status `new`. Unticked, it stores neither. The status moves to `added` or `opted_out` only by a team edit.
- **AC-6**: On the phone step the student must give a number to move on. The thank you shows only after the server confirms. When the server cannot be reached, the student stays on the step with a kind retry message and the typed number kept. A student whose lead is already saved skips the step. The guardian tick shows only for students under 18.
- **AC-7**: A student whose lead is not saved is sent back to `done.html` from `who.html` and `report-student.html`, and `resumeTarget` sends a finished student with no saved lead straight to `done.html` (so "Continue as" does not bounce through the report). (This is a flow gate in the browser, not a security boundary, because the report is built in the browser from the student's own answers.)
- **AC-8**: A signed in student whose check is finished and whose report has been opened can save feedback: a rating of 1 to 5, a note, and the share choice (unticked by default). Not finished is refused with `not_completed`, report not opened with `report_not_seen`.
- **AC-9**: The server decides `genuine` itself. A note under 30 characters after trimming, over 1000, or a rating outside 1 to 5 is refused. A note of 30 or more characters that has fewer than 5 distinct letters (a to z or Devanagari) or a character repeated 5 or more times in a row is saved with `genuine` false.
- **AC-10**: One feedback per check, the first one kept. A repeat (reload, second device, double tap, two at once) changes nothing and answers that it was already saved.
- **AC-11**: Each function allows a student 10 calls per hour. Refused attempts count too, and the student sees a kind message ("Please try again a little later").
- **AC-12**: No function takes a student id, a phone or an email as a way to find someone. The phone and the feedback text are never returned by any function, public or not. `students.me` returns only whether a lead and a feedback are saved, and when.
- **AC-13**: The browser no longer posts leads or feedback to a Sheet address. The `leadEndpoint` and `feedbackEndpoint` settings, the local copies `dhirise.lead.v1` and `dhirise.reportFeedback.v1`, and the code that used them are removed.
- **AC-14**: A consent version belongs to one kind. The phone text works only for a lead, and the landing text works only for creating a profile, so the two cannot be swapped.

## Decision

**Chosen option**: Option 1: Save leads and feedback in Convex first, with the Sheet as a later copy.

Two new tables (`leads`, `feedback`) hold what the student gave, behind the signed in student, with server side checks, a consent record for the phone step, and per student rate limits. Everything the old browser post carried that is not new (name, age, class, results, challenge status) stays where it lives and is joined by the sheet copy later.

**Implementation skills**: `convex` (`get-convex/agent-skills`, `.agents/skills/convex/`) · `convex-expert` (`get-convex/agent-skills`, `.agents/skills/convex-expert/`) · `convex-authz` (`get-convex/agent-skills`, `.agents/skills/convex-authz/`) · `convex-test` (`get-convex/agent-skills`, `.agents/skills/convex-test/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`). Read `convex/_generated/ai/guidelines.md` before any Convex code.

## Feature design

**Data model sketch** (Convex tables, app side; the student, check, answer and consent tables from spec 0002 stay as they are except the `consents` change below):

| Table | Fields | Rules |
|---|---|---|
| `leads` | `studentId`, `checkId`, `phone` (string, 10 digits), `wantsCommunity` boolean, `whatsappOptInAt` optional number (server time), `whatsappStatus` optional `"new"` or `"added"` or `"opted_out"`, `phoneSeenBefore` boolean, `consentId` (a `consents` row) | One per check, first kept. Index `by_checkId`, index `by_phone`. Never returned to the browser. `whatsappStatus` is set to `new` only when `wantsCommunity` is true. |
| `feedback` | `studentId`, `checkId`, `rating` number 1 to 5, `text` string, `chars` number, `genuine` boolean, `canShare` boolean | One per check, first kept. Index `by_checkId`. Never returned to the browser. |
| `consents` (existing) | `kind` becomes `"landing"` or `"lead"` | Only ever added to. A `lead` row has the phone text version, `ageAtConsent` (the student's stored age) and `guardianPresent` (true is required when that age is under 18). |

Relationships: `checks` 1 to 0 or 1 `leads`; `checks` 1 to 0 or 1 `feedback`; each `leads` row points at the `consents` row made in the same step. Later rows (results, referrals, challenge entries) point at `students` and `checks` as before, so nothing here changes them.

**State transitions**:
- Lead: absent → saved. Saved is final (first kept).
- WhatsApp status (only when ticked): `new` → `added` or `opted_out`; `added` → `opted_out`. Changed by hand in the Convex dashboard until the admin view (scope row 14).
- Feedback: absent → saved. Saved is final.

**Rate limiting and the result shape**: the two functions use the `@convex-dev/rate-limiter` component (a Convex add on that counts calls safely when many arrive at once), one limit per function per student, a token bucket of 10 per hour. A Convex function that throws rolls back everything it wrote, including the limiter's count. So these two functions return a result object for every expected refusal (`{ ok: false, code }`) and throw only for `not_signed_in` and `no_profile`, so a refused attempt still uses up a token.

**API surface** (every function needs a signed in student with a profile; none takes a student id):

| Function | Kind | Key inputs | Key outputs | Key refusals |
|---|---|---|---|---|
| `leads.submit` | mutation | `phone` string, `wantsCommunity` boolean, `guardianPresent` boolean, `consent:{version, hash}` | `{ok:true, alreadySaved}` or `{ok:false, code}` | `invalid_input`, `guardian_required`, `consent_text_changed`, `not_completed`, `rate_limited`; throws `not_signed_in`, `no_profile` |
| `feedback.submit` | mutation | `rating` number, `text` string, `canShare` boolean | `{ok:true, alreadySaved, genuine}` or `{ok:false, code}` | `invalid_input`, `not_completed`, `report_not_seen`, `rate_limited`; throws `not_signed_in`, `no_profile` |
| `students.me` (changed) | query | none | `check` gains `leadSavedAt` and `feedbackSavedAt` (number or null) | none |

Browser side: `window.DhiSession` gains `submitLead(form)`, `submitFeedback(form)` and `isGenuine(text)`; the cached copy (`dhirise.session.v1`) gains `leadSavedAt` and `feedbackSavedAt`. `submitFeedback` first marks the report seen (it is safe to repeat) when the cached copy lacks `reportSeenAt`, so a failed earlier mark does not block feedback. `DhiStore.resumeTarget` gains one rule: finished with no saved lead goes to `done.html`. The note rules live once, in `convex/feedbackRules.ts`, and the browser uses that same module through `DhiSession.isGenuine`, so the page and the server cannot disagree. The consent text for the phone step lives once, in `convex/consentText.ts` (version `lead-v1`), and `done.astro` draws it from there, as the landing page does.

**Value sourcing** (every value each action produces, computes or displays, and where it comes from):

| Action | Value produced or displayed | Source |
|---|---|---|
| `leads.submit` | `studentId`, `checkId` | The signed in session, never the request |
| `leads.submit` | `phone` | Request, checked against 10 digits, first digit 6 to 9 (India only) |
| `leads.submit` | `wantsCommunity` | Request (the tick, which starts ticked) |
| `leads.submit` | `whatsappOptInAt`, `whatsappStatus` | Server clock, and the fixed value `new`, only when `wantsCommunity` is true |
| `leads.submit` | `phoneSeenBefore` | A lookup of another lead with the same number, by `by_phone` |
| `leads.submit` | consent text stored | The server's own copy of that version, found by `version`, which must be of kind `lead`; the request's `hash` must equal the server hash |
| `leads.submit` | consent row `textVersion` | The request's `version`, accepted only after it matches the server's copy of kind `lead` |
| `leads.submit` | consent row `acceptedAt` | Server clock |
| `leads.submit` | rate limit key | The student id found from the session, never the request (both functions) |
| `leads.submit` | `ageAtConsent` | The student's stored age, not the request |
| `leads.submit` | `guardianPresent` required | True is required when the student's stored age is under 18 |
| `feedback.submit` | `rating`, `text`, `canShare` | Request, checked |
| `feedback.submit` | `chars`, `genuine` | Worked out on the server from the trimmed `text` by `convex/feedbackRules.ts` |
| `students.me` | `leadSavedAt`, `feedbackSavedAt` | The creation time of the student's `leads` and `feedback` rows, or null |
| Phone step | Whether to show it, and the guardian tick | `leadSavedAt` (skip when set); the cached student age under 18 |
| Report gate | Whether `who.html` and `report-student.html` open | `leadSavedAt` in the cached copy |
| Report feedback card | Whether to show the thanks instead of the form | `feedbackSavedAt` in the cached copy |

**Key invariants**:
- At most one `leads` row and one `feedback` row per check. Created inside one mutation that looks the row up by `by_checkId` with no `.filter`, so two simultaneous calls conflict and one retries and finds the other.
- A lead always has the consent row it was made with, and that row's version is of kind `lead`.
- A lead for a student under 18 always has a consent row with `guardianPresent` true.
- `whatsappOptInAt` and `whatsappStatus` exist only when `wantsCommunity` is true.
- A saved lead or feedback is never changed by the student or the browser.
- Server time is the only clock.

**Security model**:
- Compliance scope: students under 18 in India, covered by the Digital Personal Data Protection Act, 2023 (consent, correction, erasure). A mobile number and free text from a minor are personal data. The guardian tick is a statement, not proof (open since spec 0002).
- Every function reads who is calling from the session on the server (`requireStudent` in `convex/helpers.ts`) and touches only that student's rows. No function accepts a student id, a phone or an email.
- `leads` and `feedback` are never returned to the browser. Only the team reads them, through the dashboard now and an audited admin view later (scope row 14).
- The phone is typed by the student and not verified. It must not be treated as proof that the number belongs to them.
- Erasure (scope row 15) must delete the student's lead, feedback and consent rows, and the copies in the Sheet and the WhatsApp group.
- Limits: 10 calls per hour per student per function, a 1000 character note, one row per check.

**Configuration required**:
- No new environment variables and no new secrets.
- One new dependency, `@convex-dev/rate-limiter`, mounted in `convex/convex.config.ts`.
- Remove `leadEndpoint` and `feedbackEndpoint` from `js/funnel-config.example.js` and the docs. `whatsappInvite` and `shareUrl` stay.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: finish a check, give a number with the tick and the agreement, the thank you shows after the server confirms, one lead and one lead consent row exist, verifies **AC-1, AC-5, AC-6**.
- A number of 9 digits, one starting with 5, a wrong fingerprint, the landing text sent as the phone text, an unfinished check, and an under 18 without the guardian tick are each refused and nothing is written, verifies **AC-2, AC-14**.
- Submit twice, from two devices with two different numbers, and twice at once: one lead, the first number kept, one consent row, verifies **AC-3**.
- Two students with the same number both save, and the later lead is marked `phoneSeenBefore`, verifies **AC-4**.
- Ticked saves the opt in time and status `new`; unticked saves neither, verifies **AC-5**.
- Offline on the phone step shows a retry message and keeps the number; a student with a saved lead skips the step, verifies **AC-6**.
- Opening `who.html` or `report-student.html` with no saved lead goes back to `done.html`, verifies **AC-7**.
- Feedback saves after the report was opened and is refused before, and on an unfinished check, verifies **AC-8**.
- A 29 character note, a 1001 character note and a rating of 0 or 6 are refused; a 40 character note of one letter repeated, or of 4 distinct letters, is saved with `genuine` false; a normal note is saved with `genuine` true, verifies **AC-9**.
- Submit feedback twice and from two devices: one row, the first kept, verifies **AC-10**.
- The 11th call in an hour, valid or not, is refused with a kind message, and refused attempts used tokens, verifies **AC-11**.
- Inspect every exported function's arguments and results: no identity argument, no phone or feedback text returned, verifies **AC-12**.
- Search the pages and config for the Sheet post code and the old local keys: none left, verifies **AC-13**.

## Build plan

Approach: Tracer Bullet (the project default). First one thin real thread (the phone number saved and read back as a flag), then the feedback thread, then the cleanup.

**Milestone 1. The lead thread**
1. Add the `leads` and `feedback` tables, widen `consents.kind` to `landing` or `lead`, install and mount `@convex-dev/rate-limiter` with the two limits, and push to dev, satisfies **AC-1, AC-3, AC-4, AC-11**.
2. Make the consent text kind aware in `convex/consentText.ts`: add `lead-v1` (the phone text), give every version a kind, and make `createProfile` accept only a landing version (a small change to spec 0002 code), satisfies **AC-2, AC-14**.
3. Write `leads.submit` with all checks, the consent row, the duplicate phone flag and the rate limit, satisfies **AC-1, AC-2, AC-3, AC-4, AC-5, AC-11, AC-12**.
4. Add `leadSavedAt` and `feedbackSavedAt` to `students.me`, to the cached copy and to `DhiSession`, plus `DhiSession.submitLead` and the extra `resumeTarget` rule, satisfies **AC-6, AC-7, AC-12**.
5. Wire `done.html`: draw the phone text from `convex/consentText.ts`, show the guardian tick under 18, wait for the server before the thank you, show a kind retry on failure, skip the step when the lead is saved, and remove the old Sheet post, satisfies **AC-1, AC-5, AC-6, AC-13**.

**Milestone 2. The feedback thread and the gate**
6. Write `convex/feedbackRules.ts` (minimum 30, maximum 1000, distinct letters, repeats) and `feedback.submit`, satisfies **AC-8, AC-9, AC-10, AC-11, AC-12**.
7. Add `DhiSession.submitFeedback` (marking the report seen first when needed) and `DhiSession.isGenuine`, point the report feedback card and `js/api.js` `isGenuine` at it, show the thanks from `feedbackSavedAt`, and remove the old Sheet post and `dhirise.reportFeedback.v1`, satisfies **AC-8, AC-9, AC-10, AC-13**.
8. Send a student with no saved lead from `who.html` and `report-student.html` back to `done.html`, satisfies **AC-7**.

**Milestone 3. Clean up**
9. Remove `leadEndpoint` and `feedbackEndpoint` from the config, its example and the docs that name them, and remove `dhirise.lead.v1` wherever it is read, satisfies **AC-13**.

Tests for the whole plan (`convex-test` for the functions, Playwright for the flows) belong to `/test`, mapped to the scenarios above.

## Consequences

**Positive**:
- Leads and feedback survive a cleared browser and are the source of truth, with the exact consent text kept for the phone step.
- The server checks every input, so a junk or flooded submission no longer reaches the team's Sheet.
- The sheet copy (row 7) and the referral rules (row 10) read one clean `genuine` flag and one lead per student.
- One rules module means the page and the server cannot drift apart on what counts as genuine feedback.

**Negative / tradeoffs**:
- The phone is required to unlock the full report and the WhatsApp tick starts ticked. You chose these against the recommendation. Making a service depend on a number, and a pre ticked box as the opt in, is weak under the Data Protection Act, most of all for students under 18. The legal check already open in spec 0002 must now cover both before launch.
- The number is typed and not verified, so a student can give someone else's number and the team could add that person to the WhatsApp group by hand. An opt in is only as good as the tick that produced it.
- The report gate is in the browser only. A determined student can open `report-student.html` directly without giving a number, because the report is built in the browser from their own answers. A true gate would need the report rendered on the server (scope row 6).
- Expected refusals come back as a result object instead of a thrown error, which differs from spec 0002's convention for these two functions. This is needed so refused attempts still count against the rate limit.
- A new dependency (`@convex-dev/rate-limiter`) to keep up to date.
- The WhatsApp status can only be changed by hand in the dashboard until row 14.

**Neutral**:
- The Sheet receiver `tools/lead-sheet.gs` stays and changes shape in row 7, which will send a row assembled from the student, the lead and the saved result.
- `js/api.js` still holds the challenge mock, including its own feedback calls, until scope row 10.
- `BACKEND.md` section 9 and the lead payload description describe the old browser post and need a refresh (`/sync`).

## Follow-up

- [ ] Legal check before launch (extends the one in spec 0002): is a phone number that is required for the report, and a WhatsApp tick that starts ticked, acceptable for students under 18 under the Data Protection Act? If not, the earlier recommendations (phone optional with a skip, tick starts unticked) are a small change here.
- [ ] Decide the exact wording of the `lead-v1` consent text with whoever owns the privacy page (scope row 18). The draft in the build task is a placeholder.
- [ ] Decide how a number is checked before the team adds anyone to the WhatsApp group (a one time code, or the student confirming inside WhatsApp). Belongs with the deferred WhatsApp welcome message.
- [ ] Scope row 7 (sheet copy) reads `leads`, `feedback`, `students` and the saved result, never the browser. It must not copy `wantsCommunity` false leads to the WhatsApp list.
- [ ] Scope row 10 (referrals) reads `feedback.genuine` and must treat a missing or false value as not valid. The mock feedback in `js/api.js` goes away there.
- [ ] Scope row 14 (admin view) replaces hand edits to `whatsappStatus` and audits staff reads of phone numbers.
- [ ] Scope row 15 (export and erasure) must remove the student's lead, feedback and lead consent rows and the copies elsewhere. It also owns correcting a number: the first number is kept, so a typo is fixed by a request to privacy@dhirise.com (by hand until that row ships).
- [ ] The note rules count letters in a to z and Devanagari only, so a long note in another script (Tamil, Telugu and so on) is saved with `genuine` false. Revisit with the deferred regional languages work.
- [ ] The third party Agent Skill `imfa-solutions/skills@convex-rate-limiter` you chose could not be installed (the repository was not found). Consider the official `convex-suggest` skill (already installed) or try again later. Add the `@convex-dev/rate-limiter` conventions to root `AGENTS.md` through `/sync` once it is in use.
- [ ] Refresh `AGENTS.md` and `BACKEND.md` for the new tables and for the removed Sheet post (`/sync`).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
