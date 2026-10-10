# Verify: share buttons that send the report · spec 0010 · updated 2026-10-11
_Verified 2026-10-11 by /check verify: ticked steps were run and passed; unticked steps failed, were only partly run, or need a real phone or a Pages preview. Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Milestones 1 to 4 (AC-1 to AC-18). The steps for the real phones (M5) are marked LIVE and cannot be run from a computer._

## UI / manual
- [x] On dev, sign in as a fake student with a finished check, make a link (until the share row exists in M2, copy the token steps of the live test in `e2e/shared.spec.ts`: the student's token from `/api/auth/convex/token`, then `shares:enable`), then open `/s/<code>` in a browser that has never signed in → the report opens with the Founding Card on top, the banner "<first name> shared this DhiRise report with you.", and a "Take your own check" button     → AC-4
- [x] On that page look for Download, the join card, the feedback box, the blurred week 2 and 3 teasers, the week tick boxes, the trophy link, the Remove my picture row → none of them is there     → AC-4
- [ ] On that page look for the student's class, age, email, phone, last name and any sentence from a sensitive flag (set every flag on the student first) → none is there; the heading line shows only the date     → AC-4, AC-12
- [ ] A student with a Google picture: the circle beside the title shows the picture from `/api/avatar/<key>`; a student with none, or one who pressed Remove: the circle shows the first initial     → AC-4 (spec 0011)
- [x] Open the page with animations on, then with "reduce motion" on → numbers and bars count up in the first case and appear at once in the second     → AC-4
- [ ] Open `/s/<code>` after changing one character of the code, after the link is off (set `offAt` on the row), after it ended (set `expiresAt` in the past) and after a new generation was made → every time the same "This link is off or has ended" message, nothing that says which reason it was     → AC-7
- [x] On a phone width the public page does not scroll sideways, and every button is at least 44 pixels tall     → AC-4
- [x] Open `/s/<code>` in a browser with developer tools: Network tab → only requests to our own address (page, scripts, styles, our Mukta fonts, the one payload call, the picture); Application tab → no cookie, empty local storage and session storage     → AC-13
- [ ] On the Pages preview open `/s/anything` → status 200, the same page for any code, view source shows the fixed title, description, a full `https://` `og:image`, no `og:url`, and no code anywhere in a tag     → AC-8
- [ ] Share the link in WhatsApp or paste it into a link preview checker → the fixed DhiRise picture, title and description show; nothing about the student shows     → AC-8
- [ ] Change `REPORT_VERSION` (and `VERSION` in `reportText.js`) on a preview build, open an old link → it still opens, drawn with the new words     → AC-15

## Commands
- [x] `pnpm exec vitest run` → all unit suites pass (648 at the time of building)     → AC-4, 6, 7, 11, 12, 14, 15
- [x] `pnpm exec tsc --noEmit` → no errors     → AC-14
- [x] `pnpm exec playwright test e2e/shared.spec.ts` → 11 pass, including the live one against the dev deployment     → AC-4, 7, 8, 13, 14
- [x] `pnpm build` then `pnpm exec wrangler pages dev dist --port 4321 --binding CONVEX_SITE_URL=https://proper-camel-616.ap-southeast-2.convex.site`, then `curl -si http://localhost:4321/s/anything.1.AAAAAAAAAAAAAAAAAAAAAA` → status 200, `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy` ending in `no-referrer`, a `Content-Security-Policy` with no outside address     → AC-8
- [x] Same server: `curl -si http://localhost:4321/api/shared/payload -H "x-share-token: nope"` → 404 with body `{"code":"unavailable"}`; with POST → 405; `curl -s http://localhost:4321/api/shared/other` → the same 404 body     → AC-7
- [ ] The same `curl -si http://<preview address>/s/anything` on a real Cloudflare Pages preview (not the local emulation) → the same headers as above (if not, add the headers to the shell with a meta tag and a small Function, as the spec's follow up says)     → AC-8
- [x] `npx convex run shares:publicRead '{}'` is not callable from the browser (it is internal); `npx convex run shares:enable '{}'` with no sign in → refused (it needs a student session)     → AC-14
- [ ] Make a link, open it 601 times within a minute (a loop of `curl` with the header) → the 601st answers 429 `{"code":"slow_down"}` and another student's link still answers 200; 700 made up codes in a minute → some 429, none creates a rate limit key per code     → AC-11  ← FAILED 2026-10-11: with 40 readers at once, 332 of 640 reads of one link and 105 of 720 made up codes answered 500 (a write conflict on the rateLimits table), and none answered 429. With 5 and 10 at once all were 404; with 20 at once 3 of 160 were 500. Needs a fix in `shares.publicRead` and the HTTP route (shard the per link bucket, and answer 429 instead of 500 on a conflict).
- [x] Source scan: `convex/sharePayload.ts` names no flag table, lead, feedback, email, phone, age or class (the test in `convex/shares.test.ts` does this)     → AC-12

## Value sourcing (one step per row the build touched)
- [ ] The link code is `<shareId>.<generation>.<signature>`: make a link, then make a new generation (set `offAt`, tap again) → a different code, the old one answers 404; change `SHARE_LINK_SECRET` on dev → every old link answers 404     → AC-7
- [ ] `expiresAt` is server time plus 90 days, capped at `createdAt` plus 365 days: tap twice 10 days apart (move the row's `expiresAt` back to simulate) → the end moves to 90 days from the second tap; for a row made 360 days ago it stops at day 365     → AC-6
- [x] The payload's first name is the first word of the student's name: a student named "Priya Nair" shows "Priya" in the banner and the title, and "Nair" appears nowhere     → AC-4, AC-12
- [ ] The payload's result, date and seed come from the saved result, the check's `completedAt` and `seed`: the public page shows the same Dhi starting score, style and date as the student's own report     → AC-4
- [ ] The Founding Card on the page uses the result's style key and the first name: a student of each style (v, p, k) shows the matching card (Explorer, Achiever, Builder)     → AC-4

## Share row, notice and link (milestones 2 to 4)
- [ ] LIVE, Android phone (Chrome), `publicShare: true` in `js/funnel-config.js` on a Pages preview: open your report, tap WhatsApp for the first time → the notice "Before you share" shows; Not now closes it and shares nothing     → AC-3
- [ ] Same phone: tap WhatsApp, then Share in the notice → "Your report link is ready. Tap WhatsApp again to share."; tap again → the share sheet opens with the Founding Card story picture and a text that holds your `/s/<code>` link; choose WhatsApp → the picture and the link arrive in the chat     → AC-1, AC-3
- [ ] Same phone: tap Instagram → the share sheet opens with the picture; choose Instagram Stories → the picture is there; paste → the link was copied, and the toast said so     → AC-1
- [ ] Same phone: tap Facebook → the share sheet opens with the picture and the link text     → AC-1
- [ ] LIVE, iPhone (Safari), same steps for the three buttons (Safari is the strictest about the tap's permission: the first share after the notice must be a second tap, and the second tap must open the sheet at once)     → AC-1, AC-3
- [ ] On either phone with a student under 18: the notice shows the tick "I have checked with a parent or guardian."; Share without it says "Please tick the box to continue." and makes no link     → AC-3
- [ ] On either phone, tap the report's own "Share with a friend" button → the same share sheet, the same picture and the same link as the buttons under the card     → AC-10
- [x] On a laptop (Chrome), tap WhatsApp → WhatsApp Web opens with text that holds your public link, and the picture is saved to Downloads; tap Facebook → the Facebook sharer opens with your public link     → AC-2
- [x] On a laptop, tap Instagram → the picture is saved, a dialog "Post to Instagram from your phone" shows a QR code, "Copy my report address" and Close; scan the code with a phone → your own report page opens (the phone may ask you to sign in first)     → AC-2
- [x] On a laptop with the QR file blocked in developer tools → the dialog shows only the words and the copy button     → AC-2
- [x] Under the share row, while a link is on: "Your link is on until <date> (India time)." with the date 90 days ahead written like 12 January 2027, and a Stop sharing button     → AC-18
- [x] Tap Stop sharing → "Anyone who has the link will no longer see your report." with Stop sharing and Keep sharing; Keep sharing changes nothing; Stop sharing → the line becomes "Sharing is off. Tap a button to make a new link."; the old link now shows "This link is off or has ended"     → AC-5, AC-18
- [x] After Stop sharing, tap a button → no notice, a new link is made ("Your report link is ready..."); the old link is still dead, the new one opens     → AC-3, AC-5, AC-6
- [x] Set `expiresAt` on the row to today (India date) and reload the report → the line says "Your link ends today."     → AC-18
- [x] Switch `publicShare` off (remove it from the config) → no notice, no link, no Stop sharing line; the buttons share the picture with the landing address as before     → AC-17
- [ ] Turn the network off, then tap a button when the link is off → the picture is still shared with the landing address and the line "We could not add your report link, so only your card was shared." shows     → AC-9
- [x] Privacy page → a section "6. Your report link" says who can see what, how to stop it and when it ends; the sections are numbered 1 to 10     → AC-3 (privacy page)
- [x] Run `npx convex run shares:adminOff '{"email":"<a student email on dev>"}'` → that student's link answers 404; the student can make a new one by sharing again     → AC-14

## Share row commands (milestones 2 to 4)
- [x] `pnpm exec playwright test e2e/share-row.spec.ts` → 17 pass (notice, tick, link, Stop sharing, laptop fallbacks, Instagram dialog, failure fallbacks, the report's own Share button)     → AC-1, 2, 3, 5, 6, 9, 10, 17, 18
- [x] `pnpm exec vitest run` → all pass, including `convex/shares.test.ts` (consent, tick, status, Stop sharing, adminOff) and `tests/share-flow.test.js`     → AC-3, 5, 6, 14, 16
- [x] `npx convex run shares:enable '{}'` with no sign in → refused (it needs a student session); there is no argument that names a student     → AC-14

## Value sourcing (milestones 2 to 4)
- [x] The consent row for a share: `students.age` is kept as the age, the tick as `guardianPresent`, the notice version `share-v1` and its fingerprint match the words on screen → look at the `consents` row after agreeing as an adult and as a student under 18     → AC-3
- [x] The full link shown and shared is `location.origin` + `/s/` + the code (not `DHI_FUNNEL.shareUrl`, which is empty): on a preview the shared text holds the preview's own address     → AC-1
- [x] The QR code holds `new URL("report-student.html", location.href)`: scan it on localhost and on the preview, each opens its own report page     → AC-2
- [ ] The end date text is `expiresAt` in India time: set `expiresAt` to 23:30 UTC on a day and check it shows the next India date     → AC-18

## Acceptance-criteria coverage
- AC-4 … covered by the first five UI steps, the phone width step and the value sourcing steps · AC-7 … covered by the "one character changed" step, the curl steps and the code step · AC-8 … covered by the Pages preview steps and the `curl` header step · AC-11 … the 601 reads step · AC-12 … the flags step, the source scan and the first name step · AC-13 … the developer tools step · AC-14 … `tsc`, the `convex run` step · AC-15 … the report version step · AC-6 … the `expiresAt` step (the renewal rules are also covered by the unit suite; the Stop sharing text and button come in M4)
- Milestones 2 to 4 add: AC-1 … the Android and iPhone steps and the Instagram step · AC-2 … the laptop steps and the QR steps · AC-3 … the notice, tick and consent row steps · AC-5 … Stop sharing and the new link step · AC-6 … the renewal and ended steps (also the unit suite) · AC-9 … the offline step · AC-10 … the report's own Share button step · AC-16 … the unit suite (a student with no finished check has no link) · AC-17 … the switch off step · AC-18 … the end date, last day and off line steps
- Only a real phone can prove the share sheet reaching WhatsApp, Instagram and Facebook; the browser tests use a pretend share sheet that records what it was asked to send
