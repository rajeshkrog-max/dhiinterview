# 0007 · Privacy page and grievance contact

**Status**: Assumed
**Date**: 2026-10-09
**Authorized by**: the project owner, during /develop (told to build the privacy page next, in order, with the production deploy after it)

## Owed decision
The privacy page (scope row 18) needs the shared page frame from scope row 20 (site layout, root address and 404), and row 20 has no spec yet. The page's own design, sections and wording also have no spec.

## Assumption built on
- The page is a standalone static page at `/dhiinterviews/privacy.html`, built the way `terms.astro` is (its own markup, the funnel's dark skin through `css/terms.css`). When row 20 settles the shared frame, this page moves into it; its words and address do not change.
- The words are written from three sources that already exist in the repo: the consent text (`convex/consentText.ts`, v2), the rules in `AGENTS.md` (flags are private, nothing about a result goes to the Sheet or the leaderboard), and the services the code really uses (Google sign in, Convex, Cloudflare Pages, Cloudflare Browser Run, the team's Google Sheet).
- The page names no storage region, no retention period and no person, because none is recorded anywhere in the repo. The grievance contact is the address already in the consent text, `privacy@dhirise.com`. A named person is still owed by the owner.
- The page is linked from the landing consent sheet and from the phone step's notice. Google's consent screen address is set by the owner in the Google Cloud console.

## Code area
`src/pages/dhiinterviews/privacy.astro`, a link in `landing.astro` and `done.astro` with a small style each, `tests/privacy-page.test.js`, `e2e/privacy.spec.ts`.

## Requirements
- AC-1: `/dhiinterviews/privacy.html` opens without signing in and reads well on a phone.
- AC-2: It says what is collected, why, which services handle it (including Cloudflare Browser Run for the PDF copy), where to ask for correction or erasure, and who to contact.
- AC-3: Every contact address on the page equals the one in the consent text.
- AC-4: It never names a flag, never promises a retention period or a storage region, and uses no technical words a student would not know.
- AC-5: The landing consent sheet and the phone step notice link to it.

## Ratify
This decision was recorded by /develop, not deliberated. Run `/architect privacy page and grievance contact` to deliberate and ratify it. Until then it stays flagged as an owed decision; it does not block marking the feature `done`.
