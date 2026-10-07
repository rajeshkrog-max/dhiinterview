# Integration guide

> For the full backend handover (database, API contract, auth, challenge rules, test cases), see **[BACKEND.md](BACKEND.md)**.

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
  feedbackEndpoint: "https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec",
  shareUrl:         "https://dhirise.com"
};
```

| Key | Used in | What it does | If empty |
|---|---|---|---|
| `whatsappInvite` | `js/report-student.js` → `join()` | The "Join Dhi early access on WhatsApp" button, and "Open the WhatsApp group" for students who already joined | The card says "WhatsApp early access opens soon" |
| `leadEndpoint` | `js/done.js` → the `#join` form `submit` handler | Receives the lead POST when a student submits their mobile number | The lead is saved only in localStorage; no error |
| `feedbackEndpoint` | `js/report-student.js` → `feedback()` | Receives the feedback POST from the report | Feedback is saved only in localStorage; no error |
| `shareUrl` | `js/card.js`, `js/card-export.js`, `js/api.js` | The public site address printed on the story image, sent in the share text, and the base of every **referral link** (`shareUrl + "/landing.html?ref=CODE"`) | The story has no link line, and the share text falls back to this page's own `landing.html` address |

**`shareUrl` must be set to the live site address** (e.g. `https://dhirise.com`) when you deploy. Left empty, shared stories carry no link,
and the share text points at whatever host the page runs on.

There are no other keys. Endpoints are public URLs, never secrets: anyone can read front-end code (see the do-not list).

---

## b) Payloads and browser storage

### Lead POST (`done.html`, on Submit)

`fetch(leadEndpoint, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body })`.
`no-cors` means the page cannot read the response: the server must accept a `text/plain` body containing JSON. The page waits
for nothing: the form shows the thank-you and the story opens after 2.5 s, while `keepalive` finishes the send.

```json
{
  "name": "Test Student",
  "age": 15,
  "class": "Class 10",
  "phone": "9000000000",
  "wantsCommunity": true,
  "foundingId": "DR-K7QM",
  "styleKey": "k",
  "areas": { "routine": 67, "emotions": 50, "drive": 58, "connection": 75, "expression": 44, "clarity": 60, "purpose": 71 },
  "indices": { "studyReadiness": 56, "emotionalBalance": 65, "focusEnergy": 61, "direction": 66 },
  "dhiStart": 62,
  "flags": { "keepsFeelingsInside": false, "lowCareerClarity": false, "heavyExpectations": true, "selfDoubt": false,
             "sleepStrain": false, "lowMood": false, "lowConsistency": false },
  "completedAt": "2026-10-06T10:22:31.000Z"
}
```

- `phone`: 10 digits starting 6–9, no country code (the field shows a fixed +91 and groups the digits 3-3-4).
- `foundingId`: the student's Founding ID, `DR-` + 4 characters from A–Z / 2–9 without O, 0, I or 1. Made once per student on this device
  (`localStorage "dhirise.founding.v1"`, keyed to the name). Not unique across devices: give it a unique index server-side and re-issue on a clash.
- `wantsCommunity`: the "Add me to Dhi early access on WhatsApp" tick (on by default). This is the WhatsApp opt-in.
- `styleKey`: internal only, never shown to students. `v` = quick and creative ("The Creative Explorer"), `p` = sharp and driven ("The Focused Achiever"), `k` = steady and patient ("The Steady Builder").
- `areas`, `indices`, `dhiStart`: 0–100. Bands: 70+ Strong, 45–69 Growing, under 45 Next to grow. `dhiStart` is a starting point, never a rank.

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
| `dhirise.lead.v1` | `js/done.js` | `{ lead: <lead payload above>, completedAt, sent: boolean, at }` (older browsers may hold `lead: null, skipped: true` from the removed Skip) |
| `dhirise.founding.v1` | `js/engine/identity.js` | `{ id: "DR-XXXX", name, at }`: the Founding ID |
| `dhirise.music.muted` | `js/music.js` | `"1"` when the student muted the music (sessionStorage `dhirise.music.pos` holds the play position) |
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

---

## h) Referral challenge (Founding Circle Challenge)

> **Not live-ready.** The challenge needs **real Google sign-in** (see c) and **a backend** before it goes public.
> Today every function in `js/api.js` is a localStorage mock, so referrals only "work" between students on the same browser.

Pages: `report-student.html` (invite overlay, sticky bar, pill: `js/challenge-ui.js`), `challenge.html` (`js/challenge.js`),
`leaderboard.html` (`js/leaderboard.js`), `terms.html`. Settings: `js/challenge-config.js` (`window.DHI_CHALLENGE`).
Navigation: Report → Challenge → Leaderboard → back to Report (the trophy in the report header also opens the leaderboard).

### Settings: `js/challenge-config.js`

```js
window.DHI_CHALLENGE = {
  name: "DhiRise Founding Circle Challenge",
  endsAt: "2026-10-30T23:59:00+05:30",
  prize: { title: "Gift hamper worth ₹2,999", items: ["Shoes", "Headphones", "Apparel"],
           image: "assets/challenge/prize.webp", imageFallback: "assets/challenge/prize.svg" },
  minFeedbackChars: 30, leaderboardSize: 50, milestones: [1, 5, 10, 25], maxInviteShows: 2
};
```

### `js/api.js`: the only data layer

Every function returns a Promise. Each has a `// BACKEND: replace with fetch to …` comment with the suggested route.
Swap the bodies for `fetch` calls and the pages keep working unchanged.

