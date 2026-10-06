# Changelog

## 2026-10-06 · Funnel revamp

**Part 1: Scoring engine**
- One source for all 18 questions and 72 options (`js/engine/questions.js`), each option scored from its on-screen wording.
- Pure scoring in `js/engine/score.js`: learning style with confidence, mind state, 7 areas with bands and tie-breaks, 4 indices, Dhi starting score, top/bottom areas with the answer that moved them, subject profile, flags.
- Options are shuffled per student (seeded by name + date); answers are stored as option ids.
- One store, `localStorage "dhirise.check.v1"`, which survives a refresh. The question screens render from the engine.

**Part 2: Flow and lead capture**
- The landing gate opens the new `meet.html`, and the "Preview question" link is gone.
- `done.html`: the wait animation is kept, followed by a teaser and the join (mobile + WhatsApp early-access tick, or Skip).
- Leads are kept locally and POSTed to `leadEndpoint` when it's set. Added `js/funnel-config.js` and the Google Sheet script in `tools/`.

**Part 3: Tip cards**
- All 72 tip cards rewritten: a mirror line, a gold "In Dhi · Room" pill, how that room helps, and "X% of students chose this too". Card timing and animation are unchanged.

**Part 4A/4B: New report**
- `report-student.html`: Dhi starting score ring, KPI 2×2, 7-axis radar, mind-state donut, learning style, what's working / next to grow, gentle signals, study blueprint, 21-day path with saved ticks, Dhi rooms, join card. Inline SVG; animates once; respects reduced motion.
- Full report text (`js/engine/reportText.js`): three styles plus blends, 7 areas × 3 bands quoting the student's own answer, plans per area tied to Dhi rooms, with variants chosen per student.

**Part 5: Flow check and docs**
- Verified the new flow loads none of the legacy files. Added `README-FUNNEL.md`.

**Part 6: Story and report additions**
- `who.html`: a 6-card "Who you are" story from the answers (`js/engine/storyText.js`), between the join and the report.
- Report: soft "self-reflection only" chip; food, sports & hobbies, and career cards per style and blend; a feedback card (stars, note, share opt-in) POSTed to `feedbackEndpoint`. The sheet script gained a Feedback tab.

**Cleanup**
- `.gitignore` now covers student data, test outputs, local settings and OS clutter. Added `js/funnel-config.example.js`.
- New `README.md`, `INTEGRATION.md` and this changelog.
