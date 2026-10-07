# DhiRise · student interview funnel

A short self-check for students, and the marketing funnel for **Dhi**, our upcoming student app.
A student signs in, answers 18 everyday questions, sees a teaser, can join the Dhi early-access WhatsApp group, reads a short
"Who you are" story and gets a full Mind & Study Profile. Every insight comes from their own answers. Nothing is diagnosed or ranked.

Plain HTML, CSS and JavaScript. There is no build step and no framework, and no backend yet (see [INTEGRATION.md](INTEGRATION.md)).

## Student flow

| # | Page | What the student sees |
|---|---|---|
| 1 | `landing.html` | Name, age, class and consent ("Continue with Gmail" is a stub for now). |
| 2 | `meet.html` | One screen about DhiRise: founding batch, productivity app, mentorship, community. |
| 3 | `question.html`, `question2.html`, `questions.html?q=3…18` | 18 questions; each answer shows a tip card about the Dhi room that fits. |
| 4 | `done.html` | A constellation reveal ("You are …"), a teaser (style, Dhi starting score, locked cards), then +91 mobile number + WhatsApp early-access tick and a thank-you. |
| 5 | `who.html` | "Who you are": 6 swipeable cards built from their answers. |
| 6 | `report-student.html` | The Founding Card (save / share to Instagram), then the full report: score ring, KPIs, radar, style, strengths, next steps, 21-day path, Dhi rooms, food, hobbies, careers, feedback. |

A returning student who taps "Continue as …" on the landing page resumes where they left off.

## Run it locally

```bash
npx --yes serve -l 8081 --no-clean-urls .
```

Then open **http://localhost:8081/landing.html**. (`--no-clean-urls` keeps `.html` and `?q=` links exactly as written;
`python -m http.server 8081` works too.) Use port 8081 (8080 is taken on the main dev machine).
Answers live in the browser's localStorage, so to start fresh use a private window or clear the `dhirise.*` keys.

## Folder map

**Student funnel (current)**

| Path | What |
|---|---|
| `landing.html`, `js/gate.js`, `css/landing.css` | Sign-in and consent |
| `meet.html`, `js/meet.js` | Meet Dhi |
| `question.html`, `question2.html`, `questions.html`, `js/q1.js`, `js/q2.js`, `js/questions.js`, `js/question.js`, `js/leaves.js`, `css/question.css` | Question screens, tip card, falling leaves |
| `done.html`, `js/done.js`, `css/done.css` | Constellation reveal, teaser, join (lead capture) |
| `js/music.js`, `assets/music/hero.mp3` | Background music from the landing page to question 18, with the mute button |
| `js/card.js`, `css/card.css` | The Founding Card at the top of the report (flip, shine, tilt) |
| `js/card-export.js` | Draws the card and the Instagram story on a canvas for "Save card" / "Share to Instagram" |
| `js/engine/identity.js` | Style theme and name, the Founding ID (`dhirise.founding.v1`), sound effects |
| `assets/cards/` | `owl-builder/achiever/explorer`, `seal-founding-cut` (PNG for the canvas, WebP for the page), `card-back`, `story-bg`, `flip.mp3`, `reveal.mp3`, `card-mockup (1).html` (the design reference) |
| `assets/cards/_unused/` | Local only, git-ignored: retired frame/hero card art |
| `tools/prepare_cards.py` | Built the retired frame card art (kept for reference) |
| `who.html`, `js/who.js`, `css/who.css` | "Who you are" story |
| `report-student.html`, `js/report-student.js`, `css/report-student.css` | Full report |
| `js/engine/questions.js` | The 18 questions, 72 options, their scoring and tip-card text (single source of truth) |
| `js/engine/score.js` | Pure scoring: `DhiScore.score(answers, { seed })`. No DOM, so it also runs in Node |
| `js/engine/store.js` | The one answer store (`localStorage "dhirise.check.v1"`) |
| `js/engine/screen.js` | Fills a question screen from the engine |
| `js/engine/reportText.js`, `js/engine/storyText.js` | Every word on the report and the story |
| `js/funnel-config.js` | WhatsApp link and backend endpoints (empty in the repo); see `js/funnel-config.example.js` |
| `tools/lead-sheet.gs`, `tools/LEAD-SHEET-SETUP.md` | Google Sheet receiver for leads and feedback |
| `assets/` | Logo, landing hero, `interview bg/Q1–Q18.png` |
| `INTEGRATION.md` | Everything needed to connect a backend |
| `CHANGELOG.md` | What changed |
| `README-FUNNEL.md` | Short funnel notes (older companion to this file) |

**Legacy: the old interviewer tool (kept, not used by the funnel)**

| Path | What |
|---|---|
| `index.html`, `panel.html`, `css/styles.css`, `js/app.js`, `js/data.js`, `js/panel.js` | Presenter-led interview with a private interviewer panel |
| `report.html`, `css/report.css`, `js/report.js`, `js/reportContent.js`, `js/config.js`, `js/vendor/html2pdf.*` | Printable parent report |
| `result.html`, `js/result.js`, `css/result.css` | First version of the student result (replaced by `report-student.html`) |
| `backup-before-parent-report/` | Snapshot of the old tool |
| `start-dhirise.bat` | Starts the server on 8081 and opens the legacy tool's start page |
| `recovery/` | Local only, git-ignored: student data recovered from a browser |

Nothing in the funnel loads a legacy file.

## Privacy

Real student data never goes in the repo: `recovery/`, session JSON and report PDFs are git-ignored (see `.gitignore`).
`js/funnel-config.js` stays empty in the repo (`shareUrl` is set to the live site at deploy time). The landing consent text says students under 18 need a parent or guardian with them.
