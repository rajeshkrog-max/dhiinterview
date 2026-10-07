# BACKEND.md: backend handover

This document is for the developer building the backend. It is written from the code in this folder as of 2026-10-07.
Where something is only simulated in the browser it says **⚠ Mocked today**. Where the product owner still has to choose, it says **⚠ Needs decision**.

Companion docs: `INTEGRATION.md` (earlier, shorter guide), `README.md` (project map), `CHANGELOG.md` (history).

---

## 1. Overview

**DhiRise** is building a student app ("Dhi") and a student community. This repo is the **DhiRise check**: a short, mobile-first
self-reflection that doubles as the **marketing funnel and early-access list** for the app.

What a student does:

```
sign in → meet DhiRise → 18 questions → reveal ("You are …") → teaser → join (mobile + WhatsApp opt-in)
       → "Who you are" story (6 slides) → full report (Founding Card, share, feedback)
       → Founding Circle Challenge (referrals) → leaderboard
```

Who uses it: students from **Class 8 to college, in India**. **Many are under 18**, which matters for consent (section 11).

Goals: (1) collect qualified leads with a WhatsApp opt-in for early access; (2) grow through referrals (the challenge);
(3) give every student a useful, kind report.

Tech today: **plain static HTML/CSS/JS**, no framework or build step, and **no backend**. Everything is kept in the browser's
`localStorage`. The only network calls are optional `no-cors` POSTs of leads and feedback to a Google Apps Script (section 9).

---

## 2. Student flow, step by step

```
landing.html ──► meet.html ──► question.html (Q1) ──► question2.html (Q2) ──► questions.html?q=3 … ?q=18
     │                                                                              │ Finish
     │ returning student: "Continue as …" resumes where they left off               ▼
     │                                                         done.html (reveal → teaser → join: +91 mobile)
     │                                                                              │ Submit (no Skip)
     │                                                                              ▼
     │                                                         who.html (6-slide story) ──► report-student.html
     │                                                                                            │  │
     │                                     challenge.html ◄── pill / invite / sticky bar ──────────┘  │
     │                                          │  terms.html                                         │ trophy
     │                                          ▼                                                     ▼
     └── ?ref=CODE pre-fills the referral code  leaderboard.html ──────── back arrow ──► report-student.html
```

| Page | File(s) | What the student does | Data created or changed | Where it's stored today |
|---|---|---|---|---|
| Landing | `landing.html`, `js/gate.js`, `css/landing.css` | Name, age (10–25), class (Class 8–12, College), optional referral code, consent sheet (must scroll to the end, then "I agree"), "Continue with Gmail". **⚠ Mocked today:** no Google sign-in happens. | Gate record (name, age, class, consent + exact consent text). Referral use if the code is valid and not their own. | `localStorage dhirise.gate.v1`; `sessionStorage dhirise.ref` until sign-in; challenge mock keys (section 3) |
| Meet | `meet.html`, `js/meet.js`, `js/music.js` | Reads what DhiRise is, taps "Start the check". Background music starts (mute button). | Music mute choice and play position | `localStorage dhirise.music.muted`, `sessionStorage dhirise.music.pos` |
| Q1–Q18 | `question.html` + `js/q1.js`, `question2.html` + `js/q2.js`, `questions.html?q=N` + `js/questions.js`; shared `js/question.js`, `js/engine/screen.js`, `js/engine/questions.js`, `js/leaves.js` | Picks one of 4 options. Options are **shuffled per student** (seeded by name + start date). A tip card shows; Next unlocks after 10 s. Q18's button says Finish. | One answer per question, stored as an **option id** (`q4o2` = question 4, 2nd option as written in `js/engine/questions.js`), never a screen position. `startedAt` on first load, `completedAt` on Finish (only if all 18 are answered). | `localStorage dhirise.check.v1` |
| Done | `done.html`, `js/done.js`, `js/engine/identity.js` | Watches a ~7 s "constellation" reveal ("You are The Focused Achiever"), sees a teaser (style, Dhi starting score, two locked cards), taps "Unlock my full report", enters a **+91 mobile** (10 digits starting 6–9, shown 3-3-4) with a **pre-ticked "Add me to Dhi early access on WhatsApp"** box, then Submit. | The **lead** (section 9) including a **Founding ID** `DR-XXXX`. **⚠ Needs decision:** there is no Skip, so the phone number is effectively required to see the report. | `localStorage dhirise.lead.v1`, `dhirise.founding.v1`; optional POST to `leadEndpoint` |
| Who you are | `who.html`, `js/who.js`, `js/engine/storyText.js` | Swipes 6 story slides built from their answers, then "See my full report". | Nothing | none |
| Report | `report-student.html`, `js/report-student.js`, `js/engine/reportText.js`, `js/card.js`, `js/card-export.js`, `js/challenge-ui.js` | Founding Card (save PNG, share to WhatsApp / Instagram / Facebook), full report, 21-day path (tappable ticks), feedback (1–5 stars + text, at least 30 characters, optional "share anonymously"). After valid feedback: the challenge invite overlay. | Report completion, feedback, Week 1 ticks, invite show count | `dhirise.reportFeedback.v1`, `dhirise.path.v1`, `dhirise.challenge.v1`, `dhirise.challenge.mock.v1`, `dhirise.challenge.invite.v1`; optional POST to `feedbackEndpoint` |
| Challenge | `challenge.html`, `js/challenge.js` | Reads the prize, why, steps and rules. Ticks "I agree to the rules" (+ "My parent or guardian agrees" if under 18), taps "Scratch to join", scratches a gold foil card to reveal their code, copies / shares it. | Challenge entry + referral code | `dhirise.challenge.v1`, `dhirise.challenge.mock.v1` |
| Leaderboard | `leaderboard.html`, `js/leaderboard.js` | Sees the podium, ranks 4–50, their own rank, progress, milestone badges, Share. | Nothing | reads only |
| Terms | `terms.html` | Reads the full challenge terms. | Nothing | none |

