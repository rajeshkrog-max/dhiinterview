# Integration guide

Everything needed to connect a backend to the student funnel. Today the funnel is fully static: it runs in the browser,
keeps everything in `localStorage`, and can POST leads and feedback to an endpoint you configure. Nothing else leaves the browser.

Flow: `landing.html` → `meet.html` → `question.html` / `question2.html` / `questions.html?q=3…18` → `done.html` → `who.html` → `report-student.html`.

---

## a) `js/funnel-config.js`

The only settings file. The pages load it as a plain script that sets `window.DHI_FUNNEL`. In the repo every value is empty;
`js/funnel-config.example.js` shows the format.

```js
window.DHI_FUNNEL = {
  whatsappInvite:   "https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXXXX",
  leadEndpoint:     "https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec",
  feedbackEndpoint: "https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec"
};
```

| Key | Used in | What it does | If empty |
|---|---|---|---|
| `whatsappInvite` | `js/report-student.js` → `join()` | The "Join Dhi early access on WhatsApp" button, and "Open the WhatsApp group" for students who already joined | The card says "WhatsApp early access opens soon" |
| `leadEndpoint` | `js/done.js` → the `#join` form `submit` handler | Receives the lead POST when a student submits their mobile number | The lead is saved only in localStorage; no error |
| `feedbackEndpoint` | `js/report-student.js` → `feedback()` | Receives the feedback POST from the report | Feedback is saved only in localStorage; no error |

There are no other keys. Endpoints are public URLs, never secrets: anyone can read front-end code (see the do-not list).

---

## b) Payloads and browser storage

### Lead POST (`done.html`, on Submit)

`fetch(leadEndpoint, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body })`.
`no-cors` means the page cannot read the response: the server must accept a `text/plain` body containing JSON. The page waits
at most 1.5 s and then moves on.

```json
{
  "name": "Test Student",
  "age": 15,
  "class": "Class 10",
  "phone": "9000000000",
  "wantsCommunity": true,
  "styleKey": "k",
  "areas": { "routine": 67, "emotions": 50, "drive": 58, "connection": 75, "expression": 44, "clarity": 60, "purpose": 71 },
  "indices": { "studyReadiness": 56, "emotionalBalance": 65, "focusEnergy": 61, "direction": 66 },
  "dhiStart": 62,
  "flags": { "keepsFeelingsInside": false, "lowCareerClarity": false, "heavyExpectations": true, "selfDoubt": false,
             "sleepStrain": false, "lowMood": false, "lowConsistency": false },
  "completedAt": "2026-10-06T10:22:31.000Z"
}
```

- `phone`: 10 digits, no country code.
- `wantsCommunity`: the "Add me to Dhi early access on WhatsApp" tick (on by default). This is the WhatsApp opt-in.
- `styleKey`: internal only, never shown to students. `v` = quick and creative ("The Creative Explorer"), `p` = sharp and driven ("The Focused Achiever"), `k` = steady and patient ("The Steady Builder").
- `areas`, `indices`, `dhiStart`: 0–100. Bands: 70+ Strong, 45–69 Growing, under 45 Next to grow. `dhiStart` is a starting point, never a rank.
- Skip sends nothing.

### Feedback POST (`report-student.html`, on Submit)

Sent the same way (`no-cors`, `text/plain`, `keepalive`). `phone` is included only if the student submitted one.

```json
{
  "type": "feedback",
  "rating": 4,
  "text": "The study blueprint was spot on.",
  "canShare": false,
  "styleKey": "k",
  "completedAt": "2026-10-06T10:22:31.000Z",
  "phone": "9000000000"
}
```

`type: "feedback"` lets one endpoint take both payloads (that is how `tools/lead-sheet.gs` routes them).
`canShare` is the "You may share my feedback anonymously" tick. Only quote feedback publicly when it is `true`, and never with a name.

### localStorage keys

