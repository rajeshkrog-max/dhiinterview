# Site pages and the browser bridge

## Overview

The Astro side of the funnel (static output, no server rendering). Each page in `src/pages/dhiinterviews/` is a thin shell: markup, a `<Guard>`, and the page's classic scripts from `public/dhiinterviews/js/`. `src/lib/session.ts` is the bridge between those scripts and Convex: it exposes `window.DhiSession` and guards every protected page.

## Key files

| File | Owns |
|---|---|
| `components/Guard.astro` | The page guard in `<head>`: hides a protected page until the session state is known, sends a definite signed out or no profile visitor to landing, then starts the page scripts. Modes `protected` and `landing`. |
| `lib/session.ts` | `window.DhiSession`: who is here, the local copy of the check (`dhirise.session.v1`), the unsent answers queue, sign in and out, `finish`, lead and feedback saves, and `result()` (the saved result as the old flat object, with a try again state, never a redirect to landing). |
| `lib/result.ts` | The pure parts of the saved result, unit tested without a page: `flatten` (the one adapter to the old flat object), `isFlat` (shape check for a device copy) and `startResult` (the wait, the box and the retry, one live timer). |
| `lib/local.ts` | Every `dhirise.*` localStorage key and the wipe used at sign out. A new key belongs in this list and in its header comment. |
| `lib/auth-client.ts` | Better Auth and Convex client setup. Talks to the site's own `/api/auth/*`, never to Convex for auth. |
| `pages/dhiinterviews/privacy.astro` | The privacy page (spec 0007). Its words are plain and factual; the contact address is read from the consent text so the two cannot differ. Update it whenever the consent text or a service that handles student data changes. |
| `pages/dhiinterviews/*.astro` | One page each. Page scripts are written as `<script is:inline type="text/dhi-deferred" src="js/...">`; `session.ts` starts them, in order, after the guard lets the page through. |
| `../functions/api/` | The Cloudflare Pages Functions that forward `/api/auth/*` to Convex, the health check, and two GET only forwarders for the report copy: `files/` (`/api/files/report`, the student's own PDF) and `render/` (`/api/render/payload`, read by Browser Run with a signed token). |
| `../functions/api/avatar/` | The GET only forwarder for the profile picture (`/api/avatar/<key>`). It checks the key shape before forwarding, sends no cookies, sets every header in code (`nosniff`, `noindex`, the sandbox policy, `ETag`) and keeps an image at the edge for 50 minutes and in a browser for 10 (an hour in all, at most). |
| `pages/dhiinterviews/report-render.astro` | The page Cloudflare Browser Run opens to draw the saved PDF (spec 0006). No sign in, no Guard, no tracking. `public/dhiinterviews/js/render-boot.js` reads the token from the `#t=` fragment, fetches the payload with a header, draws `report-student.js` in its print mode and sets `data-ready` or `data-error`. |

## Commands

```bash
pnpm dev                 # Astro on http://localhost:4321 (proxies /api/auth to the Convex dev deployment)
pnpm build               # static site into dist/
pnpm test                # vitest: convex suites plus the plain browser scripts in tests/
pnpm test:e2e            # Playwright against the local site and the Convex DEV deployment
pnpm run deploy:pages    # convex deploy, then build, then wrangler pages deploy
```

## Conventions

- Page scripts are plain ES5 and hang one global on `window`. They never talk to Convex themselves; they call `DhiSession` (typed in `session.ts`). Anything a page and the server must agree on (`consentText.ts`, `feedbackRules.ts`) is imported from `convex/` so the two cannot drift.
- Pages never score. Pages that show a result wait for `DhiSession.result()` and draw only when it arrives. The device copy is `dhirise.result.v1` (`{ v: 1, owner, result }`), written only after the server answered and used only for its owner.
- `report-student.js` has a print mode, on when `window.DHI_RENDER` is set (only the render page sets it): no flag text, no animation, no interactive parts, the India date. The Download button (`report-download.js` rules, `DhiSession.reportCopy`) gives the server made PDF and falls back to the browser's print page.
- A page that must not flash before the guard decides keeps its script tags `text/dhi-deferred`; do not turn them into plain `<script>` tags.
- The router is pages only: links are relative (`report-student.html`), `build.format` is `file`. `/` redirects to the landing page through `public/_redirects`.
- No secrets here. Public values come from `PUBLIC_*` build variables (`.env.example`); `js/funnel-config.js` stays empty in the repo.
- The student's picture (spec 0011): `DhiSession.picture()` is its same origin path (`/api/avatar/<key>`), kept in memory only, never in `localStorage`. Pages draw it only through `DhiAvatar` (`js/avatar.js`: a fixed size circle with a fall back to the initial), never with their own `<img>`, and no page or HTML points at a Google host. The report page's own Remove and Restore row is `js/picture-control.js`; the one time notice (asked mode only) is `js/picture-notice.js`.
- The team pages load exactly one plain script besides the bundled `lib/team` import: `js/avatar.js` as a same site file (the team tests allow that one tag and no other `is:inline`). Their strict policy (`img-src 'self'`) is unchanged because the picture is a same origin path.

## Gotchas

- The guard reveals the page before the page's own scripts run, so a test must wait for the engine globals (`DhiStore`, `DhiMusic`) as `e2e/helpers.ts` does.
- Sign out wipes every `dhirise.*` key except the music setting and a waiting referral code, and only after the server confirms the session ended (offline sign out changes nothing).
- Browser tests create throwaway fake students on the dev deployment (needs `TEST_SIGNIN_ENABLED=true` there) and refuse to run against production.

## Related specs

[0001 stack](../docs/specs/0001-adopt-astro-convex-cloudflare-stack/index.md) · [0002 sign in and saved check](../docs/specs/0002-google-sign-in-and-saved-check/index.md) · [0005 results](../docs/specs/0005-results-and-report-from-saved-data/index.md) · [0006 report copy](../docs/specs/0006-report-copy-saved-when-seen/index.md) · [0011 profile picture](../docs/specs/0011-google-profile-picture/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
