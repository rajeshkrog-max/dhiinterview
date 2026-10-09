# 0009 rationale: shared site frame, root address and 404 page

The decision record for [index.md](index.md). The build does not read this file.

## Context

The site answers on `dhirise.com`, and the funnel lives under `/dhiinterviews` (Astro static output, one page per file, hosted on Cloudflare Pages). Today a visitor to `/` is sent to the landing page by a temporary redirect, and an address that does not exist gets no page of our own: there is no `404.html`, so Pages treats the site as a single page app and answers with the root address instead of an error.

The pages after the funnel screens are built one at a time. `terms.astro` and `privacy.astro` each carry their own copy of a small header, a stylesheet (`terms.css`), a Google Fonts link and a logo fallback handler. The two team pages (row 23) carry a third look in `team.css`, and a strict content security policy that allows only the site's own scripts and files, so they cannot load Google Fonts at all. An About page (row 21) and a 404 page would each add a fourth and a fifth shell. The funnel screens themselves are full screen designs and are not part of this problem.

Forces: the main address is expected to belong to a different product later (an invitation style page), so the root must be easy to hand over and nothing shared may depend on `/` meaning DhiRise; many readers are students under 18 on phones and mobile data; one of the pages (team) has a security policy that rules out outside fonts; and launch is planned for 30 October, so the choice must stay small. Not deciding leaves a growing set of pages that drift apart and a site that answers wrong addresses with the wrong page.

## Evidence: the look to match

Studied in `question.css` and `landing.css` on 2026-10-09:
- Dark ink base (`#14110e`), white text, gold accent (`#e9b95c`), Mukta for text.
- Glass panels: translucent ink fill (`rgba(20,17,14,.62)` to `.78`), `backdrop-filter: blur(14px)` to `18px`, a 1px hairline border (white at 18 to 22 percent, or gold at 45 percent on the main panel), a soft shadow or gold glow, large rounded corners (22 to 24px), and a slim glass pill bar at the top.
- Full screen photo behind the glass on question pages (1.6 MB each) and a sky photo on the landing page (2 MB). The owner chose an ink gradient only for the frame pages, because those photos are too heavy for mobile data.
- Text sizes of 15 to 17px, 44 to 52px tall tap targets, `100dvh` with a `100vh` fallback, and animation only inside `prefers-reduced-motion: no-preference`.

## Options considered

### Option 1: One layout component, one stylesheet, hosted fonts

An Astro layout (`Frame.astro`) plus `frame.css` and hosted Mukta files become the shell of every non funnel page. The 404 is a root `404.astro`. The root stays one redirect line.

**Pros**:
- One place for the header, footer, colours and fonts; About becomes a short page.
- Static and script free, so the team pages' strict policy still holds.
- Hosted fonts remove a third party call and work under that policy.
- Plain Astro and Cloudflare Pages features, nothing new to run.

**Cons**:
- The team pages must be moved carefully and their tests updated.
- Privacy and terms headings change font.
- Font files need their licence kept beside them.

### Option 2: Copy the terms skin into each new page

Keep what the terms and privacy pages do today and copy it for 404, About and the team pages.

**Pros**:
- No migration of existing pages.
- No shared component to design.

**Cons**:
- Five copies of the same shell drift apart; a footer change is five edits.
- The team pages still could not use the fonts, so they would never match.

### Option 3: Wrap pages with a Pages Function

A Cloudflare Pages Function rewrites each response to add the header and footer (HTML rewriting).

**Pros**:
- Existing pages need no edit.

**Cons**:
- Runs code on every page view, adds a failure mode and a cost to pages that are static today.
- Hard to test and to reason about; the funnel's strict pages would need exceptions.

### Option 4: A root page that decides, or a Function, for the root address

Replace the redirect line with an Astro page at `/` (or a Function) that chooses where to send visitors.

**Pros**:
- Easier to turn into a real page, or to branch by campaign, later.

**Cons**:
- A visible flash or a running function for something that is one static line today.
- More to change on handover than editing the line.

## Rationale

Option 1 fits the forces: the team pages' policy rules out anything that runs a script or loads an outside font, and a layout component with hosted files is exactly the static, script free shape that policy allows. The question pages' look is made of a few repeatable parts (ink gradient, glass panel, glass pill, gold accent), so one stylesheet carries it without a design tool. The root stays a single `302` line because it is the cheapest thing that already works and it is the one place a handover needs to touch; a Function or a page can replace that one line later without changing anything else. The 404 lives at the site root because Pages looks for the closest `404.html` up the folder tree, so one file covers `/dhiinterviews/*` and `/api/*` too.

The owner chose the ink gradient over a photo because the photos weigh 1.6 to 2 MB, and Mukta alone for headings (instead of Cinzel) to host the fewest files. Option 2 is faster for one page and wrong for five; Option 3 turns a static site into a rewriting proxy for a cosmetic gain.

## References

**Project sources** (verifiable, in this repo):
- `public/dhiinterviews/css/question.css` and `landing.css`: the glass look this frame follows.
- `public/dhiinterviews/css/terms.css`, `src/pages/dhiinterviews/privacy.astro` and `terms.astro`: the shells being replaced.
- `public/_redirects` and `public/_headers`: the root redirect and the headers.
- Spec 0008 (the team pages and their content security policy) and spec 0007 (the privacy page, `Assumed`, owed a shared frame).
- Scope row 20 and its `Done when`.

**Practices & standards**:
- A custom 404 page with a real 404 status, so search engines and people are not told a missing page exists.
- Absolute addresses for assets on an error page that can be served at any depth.
- Self hosting web fonts to avoid sending visitors' addresses to a font provider.
- The Mukta font is released under the SIL Open Font License, which allows hosting the files if the licence text travels with them (not confirmed on Google's own page when checked; confirm from the font's release when the files are taken).

**Links** (web verified only):
- Cloudflare Pages, serving pages (closest `404.html`, single page app fallback when there is none): https://developers.cloudflare.com/pages/configuration/serving-pages/
- Cloudflare Pages, redirects (static 302, limits; whether the query string is kept is not stated): https://developers.cloudflare.com/pages/configuration/redirects/
- Cloudflare Pages, headers (a header set twice is joined with a comma): https://developers.cloudflare.com/pages/configuration/headers/
- WCAG 2.2, contrast minimum (4.5 to 1 for normal text, 3 to 1 for large): https://www.w3.org/TR/WCAG22/
- MDN, `backdrop-filter` (widely available since September 2024): https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter
- Astro, layouts: https://docs.astro.build/en/basics/layouts/
- Astro, pages (a `src/pages/404.astro` builds to `404.html`): https://docs.astro.build/en/basics/astro-pages/
