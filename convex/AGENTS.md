# Convex backend

## Overview

The whole backend: sign in (Better Auth, Google only), the student, their one check and its 18 answers, the saved result, the phone step (leads), report feedback, and the queue that copies leads and feedback to the team's Google Sheet. Every function acts only on the signed in student's own rows; the browser is untrusted. **Read `convex/_generated/ai/guidelines.md` before writing any Convex code** (it overrides what you may remember about Convex).

## Key files

| File | Owns |
|---|---|
| `schema.ts` | Every table and index. Uniqueness holds only because mutations look rows up by index. |
| `helpers.ts` | `requireStudent` (the one place the signed in student and their check are found), `fail(code)`, `answersOf`, option id checks. |
| `auth.ts`, `http.ts`, `convex.config.ts` | Better Auth, the HTTP routes (`/health`, `/api/auth/*`, `/api/files/report`, `/api/render/payload`), the declared environment variables. |
| `students.ts`, `checks.ts` | `me`, `createProfile`; `saveAnswers`, `complete`, `markReportSeen`, `importLocal`. |
| `results.ts`, `resultsCore.ts`, `scoring.ts` | The saved result (spec 0005). `scoring.ts` loads the browser's `questions.js` and `score.js` (never a copy); `makeResult` saves the result and flags once; `mine` and `ensure` are the only functions that return flags. |
| `leads.ts`, `feedback.ts`, `feedbackRules.ts`, `limits.ts`, `consentText.ts` | The phone step and feedback (spec 0003), the rate limits, the versioned consent texts. `feedbackRules.ts` and `consentText.ts` are shared with the pages. |
| `sheetSync.ts`, `sheetRows*.ts`, `sheetFlush*.ts`, `sheetsGoogle.ts`, `sheetAdmin.ts` | The Sheet copy queue and job (spec 0004). Everything is internal; `sheetAdmin` is run with `npx convex run`. |
| `reportCopy.ts`, `reportCore.ts`, `reportMake.ts`, `reportMakeCore.ts`, `reportHttp.ts`, `reportVersion.ts` | The saved PDF copy of the report (spec 0006). `reportCopy` has `request`, `status`, the job claim and attach; `reportCore` the pure rules (retry schedule, signed render token, pacing); `reportMakeCore` one Browser Run job; `reportMake` the self chaining action; `reportHttp` the file and render payload routes; `reportVersion` the `REPORT_VERSION`. |
| `avatars.ts`, `avatarCore.ts`, `avatarState.ts`, `avatarHttp.ts` | The Google profile picture (spec 0011). `avatarCore` holds the pure rules (the one safe fetch to Google, the host and size and type checks, when a fetch is due); `avatars` has `ensure`, `remove`, `restore`, the internal `sync` action and `apply`, and the team's `adminBlock` and `adminUnblock`; `avatarState` has the switches, `isPictureAgreed`, `pictureFor` and `leaderboardPictureFor`; `avatarHttp` is `GET /api/avatar/<key>`. |
| `shares.ts`, `shareCore.ts`, `sharePayload.ts`, `shareHttp.ts` | The private report link (spec 0010). `shareCore` has the pure rules (the signed code, the 90 and 365 day life, `shareSecret`, `isWriteConflict`, the shard counts); `shares` has `enable`, `status`, `disable` and the internal `adminOff` and `publicRead`; `sharePayload` is the one function that builds what a stranger sees; `shareHttp` is `GET /api/shared/payload`. |
| `purge.ts`, `crons.ts` | The daily clean up of abandoned sign in accounts, and the scheduled jobs. |

## Commands

```bash
pnpm exec convex dev            # push to the dev deployment and watch (writes .env.local)
pnpm exec convex dev --once     # push once (also typechecks and bundles)
pnpm exec tsc --noEmit          # typecheck everything
pnpm exec vitest run --project convex    # convex-test suites (convex/*.test.ts)
```

## Conventions