Guards: `done.html`, `who.html` and `report-student.html` send the student back to their first unanswered question unless `completedAt` is set.
A different name at the gate starts a fresh check (`js/engine/store.js`). **⚠ Mocked today:** with real auth this must compare a user id, not a name.

Legacy files (`index.html`, `panel.html`, `report.html`, `result.html`, `js/app.js`, `js/data.js`, `js/result.js`, …) are an older interviewer tool. The funnel loads none of them; ignore them.

---

## 3. Current data storage (browser)

All keys are per browser and per origin. Nothing here is shared between devices. This is what the backend replaces.

### `localStorage "dhirise.gate.v1"`: written by `js/gate.js` on sign-in

```json
{
  "name": "Asha Kumar",
  "age": 15,
  "class": "Class 10",
  "provider": "google",
  "at": "2026-10-07T09:12:03.120Z",
  "consent": true,
  "consentAt": "2026-10-07T09:12:03.120Z",
  "consentText": "DhiRise collects your name, age, class, and the Google account you use to continue. …\n\nBy tapping I agree, you confirm …"
}
```
`provider: "google"` is hard-coded; no Google account is involved yet. `consentText` is the full notice exactly as shown (paragraphs joined by blank lines).

### `localStorage "dhirise.check.v1"`: `js/engine/store.js`

```json
{
  "profile": { "name": "Asha Kumar", "age": 15, "class": "Class 10" },
  "answers": { "q1": "q1o3", "q2": "q2o4", "q3": "q3o2", "…": "…", "q18": "q18o1" },
  "startedAt": "2026-10-07T09:12:10.004Z",
  "completedAt": "2026-10-07T09:18:44.512Z"
}
```

### `localStorage "dhirise.founding.v1"`: `js/engine/identity.js`

```json
{ "id": "DR-7KQ2", "name": "asha kumar", "at": "2026-10-07T09:19:01.000Z" }
```
`DR-` + 4 random characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. **Made in the browser, not unique globally** (section 13).

### `localStorage "dhirise.lead.v1"`: `js/done.js`

```json
{
  "lead": { "…": "the lead payload, see section 9" },
  "completedAt": "2026-10-07T09:18:44.512Z",
  "sent": false,
  "at": "2026-10-07T09:19:30.300Z"
}
```
`sent` is `true` only if `leadEndpoint` was set; the page cannot know whether the POST succeeded (`no-cors`).

### `localStorage "dhirise.reportFeedback.v1"`: `js/report-student.js`

```json
{
  "feedback": { "type": "feedback", "rating": 4, "text": "The study blueprint really fits how I revise.", "canShare": false,
                "styleKey": "p", "completedAt": "2026-10-07T09:18:44.512Z", "challengeJoined": false, "joinedAt": null,
                "phone": "9000000000" },
  "completedAt": "2026-10-07T09:18:44.512Z",
  "sent": false,
  "at": "2026-10-07T09:25:10.000Z"
}
```

### `localStorage "dhirise.path.v1"`: Week 1 ticks on the report

```json
{ "completedAt": "2026-10-07T09:18:44.512Z", "ticks": { "a0d1": true, "a2d3": true } }
```
`a{action 0–2}d{day 1–7}`. Cosmetic; the backend may ignore it.

### Challenge mock (`js/api.js`). **⚠ Mocked today**

`localStorage "dhirise.challenge.v1"`: this student:
```json
{ "id": "K7M2Q9XA", "owner": "asha kumar", "code": "ASH7K2Q", "joined": true, "parentConsent": true,
  "joinedAt": "2026-10-07T09:30:00.000Z",
  "usedCode": { "code": "RAJ4M8P", "at": "2026-10-07T09:12:03.500Z" },
  "reportComplete": true,
  "feedback": { "rating": 4, "text": "…", "genuine": true, "at": "2026-10-07T09:25:10.000Z" } }
```
`owner` is the lower-cased name, a stand-in for the email.

