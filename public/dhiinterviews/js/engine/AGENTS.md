# Engine (questions, scoring, store, words)

## Overview

The engine holds everything that decides what a student sees about themselves: the 18 questions, how answers turn into a score, where answers are kept, and the words on the report and story. The screens in `js/` only draw what the engine returns. `score.js` has no DOM and no storage, so it also runs in Node and on the Convex server (`convex/scoring.ts` loads `questions.js` and `score.js` for their side effect; never a second copy).

## Key files

| File | Owns |
|---|---|
| `questions.js` | `DhiQuestions`: the 18 questions, 72 options, their scoring and tip card text. The single source of truth. |
| `score.js` | `DhiScore.score(answers, { seed })`, `order`, `ENGINE_VERSION`. Style, mind state, 7 areas, 4 indices, Dhi starting score, flags. Also the seeded option shuffle. |
| `store.js` | `DhiStore`: the signed in student's local copy of the check (`dhirise.session.v1`) and, from `result()`, the saved result copy (`dhirise.result.v1`). Pages get the result itself from `DhiSession.result()` (a promise; `src/lib/session.ts`). |
| `screen.js` | `window.dhiriseScreen(start)`: the controller for all 18 questions in one page. Fills the screen from the engine, hands it to `js/question.js`, and on Next / Back swaps the question in place (`history.pushState` with the `urlFor` addresses, `popstate` for the browser's Back), so the page never reloads between questions and the music (`js/music.js`) keeps playing. The background is `js/qbg.js`. |
| `reportText.js` | `DhiReportText`: every word on `report-student.html`, plus `band(score)` and `VERSION` (the report version, bump it by hand when the report's words or layout change). |
| `storyText.js` | `DhiStoryText`: every word on `who.html`. |
| `identity.js` | `DhiIdentity`: style theme and name, the Founding ID (`dhirise.founding.v1`), sound effects. |

## Conventions

- Load order matters: `questions.js` before `score.js`, `score.js` before `store.js`, `reportText.js` before `identity.js`. Each file's header says what it needs.
- Answers are option ids (`q4o2` = question 4, the 2nd option as written in `questions.js`), never screen positions. Do not reorder options in `questions.js`; ids follow the written order.
- Pages never score. They draw the saved result (`DhiSession.result()`); only the server scores, at Finish. Bump `DhiScore.ENGINE_VERSION` whenever `score()` gives different output for any answers, and add the new version's entry to `tests/fixtures/score-lock.json` (never edit an older entry); `convex/score.lock.test.ts` fails otherwise.
- Scoring stays pure: no DOM, no `localStorage`, no clock. Anything random comes from the seed (name plus start date) so the same student always gets the same result.
- Style keys `v`/`p`/`k` (and blends `vp`, `vk`, `pk`) are internal. Student facing text uses the names (Explorer, Achiever, Builder).
- Report and story text use soft language ("you may", "it seems"), no labels about ability, no medical words. Arrays of two lines are variants picked per student by seed.
- A new name at the gate starts a fresh check in the store.

## Gotchas

- The area and index names are repeated in `tools/lead-sheet.gs` (`AREAS`, `INDICES`). If you add or rename one here, update the sheet script too.
- `DhiReportText.VERSION` must equal `REPORT_VERSION` in `convex/reportVersion.ts`; bumping both makes the server draw each student's saved PDF copy again.
- Peer shares ("X% of students chose this") are seeded numbers (`peerSeed` in `questions.js`, `peers` in `reportText.js`), not real data.
- A saved result never changes. Each one stores the `ENGINE_VERSION` that made it, so changing scoring affects only students who finish afterwards.

## Related specs

Scoring rules and the API contract are in `BACKEND.md` (sections on scoring and test scenarios). Saved results and the scoring lock: [spec 0005](../../../../docs/specs/0005-results-and-report-from-saved-data/index.md).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
