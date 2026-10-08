# Engine (questions, scoring, store, words)

## Overview

The engine holds everything that decides what a student sees about themselves: the 18 questions, how answers turn into a score, where answers are kept, and the words on the report and story. The screens in `js/` only draw what the engine returns. `score.js` has no DOM and no storage, so it also runs in Node.

## Key files

| File | Owns |
|---|---|
| `questions.js` | `DhiQuestions`: the 18 questions, 72 options, their scoring and tip card text. The single source of truth. |
| `score.js` | `DhiScore.score(answers, { seed })`, `order`, `seedOf`, `band`. Style, mind state, 7 areas, 4 indices, Dhi starting score, flags. Also the seeded option shuffle. |
| `store.js` | `DhiStore`: the one answer store, `localStorage "dhirise.check.v1"`. |
| `screen.js` | `window.dhiriseScreen(n, back)`: fills one question screen from the engine, hands it to `js/question.js`. |
| `reportText.js` | `DhiReportText`: every word on `report-student.html`. |
| `storyText.js` | `DhiStoryText`: every word on `who.html`. |
| `identity.js` | `DhiIdentity`: style theme and name, the Founding ID (`dhirise.founding.v1`), sound effects. |

## Conventions

- Load order matters: `questions.js` before `score.js`, `score.js` before `store.js`, `reportText.js` before `identity.js`. Each file's header says what it needs.
- Answers are option ids (`q4o2` = question 4, the 2nd option as written in `questions.js`), never screen positions. Do not reorder options in `questions.js`; ids follow the written order.
- Scoring stays pure: no DOM, no `localStorage`, no clock. Anything random comes from the seed (name plus start date) so the same student always gets the same result.
- Style keys `v`/`p`/`k` (and blends `vp`, `vk`, `pk`) are internal. Student facing text uses the names (Explorer, Achiever, Builder).
- Report and story text use soft language ("you may", "it seems"), no labels about ability, no medical words. Arrays of two lines are variants picked per student by seed.
- A new name at the gate starts a fresh check in the store.

## Gotchas

- The area and index names are repeated in `tools/lead-sheet.gs` (`AREAS`, `INDICES`). If you add or rename one here, update the sheet script too.
- Peer shares ("X% of students chose this") are seeded numbers (`peerSeed` in `questions.js`, `peers` in `reportText.js`), not real data.
- Changing scoring changes every saved student's result. The backend stores an engine version for that reason (see `BACKEND.md`).

## Related specs

Scoring rules and the API contract are in `BACKEND.md` (sections on scoring and test scenarios).

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
