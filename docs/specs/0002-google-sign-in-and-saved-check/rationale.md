# 0002 rationale: Google sign in, student record and saved check

## Context

> ⚠️ Premise note: This spec bundles four things that could be built separately: Google sign in, the student and consent record, the saved check, and a stored report PDF. They share one data model, so they are written together, but the PDF cannot be built until the report can be made from saved data (scope row 6). It is designed here and built last (milestone 4). Two choices carry real risk. Google first creates a Google account record before the student has read the consent text (handled by a notice and a 7 day purge, not removed). The guardian tick for under 18s is a statement, not proof, and may not satisfy the Act's rule on verifiable parental consent (a legal check before launch is already tracked in spec 0001).

Today the funnel is a finished set of screens that keep everything in the browser. The landing form writes a "gate" record to `localStorage`, "Continue with Gmail" is a stub, and the 18 answers live in one `localStorage` key. A student who changes phone, clears site data or shares a device loses or mixes their check. The team also has nothing: no record of who signed up, no proof of what each student agreed to, and no way to carry on from another device.

The students are in Class 8 to college, in India, and many are under 18. Their name, age, class, email and answers are personal data of children. India's Digital Personal Data Protection Act, 2023 applies: consent, special care for children's data, and the right to correction and erasure. The consent text and the grievance contact (`privacy@dhirise.com`) already exist in `BACKEND.md`.

The stack is decided (spec 0001): static Astro pages on Cloudflare Pages, Convex for data and rules, Better Auth with Google only. The sign in path was proved on 2026-10-08: a real Google account signed in on `dhirise.com` and Convex recognised it. What is missing is the student's own record, the consent proof, and a saved check that follows them between devices.

Students often open links from WhatsApp, Instagram and Facebook. Google refuses sign in inside some of those in app browsers, so the flow must not dead end there.

## Options considered

### Option 1: A Convex record per student after Google sign in, local copy plus background sync

Google sign in first, then a form that creates the student, a consent record and one check in one step. The check lives in Convex. The browser keeps a local copy of the answers so each tap is instant, and a small queue sends them to the server with retries.

**Pros**:
- Fits the decided stack and the thin end to end slice approach.
- The quiz is smooth on slow mobile networks, and a student can switch devices.
- The exact consent text and its version are stored for every student.

**Cons**:
- More moving parts in the browser (a local copy, a queue, a sync mark) than a plain "save and wait".
- Google first holds a Google email and name before consent is shown.
- Two copies of an answer (device and server) must be reconciled, with the server winning.

### Option 2: Form first, then Google, and wait for the server on every question

Keep today's screen order. Consent is given before any account exists. Each answer is saved by waiting for the server before the next question appears.

**Pros**:
- Cleanest order for children's data: nothing is held before consent.
- Simplest code: one source of truth and no queue.

**Cons**:
- On a slow connection the quiz stalls on every tap, which risks students giving up.
- Fields typed before the Google trip must be carried across it and can be lost.
- You chose against this order for the landing page.

### Option 3: Keep the check in the browser and save it once at the end

Sign in with Google, but send the whole check to the server only when it is finished.

**Pros**:
- The least server traffic and the fewest write rules.

**Cons**:
- A student cannot carry on from another device, which breaks the scope's "done when".
- Answers are lost with the browser's data. A half finished check never reaches the server.
- Every answer is trusted from the browser in one go at the end, which makes cheating on referrals easier.

## Rationale

Option 1 matches what you asked for: Google first, a saved check that resumes anywhere, and a smooth quiz on weak networks. The forces from Context point the same way. Students are on phones with patchy connections, so the quiz cannot wait on the network (Option 2 fails that). The scope says a student must "refresh or switch device and resume at the same question" (Option 3 fails that). Option 2's cleaner consent order is real, so the chosen design softens Google first instead of ignoring it: a notice beside the button, a version on that notice, and a purge of accounts that never finish the form.

