# Add the private report link for the share buttons (spec 0010)

_Draft PR text for branch `feat/report-copy-and-privacy`, written 2026-10-11. Not opened on GitHub. The code is already deployed to production with the feature switched off._

## What

Students can share their report as a private link. The share buttons send the Founding Card picture with a text that holds `/s/<code>`, a stranger who opens it sees a read only copy of the report, and the student can end the link at any time. On production the whole feature is switched off on the server and hidden in the browser.

## Why

Implements `docs/specs/0010-share-report-public-link/index.md` (scope row 32). The old buttons only saved a picture or copied the landing address, and Instagram has no web link that posts for you. The owner chose to make the whole report the public view, with a signed link, a notice, an under 18 tick, a Stop sharing switch and a 90 day end.

## Changes

- **Link and data:** a `reportShares` table (one row for each student), signed codes (`<shareId>.<generation>.<signature>`, HMAC SHA 256 with `SHARE_LINK_SECRET`, nothing secret stored), and `convex/shares.ts` with `enable`, `status`, `disable`, `adminOff` and `publicRead`. No function takes a student id.
- **Public route and page:** `GET /api/shared/payload` with a Pages forwarder, `/s/*` rewritten to one static page with a strict policy, and `report-student.js` in a public mode (no Download, join card, feedback, ticks or picture row).
- **Share row:** the notice (`share-v1`) with the under 18 tick, one flow for the three card buttons and the report's own Share button, laptop fallbacks with a QR dialog for Instagram, and a Stop sharing line with its confirm step.
- **Limits:** 20 links an hour for each student, 600 reads a minute for each link, one shared bucket for made up codes. Both read buckets use 16 shards that share one clock minute (`start: 0`), and a lost race on the limit rows answers 429 instead of 500.
- **Review fixes (commit 224319a):** the public payload no longer carries the mood split or the students' quoted answers, a server switch `PUBLIC_SHARE_ENABLED` gates link making and opening, Stop sharing and the team switch give the picture a new address, the forwarder answers 502 when Convex is unreachable, and an unknown age shows the guardian tick.
- **Words:** privacy page section 6 "Your report link" (sections now 1 to 10), consent kind `share` with the `share-v1` text.

## How to test / verify

- `pnpm exec tsc --noEmit` shows no errors, and `pnpm exec vitest run` passes (697 tests).
- `pnpm exec playwright test e2e/shared.spec.ts e2e/share-row.spec.ts` passes against the dev deployment (29 specs, including a real dev student's link opened in a browser that never signed in).
- The steps with their results are in `docs/specs/0010-share-report-public-link/verify.md`. The live race check (40 readers at once, 700 reads and 700 made up codes) gave only 200, 404 and 429, never 500.
- The steps that need a real Android phone, an iPhone and a real Pages preview are still open.

## Risk & rollout

- **Deployed, switched off.** Production has the code and `SHARE_LINK_SECRET`, but `PUBLIC_SHARE_ENABLED` is unset and `publicShare` is not in `funnel-config.js`. `shares.enable` answers `unavailable` and every code gets the one 404.
- **Live now even when off:** privacy page section 6 and one new table index. No migration. Students see no change in the buttons.
- **To switch on:** set `PUBLIC_SHARE_ENABLED=true` on production, add `publicShare: true` to `funnel-config.js`, deploy again. To switch off: unset the setting. Rollback of a single student's link: `npx convex run shares:adminOff '{"email":"..."}' --prod`.
- **Owed before switching on:** a lawyer's check on public sharing for students under 18, the 1200 by 630 preview picture, and the live phone checks.
- **Accepted residual risks:** the picture address can still be served for up to 50 minutes from the edge after a link ends, and a link that simply expires (nobody pressed Stop sharing) does not change the picture address. Anonymous reads have no edge limit, so a flood costs one Pages call and one Convex write each time.

## Notes for reviewers

- The review (`docs/reviews/2026-10-11-feat-report-copy-and-privacy-share-link.md`) is worth reading first. Its blocker is why `convex/sharePayload.ts` now has `publicDetail`.
- The saved PDF copy (spec 0006) still carries the mood split and quoted answers on purpose: only the student and the team open it. The public payload is the stricter one.
- `convex-test` runs one mutation at a time, so only the live run proves the race fix. The unit test that fails without `start: 0` guards the shared window.
- The branch is far ahead of `origin/main` (earlier features were deployed from this machine without a push), so a PR from it holds more than this one feature.