`localStorage "dhirise.challenge.mock.v1"`: a fake "server" so referrals can be tested on one machine:
```json
{ "codes": { "ASH7K2Q": { "owner": "asha kumar", "firstName": "Asha", "at": "2026-10-07T09:30:00.000Z" } },
  "uses":  [ { "code": "RAJ4M8P", "by": "asha kumar", "at": "2026-10-07T09:12:03.500Z",
               "finished": true, "report": true, "feedback": true } ] }
```

`localStorage "dhirise.challenge.invite.v1"`: `"1"`: how many times the invite overlay has been shown (max `maxInviteShows`).

### Other keys

| Key | Storage | Shape | Purpose |
|---|---|---|---|
| `dhirise.ref` | sessionStorage | `"RAJ4M8P"` | referral code from `?ref=` until sign-in |
| `dhirise.music.muted` | localStorage | `"1"` or `"0"` | mute button |
| `dhirise.music.pos` | sessionStorage | `{"t": 42.7, "at": 1759828330000}` | music position across pages |

Old keys you may see in a browser, unused by this flow: `dhirise.community.v1`, `dhirise.feedback.v1`, sessionStorage `dhirise.q1` / `dhirise.answers`.

---

## 4. Scoring

**Scoring runs in the browser** (`js/engine/score.js`, pure functions, no DOM). The backend only needs to **store** the answers and
results. It may **re-compute** them to verify, because the engine also runs in Node:

```js
require("./js/engine/questions.js");
require("./js/engine/score.js");
const result = globalThis.DhiScore.score(answers, { seed });   // answers = { q1: "q1o3", … }
```

### Inputs
- `answers`: `{ qN: optionId }` for N = 1–18.
- `seed` (optional): `"<lower-case name>|<YYYY-MM-DD of startedAt>"` (`DhiScore.seedOf`). Only used for the `lowConsistency` flag and for the shuffle (`DhiScore.order(n, seed)`).

### What each option carries (`js/engine/questions.js`)
- `style`: points for three learning styles, internal keys `v` (quick and creative, "The Creative Explorer"), `p` (sharp and driven, "The Focused Achiever"), `k` (steady and patient, "The Steady Builder"). **Internal only; never show `v/p/k` to students.**
- `state`: `calm` | `restless` | `low`.
- `areas`: −2 to +2 points for some of 7 areas: `routine`, `emotions`, `drive`, `connection`, `expression`, `clarity`, `purpose`.
- `flags`: e.g. `keepsFeelingsInside`. Q15 is "profile only" (the subject that feels heaviest); it doesn't affect style, state or areas.

### Outputs (plain words)
- **style**: the share of style points (sums to 100). `styleKey` = highest. `confidence`: `clear` if the gap to second is ≥15, `leaning` if 6–14, `blended` if under 6 (the report then names a blend).
- **state**: share of calm / restless / low answers (Q4, Q5, Q11, Q16, Q18 count 1.5×).
- **areas**: each 0–100 = (sum − min possible) / (max possible − min possible) over the answered questions that touch the area. Bands: **Strong ≥70**, **Growing 45–69**, **Next to grow <45**.
- **top / bottom**: 3 highest and 2 lowest areas (ties: more negative answers, then a fixed order), each with the answer that moved it most (`said`).
- **indices** (0–100): Study Readiness = avg(routine, drive, expression); Emotional Balance = avg(emotions, connection, purpose), −10 if low ≥35%; Focus Energy = drive × 0.6 + calm% × 0.4; Direction = avg(clarity, purpose).
- **dhiStart** = round(average of the 4 indices). A starting point, **never a rank**.
- **subject**: Q15's heaviest class (`memory` / `writing` / `numbers` / `mixed`) + style.
- **flags** (booleans): `keepsFeelingsInside`, `lowCareerClarity`, `heavyExpectations`, `selfDoubt`, `sleepStrain`, `lowMood`, and `lowConsistency` (the same screen position picked 12+ times; needs `seed`, else `null`).

### Example output (real output of the engine; trimmed)

```json
{
  "answered": 18, "complete": true,
  "style": { "v": 3, "p": 94, "k": 3 }, "styleKey": "p", "styleGap": 91, "confidence": "clear",
  "state": { "calm": 54, "restless": 38, "low": 8 },
  "areas": {
    "routine": { "score": 58, "band": "Growing", "negatives": 1 },
    "emotions": { "score": 25, "band": "Next to grow", "negatives": 3 },
    "drive": { "score": 83, "band": "Strong", "negatives": 0 },
    "connection": { "score": 25, "band": "Next to grow", "negatives": 1 },
    "expression": { "score": 60, "band": "Growing", "negatives": 0 },
    "clarity": { "score": 88, "band": "Strong", "negatives": 0 },
    "purpose": { "score": 60, "band": "Growing", "negatives": 0 }
  },
  "top": [ { "area": "clarity", "score": 88, "band": "Strong",
             "said": { "q": 14, "optionId": "q14o2", "text": "Certain. I have decided and I am going for it.", "value": 2 } } ],
  "bottom": [ { "area": "emotions", "score": 25, "band": "Next to grow",
                "said": { "q": 18, "optionId": "q18o2", "text": "A fear that I am not good enough.", "value": -2 } } ],
  "lowest": "emotions",
  "indices": { "studyReadiness": 67, "emotionalBalance": 37, "focusEnergy": 71, "direction": 74 },
  "dhiStart": 62,
  "subject": { "heavy": "writing", "style": "p", "key": "writing-p", "optionId": "q15o2" },
  "flags": { "keepsFeelingsInside": true, "lowCareerClarity": false, "heavyExpectations": false, "selfDoubt": true,
             "sleepStrain": false, "lowMood": false, "lowConsistency": false }
}
```

