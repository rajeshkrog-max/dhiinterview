# DhiRise student funnel

A mobile first self check for students (Class 8 to college, India) and the marketing funnel for the upcoming Dhi app. A student signs in, answers 18 questions, gets a teaser, a "Who you are" story, a full report with a Founding Card, then can join the Founding Circle Challenge (referrals and leaderboard). Backend developers: start with `BACKEND.md`.

## Stack

- **Language / Runtime**: plain HTML, CSS and JavaScript (ES5 style, runs in the browser). No framework, no build step, no backend yet.
- **Framework**: none
- **Key dependencies**: `js/vendor/html2pdf.bundle.min.js` (legacy report only), Google Apps Script receiver in `tools/lead-sheet.gs`, Python with Pillow for image prep scripts in `tools/`
- **Package manager**: none (no `package.json`)
- **Storage**: browser `localStorage`, keys start with `dhirise.` and end with a version, e.g. `dhirise.check.v1`

## Build approach

<TBD, set by /scope>

## Commands

```bash
# Install
# nothing to install

# Dev server (port 8081; 8080 is taken on the main dev machine)
npx --yes serve -l 8081 --no-clean-urls .      # or: python -m http.server 8081
# then open http://localhost:8081/landing.html

# Build
# no build step

# Test
# no test runner; js/engine/score.js is pure and runs in Node. Manual scenarios: BACKEND.md section 15
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`. Handover docs live at the root: `BACKEND.md`, `INTEGRATION.md`, `README.md`, `CHANGELOG.md`.

## Rules

- Each script is an IIFE that hangs one global on `window` (`DhiScore`, `DhiQuestions`, `DHI_FUNNEL`, `DHI_CHALLENGE`). Pages load them with plain `<script>` tags, so the order matters: config, then `js/api.js`, then `js/engine/*`, then the page script.
- Start each file with a header comment that says what it owns and what it needs loaded first.
- Challenge data is read and written only through `js/api.js` (a localStorage mock today). Keep its `// BACKEND:` notes accurate when you change it.
- Store answers as option ids (`q4o2`), never screen positions. Options are shuffled per student.
- Never show the internal style keys `v`/`p`/`k` or scoring internals to students. Never label a student by ability or rank. Flags like `selfDoubt` and `lowMood` are sensitive and never public.
- No secrets in front end code. `js/funnel-config.js` stays empty in the repo; real values are set at deploy time (format in `js/funnel-config.example.js`).
- Never commit student data (`recovery/`, `Dhirise_Session_*.json`, report PDFs are git ignored). Students under 18 need a parent or guardian's consent.
- The legacy interviewer tool (`index.html`, `panel.html`, `report.html`, `result.html`, `js/app.js`, `js/data.js`, `js/panel.js`, `js/report*.js`, `js/result.js`, `js/config.js`, `backup-before-parent-report/`) is kept but not used. The funnel must never load a legacy file.
- Every word students read is kind and plain. Copy lives in `js/engine/reportText.js`, `js/engine/storyText.js` and `js/engine/questions.js`, not in the page scripts.

## Agent skills

None installed. Skipped for now; candidates to review later: none needed for plain HTML/JS, optionally a Google Apps Script or Google Sheets skill for `tools/lead-sheet.gs`.

## Context files

- [js/engine/AGENTS.md](js/engine/AGENTS.md) (questions, scoring, answer store, report and story text)
- [tools/AGENTS.md](tools/AGENTS.md) (Google Sheet lead receiver and image prep scripts)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
