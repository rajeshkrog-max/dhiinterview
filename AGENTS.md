# DhiRise student funnel

A mobile first self check for students (Class 8 to college, India) and the marketing funnel for the upcoming Dhi app. A student signs in, answers 18 questions, gets a teaser, a "Who you are" story, a full report with a Founding Card, then can join the Founding Circle Challenge (referrals and leaderboard). Backend developers: start with `BACKEND.md`.

## Stack

- **Language / Runtime**: TypeScript (strict) for the backend and the browser bridge, Node 22. Page scripts stay plain JavaScript (ES5 style, runs in the browser).
- **Framework**: Astro 7 (static output, no server adapter). Backend: Convex. Sign in: Better Auth (Google only). Hosting: Cloudflare Pages. Source of truth: spec `docs/specs/0001-adopt-astro-convex-cloudflare-stack/`.
- **Key dependencies**: Cloudflare Browser Run (draws the saved report PDF on the server, spec 0006), `js/vendor/html2pdf.bundle.min.js` (legacy report only), Google Apps Script receiver in `tools/lead-sheet.gs`, Python with Pillow for image prep scripts in `tools/`
- **Package manager**: pnpm
- **Storage**: Convex is the truth. The browser keeps a device copy in `localStorage` (keys start with `dhirise.` and end with a version, e.g. `dhirise.session.v1`, `dhirise.result.v1`); the list is in `src/lib/local.ts`.

## Build approach

Tracer Bullet (vertical slices, each built end to end through every layer, working). Prove one thin real thread first, then thicken one strand at a time. (from the scope header, `docs/scope/scope.md`)

## Commands

```bash
# Install
pnpm install

# Dev server (Astro, port 4321) and the Convex dev deployment (writes .env.local)
pnpm dev                       # then open http://localhost:4321/dhiinterviews/landing.html
pnpm exec convex dev           # or `convex dev --once` to push once and typecheck

# Build
pnpm build                     # static site into dist/

# Test
pnpm test                      # vitest: convex suites (convex/*.test.ts) and the browser scripts (tests/)
pnpm test:e2e                  # Playwright, against the local site and the Convex DEV deployment
pnpm exec tsc --noEmit         # typecheck
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`. Handover docs live at the root: `BACKEND.md`, `INTEGRATION.md`, `README.md`, `CHANGELOG.md`.

## Rules

- Each script is an IIFE that hangs one global on `window` (`DhiScore`, `DhiQuestions`, `DHI_FUNNEL`, `DHI_CHALLENGE`). Pages load them as `<script type="text/dhi-deferred">` tags (started in order by the page guard in `src/lib/session.ts`), so the order matters: config, then `js/api.js`, then `js/engine/*`, then the page script.
- Start each file with a header comment that says what it owns and what it needs loaded first.
- Challenge data is read and written only through `js/api.js` (a localStorage mock today). Keep its `// BACKEND:` notes accurate when you change it.
- Store answers as option ids (`q4o2`), never screen positions. Options are shuffled per student.
- Never show the internal style keys `v`/`p`/`k` or scoring internals to students. Never label a student by ability or rank. Flags like `selfDoubt` and `lowMood` are sensitive and never public.
- No secrets in front end code. `js/funnel-config.js` stays empty in the repo; real values are set at deploy time (format in `js/funnel-config.example.js`).
- Never commit student data (`recovery/`, `Dhirise_Session_*.json`, report PDFs are git ignored). Students under 18 need a parent or guardian's consent.
- The legacy interviewer tool (`index.html`, `panel.html`, `report.html`, `result.html`, `js/app.js`, `js/data.js`, `js/panel.js`, `js/report*.js`, `js/result.js`, `js/config.js`, `backup-before-parent-report/`) is kept but not used. The funnel must never load a legacy file.
- Every word students read is kind and plain. Copy lives in `js/engine/reportText.js`, `js/engine/storyText.js` and `js/engine/questions.js`, not in the page scripts.
- The Google profile picture (spec 0011) is copied once into our own storage and shown only from `/api/avatar/<key>`; no screen contacts Google for it. Pages draw it through `DhiAvatar` (`js/avatar.js`) and keep its path in memory, never in `localStorage`. It is not on the question pages, the Founding Card, the Sheet or analytics. Production runs it ON for everyone since 2026-10-10 (owner decision, nobody is asked); `PROFILE_PICTURE_ENABLED=false` holds it off, and `PICTURE_CONSENT_REQUIRED=true` brings the asked flow back (then run `avatars:dropUnagreed` once). The v4 words approval and the legal check are still owed.

## Agent skills

None installed. Skipped for now; candidates to review later: none needed for plain HTML/JS, optionally a Google Apps Script or Google Sheets skill for `tools/lead-sheet.gs`.

## Context files

- [public/dhiinterviews/js/engine/AGENTS.md](public/dhiinterviews/js/engine/AGENTS.md) (questions, scoring, answer store, report and story text)
- [tools/AGENTS.md](tools/AGENTS.md) (Google Sheet lead receiver and image prep scripts)
- [convex/AGENTS.md](convex/AGENTS.md) (the Convex backend: tables, sign in, checks, results, leads, Sheet copy)
- [src/AGENTS.md](src/AGENTS.md) (Astro pages, the page guard and the browser bridge `DhiSession`)

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
