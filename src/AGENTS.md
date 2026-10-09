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
| `pages/dhiinterviews/*.astro` | One page each. Page scripts are written as `<script is:inline type="text/dhi-deferred" src="js/...">`; `session.ts` starts them, in order, after the guard lets the page through. |
| `../functions/api/` | The Cloudflare Pages Function that forwards `/api/auth/*` to Convex, and the health check. |

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
- A page that must not flash before the guard decides keeps its script tags `text/dhi-deferred`; do not turn them into plain `<script>` tags.
- The router is pages only: links are relative (`report-student.html`), `build.format` is `file`. `/` redirects to the landing page through `public/_redirects`.
- No secrets here. Public values come from `PUBLIC_*` build variables (`.env.example`); `js/funnel-config.js` stays empty in the repo.

## Gotchas

- The guard reveals the page before the page's own scripts run, so a test must wait for the engine globals (`DhiStore`, `DhiMusic`) as `e2e/helpers.ts` does.
- Sign out wipes every `dhirise.*` key except the music setting and a waiting referral code, and only after the server confirms the session ended (offline sign out changes nothing).
- Browser tests create throwaway fake students on the dev deployment (needs `TEST_SIGNIN_ENABLED=true` there) and refuse to run against production.

## Related specs

[0001 stack](../docs/specs/0001-adopt-astro-convex-cloudflare-stack/index.md) · [0002 sign in and saved check](../docs/specs/0002-google-sign-in-and-saved-check/index.md) · [0005 results](../docs/specs/0005-results-and-report-from-saved-data/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