Flags like `selfDoubt` and `lowMood` are **sensitive**. They are shown to the student gently and must never be public (section 11).

---

## 5. `js/api.js` contract

`js/api.js` is the **only** place the referral challenge reads or writes data. Every function returns a Promise. **⚠ Mocked today:** all of them use localStorage plus 30 hard-coded demo leaderboard rows (`demo: true`). Each function has a `// BACKEND: replace with fetch to …` comment. Replace the bodies with `fetch` calls and the pages keep working unchanged.

Proposed REST API (JSON, cookie or bearer session from Google sign-in; all routes need a signed-in student unless marked public):

| Function | Method + path | Request | Response (200) | Errors |
|---|---|---|---|---|
| `getMe()` | `GET /api/me` | none | `{ name, firstName, email, age, class, style, code, joined, joinedAt, parentConsent, usedCode, finished, reportComplete, feedbackGiven }` | 401 not signed in |
| `validateCode(code)` | `GET /api/referral/validate?code=RAJ7K2Q` (public) | none | `{ ok: true, referrerFirstName: "Raj" }` or `{ ok: false, reason: "format" \| "unknown" \| "self" \| "ended" }` | none (always 200) |
| `recordReferralUse(code)` | `POST /api/referral/use` | `{ "code": "RAJ7K2Q" }` | `{ ok: true, referrerFirstName }` | `{ ok: false, reason: "format" \| "unknown" \| "self" \| "ended" \| "already" \| "notNew" }` |
| `markReportComplete()` | `POST /api/report/complete` | `{ "completedAt": "…" }` | `{ ok: true }` | 409 if the check isn't complete |
| `submitFeedback({rating, text})` | `POST /api/feedback` | `{ "rating": 4, "text": "…", "canShare": false }` | `{ ok: true, genuine: true, minChars: 30 }` | 400 rating not 1–5 |
| `joinChallenge({parentConsent})` | `POST /api/challenge/join` | `{ "parentConsent": true }` | `{ ok: true, code: "ASH7K2Q" }` | `{ ok: false, reason: "parentConsent" \| "ended" }` |
| `getMyReferral()` | `GET /api/referral/me` | none | `{ code, link, valid, pending }` | 404 if not joined |
| `getLeaderboard()` | `GET /api/challenge/leaderboard` (public) | none | `[ { rank, displayName, cls, style, valid } ]`, top 50 | none |
| `getMyRank()` | `GET /api/challenge/rank` | none | `{ rank, valid, pending, toNext, nextRank }` (`rank: null` if not joined) | 401 |
| `isGenuine(text)` | none (local) | | boolean hint for the form; the server decides | |
| `isOver()` | none (local) | | `Date.now() > endsAt`; the server decides | |

Notes
- `getMe().joined/code` is read on almost every challenge page. Keep it fast.
- Today `recordReferralUse` is called right after the gate writes `dhirise.gate.v1` (`js/gate.js`, form submit). With real auth, call it **after** the session exists.
- `markReportComplete` is called when `report-student.html` opens (`js/challenge-ui.js`) and again after feedback.
- The **lead and feedback POSTs to the Google Sheet** (section 9) are separate from `api.js`. Fold them into `POST /api/leads` and `POST /api/feedback` when the backend exists.

Suggested extra endpoints (not in `api.js` yet, needed to stop relying on localStorage):

| Purpose | Method + path | Body |
|---|---|---|
| Save sign-in profile + consent | `POST /api/students` (upsert) | `{ name, age, class, consent, consentAt, consentText }` |
| Start a check | `POST /api/checks` | `{ startedAt, seed, engineVersion }` → `{ checkId }` |
| Save an answer | `PUT /api/checks/:id/answers/:q` | `{ optionId }` |
| Finish a check | `POST /api/checks/:id/complete` | `{ completedAt, result }` (server re-computes and compares) |
| Lead | `POST /api/leads` | the lead payload (section 9) |

Hook points in the front-end: `DhiStore.answer(n, optionId)` and `DhiStore.complete()` in `js/engine/store.js`; the `#join` submit handler in `js/done.js`; `feedback()` in `js/report-student.js`.

---

## 6. Database design

Postgres (e.g. Supabase). `uuid` keys, `timestamptz` times.

```
students 1──* checks 1──* answers
   │            1──1 results
   │            1──* feedback
   │            1──1 leads
   │
   ├──1 challenge_entries (referral_code)
   └──* referrals (as referrer)    referrals *──1 students (as friend; unique)
```