- Errors a page can read are `ConvexError({ code })` through `fail("code")`. Never put personal data in a message or a log line (log counts and ids only).
- No function takes a student id, email or auth user id as input. Find the student with `requireStudent`.
- Expected refusals in `leads.submit` and `feedback.submit` return `{ ok: false, code }` instead of throwing, so the rate limit count stays.
- Every function has `args` and `returns` validators. New tables and fields are additive: never rename or remove one in the same release as the code that stops using it.
- Saved rows that are meant to be final (`results`, `resultFlags`, `consents`, `consentTexts`) are never patched or deleted by app code. `convex/results.test.ts` scans the sources to enforce this for results. A consent text changes only as a new version.
- Flags (`selfDoubt`, `lowMood`, and the rest) live only in `resultFlags` and are returned only to the owner. Nothing about a result goes into the Sheet copy, analytics or the leaderboard.
- `ENGINE_VERSION` in `public/dhiinterviews/js/engine/score.js` is bumped by hand when scoring output changes; `convex/score.lock.test.ts` and `tests/fixtures/score-lock.json` enforce it (see `public/dhiinterviews/js/engine/AGENTS.md`).
- The report copy never carries flags: the render payload is built with `NO_FLAGS` (in `resultsCore.ts`, the only place flag names may appear), and a copy is drawn only from a signed, short lived render token, never from anything a browser sends. `REPORT_VERSION` must equal `VERSION` in `reportText.js` (a test fails if not); bump both together when the report's words or layout change.
- Secrets live only in Convex environment variables, per deployment (declared in `convex.config.ts`). `TEST_SIGNIN_ENABLED` is for dev and preview only, never production.
- A picture path for any place other than the student's own `students.me` (the report copy payload, the team list, a leaderboard row, later the shared report) comes only from `pictureFor` in `avatarState.ts`; leaderboard rows use `leaderboardPictureFor`. The Google address, the storage id and the ETag never leave the server, and the only request to Google is `fetchPicture`, called from `avatars.sync`. Removing a picture deletes its file in the same step.
- The picture switches are read trimmed and ignoring case: `PROFILE_PICTURE_ENABLED` is on unless it is `false`, `0`, `no` or `off`; `PICTURE_CONSENT_REQUIRED` unset means nobody is asked and any other value brings the asked flow back; `LEADERBOARD_PICTURES_ENABLED` is off unless an explicit yes.
- The private report link works only when both `SHARE_LINK_SECRET` and `PUBLIC_SHARE_ENABLED` (`true`, `1`, `yes` or `on`; unset means off) are set, and the secret is read only through `shareSecret(env)`. Dev has both (the same secret value as production, by the owner's choice); production has the secret and no switch, so nobody can make or open a link there. Anything a stranger sees comes only from `sharePayload.ts`: flags are `NO_FLAGS`, `state` is sent empty and each area's `said` is null, because the mood split and the quoted answers give `lowMood` and `selfDoubt` away (the saved PDF copy keeps them, only the student and the team open it). `shares.disable` and `shares.adminOff` call `rotatePictureKey`, so the picture address in an old payload stops working. No code is ever logged; the one allowed log line is the fixed words for a lost race in `shareHttp.ts`.

## Gotchas

- A sharded rate limit in the limiter component gives every shard its own random window start unless the config has `start`, so a burst gets extra tokens as shards reset one by one. Set `start: 0` on a sharded fixed window you want to behave like "N a minute" (`shareRead`, `shareBad`). With 16 shards each holds a sixteenth, so the cap is a little under N, never above. `convex-test` runs one mutation at a time, so it cannot show a write race; check that live (40 readers at once), and expect 429, never 500, on a lost race.
- `convex/_generated/` is committed. `convex dev` regenerates it; if you add a file without running it, add the module to `_generated/api.d.ts` by hand (the same lines codegen writes).
- Test files (`*.test.ts`) sit beside the code but are not bundled. `import.meta` is allowed only in them (and in `tests/convexTestUtils.ts`, which is deliberately outside `convex/`).
- `scoring.ts` imports files from `public/dhiinterviews/js/engine/` for their side effect. They must stay plain ES5 scripts that fall back to `globalThis`.
- The report copy runs on Cloudflare Browser Run and needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `REPORT_RENDER_SECRET` (a different value per deployment) and `REPORT_RENDER_BASE_URL` (a public address; dev needs a deployed Pages preview, Browser Run cannot reach localhost). The Workers Free plan allows one request every 10 seconds and 10 minutes of browser time a day, so jobs run one at a time about 11 seconds apart and a "time limit exceeded" 429 waits for the next UTC day.
- Production is `abundant-caiman-975`, dev is `proper-camel-616` (`.env.local`). The browser tests refuse to run against production.
- A picture check is limited to one every 10 minutes for each student, so a fetch right after a team unblock or a sign in can wait up to 10 minutes (Restore has its own limit of 3 an hour). Nothing needs doing by hand: the next page load asks again. The Pages forwarder keeps an image at the edge for 50 minutes and tells a browser to keep it for 10 (Pages Functions ignore `_headers`, so its headers are set in code), so a removed picture can stay visible for at most an hour.
- Block or unblock a picture from a terminal: `npx convex run avatars:adminBlock '{"email":"student@example.com"}'` (and `adminUnblock`). Add `--prod` only on purpose.
- After switching to the asked mode (`PICTURE_CONSENT_REQUIRED` set), run `npx convex run avatars:dropUnagreed` once (add `--prod` on purpose). It deletes the copied pictures of students who have not agreed, including those who never come back; `ensure` does the same for each student who does.

## Related specs

[0001 stack](../docs/specs/0001-adopt-astro-convex-cloudflare-stack/index.md) · [0002 sign in and saved check](../docs/specs/0002-google-sign-in-and-saved-check/index.md) · [0003 leads and feedback](../docs/specs/0003-leads-and-feedback-saved/index.md) · [0004 Sheet copy](../docs/specs/0004-sheet-copy-of-leads-and-feedback/index.md) · [0005 results](../docs/specs/0005-results-and-report-from-saved-data/index.md) · [0006 report copy](../docs/specs/0006-report-copy-saved-when-seen/index.md) · [0010 private report link](../docs/specs/0010-share-report-public-link/index.md) · [0011 profile picture](../docs/specs/0011-google-profile-picture/index.md)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
