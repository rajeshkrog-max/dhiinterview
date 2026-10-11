# 0020. Share previews and search listing for the public pages

**Date**: 2026-10-11
**Status**: Proposed

## Summary

When someone shares the DhiRise landing page or a `?ref=` invitation on WhatsApp, Instagram or Facebook, the preview should show a clear title, a short description and a branded picture. Today the landing page has none of these. This spec adds them to the landing, privacy and terms pages, keeps every signed in or personal page out of search, and adds a small `robots.txt` and `sitemap.xml`. Every invitation link shows the same preview, so nothing about the person who invited you reaches a link crawler.

## Context

The landing page (`src/pages/dhiinterviews/landing.astro`) has a title but no description, no share tags, no canonical address and no robots rule. Only the private report page (`shared.astro`) has full share tags, with a stand in picture (`assets/share-preview.v1.png`, 1200 by 630, 73 KB). The privacy, terms and 404 pages use `Frame.astro`, which already takes a description and a `noindex` switch. There is no `robots.txt` and no sitemap. `/` redirects to `/dhiinterviews/landing` and keeps the query, so `/?ref=ABC1234` works. The challenge runs to 30 October, so a good preview matters while students share links.

Link crawlers read static HTML and do not run scripts, so previews come from the head tags. Crawlers cache a preview by address, so a changed picture needs a new file name. The site is also reachable on `dhirise.pages.dev`, so a canonical address stops the two addresses competing.

## Requirements

**User stories**:
- As a student, I want a link to DhiRise to show a clear title, line and picture when I send it on WhatsApp or Instagram, so that friends know what they are opening.
- As a parent, I want my child's pages to stay out of search.
- As the team, I want one place that holds the site address and the preview words.

