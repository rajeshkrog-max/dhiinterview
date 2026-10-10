# 0010. Rationale: share buttons that send the report, with a public link

## Context

> ⚠️ Premise note: the engineer chose a public link to the student's whole report, against the recommendation of a card only page. The report is written for one student and holds personal analysis; many students are under 18. India's Digital Personal Data Protection Act, 2023 expects verifiable consent from a parent or guardian before a child's personal data is processed, and a tap on a notice is weaker than that. This spec builds what was chosen and keeps the risk as small as the choice allows (flags removed on the server, first name only, an off switch, a 90 day end, a notice before the first share), and records the legal check as a follow up that should be settled before launch on 30 October.

The Founding Card has three share buttons (WhatsApp, Instagram, Facebook), and the report has a separate Share button. Today they do very little. The card buttons share the story picture through the phone's share sheet where files can be shared, and otherwise open a WhatsApp or Facebook link and save the picture; Instagram only saves the picture and shows a hint. The text they send holds the landing page link, or the page's own address when `DHI_FUNNEL.shareUrl` is empty, as it is in the repository. The report's own Share button only sends text. None of them carries a link to the student's report, and none works well on a laptop.

The report is private. It is read only through the signed in session, its PDF copy is private to the student and to named team members, and `AGENTS.md` says sensitive flags are never public. Spec 0006 already built the way to draw a report without flags, from saved data, on a page with no sign in (the render page). The site is static (Astro with no server adapter) and runs on Cloudflare Pages with Convex behind it, and the report fonts and some pages still load from Google, which matters for a public page opened by strangers.

Link previews in WhatsApp, Instagram and Facebook are made by crawlers that do not run page scripts, so what a preview shows must be in the page's first response. Instagram stories cannot carry a tappable link in the shared picture, and a laptop browser cannot hand a post to Instagram at all.

## Options considered

### Option A: Share the card picture and the landing page link only

Keep the report private. The buttons send the story picture and a link to the public landing page, with the share sheet on phones and the saved picture on laptops.

**Pros**:
- No new public surface and no new consent. Nothing about a student becomes readable by others.
- Smallest build: fix the Instagram and laptop paths and the text.

**Cons**:
- It does not send the report. The engineer asked for a public link to the report.
- A friend who taps the link sees the landing page, not what the student is proud of.

### Option B: A signed private link to a read only report page

A random looking link per student opens the report in a read only public mode. The student agrees before the first share, can turn the link off, and it ends after 90 days. Previews use a fixed brand picture.

**Pros**:
- Does what was asked, and reuses the proven flag removal and report drawing from spec 0006.
- The student controls it: a notice, a switch, an end date.
- Needs no stored secret: the link is signed, so it can be made again for the same row.

**Cons**:
- The whole report is public to anyone with the link, including for under 18s.
- The code is in the address path, so edge logs hold it.
- One more public surface to protect: a route, a page, a table, a setting.

### Option C: Share the saved PDF copy by link

The link serves the PDF from spec 0006 through a public route.

**Pros**:
- The file already exists and is frozen exactly as the student saw it.

**Cons**:
- PDFs open badly in the in app browsers of Instagram, WhatsApp and Facebook.
- The file exists only after the report was seen, and the copy job runs at about 150 to 200 a day on the Free plan.
- It hands over a file, not a page, which is harder to switch off and easier to forward.

### Option D: A card only public page

A public page with the Founding Card and a Take the check button, and no report text. This was the recommended option.

**Pros**:
- Almost nothing personal on a public page; easy to defend to a parent.
- Preview and page can match.

**Cons**:
- Not what the engineer asked for. It was offered and not chosen.

## Rationale

Option B is the choice that matches what was asked and keeps the work on proven ground. The flag removal and the print mode drawing of spec 0006 already solve the hardest rule in `AGENTS.md` (sensitive flags never public), so the new surface is a small read route and a page, not a second copy of the report logic. A web page is also the only form that opens well inside Instagram, WhatsApp and Facebook, which is where the link will be tapped; that rules out the PDF (Option C).

