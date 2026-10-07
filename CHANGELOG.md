# Changelog

## 2026-10-07 · Founding Card, reveal, music, join and DhiRise naming

**Meet screen** (`meet.html`)
- New copy: the DhiRise logo, a "Founding batch · Student trial" card ("Grow in marks. Grow in mind."), three rows (Productivity app,
  Mentorship, Community), the trial-batch line and "18 questions · about 5 minutes". The old tracker / short film / AI desk text is gone.
  The button reads "Start the check".

**Join screen** (`done.html`)
- Mobile number with a fixed "+91" prefix, grouped 3-3-4 while typing (works with backspace and paste). Valid = 10 digits starting 6–9.
  Only the digits are saved, as before.
- Submit swaps the form for a gold tick and "Thank you! Our team will message you soon.", then opens the story after 2.5 s.
- "Skip" removed. The WhatsApp early-access tick is unchanged.
- Wherever a number is shown later it is masked: `+91 ••• ••• 3210`.

**Background music** (`js/music.js`, `assets/music/hero.mp3`)
- Plays from the landing page through question 18: soft loop (0.35), fades in, starts on the first tap if autoplay is blocked,
  carries its position across pages (sessionStorage), fades out on Finish. No music on done.html or the report.
- Round mute button top-right, remembered in localStorage (`dhirise.music.muted`). Hidden if the file fails to load.

**Constellation reveal** (`done.html`)
- Replaces the loading bar: the 18 answers appear as points on the 7-area shape, join up, glow in the style colour, then
  "You are <style>" with `reveal.mp3` (silent when muted). Reduced motion shows the finished shape with a fade.

**Founding ID**
- `DR-` + 4 characters (A–Z, 2–9, no O/0/I/1), made once per student (`localStorage "dhirise.founding.v1"`) and added to the lead as `foundingId`.
  Not printed on the card. The Google Sheet script stores it as a new last column.

**Founding Card** (`js/card.js`, `css/card.css`, top of `report-student.html`)
- Built from `assets/cards/card-mockup (1).html`: ivory card with gold rims, a colour window with the style's owl breaking out of it,
  the style tag, the first name in caps (Cinzel, shrinks to fit), a gold rule, the community line (first name in Title Case) and the Founding Batch seal.
- Builder = red owl, Achiever = green, Explorer = blue; blends use the main style.
- Enters as the card back and flips (`flip.mp3`), with a subtle shine and a 6° tilt; none of these with reduced motion.

**Save and share** (`js/card-export.js`)
- The card is drawn on a canvas from the PNGs (not a screenshot): "Save card" downloads `DhiRise_<FirstName>.png` (1080×1620).
- "Share to Instagram" shares a 1080×1920 story image (story background, the card, "Take your DhiRise check" and `shareUrl`)
  through the share sheet, or downloads it with a hint where file sharing isn't supported.

**DhiRise naming**
- Every student-visible "Dhirise" is now "DhiRise" (titles, page text, tip cards, report). File names, classes and storage keys are unchanged.

**Housekeeping**
- Retired card art (frames, heroes, the first seal) moved to `assets/cards/_unused/`, which is git-ignored. `tools/prepare_cards.py` built it.

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