**students**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| auth_uid | text UNIQUE NOT NULL | from Google / auth provider |
| email | citext UNIQUE NOT NULL | lower-cased; the "one email = one person" rule |
| name | text NOT NULL | as typed |
| first_name | text | for public display |
| last_initial | char(1) | for public display |
| age | smallint CHECK (age BETWEEN 10 AND 25) | |
| class | text CHECK (class IN ('Class 8','Class 9','Class 10','Class 11','Class 12','College')) | |
| consent_at | timestamptz NOT NULL | |
| consent_text | text NOT NULL | exact text shown |
| is_minor | boolean GENERATED (age < 18) | |
| used_referral_code | text NULL | the first code they signed in with |
| created_at | timestamptz default now() | |
| deleted_at | timestamptz NULL | soft delete for erasure requests |

Indexes: `auth_uid`, `email`.

**checks**: id uuid PK · student_id FK → students · seed text · engine_version text · started_at · completed_at NULL · report_reached_at NULL. Index `(student_id, started_at desc)`.
**⚠ Needs decision:** one check per student, or allow retakes? (The front-end starts a fresh check when the name changes.)

**answers**: check_id FK · q smallint (1–18) · option_id text (`^q([1-9]|1[0-8])o[1-4]$`) · answered_at. PK `(check_id, q)`.

**results**: check_id PK/FK · style_key char(1) · style_v/p/k smallint · confidence text · state_calm/restless/low smallint · area_routine … area_purpose smallint (7 columns) · idx_study_readiness, idx_emotional_balance, idx_focus_energy, idx_direction smallint · dhi_start smallint · subject_heavy text · flags jsonb · computed_at · client_matches boolean (true if the client result equals the server re-compute).

**leads**: id PK · student_id FK · check_id FK · phone char(10) (`^[6-9][0-9]{9}$`) · wants_community boolean · whatsapp_opt_in_at timestamptz NULL · founding_id text · created_at · whatsapp_status text (`new` / `added` / `failed` / `opted_out`) · whatsapp_added_at NULL. UNIQUE `(student_id)`. **⚠ Needs decision:** one phone per student, or several?

**feedback**: id PK · check_id FK · student_id FK · rating smallint (1–5) · text text · chars int · genuine boolean (server-decided) · can_share boolean · created_at. UNIQUE `(check_id)` (one feedback per check; the front-end shows "Thank you" after one submit).

**challenge_entries**: student_id PK/FK · referral_code char(7) UNIQUE · joined_at · parent_consent boolean · parent_consent_at NULL. CHECK: `is_minor` → `parent_consent`.

**referrals**: id PK · code char(7) FK → challenge_entries.referral_code · referrer_id FK → students · friend_id FK → students **UNIQUE** · used_at · finished_at NULL · report_at NULL · feedback_at NULL · status text (`pending` / `valid` / `rejected`) · reached_valid_at NULL · reject_reason text NULL · reviewed_by / reviewed_at / review_note NULL. Indexes `(referrer_id, status)`, `(status, reached_valid_at)`.

---

## 7. Auth: replace the Gmail stub

Today "Continue with Gmail" only validates the form and writes `dhirise.gate.v1`. **⚠ Mocked today.**

Recommendation: **Supabase Auth with Google** (Postgres + auth + row-level security in one place). Firebase Auth works too.

Where it plugs in, in `js/gate.js`:
1. The `form.addEventListener("submit", …)` handler: after `check()` passes (fields + consent), start Google sign-in
   (`supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: <origin>/landing.html } })`).
   Keep the typed name / age / class / consent / referral code in `sessionStorage` across the redirect.
2. On return to `landing.html`: read the session, `POST /api/students` (upsert) with name, age, class and consent, then
   `recordReferralUse(code)` if a code was kept, then `write({...})` the gate record (add `uid` and `email`) and call `go()`.
3. "Continue as …" (`read()`): check the live session instead of localStorage. "Not you": also sign out.
4. `js/engine/store.js` → `get()` / `profileOf()`: compare `uid`, not `name`, to decide whether this is the same student; add `uid` to the profile.

The session must give the backend: `auth_uid`, verified `email`, and (from the student row) name, age, class, `is_minor`.
**Every record links to the student by `student_id`, and the student is found by `auth_uid` / `email`.** This is also how the "new email" referral rule works.

Only the provider's public client id / anon key may be in front-end code (section 11).

---

## 8. Referral challenge rules (exact)

- **Name:** DhiRise Founding Circle Challenge. **Ends 2026-10-30 23:59 IST** (`2026-10-30T23:59:00+05:30`); the server clock decides.
- **Prize:** the top referrer wins a gift hamper worth ₹2,999 (shoes, headphones, apparel).
- **Code format:** the first 3 letters of the first name in capitals (A–Z only, padded with `X` if shorter), plus 4 characters from
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O, 0, I, 1). Regex: `^[A-Z]{3}[A-HJ-NP-Z2-9]{4}$`. Example `RAJ7K2Q`. Unique (retry on clash). Created on join.
- **Link:** `shareUrl + "/landing.html?ref=" + code`. `?ref=` pre-fills the code field; the code is kept until sign-in.
- **Joining:** must tick "I agree to the rules"; **under 18 must also tick "My parent or guardian agrees"** (store `parent_consent_at`). Not after the deadline.