**Acceptance criteria**:
- **AC-1**: The landing page has a title, a meta description, a canonical address (`https://dhirise.com/dhiinterviews/landing`, the clean form with no `.html`, no trailing slash and no query), and these tags, placed first in `<head>` before the font links (WhatsApp reads only the first part of the HTML): `og:type` website, `og:site_name`, `og:title`, `og:description`, `og:url` (the canonical), `og:image` (absolute), `og:image:width` 1200, `og:image:height` 630, `og:image:type`, `og:image:alt`, and `twitter:card` summary_large_image. `<title>` keeps the form "DhiRise · <title>"; the longer share sentence is `og:title`. A `?ref=` link serves the same page, so it shows the same preview; no tag, canonical or image address ever holds a referral code.
- **AC-2**: The privacy and terms pages have the same set (their own title and description) and a canonical address, through new `Frame.astro` props (a canonical path, a share on or off switch and a picture), not copies. A page marked `noindex` never gets a canonical or share tags.
- **AC-3**: Every signed in or personal page carries `<meta name="robots" content="noindex, nofollow">`: `question`, `question2`, `questions`, `meet`, `done`, `who`, `report-student`, `challenge` and `leaderboard` get it once from `Guard.astro` in protected mode (it renders inside `<head>`; `landing` mode must NOT add it). `team`, `team-report` and the 404 already get it from `Frame`'s `noindex` prop, and `report-render` and `shared` already have it. Only the landing, privacy and terms pages are listable. `_headers` also sends `X-Robots-Tag: noindex` for `https://dhirise.pages.dev/*` and the preview hosts, so the duplicate addresses stay out of search.
- **AC-4**: `https://dhirise.com/robots.txt` allows crawling, disallows only `/api/`, and names the sitemap. It does not disallow `/s/` or any `noindex` page: a crawler must fetch a page to see its `noindex`, and Facebook and Twitter must read `/s/<code>` to build the report link preview (spec 0010). `https://dhirise.com/sitemap.xml` lists the three listable pages in the clean form and nothing else; each address answers 200 with no redirect.
- **AC-5**: The preview picture is 1200 by 630 and at most 300 KB (a cautious target for WhatsApp, not a hard rule), has a versioned name (`assets/share-landing.v1.png`), and is served from our own site. Until your artwork arrives, the existing stand in picture is used; swapping it is a new file name plus one constant, never an edit in place.
- **AC-6**: The site address, the preview words and the picture path live in one place (`src/lib/site.ts`). The landing page and `Frame.astro` take all of them; `shared.astro` takes only the origin and the picture and keeps its own report words.
- **AC-7**: The new tags and files load nothing from a third party. (The landing page still loads Google's font servers until row 29 ships; that is outside this spec.)
- **AC-8**: After the full `pnpm build`, a test under `tests/` reads `dist/*.html` and checks AC-1 to AC-3 and AC-6 (the tags on the three public pages, `noindex` on each protected page, no referral code in any tag). `pnpm verify:pages` (which runs the built site under Pages) checks only HTTP behaviour: the clean addresses, the sitemap addresses answering 200, and `robots.txt` and `sitemap.xml` being served.
- **AC-9**: On the live site, Facebook's Sharing Debugger shows the right title, description and picture for the landing page and for a `?ref=` address (it follows the redirect and shows the canonical page, which is the expected result); and a real phone shows the WhatsApp preview (WhatsApp caches each `?ref=` address separately). Instagram reads no tags itself and its in app previews vary. Owed as a manual check; clear the crawler cache with the debugger after each picture change.

## Options considered

### Option 1: Static head tags from one shared module
Add the tags to the Astro pages, drive them from `src/lib/site.ts`, add `noindex` in the guard, and ship two static files.

**Pros**:
- No server code; works for every crawler that reads HTML; one place to change words and picture.

**Cons**:
- Every invitation shows the same preview (by your choice); the picture cannot change per student.

### Option 2: A function that writes per invitation tags
A Pages function on the landing path reads `?ref=`, looks up the owner and writes "Raj invited you".

**Pros**:
- Personal.

**Cons**:
- A lookup per crawl, shows a child's first name to crawlers, must respect hide my name, and adds a failure mode on the front door.

### Option 3: An SEO integration for Astro
Use a ready made sitemap and SEO package.

**Pros**:
- Less hand written code.

**Cons**:
- A new dependency for three pages; the hand written file plus a test is smaller and clearer.

## Decision

**Chosen option**: Option 1: Static head tags from one shared module

One shared module for the site address, words and picture; tags on the three public pages; `noindex` on everything personal; a hand written `robots.txt` and `sitemap.xml` checked by `verify:pages`. JSON-LD structured data is skipped on purpose: a funnel with three pages gains nothing from it.

## Rationale

The preview problem is only head tags and one file, and crawlers read static HTML, so static is both the simplest and the most reliable. Keeping one shared module follows the reason spec 0009 gave for the frame and stops the landing and the report page drifting apart. A single invitation preview keeps minors' names away from link crawlers, which is the safer default for this audience. Hand written files with a build check avoid a package for three entries.

## Feature design

**Shared module** `src/lib/site.ts`: `SITE_ORIGIN = "https://dhirise.com"`, `PREVIEW_IMAGE` (the picture path, absolute through `SITE_ORIGIN`), `PUBLIC_PAGES` (the three listable pages with path, title, description), `PREVIEW_ALT`.

**Draft words** (you approve): landing title "DhiRise · I want to be heard"; share title "DhiRise: understand who you are, then study in a way that fits you"; description "Answer 18 short questions and get a kind, clear picture of how you like to study. For students from Class 8 to college."; picture alt "DhiRise, a calm place to study". Privacy and terms keep their existing descriptions.

**Files**: `public/robots.txt` (`User-agent: *`, `Disallow: /api/`, `Sitemap: https://dhirise.com/sitemap.xml`), `public/sitemap.xml` (landing, privacy, terms, in the clean form; Pages keeps these two for the default 4 hours, which is fine), `public/dhiinterviews/assets/share-landing.v1.png` (stand in copy now, artwork later).

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| The site address | `https://dhirise.com` | `SITE_ORIGIN` in `src/lib/site.ts`, the production domain already used by `shared.astro` and the live checks recorded in the scope |
| Canonical and `og:url` | `SITE_ORIGIN` plus the clean page path, no query | `src/lib/site.ts` |
| `og:image` | absolute picture address | `SITE_ORIGIN` plus `PREVIEW_IMAGE` |
| Title, description, alt | the words | `src/lib/site.ts` (draft until approved) |
| Which pages are `noindex` | all but the three public pages | `Guard.astro` protected mode, `Frame`'s `noindex` prop, and the tags already on `report-render` and `shared` |
| Duplicate hosts kept out of search | `dhirise.pages.dev` and previews | a host rule in `public/_headers` sending `X-Robots-Tag: noindex` |
| The picture itself | 1200 by 630, at most 300 KB | your artwork; the stand in until then |

**Key invariants**: no tag holds a referral code or student data; the canonical never carries a query; the picture address changes whenever the picture changes.

**Security model**: public static content; nothing personal. Compliance: personal pages kept out of search protects minors.

**Critical test scenarios**: built `dist/` has the full tag set on landing, privacy and terms with absolute addresses and no query in canonical, verifies **AC-1, AC-2, AC-6**; every protected page has `noindex`, verifies **AC-3**; `robots.txt` and `sitemap.xml` exist with the right lines and only the three pages, verifies **AC-4**; the picture file is 1200 by 630 and at most 300 KB with a versioned name, verifies **AC-5**; a source scan shows no third party address, verifies **AC-7**; the check fails when a tag is removed, verifies **AC-8**.

## Build plan

Build approach: Tracer Bullet (the project default): one real preview first, then the rest.

1. **M1 The thin thread**: add `src/lib/site.ts`, put the full tag set on the landing page with the stand in picture copied to `share-landing.v1.png`, and have `shared.astro` read its origin from the same module; check the built page, satisfies **AC-1, AC-5, AC-6**.
2. **M2 The other pages and the files**: the new props in `Frame.astro` for privacy and terms, `noindex` in `Guard.astro` (protected mode only), the `_headers` host rule, `robots.txt` and `sitemap.xml`, satisfies **AC-2, AC-3, AC-4, AC-7**.
3. **M3 Proof**: the `tests/` file over `dist/`, the added HTTP checks in `scripts/verify-pages.mjs`, then the live checks (Facebook debugger, a real phone), satisfies **AC-8, AC-9**.
4. **When your artwork arrives**: add it as `share-landing.v2.png`, change one constant, clear the crawler cache, satisfies **AC-5**.

## Consequences

**Positive**:
- Shared links look intentional on every app, and personal pages stay out of search.
- One module holds the site address and words.

**Negative / tradeoffs**:
- Until the artwork arrives the picture is a stand in.
- Every invitation preview is the same; a friend does not see who invited them until they open the page.
- Until the artwork arrives, the landing and report link previews use the same stand in picture and look identical.
- WhatsApp and Facebook cache a preview, so a change shows up late unless the cache is cleared.

**Neutral**:
- Instagram shows previews only in some places (direct messages); the same tags serve it.

## Follow-up

- [ ] You supply the 1200 by 630 artwork (under 300 KB) and approve the draft words.
- [ ] Row 21 (About page) adds its entry to `PUBLIC_PAGES` and the sitemap.
- [ ] Row 29 (own fonts) is separate; the landing page still loads Google's font servers until it ships.
- [ ] Cross check (same model, 2026-10-11) gaps are closed in this spec.
- [ ] Manual check: Facebook Sharing Debugger, and WhatsApp on an Android phone and an iPhone.
