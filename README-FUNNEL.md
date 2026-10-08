# Dhirise student funnel

A student signs in, meets Dhi, answers 18 questions, sees a teaser, leaves a mobile number, reads a short "Who you are" story and opens their full report.
Static files only. Run from this folder:

```
python -m http.server 8081
```

Then open http://localhost:8081/landing.html (never use port 8080 on this machine).

## The flow

| Step | Page | Script(s) | What happens |
|---|---|---|---|
| 1 | `landing.html` | `js/gate.js` | Name, age, class and consent. A returning student continues where they left off. |
| 2 | `meet.html` | `js/meet.js` | One screen about Dhi, then Start. |
| 3 | `question.html` (Q1), `question2.html` (Q2), `questions.html?q=3…18` | `js/q1.js`, `js/q2.js`, `js/questions.js` → `js/engine/screen.js` → `js/question.js` | Options are shuffled per student. Choosing one shows the tip card for 10 s, then Next unlocks. Q18 says Finish. |
| 4 | `done.html` | `js/done.js` | Constellation reveal, teaser (name, style, Dhi starting score, two locked cards), then the join: +91 mobile + WhatsApp early-access tick, then a thank-you. |
| 5 | `who.html` | `js/who.js` | "Who you are": 6 swipeable cards built only from the answers, then "See my full report". |
| 6 | `report-student.html` | `js/report-student.js` | The full report, with food, hobbies, careers and a feedback card. |

The new flow loads none of the old files (`index.html`, `panel.html`, `report.html`, `result.html`, `js/app.js`, `js/data.js`,
`js/panel.js`, `js/report.js`, `js/reportContent.js`, `js/config.js`, `js/result.js`, `css/styles.css`, `css/report.css`, `css/result.css`).
Those are still in the folder, unchanged.

## New files

- `js/engine/questions.js`: all 18 questions and 72 options. Each option has its scoring (style, mind state, area points), a peer share and its tip card text.
- `js/engine/score.js`: pure scoring, no page code. `DhiScore.score(answers, { seed })` returns style, mind state, 7 areas, 4 indices, the Dhi starting score, top and bottom areas, subject profile and flags. It also holds the seeded option shuffle.
- `js/engine/store.js`: the single answer store.
- `js/engine/screen.js`: fills a question screen from the engine.
- `js/engine/reportText.js`: every word on the report.
- `js/engine/storyText.js`, `who.html`, `js/who.js`, `css/who.css`: the "Who you are" story.
- `js/report-student.js`, `css/report-student.css`, `report-student.html`: the report.
- `meet.html`, `js/meet.js`: the meet-Dhi screen.
- `js/funnel-config.js`: settings (below).
- `tools/LEAD-SHEET-SETUP.md`: setting up the Google Sheet copy of leads and feedback.

Changed: `landing.html`, `js/gate.js`, `question.html`, `question2.html`, `questions.html`, `js/q1.js`, `js/q2.js`, `js/questions.js`,
`js/question.js` (one line: the tip card is filled by the engine), `done.html`, `js/done.js`, `css/question.css`, `css/done.css`.

## What is saved in the browser (localStorage)

| Key | What |
|---|---|
| `dhirise.gate.v1` | Name, age, class, consent. |
| `dhirise.check.v1` | `{ profile, answers: { qN: optionId }, startedAt, completedAt }`. Survives a refresh. A new name starts a fresh check. |
| `dhirise.path.v1` | Week 1 ticks on the report. |

To test from scratch, clear these keys (or use a private window).

## `js/funnel-config.js`

```js
window.DHI_FUNNEL = { whatsappInvite: "", shareUrl: "" };
```

- `whatsappInvite`: your WhatsApp group invite link (`https://chat.whatsapp.com/...`). It powers the join button on the report. While it is empty, the report shows "WhatsApp early access opens soon".
- `shareUrl`: the public site address printed on the Founding Card and used for referral links.

Leads and feedback are no longer posted from the browser. Convex saves them (`leads.submit`, `feedback.submit`, specs 0003 and 0004) and the server copies them to the team's Google Sheet (`tools/LEAD-SHEET-SETUP.md`).

## Google Sheet for leads and feedback

Set up in `tools/LEAD-SHEET-SETUP.md` (a Google Cloud service account, a Sheet shared with it, and two settings on the Convex deployment).
The Sheet holds phone numbers. Share it only with people who need it.
