# 0009. Shared site frame, root address and 404 page

**Date**: 2026-10-09
**Status**: Proposed

## Summary

The site gets one shared page frame (a header bar with the logo, a footer bar with links, and the dark glass look of the question pages) that the 404 page, the privacy page, the terms page and the two team pages all use. Any address that has no page shows a friendly styled 404 that really answers with a 404 status. The root address `/` keeps sending visitors to the landing page through one redirect line, so a different product can take the root later without moving anything under `/dhiinterviews`. The fonts move to files we host ourselves, so these pages no longer send students' addresses to Google.

## Context

Moved to [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a student who followed a mistyped or old link, I want a kind page that says the address is not here and takes me back to DhiRise, so that I am not stuck on a blank error.
- As the owner, I want the root address controlled by one line, so that I can give `/` to another product later without touching `/dhiinterviews` or any shared link.
- As a student or parent reading the privacy and terms pages, I want them to look like the rest of DhiRise and be easy to read on a phone.
- As the team, I want the team pages to match the site without changing their address or their strict security rules.

**Acceptance criteria** (the contract, each one independently checkable):
- **AC-1**: `/`, `/dhiinterviews` and `/dhiinterviews/` open the landing page through a temporary redirect (302), and a query string survives it: `/?ref=ABC123` arrives at the landing page with `ref=ABC123` still in the address.
- **AC-2**: Exactly one thing decides what `/` does: one line in `public/_redirects` (or, only if the fallback in Follow up is ever needed, one Pages Function at `/`, never both), with a comment saying it is the only place to change to give the root to another product. A source scan fails on any `href="/"` or assignment of `"/"` as an address under `src/` or `public/dhiinterviews/js`, so nothing under `/dhiinterviews` treats `/` as the funnel's home.
- **AC-3**: Any address that has no page and is not served by a Pages Function (for example `/nope`, `/dhiinterviews/nope`, `/a/b/c/d`, `/api/nope`) answers HTTP status 404 with the styled 404 page: the approved title, text and a "Go to DhiRise" button that opens the landing page. It looks right at any depth (its files are loaded by absolute address), carries a `noindex` meta tag, and runs no script. Addresses under `/api/team`, `/api/auth`, `/api/files` and `/api/render` belong to the Pages Functions and keep answering as they do today.
- **AC-4**: One shared layout (the frame) draws the page shell for the 404, privacy, terms, team list and team report pages: a glass pill header with the logo and name linking to the landing page, a main area, and a glass footer bar. The look is the question pages' design language: ink background gradient (no photo), translucent glass panels with blur and a thin border, gold accents, Mukta text.
- **AC-5**: The footer shows links to Privacy and Terms (About is added by row 21), the privacy contact email, and the line `© <year> DhiRise` with the build year. The links come from one list, and every link the frame draws ends at a page that answers 200 after at most one redirect. The footer sits outside `<main>` and has no `h1` or `h2`, so existing page checks on `main` keep their meaning.
- **AC-6**: Mukta (weights 400, 600 and 700, Latin subset) is served from our own address with its licence file, and the frame pages load nothing from Google or any other outside host. A font file that changes gets a new file name.
- **AC-7**: The two team pages keep their addresses (including the Sheet link `/dhiinterviews/team-report.html?s=`), their behaviour, their `data-page` marker on `<body>`, their `noindex` meta tag, and their strict content security policy (own scripts only). The frame adds no `<script>`, no inline event handler and no outside address, so that policy needs no change.
- **AC-8**: The privacy and terms pages keep their words exactly (the privacy contact still comes from the consent text); only their shell and look change, and the old Google Fonts links and logo fallback handlers on them are gone.
- **AC-9**: On a 390px phone, a tablet and a desktop, the frame pages never scroll sideways, all text (the footer and the team list's small lines included) is at least 16px, normal text has a contrast ratio of at least 4.5 to 1 measured with the glass laid over the lightest gradient colour, tap targets are at least 44px tall, the keyboard focus is visible, nothing moves (the frame has no animation), and the glass still reads when the browser does not support blur (a solid fallback colour no lighter than that measured colour).
- **AC-10**: Every frame page has the title `DhiRise · <page name>` and a one line description: "Page not found", "Privacy", "Challenge terms", "Team" and "Team report". The 404 and both team pages carry `<meta name="robots" content="noindex, nofollow">`; privacy and terms stay indexable.
- **AC-11**: The superseded pieces are gone: `public/dhiinterviews/css/terms.css`, the Google Fonts links on the five frame pages, and the `onerror` logo fallback. The team pages keep a small `team.css` for their own parts only.

## Decision

**Chosen option**: Option 1: One Astro layout component and one shared stylesheet, fonts hosted by us, the root as a single redirect line, and a root `404.astro`.

A `Frame.astro` layout plus `frame.css` and hosted Mukta files (Latin subset, versioned file names) become the shell of every non funnel page. The 404 page is `src/pages/404.astro`, which builds to `404.html` at the site root, where Cloudflare Pages looks up the folder tree for the closest `404.html`. The root stays one `302` line in `public/_redirects`.

**Implementation skills**: `astro` (`.claude/skills/astro/`) for layouts and the 404 page · `wrangler` (`.claude/skills/wrangler/`) for the live check with Pages functions and `_headers`

## Feature design

**Data model sketch**: None. Nothing is stored and no table changes. The frame has no state.

**State transitions**: None.

**API surface** (addresses, no new functions):

| Address | Answer | Notes |
|---|---|---|
| `/` | 302 to `/dhiinterviews/landing` | the one root line in `public/_redirects`, query string kept |
| `/dhiinterviews` and `/dhiinterviews/` | 302 to `/dhiinterviews/landing` | already there, kept |
| any unknown address that no Pages Function serves | 404 with `404.html` | closest `404.html` up the folder tree; only the root one exists. The `/*` rules in `public/_headers` apply (`nosniff`, `frame-ancestors 'none'`); no `X-Robots-Tag`, the meta tag is enough |
| `/api/team/*`, `/api/auth/*`, `/api/files/*`, `/api/render/*` | unchanged | the Pages Functions answer these, not the 404 page |
| `/dhiinterviews/fonts/*.woff2` | the font files | `Cache-Control: public, max-age=31536000, immutable` set in `public/_headers`; safe because every file name carries a version (`mukta-400.v1.woff2`) and a changed font gets `v2` |
| `/dhiinterviews/css/frame.css` | the shared stylesheet | ordinary static file |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| every frame page | the landing address for the logo link and the 404 button | one constant `HOME_PATH = "/dhiinterviews/landing.html"` in `src/lib/frame.ts` (the `.html` form is the one the dev server and the existing pages use; Pages answers it with one 308 to the clean address) |
| every frame page | the footer links | one list `FOOTER_LINKS` in `src/lib/frame.ts`, absolute `.html` addresses (`/dhiinterviews/privacy.html`, `/dhiinterviews/terms.html` now; row 21 adds About) |
| every frame page | the privacy contact email | the one email pattern moves from `privacy.astro` into `src/lib/frame.ts` as `PRIVACY_CONTACT`, reading `CONSENT_LINES` in `convex/consentText.ts`; `privacy.astro` imports it from there (no second copy) |
| every frame page | the copyright line | `© {year} DhiRise`, with the year computed in the front matter of `Frame.astro` at build time; it changes at the next deploy |
| every frame page | the title and description | page props `title` (shown as `DhiRise · <title>`) and `description` |
| every frame page | charset, viewport, `theme-color #0b0c18`, `lang="en"`, the favicon and `frame.css` | fixed in `Frame.astro`; a page adds its own CSS or head tags through `<slot name="head" />` inside `<head>` (the team pages link `team.css` after `frame.css`, by absolute address) |
| every frame page | the logo | a new 64px file `public/dhiinterviews/assets/dhirise-logo-64.png` (under 5 KB, made from the existing logo with the Pillow prep scripts), shown at 32px with `alt="DhiRise"` and used as the favicon; no `onerror` handler |
| the 404 and team pages | `noindex` | prop `noindex`, which writes exactly `<meta name="robots" content="noindex, nofollow">` in `Frame.astro`; set on the 404 and both team pages |
| the colours | ink gradient, glass, text, muted text, gold | tokens in the `:root` of `frame.css`: the team pages' indigo radial gradient (`#0b0c18` to `#1b1e3d`), glass `rgba(20,15,42,.62)` with a solid fallback, text `#fff`, muted at least `#b4b8cc`, gold `#e9b95c`, dark text `#1a1405` on gold buttons |
| the privacy and terms pages | the optional back link (terms: Challenge, privacy: landing) | prop `back` with `href` and `label` |
| the team pages | the page marker `team.ts` reads | prop `page`, written as `<body data-page={page}>` (left out when the prop is not given); the page's `<script>` goes in the default slot inside `<main>`, and `team.ts` reads the marker when its module runs, which is after the page is parsed |
| the reading width | 680px for text pages, 760px for the team pages | prop `wide` |
| every frame page | where CSS, fonts, the logo and links point | absolute addresses starting with `/dhiinterviews/` (a 404 can be served at any depth, so relative addresses would break) |
| the root redirect | where `/` goes | the one `/` line in `public/_redirects` |
| the 404 words | title, text and button label | fixed in `404.astro`: "We could not find that page" · "The address may have a typo, or the page may have moved. If a friend sent you this link, ask them to share it again." · "Go to DhiRise" (approved by the owner) |
| the fonts | Mukta 400, 600 and 700 as `woff2`, plus the licence | the TTF files and `OFL.txt` come from the `ofl/mukta` folder of the Google Fonts repository; they are subset to Latin plus the glyphs the pages use (`·`, `…`, `←`, `’`, `“`, `”`, `₹`) with `pyftsubset --flavor=woff2` and saved as `public/dhiinterviews/fonts/mukta-400.v1.woff2` (and 600, 700). `@font-face` declares `unicode-range`, `font-display: swap` and tries `local()` first; no preload. A `README.md` beside `OFL.txt` holds the exact subset command |

**Key invariants**:
- Exactly one line in `public/_redirects` has the source `/`, and it is the only place that decides what the root does.
- `Frame.astro` contains no `<script>`, no inline event handler and no outside address, and the pages that use it add none, so the team pages' content security policy stays valid.
- The footer sits outside `<main>` and has no `h1` or `h2`.
- Every link the frame draws ends at a page that exists (final status 200 after at most one redirect).
- The frame never reads or shows student data.
- Frame CSS and font addresses are absolute, so the 404 page looks right at any depth.

**Security model**: No sign in, no data, no new function. The frame pages are public (404, privacy, terms) or already gated by the team check (team pages, unchanged). Hosting the fonts ourselves means these pages no longer disclose a student's address to Google for fonts. No redirect target comes from input, so there is no open redirect. Compliance scope: students under 18 in India (Digital Personal Data Protection Act, 2023): reduced third party data sharing on the pages students and parents read.

**Configuration required**: None (no new setting). `public/_headers` gets one rule for the font files.

**Critical test scenarios** (each maps to an acceptance criterion):
- Happy path: an unknown address at three depths answers 404 and shows the styled page with the Go to DhiRise button. The e2e suite checks the page under `astro dev` (which serves `src/pages/404.astro` for unknown paths); the status and headers are checked on the built site with `pnpm verify:pages`, verifies **AC-3**.
- Happy path (built site only, `pnpm verify:pages`): `/`, `/dhiinterviews` and `/dhiinterviews/` reach the landing page, and `/?ref=ABC123` keeps its `ref`, verifies **AC-1**.
- Failure case: `/api/nope` answers 404 with the page, `/api/team/x` still answers as the Function does; a redirect that lost the query string fails the check and triggers the fallback in Follow up, verifies **AC-1**, **AC-3**.
- Headers (built site): `/nope` carries `nosniff` and `frame-ancestors 'none'`; `/dhiinterviews/fonts/mukta-400.v1.woff2` carries the long `Cache-Control`; the two team pages keep their policy, verifies **AC-6**, **AC-7**.
- Old links (built site): the invite style address `/?ref=...`, `/dhiinterviews/landing`, the team Sheet link and `/dhiinterviews/privacy/` still end at a styled 200 or a redirect to one, verifies **AC-1**, **AC-7**.
- Source scan: one source for `/`; no `href="/"` or `"/"` address under `src/` and `public/dhiinterviews/js`; `Frame.astro` and the five pages have no inline script, handler or outside host (the team test keeps its "exactly one `<script>` and `import ../../lib/team`" per page, and asserts the `noindex` literal in `Frame.astro`); the footer has no h1 or h2 and sits outside `<main>`; the footer link list resolves; the old files are gone, verifies **AC-2**, **AC-5**, **AC-6**, **AC-7**, **AC-10**, **AC-11**.
- Contrast: a test reads `--text`, `--muted`, `--gold` and the glass token from `frame.css`, lays the glass over the lightest gradient colour and requires at least 4.5 to 1 for each text colour (and for dark text on gold), and that the solid fallback is no lighter than that colour, verifies **AC-9**.
- Layout: the five frame pages at 390, 820 and 1280 wide have no sideways scroll, text of at least 16px (the team page's small line included) and tap targets of at least 44px, verifies **AC-9**.
- Regression: the team e2e suite, the team surface tests, the privacy tests (updated to check that `privacy.astro` imports `PRIVACY_CONTACT` from `lib/frame` and `frame.ts` reads `convex/consentText`) and the Sheet link address still pass, verifies **AC-7**, **AC-8**.

## Build plan

Approach: Tracer Bullet (the project default). Prove one thin real thread first (the frame, the fonts and the 404 working on the built site), then thicken one page group at a time.

**Milestone 1. The thin thread: frame, fonts and the 404**
1. Add the subset Mukta files (versioned names), `OFL.txt` and the `README.md` with the subset command to `public/dhiinterviews/fonts/`, the `_headers` rule for them, the 64px logo, `src/lib/frame.ts` (`HOME_PATH`, `FOOTER_LINKS`, `PRIVACY_CONTACT`), `public/dhiinterviews/css/frame.css` (tokens, ink gradient, glass pill header, glass panels, glass footer, Mukta, focus, 16px floor, solid fallback when blur is unsupported) and `src/layouts/Frame.astro` (props `title`, `description`, `noindex`, `back`, `wide`, `page`; a `head` slot), satisfies **AC-4**, **AC-5**, **AC-6**, **AC-9**, **AC-10**.
2. Add `src/pages/404.astro` using the frame with the approved words, add the `verify:pages` script (build the site, run `wrangler pages dev dist` against the dev deployment, and check statuses and headers with a small node script), and prove on the built site that an unknown address at three depths answers 404 with the page and its fonts and styles load, satisfies **AC-3**, **AC-6**, **AC-10**.

**Milestone 2. The root address**
3. Tidy `public/_redirects` to one commented `/` line, keep the two `/dhiinterviews` lines, and check with `pnpm verify:pages` that `/?ref=ABC123` arrives with `ref`. If the query string is lost, add the fallback from Follow up, satisfies **AC-1**, **AC-2**.

**Milestone 3. Privacy and terms in the frame**
4. Move `privacy.astro` and `terms.astro` into the frame with their words unchanged (`privacy.astro` imports `PRIVACY_CONTACT`), delete `terms.css`, the Google Fonts links and the logo `onerror`, and update `tests/privacy-page.test.js` and `e2e/privacy.spec.ts` for the new shell, satisfies **AC-5**, **AC-8**, **AC-10**, **AC-11**.

**Milestone 4. The team pages in the frame**
5. Move `team.astro` and `team-report.astro` into the frame (`wide`, `noindex`, `page="list"` or `"report"`, `team.css` through the head slot), cut `team.css` down to the list rows, buttons and viewer (the small line goes to 16px), and update `tests/team-surface.test.js` (scan `Frame.astro` too, assert the `noindex` literal there) and the team e2e selectors that moved. This milestone is the last move and the one to drop if it gets risky, satisfies **AC-7**, **AC-9**, **AC-11**.

**Milestone 5. Proof**
6. Add the source scan tests, the redirect test, the contrast test and the e2e checks (unknown addresses under `astro dev`, layout at three widths), then run `pnpm verify:pages` on the built site with the real headers and record the result: the 404 status, the query string kept, the headers on the 404 and the fonts, the team policy intact, the old links (invite style `/?ref=`, the team Sheet link, `/dhiinterviews/privacy/`), satisfies **AC-1** to **AC-11**.

## Consequences

**Positive**:
- Every public page and the team pages look like DhiRise, from one stylesheet and one layout, so row 21 (About) is a short page.
- The root can be handed to another product by editing one line.
- A student who lands on a wrong address is guided home instead of seeing a blank error.
- These pages no longer ask Google for fonts, which is better for minors' privacy.

**Negative / tradeoffs**:
- The privacy and terms headings change from Cinzel to Mukta, and the pages gain a glass shell: a visible change to pages that were just built.
- The team pages gain risk for little gain: their strict policy and tests must keep passing through the move, and their markup changes.
- The font files add about 40 to 60 KB the first time and must keep their licence file with them.
- The funnel screens (landing, questions, report) still load fonts from Google, so the privacy gain covers only the frame pages until they move too.
- The copyright year changes only at the next deploy.
- Adding `404.html` turns off Pages' single page app fallback: an old link that only worked through that fallback now gets the 404 page, which is the intent.

**Neutral**:
- The footer shows no About link until row 21 ships.
- The frame is plain static markup: no script, no state.

## Follow-up

- [ ] Live check (`pnpm verify:pages`): confirm on the built site that Pages answers the 404 page with status 404 (the Cloudflare page does not state the status) and that the `_redirects` `/` line keeps `?ref=` (the Cloudflare page does not state it). If the query string is lost, replace the `/` line with a small Pages Function at `/` (`functions/index.ts`) that redirects with the query string copied, and keep it the single place that decides the root (a test asserts there is never both).
- [ ] Row 21 (About) adds its entry to `FOOTER_LINKS` and uses the frame.
- [ ] Move the funnel screens off Google Fonts to the hosted files (their look is wider than this spec). Enroll in the scope with `/scope`.
- [ ] Confirm the Mukta licence text from the font's own release when the files are taken, and copy `OFL.txt` beside them (the Google Fonts page did not show the licence when checked).
- [ ] Spec 0007 (the privacy page, `Assumed`) owed its shared frame; once this spec is built, ratify it with `/architect` (its premise about the missing frame is settled here).
- [ ] After the build, `/sync` records the frame conventions (absolute addresses, props, no inline script) in `src/AGENTS.md`.
- [ ] Row 10 (referrals) relies on `?ref=` surviving the root redirect (AC-1); keep that test when the root changes.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