| Key | Written by | Shape |
|---|---|---|
| `dhirise.gate.v1` | `js/gate.js` | `{ name, age, class, provider: "google", at, consent: true, consentAt, consentText }` (`consentText` is the full notice as shown) |
| `dhirise.check.v1` | `js/engine/store.js` | `{ profile: { name, age, class }, answers: { q1: "q1o3", …, q18: "q18o4" }, startedAt, completedAt }` |
| `dhirise.lead.v1` | `js/done.js` | `{ lead: <lead payload above> \| null, skipped?: true, completedAt, sent: boolean, at }` |
| `dhirise.reportFeedback.v1` | `js/report-student.js` | `{ feedback: <feedback payload above>, completedAt, sent: boolean, at }` |
| `dhirise.path.v1` | `js/report-student.js` | `{ completedAt, ticks: { "a0d1": true, … } }`: Week 1 ticks (action index, day) |

Notes
- Answers are option ids (`q{n}o{k}`, where `k` is the option's order in `js/engine/questions.js`), never screen positions. The screen shuffles options per student, seeded by name + start date (`DhiScore.seedOf`, `DhiScore.order`).
- A new name at the gate starts a fresh check (`DhiStore.get()`). Once you have real accounts, switch that to a user id (see c).
- Legacy keys you may find in old browsers, not used by the funnel: `dhirise.community.v1` (the old join; replaced by `wantsCommunity` in the lead), `dhirise.feedback.v1` (old `result.js`), and the sessionStorage keys `dhirise.q1` / `dhirise.answers`.

### The engine (for server-side use)

`js/engine/questions.js` and `js/engine/score.js` have no DOM code. They attach to `window` in the browser and to `globalThis` in Node:

```js
require("./js/engine/questions.js");
require("./js/engine/score.js");
const result = globalThis.DhiScore.score(answers, { seed });   // answers = { q1: "q1o3", … }
```

Recompute on the server from the raw answers rather than trusting client-sent scores. `seed` is needed only for the `lowConsistency` flag.

---

## c) Login: "Continue with Gmail" is a stub

Today `js/gate.js` validates the form and saves `dhirise.gate.v1`. No Google sign-in happens.

Where to plug in real sign-in (Google OAuth, Firebase Auth or Supabase Auth):

1. **`js/gate.js`, the `form.addEventListener("submit", …)` handler.** After `check()` passes and before `write({...})`, run the provider's
   Google sign-in (e.g. Firebase `signInWithPopup(auth, new GoogleAuthProvider())`, or Supabase `signInWithOAuth({ provider: "google" })`).
   On success, call `write()` with the same fields plus the account:
   ```js
   write({ name, age, class, provider: "google", uid, email, at, consent: true, consentAt, consentText });
   ```
   then `go()`. On failure, show the message in a `.err` line and stay on the page.
2. **Keep the consent.** Store `consent`, `consentAt` and the exact `consentText` with the student record on the server too.
3. **`js/gate.js` → `read()` / "Continue as" / "Not you".** With real accounts, "Continue as" should check the live session, and "Not you" should also sign out.
4. **`js/engine/store.js` → `profileOf()` and `get()`.** Add `uid` to the profile, and compare `uid` instead of `name` when deciding whether this is the same student.
5. With a redirect-based OAuth flow, return to `landing.html` and finish there (read the session, `write()`, `go()`).

Only the provider's public client config belongs in the front-end. Client secrets stay on the server.

---

## d) Database: suggested schema

Works for Postgres/Supabase, Firestore collections or sheet tabs.

| Table | Columns |
|---|---|
| `students` | `id`, `auth_uid` (unique), `email`, `name`, `age`, `class`, `consent_at`, `consent_text`, `guardian_consent` (for under-18), `created_at` |
| `checks` | `id`, `student_id`, `seed`, `engine_version`, `started_at`, `completed_at` |
| `answers` | `check_id`, `q` (1–18), `option_id` (e.g. `q4o2`), `answered_at`; unique (`check_id`, `q`) |
| `results` | `check_id` (unique), `style_key`, `style_v`, `style_p`, `style_k`, `confidence`, `state_calm`, `state_restless`, `state_low`, one column per area (7), one per index (4), `dhi_start`, `flags` (json), `computed_at` |
| `leads` | `id`, `student_id`, `check_id`, `phone`, `wants_community`, `source` (`"done"`), `created_at`, `whatsapp_status` |
| `feedback` | `id`, `check_id`, `rating` (1–5), `text`, `can_share`, `created_at` |

Order of events

1. Sign-in + consent (`landing.html`) → upsert `students`.
2. Q1 answered → create `checks` (`started_at`, `seed`).
3. Each answer (`DhiStore.answer(n, optionId)` in `js/engine/store.js`) → upsert `answers`.
4. Q18 Finish (`DhiStore.complete()`) → set `completed_at`, compute `results` on the server.
5. Join submit (`js/done.js`) → insert `leads`; if `wants_community`, queue the WhatsApp welcome (see f).
6. Report viewed → optional analytics event.
7. Feedback submit (`js/report-student.js` → `feedback()`) → insert `feedback`.

The simplest hook points for live sync are steps 3–4 (`store.js`) and the two existing POSTs (steps 5 and 7).

---

## e) Google Sheet option (no server needed)

`tools/lead-sheet.gs` is a Google Apps Script web app: one URL takes both payloads. Leads go to a **Leads** tab and
`type: "feedback"` goes to a **Feedback** tab; header rows are created automatically. Phone numbers keep leading zeros, and typed text can't run as a formula.
Setup in 5 steps: `tools/LEAD-SHEET-SETUP.md`. Put the web app URL into both `leadEndpoint` and `feedbackEndpoint`.

---

## f) WhatsApp

- **Today:** the invite link (`whatsappInvite`) is shown only on the report (`js/report-student.js` → `join()`). The join on `done.html` records the
  opt-in (`wantsCommunity`) in the lead; it does not open WhatsApp.
- **Later, with the WhatsApp Business (Cloud) API:** send from the **server** when a lead arrives with `wantsCommunity: true`, using an approved
  template (e.g. a welcome message with the group link). The tick on `done.html` is the opt-in, so store it with a timestamp.
  Keep the API token on the server, honour "STOP" and opt-outs, and never call the API from the browser.

---

## g) TODO for backend

- [ ] Real Google sign-in in `js/gate.js` (see c), with `uid` in the profile and in `store.js`.
- [ ] An endpoint for leads and feedback (or the Google Sheet), filled into `js/funnel-config.js` at deploy time.
- [ ] Store consent (`consentAt`, `consentText`) and record guardian consent for students under 18.
- [ ] Recompute scores on the server from raw answers with `js/engine/score.js`; store an `engine_version`.
- [ ] Optional live sync of answers (`DhiStore.answer` / `DhiStore.complete`), so a student can resume on another device.
- [ ] Deletion and correction requests (the consent text promises them; contact `privacy@dhirise.com`).
- [ ] Rate-limit and validate the POST endpoints (10-digit phone, rating 1–5, text up to 1000 characters).
- [ ] Optional: replace the seeded "X% of students chose this" numbers (`peerSeed` in `js/engine/questions.js`, `peers` in `js/engine/reportText.js`) with real aggregates.
- [ ] WhatsApp welcome via the Business API (see f).

### Do not

- **No API keys, tokens or secrets in front-end code** (`js/funnel-config.js` included). Endpoints are public; secrets live on the server.
- **Don't store raw answers without consent.** The landing consent covers building the study picture. Keep answers tied to that consent and delete them on request.
- **Students under 18 need a parent or guardian's consent.** The landing consent text says a parent or guardian must be present and must agree. Record it and don't skip it.
- Don't commit real student data: `recovery/`, session JSON and report PDFs are git-ignored. Keep it that way.
- Don't show internal style keys (`v`/`p`/`k`) or scoring internals to students, and never label a student by ability.
- Don't load legacy files (`index.html`, `js/app.js`, `js/data.js`, `js/result.js`, …) from the funnel.
