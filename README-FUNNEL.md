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
- `tools/lead-sheet.gs`, `tools/LEAD-SHEET-SETUP.md`: the Google Sheet for leads.

Changed: `landing.html`, `js/gate.js`, `question.html`, `question2.html`, `questions.html`, `js/q1.js`, `js/q2.js`, `js/questions.js`,
`js/question.js` (one line: the tip card is filled by the engine), `done.html`, `js/done.js`, `css/question.css`, `css/done.css`.

## What is saved in the browser (localStorage)

| Key | What |
|---|---|
| `dhirise.gate.v1` | Name, age, class, consent. |
| `dhirise.check.v1` | `{ profile, answers: { qN: optionId }, startedAt, completedAt }`. Survives a refresh. A new name starts a fresh check. |
| `dhirise.lead.v1` | The lead sent from the join (includes `foundingId`). |
| `dhirise.path.v1` | Week 1 ticks on the report. |
| `dhirise.reportFeedback.v1` | The feedback sent from the report. |

To test from scratch, clear these keys (or use a private window).

## `js/funnel-config.js`

```js
window.DHI_FUNNEL = { whatsappInvite: "", leadEndpoint: "", feedbackEndpoint: "" };
```

- `whatsappInvite`: your WhatsApp group invite link (`https://chat.whatsapp.com/...`). It powers the join button on the report. While it is empty, the report shows "WhatsApp early access opens soon".
- `leadEndpoint`: the Google Apps Script web app URL (ends in `/exec`). When a student submits their number, the page POSTs
  `{ name, age, class, phone, wantsCommunity, styleKey, areas, indices, dhiStart, flags, completedAt }` there (no-cors).
  While it is empty, the lead is kept only in the student's browser, with no error.
- `feedbackEndpoint`: usually the same web app URL. The report's feedback card POSTs `{ type: "feedback", rating, text, canShare, styleKey, completedAt, phone }`
  there (`phone` only if they joined). The script writes it to a **Feedback** tab. While it is empty, feedback stays only in the browser.

## Google Sheet for leads and feedback (5 steps)

1. Open https://sheets.new and name the sheet, for example "Dhi leads".
2. Choose **Extensions → Apps Script**, replace the code with all of `tools/lead-sheet.gs`, and click **Save**.
3. Click **Deploy → New deployment → Web app**. Set *Execute as* to **Me** and *Who has access* to **Anyone**, click **Deploy** and allow the permissions.
4. Copy the **Web app URL** into both `leadEndpoint` and `feedbackEndpoint` in `js/funnel-config.js`. Paste your WhatsApp invite into `whatsappInvite`.
5. Finish the check once and submit a number: a **Leads** tab appears. Rate the report and submit: a **Feedback** tab appears.

After editing the script, use **Deploy → Manage deployments → Edit → New version**, or the old version keeps running.
The sheet holds phone numbers. Share it only with people who need it.