| Function | Input | Output | Suggested route |
|---|---|---|---|
| `getMe()` | none | `{ name, firstName, email, age, class, style, code, joined, joinedAt, parentConsent, usedCode, finished, reportComplete, feedbackGiven }` | `GET /api/me` |
| `validateCode(code)` | `"RAJ7K2Q"` | `{ ok: true, referrerFirstName }` or `{ ok: false, reason: "format" \| "unknown" \| "self" \| "ended" }` | `GET /api/referral/validate?code=` |
| `recordReferralUse(code)` | code typed or from `?ref=` | `{ ok, referrerFirstName }` or `{ ok: false, reason }` (`"already"` if a different code was used before; the first code wins) | `POST /api/referral/use` |
| `markReportComplete()` | none | `{ ok }` | `POST /api/report/complete` |
| `submitFeedback({ rating, text })` | rating 1–5, text | `{ ok, genuine, minChars }` | `POST /api/feedback` |
| `joinChallenge({ parentConsent })` | `parentConsent: boolean` (required when age < 18) | `{ ok: true, code }` or `{ ok: false, reason: "parentConsent" \| "ended" }` | `POST /api/challenge/join` |
| `getMyReferral()` | none | `{ code, link, valid, pending }`; `link = shareUrl + "/landing.html?ref=" + code` | `GET /api/referral/me` |
| `getLeaderboard()` | none | `[{ rank, displayName, cls, style, valid, me? }]`, top `leaderboardSize` | `GET /api/challenge/leaderboard` |
| `getMyRank()` | none | `{ rank, valid, pending, toNext, nextRank }` (`rank: null` until joined; `toNext` = referrals needed to pass `nextRank`) | `GET /api/challenge/rank` |
| `isGenuine(text)` | text | boolean (page-side hint only; the server decides) | none |
| `isOver()` | none | boolean, from the local clock (the server decides for real) | none |

Where the pages call them
- `landing.html` / `js/gate.js`: `validateCode` on blur of the referral field; `recordReferralUse` on sign-in (valid, not own code). A wrong code never blocks sign-in. `?ref=CODE` pre-fills the field (sessionStorage `dhirise.ref` until sign-in).
- `report-student.html`: `markReportComplete` on open; on feedback submit `submitFeedback`, then `markReportComplete`, then `getMe` (for `challengeJoined` / `joinedAt` in the sheet row). `js/challenge-ui.js` uses `getMe` and `getMyRank`.
- `challenge.html`: `getMe`, `getMyRank`, `joinChallenge`, `getMyReferral`.
- `leaderboard.html`: `getLeaderboard`, `getMe`, `getMyRank`, `getMyReferral` (refreshes every 5 minutes until `endsAt`).

Referral codes: the first 3 letters of the first name in caps (padded with `X`), plus 4 characters from A–Z / 2–9 without O, 0, I or 1 (e.g. `RAJ7K2Q`). They must be unique.

### Validation rules (enforce on the server)

A referral is **valid** only when the friend:
1. signs in with a **new email** (no earlier DhiRise account),
2. **used the code at sign-in** (`recordReferralUse`, first code wins),
3. **finished all 18 questions** (`checks.completed_at` set),
4. **reached the report** (`markReportComplete`),
5. submitted **genuine feedback**: at least `minFeedbackChars` (30) characters, at least 5 distinct letters, and no single character repeated 5+ times in a row. Add your own spam checks too.

Also: **no self-referrals** (the referrer's account, email or device must not be the friend's), and nothing counts after `endsAt`.
A use that has started but doesn't meet every step is **pending**. Joining under 18 needs `parentConsent: true`; store it with a timestamp.
The **top 10 are reviewed by hand** before the winner is announced (see `terms.html`).

### Leaderboard ranking

- Sort by **valid referrals, highest first**.
- **Ties: whoever reached that count earliest ranks higher** (store `reached_at` for each referral that becomes valid, and compare the time each person's latest valid referral was made).
- Show only first name + initial of the surname, class and style (`Builder` / `Achiever` / `Explorer`). Never show email or phone.
- Freeze the board at `endsAt`. The page says "Updated every 5 minutes", so caching for up to 5 minutes is fine.
- Mock note: the mock breaks ties by list order (demo rows first). Remove the 30 `demo: true` rows in `api.js` when the backend serves real data.

### Data tables (add to d)

| Table | Columns |
|---|---|
| `students` | as in d, plus `referral_code` (unique), `challenge_joined_at`, `challenge_parent_consent`, `challenge_parent_consent_at` |
| `checks` | as in d |
| `feedback` | as in d, plus `genuine` (bool, decided on the server), `chars` |
| `referrals` | `id`, `code`, `referrer_id` → students, `friend_id` → students (unique: one referral per friend), `used_at`, `finished_at`, `report_at`, `feedback_at`, `valid` (bool), `reached_valid_at`, `status` (`pending` / `valid` / `rejected`), `review_note` |

Order of events: friend signs in with a code → `referrals` row (`used_at`) → Q18 → `finished_at` → report opened → `report_at` →
genuine feedback → `feedback_at`, `valid = true`, `reached_valid_at = now`. The leaderboard counts `valid` rows per `referrer_id`.

### Sheet columns

Leads and Feedback rows now also carry `challengeJoined` (yes/no) and `joinedAt` (in `tools/lead-sheet.gs`; it adds the new column names to older sheets).
Redeploy the script as a new version after updating it.

### Local storage used by the mock

| Key | What |
|---|---|
| `dhirise.challenge.v1` | this student: `{ id, owner, code, joined, parentConsent, joinedAt, usedCode, reportComplete, feedback }` |
| `dhirise.challenge.mock.v1` | the mock "server": `{ codes: { CODE: { owner, firstName, at } }, uses: [ { code, by, at, finished, report, feedback } ] }` |
| `dhirise.challenge.invite.v1` | how many times the invite overlay has been shown (max `maxInviteShows`) |
| `dhirise.ref` (sessionStorage) | the referral code from `?ref=` until sign-in |