Smaller decisions inside Option 1, with the pick, the reason and the runner up:
- **Answers as rows, not one document.** One row per `(check, question)`. Pick: rows. They record when each answer was given, two devices saving different questions never collide, and the table matches the old design. Runner up: one `answers` object on the check, which is shorter but loses per answer time and makes simultaneous saves fight.
- **Consent text lives once on the server, the page sends a version and a fingerprint.** Pick: a server constant per version, stored as a row on first use, with the page's hash checked. It stops a browser from sending a fake text, and the exact text is kept in the database as proof. Runner up: send the full text from the page and store it as given, which is simpler but trusts the browser.
- **Email copied onto the student row.** Pick: copy (lowercase). The sheet copy, the team view and erasure all need the email, and crossing into the auth component for each is awkward. Runner up: read it from the auth user every time, which avoids the duplicate but couples every query to the component.
- **Age, not date of birth.** Pick: age as given (10 to 25). It is the minimum personal data and is what the form already asks. Runner up: date of birth, which keeps "is a minor" correct over time but collects more.
- **One check per student for now.** Pick: one, as you chose. Retakes later are a new row and a rule for which result counts, not a new model.
- **Server wins, except for unsent answers.** On reload, an unsent local answer for a question beats the server for that question; every other question takes the server value. Without this rule a flaky network could quietly undo a student's last taps.
- **Seed on the server.** The option shuffle used a seed made from the profile and start time in the browser. Pick: a random seed saved on the check, so every device shows the same order. Runner up: keep deriving it, which breaks if the name is edited.
- **Import of old browser answers: ask, then import once.** You chose to import. The design limits the risk: one question first, only when the server has no answers, format checked, marked `imported`, and referral rules must not count it.
- **"Already started? Sign in" link.** With Google first, every visitor taps the same Google button, and the app then finds their record. So there is no separate second flow. A caption under the button says "Already started? Sign in with the same Google account."
- **Guardian tick under 18.** Pick: an extra tick, shown when the age is under 18, stored with the consent. Runner up: guardian email or code verification, which is stronger but needs an email service and a longer path for a child. The legal check decides whether the stronger option is required.
- **Report PDF both downloaded and stored, made when the report first opens.** You chose both. The PDF is made in the browser with `html2pdf.js` (the runner ups were a drawn text PDF with jsPDF, smaller and selectable but a rebuild of the report layout, and a server side render with Cloudflare Browser Rendering, consistent but paid and dependent on row 6). Storing it uses Convex file storage, so spec 0001's "no file storage" changes for this one use.
- **Pages after landing all need a session.** Pick: everything except `landing` and `terms`. It is one simple rule. The leaderboard can open up under row 12.
- **Purge window 7 days; session 30 days.** Seven days gives a student time to come back after a failed form, and is short enough to keep abandoned data small. The session is long so a student can do the check over several days.
- **Rate limits.** Not in this slice (scope row 5 sets them). The writes here are bounded by their shape: one student, one check, 18 answers, one PDF, and a session is required.

## Cross check

Run on the same model, read only, against `index.md` and `rationale.md`. It found 18 decision gaps and several soundness points. All were applied as recommended, with the stored PDF kept. The main changes: a `loading` state and cached summary for the page guard, a `resumeTarget` table, `reportSeenAt` on the server, fixed Google return addresses, the referral code in `localStorage`, defined error codes, a per question offline queue with ownership checks, a safer purge, a PDF type check and a session checked download route, and a `requireStudent` helper. One option raised and not taken: dropping the stored PDF and rebuilding the report on demand, which would remove file storage, clean up and a private file route.

## References

**Project sources** (verifiable, in this repo):
- Spec 0001 (stack, sign in addresses, security model, follow up items for rows 2, 4 and 10)
- `BACKEND.md` sections 3, 6, 7 and 11 (today's browser data, the old table design, the sign in replacement plan, the consent text and privacy rules)
- `public/dhiinterviews/js/gate.js`, `js/engine/store.js` (today's form rules and answer store)
- `convex/_generated/ai/guidelines.md` and the installed Convex and Better Auth skills

**Practices & standards**:
- India's Digital Personal Data Protection Act, 2023: consent, children's data and verifiable parental consent, correction and erasure (not linked, the official pages did not load)
- Derive the user from the session on the server, never from a request argument
- Idempotent creation by a unique key, so a retry never makes a second record
- Store the exact consent text and its version, append only

**Links** (web verified):
- [Better Auth: Google sign in](https://www.better-auth.com/docs/authentication/google)
- [Convex and Better Auth getting started](https://labs.convex.dev/better-auth)
- [Convex: uploading and storing files](https://docs.convex.dev/file-storage/upload-files)
- [Convex: auth in functions](https://docs.convex.dev/auth/functions-auth)
- [Convex: OCC and atomicity](https://docs.convex.dev/database/advanced/occ)
- [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)

Two official pages for India's Digital Personal Data Protection Act, 2023 (the Ministry's site and India Code) returned an access error when checked, so the Act is cited by name with no link. Section 9 on children's data and the erasure rights were not read from the Act's text during this design, and should be read in the legal check.
