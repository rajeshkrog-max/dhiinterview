# Verify: site layout, root address and 404 · spec 0009 · updated 2026-10-09
_Steps derived from spec 0009 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Before you start: `pnpm build`, then `pnpm verify:pages` serves the built site with the real Cloudflare Pages rules (it points the functions at the dev Convex deployment and refuses production). For the look, serve it on port 4321 with `pnpm exec wrangler pages dev dist --port 4321 --binding CONVEX_SITE_URL=<dev .convex.site address>` and open it in a browser.

## UI / manual
- [ ] Open `/some/lost/page` on the built site → the styled 404: title "We could not find that page", the approved text, a gold "Go to DhiRise" button, the glass header and footer, Mukta text, and the page still looks right although the address is deep      → AC-3, AC-4
- [ ] Tap "Go to DhiRise" → the landing page opens      → AC-3
- [ ] Open `/dhiinterviews/privacy.html` and `/dhiinterviews/terms.html` → same words as before, now inside the glass card with the header, a back link (privacy: Back, terms: Challenge) and the footer      → AC-4, AC-8
- [ ] Open `/dhiinterviews/team.html` and `/dhiinterviews/team-report.html?s=abc` signed out → the Sign in with Google button inside the frame; sign in as a team member (the dev fake sign in works) → the list and the PDF viewer work as before      → AC-7
- [ ] Footer on every frame page → Privacy and Terms links, the privacy email (a mailto link), and `© <this year> DhiRise`; no About link yet      → AC-5
- [ ] Value source: the footer email equals the contact in the consent text (`convex/consentText.ts`) and the privacy page      → AC-5
- [ ] On a 390px phone, a tablet and a desktop, look at all five pages → no sideways scroll, text easy to read, the glass readable over the dark background      → AC-9
- [ ] Press Tab on the 404 page → the logo link shows a clear white outline; keep tabbing through the footer links      → AC-9
- [ ] In a browser with blur turned off (or an old one) → the header, card and footer still read on a solid dark fill      → AC-9
- [ ] Open the page source of each frame page → no Google font address, no `onerror`, one script only on the two team pages      → AC-6, AC-7, AC-11
- [ ] Real phone, once: open the 404 and privacy pages on mobile data → they load quickly (fonts about 70 KB in total for three weights)      → AC-6

## Commands
- [ ] `pnpm verify:pages` → all checks pass (404 status at `/nope`, `/dhiinterviews/nope`, `/a/b/c/d` and `/api/nope`; `/api/team/list` answers 401 from its function; `/`, `/dhiinterviews` and `/dhiinterviews/` answer 302 to the landing page; `/?ref=ABC123` keeps `ref`; the font file is cached as immutable; the two team pages keep their policy; the Sheet link keeps `?s=`; old addresses end at a page)      → AC-1, AC-2, AC-3, AC-6, AC-7
- [ ] `curl -I http://localhost:8788/nope` (while `verify:pages` or wrangler runs) → `404`, `x-content-type-options: nosniff`, and a `content-security-policy` with `frame-ancestors 'none'`      → AC-3
- [ ] `pnpm exec tsc --noEmit` → no errors
- [ ] `pnpm test` → all suites pass, including `tests/frame.test.js` (one root line, no link to `/`, the footer links exist, hosted fonts with versioned names, the colour contrast of the tokens, no text under 16px, nothing moves) and `tests/team-surface.test.js`      → AC-2, AC-5, AC-6, AC-7, AC-9, AC-10, AC-11
- [ ] `pnpm test:e2e e2e/frame.spec.ts e2e/team.spec.ts e2e/privacy.spec.ts` → pass on the dev deployment      → AC-3, AC-4, AC-5, AC-7, AC-8, AC-9
- [ ] Production, after the deploy: `curl -sI https://<site>/` → 302 to `/dhiinterviews/landing`; `curl -sI "https://<site>/?ref=ABC123"` keeps the query; `curl -sI https://<site>/nope` → 404      → AC-1, AC-3
- [ ] Production: open an old invite link `https://<site>/dhiinterviews/landing.html?ref=ABC123` and the team Sheet link → both still reach their pages      → AC-1, AC-7

## Acceptance-criteria coverage
- AC-1 … `pnpm verify:pages` root and query checks, production curl · AC-2 … `tests/frame.test.js` (one root source), the comment in `public/_redirects` · AC-3 … `verify:pages` 404 checks, `e2e/frame.spec.ts`, the 404 steps
- AC-4 … the frame pages steps, `e2e/frame.spec.ts` glass check · AC-5 … footer steps, `tests/frame.test.js`, `e2e/frame.spec.ts` link walk · AC-6 … `tests/frame.test.js` fonts, `e2e/frame.spec.ts` no outside host
- AC-7 … team steps, `tests/team-surface.test.js`, `e2e/team.spec.ts` · AC-8 … privacy and terms steps, `e2e/frame.spec.ts`, `tests/privacy-page.test.js` · AC-9 … `tests/frame.test.js` contrast and sizes, `e2e/frame.spec.ts` at three widths, the phone and blur steps
- AC-10 … `tests/frame.test.js` titles and noindex · AC-11 … `tests/frame.test.js` superseded pieces gone
