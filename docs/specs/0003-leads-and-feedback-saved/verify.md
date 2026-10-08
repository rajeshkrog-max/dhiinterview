# Verify: leads and feedback saved · spec 0003 · updated 2026-10-08
_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Sign in with the test sign in, finish a check, open `done.html`, tap See your result, then Unlock. The notice shows inline under the number, the WhatsApp box is ticked, Submit has no scroll step → AC-1, AC-5
- [x] Type a valid number (for example 9876543210) and tap Submit. The thank you shows only after the server answers, then `who.html` opens. In the Convex dashboard there is one `leads` row and one `consents` row of kind `lead` with `textVersion` `lead-v1` → AC-1, AC-5
- [x] Type 9 digits, then a number starting with 5. The page says to enter a valid 10 digit number and nothing is written → AC-2
- [x] With the same student, tap Submit with the box unticked, as a new student: the lead has no `whatsappOptInAt` and no `whatsappStatus`. Ticked: both are set and the status is `new` → AC-5, Value sourcing (opt in time, status)
- [x] Use a student aged 15. The guardian box shows. Submit without it: the page says a parent or guardian must tick, and nothing is saved. With it: saved, and the consent row has `guardianPresent` true and `ageAtConsent` 15 → AC-2, AC-6, Value sourcing (age, guardian)
- [x] Switch the browser to offline and tap Submit. A kind retry message shows, the typed number stays in the box, no thank you. Go online and tap Submit again: saved → AC-6
- [x] Open `done.html` again for a student whose lead is saved, tap Unlock: it goes straight to `who.html` with no phone step → AC-6
- [x] As a student with no saved lead, open `who.html` and `report-student.html` directly: both send you back to `done.html`. Sign in again on landing: Continue as goes to `done.html`, not through the report → AC-7
- [x] Open the report as a student with a saved lead and no feedback. Tap 4 stars, type a note under 30 characters, tap Submit: the page asks for more. Type a real note of 30+ characters and Submit: Thank you shows, a `feedback` row exists with `genuine` true. Reload: the thanks shows instead of the form → AC-8, AC-9, AC-10
- [x] Type a 40 character note made of one repeated letter: the page asks for real words. Using the console `DhiSession.submitFeedback`, send the same: the row is saved with `genuine` false → AC-9, Value sourcing (chars, genuine)
- [x] Send a feedback from a second device for the same student: the answer says already saved and nothing changes → AC-10
- [x] Open the browser network tab on `done.html` and the report. No request goes to a Google script address, and `localStorage` holds no `dhirise.lead.v1` or `dhirise.reportFeedback.v1` → AC-13
- [x] Open the Convex dashboard, find the landing consent text version `v1` and try to use it as the phone text through the console (`DhiSession` with version `v1`): refused → AC-14

## Commands
- [x] `pnpm vitest run` → all Convex and page tests pass (`leads.test.ts`, `feedback.test.ts`, `store.test.js`) → AC-1 to AC-12, AC-14
- [x] `pnpm exec playwright test e2e/lead-feedback.spec.ts e2e/full-check.spec.ts` → pass against the dev deployment → AC-1, AC-5, AC-6, AC-7, AC-8, AC-10, AC-13
- [x] `npx tsc -p . --noEmit` and `npx tsc -p convex --noEmit` → no errors → AC-12
- [x] In the dashboard, call `students:me` as a student with a saved lead: the result has `leadSavedAt` and `feedbackSavedAt` only, never the phone or the note → AC-12
- [x] Call `leads:submit` 11 times in an hour, mixing valid and invalid input: the 11th answers `rate_limited` and refused calls used tokens → AC-11
- [x] `grep -r "leadEndpoint\|feedbackEndpoint\|dhirise.lead.v1\|dhirise.reportFeedback.v1" public src` → no match → AC-13
- [x] Two students with the same number both save, and the later `leads` row has `phoneSeenBefore` true → AC-4

## Acceptance-criteria coverage
- AC-1 … covered by the happy path steps and `leads.test.ts` · AC-2 … bad number, consent, guardian steps · AC-3 … second device and double submit tests · AC-4 … same number step · AC-5 … ticked and unticked steps · AC-6 … offline, skip and guardian steps · AC-7 … the gate steps · AC-8 … feedback steps · AC-9 … note rule steps · AC-10 … second device step · AC-11 … the 11th call step · AC-12 … `me` and typecheck steps · AC-13 … network tab and grep steps · AC-14 … consent kind step