**Referral status**
| status | when |
|---|---|
| `pending` | the friend used the code at sign-in, but not every step below is done yet |
| `valid` | **all** of: the friend is a **new email** (no earlier student row); **used the code at sign-in** (first code wins); **finished all 18 questions**; **reached the report**; **submitted genuine feedback**; and all of it before the deadline. `reached_valid_at` = the time the last step happened. |
| `rejected` | self-referral, duplicate or returning email, fraud found in review, or the deadline passed before it became valid |

**Genuine feedback** (the front-end checks the same rules in `DhiApi.isGenuine`; the server must re-check): at least **30 characters** after trimming (`minFeedbackChars`); at least **5 distinct letters** (a–z or Devanagari); **no character repeated 5+ times in a row**. Recommended extra checks: not the same text as another student's, not only the question words.

**Self-referral and duplicate checks:** referrer_id ≠ friend_id; the friend's email ≠ the referrer's; one referral per friend (UNIQUE `friend_id`); a code used by an email that already existed → `rejected (notNew)`. Optionally flag the same device or IP for review.

**Leaderboard**
- Rank by **valid** count, highest first. **Tie-break: whoever reached that count earliest** (compare `max(reached_valid_at)` of each person's valid referrals; earlier ranks higher).
- Top **50** (`leaderboardSize`). Cache for **5 minutes** (the page says "Updated every 5 minutes"). Freeze at the deadline.
- **Public fields only:** `displayName` (first name + last initial, e.g. "Aarav S."), `cls`, `style` (`Builder` / `Achiever` / `Explorer`), `valid`, `rank`. Never email, phone, age or flags.
- `getMyRank`: `toNext` = (valid count of the closest person above) − mine + 1; `nextRank` = their rank; `0` / `null` when first.
- Milestone badges at 1, 5, 10, 25 valid referrals (front-end only).

**Top-10 manual review:** after the deadline, export the top 10 with, for each referral: friend email (internal only), used_at, finished_at, report_at, feedback text, genuine flag, IP/device notes. Reviewers can set `rejected` with a note; re-rank, and the top valid referrer after review wins. The winner is contacted by email (and phone, and a parent or guardian if under 18). See `terms.html`.

---

## 9. Leads and WhatsApp

**What is sent today:** on `done.html` Submit, `js/done.js` builds the lead and, if `DHI_FUNNEL.leadEndpoint` is set, sends
`fetch(leadEndpoint, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON })`.
`no-cors` means the page can't read the response.

```json
{
  "name": "Asha Kumar", "age": 15, "class": "Class 10",
  "phone": "9000000000", "wantsCommunity": true, "foundingId": "DR-7KQ2",
  "styleKey": "p",
  "areas": { "routine": 58, "emotions": 25, "drive": 83, "connection": 25, "expression": 60, "clarity": 88, "purpose": 60 },
  "indices": { "studyReadiness": 67, "emotionalBalance": 37, "focusEnergy": 71, "direction": 74 },
  "dhiStart": 62,
  "flags": { "keepsFeelingsInside": true, "lowCareerClarity": false, "heavyExpectations": false, "selfDoubt": true, "sleepStrain": false, "lowMood": false, "lowConsistency": false },
  "completedAt": "2026-10-07T09:18:44.512Z",
  "challengeJoined": false, "joinedAt": null
}
```

The feedback POST (`report-student.html`) goes to `feedbackEndpoint`: `{ type: "feedback", rating, text, canShare, styleKey, completedAt, challengeJoined, joinedAt, phone? }`.

**Google Sheet receiver:** `tools/lead-sheet.gs` (Apps Script web app; setup in `tools/LEAD-SHEET-SETUP.md`). Leads go to a **Leads** tab
(receivedAt, name, age, class, phone, wantsCommunity, styleKey, dhiStart, 4 indices, 7 areas, flags, completedAt, foundingId, challengeJoined, joinedAt);
`type: "feedback"` goes to a **Feedback** tab. Phones keep leading zeros, and typed text can't run as a formula.

**WhatsApp today:** the team **adds students to the WhatsApp early-access group by hand from the sheet** (`wantsCommunity = yes`).
The report shows a "Join on WhatsApp" link only if `whatsappInvite` is set. **⚠ Needs decision:** that's currently empty.

**Suggested final approach:** keep the opt-in tick (it is the WhatsApp opt-in; store `whatsapp_opt_in_at`). On a new lead with the opt-in,
send one approved **WhatsApp Business (Cloud API) template** from the server with the community invite. Track `whatsapp_status`, honour STOP / opt-out, and keep the token server-side.
Until then, an admin view or CSV export of `leads where wants_community and whatsapp_status = 'new'` replaces the sheet.

---

## 10. Config

`js/funnel-config.js` (`window.DHI_FUNNEL`, empty in the repo; example in `js/funnel-config.example.js`):

| Key | Used by | Must set before launch? |
|---|---|---|
| `whatsappInvite` | report join card | **Yes**, or the card says "opens soon" |
| `leadEndpoint` | `js/done.js` lead POST | **Yes** (sheet URL or `POST /api/leads`), else leads stay in the browser |
| `feedbackEndpoint` | report feedback POST | **Yes** (or replaced by `POST /api/feedback`) |
| `shareUrl` | Founding Card text, story image, share text, **referral links** | **Yes**: the public site origin (e.g. `https://check.dhirise.com`). Empty makes referral links point at whatever URL the page was opened from, including localhost |

`js/challenge-config.js` (`window.DHI_CHALLENGE`):

| Key | Value today | Notes |
|---|---|---|
| `name` | "DhiRise Founding Circle Challenge" | |
| `endsAt` | `2026-10-30T23:59:00+05:30` | the server must enforce the same date |
| `prize.title` / `items` | "Gift hamper worth ₹2,999" / Shoes, Headphones, Apparel | |
| `prize.image` / `imageFallback` | `assets/challenge/prize.webp` / `prize.svg` | `prize.webp` is an 800 px copy of the original `prize.png` |
| `minFeedbackChars` | 30 | the server must use the same value |
| `leaderboardSize` | 50 | |
| `milestones` | [1, 5, 10, 25] | |
| `maxInviteShows` | 2 | how often the invite overlay appears |

---

## 11. Privacy and compliance

- **Consent text** (landing sheet, stored verbatim in `consentText`): name, age, class and Google account are collected to build the study profile, save the check and send the result; under 18 a parent or guardian must be present and agree; answers are used only for the study picture and to improve the check; **"We do not sell your data."**; withdrawal, correction and erasure on request; grievance contact **privacy@dhirise.com**. The checkbox label: "I agree that DhiRise may use my name, age, and class to build my study picture and contact me about it. I can ask for it to be deleted."
- **Under 18:** many students are minors. The landing consent requires a parent or guardian; the challenge requires an extra explicit parent/guardian tick. **⚠ Needs decision:** whether to verify guardian consent (e.g. a guardian email or OTP) under India's DPDP Act rules for children. Record at least who ticked it and when.
- **Minimum data:** don't collect more than the flow needs. Flags such as `selfDoubt` and `lowMood` are sensitive: internal only, never in public or marketing.
- **Public responses** (leaderboard, validateCode) contain **no phone, email, age or flags**: only first name + initial, class, style, counts.
- **Deletion:** requests come to privacy@dhirise.com. Delete or anonymise the student row and cascade (answers, results, leads, feedback, referrals), and remove them from the sheet and WhatsApp list. Keep an audit note.
- **No API keys or secrets in front-end code** (including `funnel-config.js`). Only public client ids / anon keys behind row-level security.
- `feedback.can_share` must be `true` before any feedback is quoted, and never with a name.
- **Repo hygiene:** `recovery/`, session JSON and report PDFs are git-ignored. Never commit real student data.

---

## 12. Hosting and deploy

**Run locally** (from the project folder):

```bash
npx serve -l 8081 --no-clean-urls .
```

or `python -m http.server 8081`, then open `http://localhost:8081/landing.html`. **Use 8081, not 8080** (taken on the main dev machine).
`--no-clean-urls` matters: pages link to `*.html` paths, and query strings like `questions.html?q=5` must reach the page.

**Suggested production setup**
- Front-end: **Vercel or Netlify** (static, no build). Disable "clean URLs" / pretty-URL rewrites or keep `.html` links working.
- Backend: **Supabase** (Postgres, Auth with Google, Edge Functions for the `/api/*` routes, scheduled function for the 5-minute leaderboard cache). Alternatives: Firebase, or a small Node API.
- **Environment variables (server only):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (in the auth provider), `CHALLENGE_ENDS_AT=2026-10-30T23:59:00+05:30`, `MIN_FEEDBACK_CHARS=30`, `ALLOWED_ORIGINS`, `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` (later), `ADMIN_EMAILS`.
- **Front-end config (public):** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (with row-level security), `shareUrl`, `whatsappInvite`. Put them in `js/funnel-config.js` at deploy time.
- **CORS:** allow only the site origin(s) (e.g. `https://check.dhirise.com`, plus `http://localhost:8081` for dev), methods `GET, POST, PUT, OPTIONS`, header `Content-Type, Authorization`. Once the API answers with CORS, drop `mode: "no-cors"` in `js/done.js` / `js/report-student.js` so errors can be seen.
- Large assets: music (`assets/music/hero.mp3`, ~4 MB), card images and story backgrounds (`assets/report/web/*.webp`). Serve with long cache headers.

---

## 13. Known limitations

- **"X% of students chose this"** on tip cards (`peerSeed` in `js/engine/questions.js`) and **"X% of students share your style"** (`peers` in `js/engine/reportText.js`) are **estimates written by hand**, not real data. Replace them with real aggregates once there is data.
- **Leaderboard demo rows:** `js/api.js` adds 30 fake students (`demo: true`). Remove them when the backend serves real rows.
- **Referrals only work inside one browser** today (the mock "server" is localStorage).
- **Founding ID** (`DR-XXXX`) is random in the browser, **not a global sequence and not guaranteed unique**. **⚠ Needs decision:** if it should be "Founder #0123", issue it on the server.
- **Identity is the typed name** until Google sign-in exists (two students with the same name on one device would collide).
- **No Skip on the join**, so the phone is required to see the report (**⚠ Needs decision**, section 2).
- Lead and feedback POSTs are `no-cors`: failures are silent.
- The deadline, "genuine" feedback and self-referral checks run on the device clock and code today; **the server must own them**.
- Music autoplay is blocked by most browsers until the first tap (by design).

---

## 14. Backend TODO (priority order)

| # | Task | Done when |
|---|---|---|
| 1 | **Google sign-in** (Supabase Auth) wired into `js/gate.js` as in section 7 | A new student signs in with Google; a `students` row exists with `auth_uid`, verified email, name, age, class, `consent_at`, `consent_text`; "Not you" signs out |
| 2 | **Schema + RLS** (section 6) | Tables and constraints exist; a student can read and write only their own rows; public views expose only leaderboard fields |
| 3 | **Checks and answers sync** (`DhiStore.answer` / `complete`) | Answering on a phone and reopening on a laptop resumes at the same question; `completed_at` is set only with 18 answers |
| 4 | **Results stored and verified** | `results` row per completed check; the server re-compute equals the client (`client_matches = true`) for 100 random answer sets |
| 5 | **Leads endpoint** (`POST /api/leads`) replacing the sheet | Submitting on `done.html` creates one `leads` row with a valid phone and the opt-in time; duplicates update, not insert |
| 6 | **Feedback endpoint** with server-side "genuine" | Rating 1–5 enforced; text under 30 characters or junk → `genuine = false`; one row per check |
| 7 | **Challenge join + codes** | `POST /api/challenge/join` returns a unique code in the format; minors without `parentConsent` get `reason: "parentConsent"`; after the deadline `reason: "ended"` |
| 8 | **Referral tracking** (`validate`, `use`, status transitions) | All 10 test scenarios in section 15 pass |
| 9 | **Leaderboard + rank** with a 5-minute cache and tie-break | Ranking matches section 8 on a seeded dataset; responses contain only public fields; frozen after the deadline |
| 10 | **Swap `js/api.js` mock for fetch** and remove demo rows | No `dhirise.challenge.mock.v1` writes; the leaderboard shows only real students |
| 11 | **Admin export**: leads for WhatsApp, top-10 review | CSV of opted-in leads not yet added; CSV of the top 10 with referral evidence; reviewers can reject with a note |
| 12 | **Deletion workflow** | A request to privacy@dhirise.com can delete a student and every related row in one action, logged |
| 13 | **Config at deploy** (`shareUrl`, `whatsappInvite`, endpoints) | Referral links point to the public domain; the WhatsApp card shows the button |
| 14 | *(Later)* WhatsApp Business API welcome | An opted-in lead gets one template message; STOP sets `opted_out` |

---

## 15. Test scenarios

| # | Scenario | Expected |
|---|---|---|
| 1 | Friend signs in with Raj's code, answers 10 questions, stops | Referral `pending`; Raj's valid count unchanged |
| 2 | Friend finishes all 18, reaches the report, but leaves no feedback | `pending` |
| 3 | Friend finishes, reaches the report, feedback "good" (4 characters) | Feedback saved with `genuine = false`; referral stays `pending`; the page asks for 30+ characters |
| 4 | Feedback "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" or "asdasdasdasdasdasdasdasdasdasdasd" | `genuine = false` (repeated character / fewer than 5 distinct letters) |
| 5 | Friend completes every step with real feedback | Referral `valid`, `reached_valid_at` set; Raj's count +1; the leaderboard shows it within 5 minutes |
| 6 | Raj signs in on a second device with his own email and uses his own code | `validateCode` → `self`; nothing recorded |
| 7 | An existing student (email already in `students`) opens a `?ref=` link and signs in | `rejected (notNew)` or no referral created; Raj's count unchanged |
| 8 | A friend uses code A, later opens code B's link | First code wins; B gets nothing (`reason: "already"`) |
| 9 | A friend signs up with a code on 30 Oct at 23:50 IST and leaves feedback at 31 Oct 00:05 IST | Not valid (deadline passed before the last step); `rejected`; joining after the deadline returns `ended` |
| 10 | Two referrers both have 7 valid; A reached 7 at 14:00, B at 13:30 | B ranks above A |
| 11 | A 15-year-old tries to join without the parent tick | Join refused (`parentConsent`); with the tick, `parent_consent_at` is stored |
| 12 | `GET /api/challenge/leaderboard` response | Only `rank, displayName, cls, style, valid`; no email, phone, age or flags |