The recommendation was Option D, because a minor's whole report is much more than the card. The engineer chose the full report, so the spec adds the controls that make it defensible: first name only, a notice before the first share, a switch, an end after 90 days, no class or age, the same refusal for every bad link, and no viewer tracking. The consent is a tap on a notice, not a verified parent step, which a lawyer should confirm (Follow up).

The link is signed rather than random and stored. A stored random code can be shown only once if it is hashed, and shows every student's link to anyone who reads the table if it is not. A signed code is made again from the row each time, nothing secret is stored, and the signature is 128 bits. The runner up (a stored random code of 22 characters) gives a shorter link and was close. The generation number in the code is what makes Stop sharing stick: a new link is a new generation, so every older copy of the link stays dead.

The address form (`/s/<code>`) was the engineer's pick over a fragment (`/s#<code>`). The fragment would keep the code out of edge logs and out of every server, and was the recommended option. The path form is shorter and cleaner to read in a chat. The spec limits the damage: `no-referrer`, `noindex`, no caching, the code never sent to Convex in a URL (the forwarder passes it in a header), and never written to a log line.

Instagram on a laptop gets both fallbacks the engineer asked for: the picture is saved with a hint, and a QR code opens the student's own report page on their phone. The QR code holds the student's own page, not the public link, because only a signed in phone has the card picture and the real share sheet. Drawing the QR code in the browser from a small file kept in our site means the link never goes to an outside service.

On a phone, Instagram stories cannot carry a link in the shared picture, so the picture is shared and the link is copied to the clipboard with a toast. WhatsApp and Facebook get the link as the caption.

## Migration plan

**Strategy**: feature flagged, no data migration. New table and new routes only, plus a third consent kind and one new frozen consent version. Existing rows, consent versions and routes are not changed. The whole feature sits behind `publicShare` in `funnel-config.js`.
**Phases**:
1. Deploy Convex (table, functions, route, `SHARE_LINK_SECRET`), then the forwarder, the rewrite and the pages. With `publicShare` off nothing visible changes.
2. After the notice words are approved and the legal check is done, set `publicShare: true` so the share row, notice and Stop sharing control appear.
**Rollback**: set `publicShare` back to off, or revert the page and script changes; the table and routes can stay unused. To end all links at once, change `SHARE_LINK_SECRET` (every code stops verifying). To end one link, run `shares.adminOff`.
**Risks**: shipping the share row before the notice words are approved and the legal check is done; a link opened in an in app browser that loads a third party font; whether Pages applies `_headers` to a rewritten address (checked at M1); a link that spreads widely and a crawler burst (the per link limit is 600 a minute); the Cloudflare Free plan limits are not touched because no Browser Run job is used.

## References

**Project sources**:
- `AGENTS.md` (flags never public; a student under 18 needs a parent or guardian's consent; no secrets in front end code)
- Spec [0006](../0006-report-copy-saved-when-seen/index.md) (the render payload with flags removed, the print mode of the report, the signed token pattern)
- Spec [0008](../0008-team-link-to-saved-report/index.md) (the response headers for private pages and the forwarder pattern)
- Spec [0009](../0009-site-frame-root-and-404/index.md) (hosted fonts, the site frame)
- `public/dhiinterviews/js/card.js` (the share row today) and `render-boot.js` (the Founding Card picture helper)

**Practices & standards**:
- Capability URLs: an unguessable address as the only credential
- Least data on a public page
- Consent before sharing a minor's data, with a way to withdraw it

**Links** (web verified only):
- MDN, Navigator.share(): https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share (secure context and a user gesture are required)
- MDN, Navigator.canShare(): https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare (returns false when files are given but not supported)
- The Open Graph protocol: https://ogp.me/ (og:title, og:description, og:image)
- qrcode-generator, MIT licence: https://github.com/kazuhikoarase/qrcode-generator
- OWASP, Insecure Direct Object Reference Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html (random identifiers are only a defense in depth, access checks are still needed)
