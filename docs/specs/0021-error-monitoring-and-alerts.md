# 0021. Error monitoring and alerts with PostHog

**Date**: 2026-10-11
**Status**: Proposed

## Summary

The team learns about a broken sign in, a failed save or a stuck Sheet copy from an alert in a team channel, before students say so. Errors from the browser, the Pages forwarders and a five minute health check are sent to PostHog's error tracking (EU cloud, a project shared with the later analytics row), which groups them into issues and posts to Slack or Discord. Every report carries only a fixed code, a page or function name and a version, never a name, email, phone, answer, link code, message text or cookie. It works on the free Convex plan.

## Context

Today a failure shows only in the Convex dashboard or in a table nobody reads. Failures are already written down (`sheetSync` status `failed`, `reportFiles` state `failed` with `lastError`, `sheetStatus.lastError`), but nothing tells a person. The jobs catch their own errors and record them rather than throwing, so there is nothing to hook inside the jobs; a health check reading those records is the right detector. Pages Functions logs are live only and not stored. Convex's own Sentry connection and log streams need the Pro plan (the plan is still your decision, row 26), and the `convex-sentinel` skill names a package (`@convex-dev/sentinel`) that is not on npm, so neither is an option now.

You chose PostHog for monitoring and want it built in another session. PostHog error tracking can group `$exception` events into issues and alert a Slack, Discord, Teams or webhook destination when an issue is new, reopened or spiking, and our own code can send `$exception` events with its capture API without an SDK. The free tier is 100,000 exceptions a month with a spend limit; the free plan allows 2 alerts (a snapshot, checked at build). A site that is completely down cannot report itself.

Students are in Class 8 to college and many are under 18, so an error report must hold no personal data. You decided that error monitoring is on for everyone by default, with no choice asked, which relies on reports carrying nothing personal; that stays on the lawyer list. Row 8 (analytics with consent) is separate and still waits for the student's choice.

## Requirements

**User stories**:
- As the team, I want an alert when sign in, saving or the Sheet copy breaks, so that we fix it before students notice.
- As a parent, I want error reports to hold nothing about my child.
- As a developer, I want errors grouped into issues with the page and version, so that I can find the cause.

**Acceptance criteria**:
- **AC-1**: Uncaught browser errors, unhandled promise rejections and failed `DhiSession` calls on the funnel and frame pages are sent as `$exception` events through our forwarder (AC-3). An event holds only: the error type, a fixed code (our own `ConvexError` code or a short name; never message text), the page name (the path with no query string or fragment, `/s/<code>` written as `/s/*`), the app version, the environment, and stack frames. A frame is kept only if its file is under `/dhiinterviews/js/` or `/_astro/`; all other frames (extensions, other origins) are dropped. Offline and network errors are not reported. The grouping key is the code plus the top kept frame.
- **AC-2**: The browser reporter is a small script of ours (`js/errors.js`, about 1 KB), not the PostHog SDK, loaded as a plain classic `<script>` first in the head of every funnel and frame page (landing, question pages, meet, done, who, report, challenge, leaderboard, privacy, terms, 404), outside the deferred chain, so early errors are caught. It is not added to `/s/*`, `report-render` or the team pages. Its address is fingerprinted by `scripts/version-assets.mjs`, and `AGENTS.md` gets a line about its place in the load order. It sets no cookie, uses no localStorage or stored id, turns on no autocapture or session replay, and never calls `identify`. Each page load uses a random id that is not stored, and every event sets `$process_person_profile: false` so no person is created. It sends at most 5 events per page load and never delays or breaks the page; its own failures are swallowed.
- **AC-3**: Browser reports go to a Pages function (`functions/api/report-error.ts`). It accepts only POST, JSON, same origin (it checks `Sec-Fetch-Site` or `Origin`), at most 4 KB. It runs the shared `redact` function again, adds the project key, the environment and the version, and forwards to PostHog's EU capture address with a 5 second timeout. The browser never contacts PostHog directly. It answers 204 whatever happens. Its rate cap is best effort (instances are many and short lived); the real backstop is the size cap and PostHog's spend limit.
- **AC-4**: The health check (`monitor.check`, a Convex cron every 5 minutes) reports a problem once per fingerprint per hour when it sees: a Sheet row `failed`, or `pending` with its `nextAttemptAt` more than 15 minutes overdue; no Sheet success (`sheetStatus.lastSuccessAt`) for 30 minutes while rows are due; a report copy `failed` (the Browser Run daily time limit is a warning reported once a day, not an error); a report copy `queued` for over 60 minutes while the day's limit has not been reached. It uses the existing indexes (`sheetSync.by_status_and_nextAttemptAt`, `reportFiles.by_state_and_nextAttemptAt`). Exact thresholds are confirmed on dev.
- **AC-5**: Server side reports are sent only from code that finishes normally: the Pages forwarders when the upstream answers 5xx (the auth forwarder `functions/api/auth/[[path]].ts` and the others, through one shared helper), and the health check. A thrown Convex query or mutation cannot report itself (its scheduled work rolls back) and is out of scope; a failing browser call to it is reported by `errors.js`. There are no hooks inside `sheetFlush`, `reportMake`, `avatars.sync` or `purge`: their failures are caught and recorded, and the health check reads those records. An event holds a fixed code, the function or route name and counts, with a fingerprint of code plus name.
- **AC-6**: One shared `redact` function (used by the forwarder, the server reporter and tests) keeps only an allowlist of fields and removes query strings, fragments, `/s/<code>`, email shapes, 10 digit numbers, and tokens longer than 20 characters from anything kept. A test feeds it samples with names, emails, phones, a referral code, a share code and an auth token and checks none survive.
- **AC-7**: PostHog alerts for "issue created" and "issue spiking", filtered to environment `production`, post to a private Slack or Discord channel the team sets up in PostHog. The steps are in `tools/MONITORING.md`. If the free plan's alert limit leaves no room for both, one combined alert is used.
- **AC-8**: Settings: `POSTHOG_PROJECT_KEY` and `POSTHOG_HOST` (default the EU ingestion address `https://eu.i.posthog.com`) in Convex and in Pages. Unset means monitoring is silently off. The environment comes from `ENVIRONMENT` in Pages (`production` in the production environment, `preview` otherwise, set in `wrangler.toml`) and `MONITOR_ENV` in Convex (set per deployment). Local, Playwright and `wrangler pages dev` runs leave the key unset, so they never alert, and the alert filter is `environment = production`.
- **AC-9**: The forced failure checks from your scope row pass on dev, each ending with an alert in the channel: sign in (the auth forwarder made to see a 5xx), saving (a `saveAnswers` call made to fail in the browser) and the Sheet copy (a row set `failed`). Failures are produced by Playwright route stubs and a `MONITOR_TEST_FAIL` setting that the code honours only when the environment is not production; nothing in production code can fail real traffic.
- **AC-10**: The privacy page gains a short section: error reports go to PostHog (EU), hold only a code, a page name and a version, use no cookie or stored id, keep no IP address (the PostHog project's "discard client IP data" setting is on, `$ip` is sent as null, and the forwarder never passes the client's IP, user agent or referer on), and cannot identify a student. The landing consent text is not changed (not asked, by your decision).
- **AC-11**: The heartbeat: `monitor.check` records when it last ran, and `/api/health` answers 503 `monitor_stale` if that was over 20 minutes ago. `tools/MONITORING.md` recommends a free outside ping of `/api/health` every 5 minutes with an alert to the same channel, because a down site or a stalled check cannot report itself. The ping is a setup step, not code.
- **AC-12**: One problem cannot flood the channel: `monitor.claim(fingerprint, window)` is one internal mutation that checks and sets in a single step and returns whether to send (one event per fingerprint per hour); the browser caps 5 per load; PostHog's spend limit is set. Convex `fetch` calls have a 5 second timeout so a slow PostHog never holds a cron action.

## Options considered

### Option 1: PostHog error tracking fed by our own small reporters
Our own script, forwarders and Convex action send `$exception` events; PostHog groups and alerts.

**Pros**:
- One tool you already plan to use for analytics; no new vendor; alerts to Slack or Discord with no code.
- Works on the free Convex plan; redaction is in our hands in two places.
- No third party script on the pages; the key stays off the browser.

**Cons**:
- A thrown Convex query or mutation is not seen unless the browser call fails or a record shows it; a total outage needs the outside ping.
- The alert limit on the free plan is small; if PostHog is down, reports are lost silently.

### Option 2: Hosted Sentry for browser, Pages and Convex
Use Sentry's SDKs and the Convex Sentry connection.

**Pros**:
- Richer stack traces and release tracking.

**Cons**:
- Sends error data of minors to a third party, the Convex part needs the Pro plan, and it is a second tool beside PostHog.

### Option 3: Only our own table and a Telegram or email alert
Store errors in Convex and send alerts ourselves.

**Pros**:
- Data stays in our deployment.

**Cons**:
- We build grouping, spike detection and the alert channel ourselves.

## Decision

**Chosen option**: Option 1: PostHog error tracking fed by our own small reporters

**Implementation skills**: `posthog-instrumentation` (`.claude/skills/posthog-instrumentation/`) · `workers-best-practices` (`.claude/skills/workers-best-practices/`, for the Pages functions) · `convex` (`.claude/skills/convex/`)

## Rationale

You already chose PostHog, it can group, alert and take server events without an SDK, and it works while the Convex plan is free. Our own reporters keep the redaction rules in one place and keep the PostHog key and domain off the pages, which also avoids ad blockers hiding the reports. The jobs already record their own failures, so reading those records every 5 minutes is more reliable than hooks inside code that catches its errors, and it removes the case where a rolled back mutation cannot report itself. The remaining gaps (a thrown query or mutation, a total outage, PostHog being down) are named and either covered by the browser report and the outside ping or accepted. Sentry was rejected for sending minors' error data to a third party and for the Pro plan needed to reach Convex.

## Feature design

**Data model** (one small table, additive): `monitorState`: `fingerprint` (string), `lastSentAt` (number), `suppressed` (number: how many repeats were held back in the current window, shown in the next event); index `by_fingerprint`. A special row with fingerprint `heartbeat` holds when `monitor.check` last ran. Rows other than the heartbeat older than 7 days are deleted by the same cron.

**Files**: `public/dhiinterviews/js/errors.js` (the browser reporter), `functions/api/report-error.ts` (the forwarder), `functions/api/_lib/report.ts` (the shared helper the other forwarders call on a 5xx), `convex/monitor.ts` (`claim`, `report`, `check`), `convex/redact.ts` (shared with the forwarders and tests), `tools/MONITORING.md`, a section in `src/pages/dhiinterviews/privacy.astro`, `ENVIRONMENT` in `wrangler.toml`, a `<meta name="dhi-version">` added by `scripts/version-assets.mjs`.

**PostHog event shape**: a POST to `https://eu.i.posthog.com/i/v0/e/` with `api_key`, `event: "$exception"`, `distinct_id` (a random id per page load for the browser; `"server"` for server events), `timestamp`, and properties `$exception_list` (type, value = the fixed code, stacktrace frames), `$exception_fingerprint`, `$process_person_profile: false`, `$ip: null`, plus `environment`, `page` and `app_version`.

**API surface**

| Endpoint or function | Kind | Inputs | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `POST /api/report-error` (Pages function) | public http | `{ type, code, page, version, frames? }` | 204 always | none (same origin) | none visible (drops silently) |
| `monitor.claim` | internal mutation | `fingerprint`, `windowMs` | `{ send: boolean, suppressed }` | server only | none |
| `monitor.report` | internal action | `{ code, where, count?, level }` | none | server only | none (errors swallowed, 5 second timeout) |
| `monitor.check` | internal action (cron, 5 minutes) | none | none | cron | none |
| `GET /api/health` (existing) | public http | none | `ok`, or 503 `monitor_stale` | none | 503 |

**Value sourcing**
| Action | Value | Source |
|---|---|---|
| Error code | a fixed word | the `ConvexError` code, or a short name chosen where we report; message text is never sent |
| Page name | path without query or fragment | `location.pathname`, redacted (`/s/*`) |
| App version | the git commit | `CF_PAGES_COMMIT_SHA` at build, written as `<meta name="dhi-version">` by `scripts/version-assets.mjs` (the string `local` when absent); `errors.js` reads the meta |
| Environment | `production` or `preview` or `dev` | `ENVIRONMENT` (Pages) and `MONITOR_ENV` (Convex) |
| Project key and host | PostHog write key and EU host | `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST` |
| Health signals | overdue, failed, stale | `sheetSync` and `sheetStatus`, `reportFiles` (existing indexes) |
| Dedupe window | one event per fingerprint per hour | `monitorState` through `monitor.claim` |
| Heartbeat | when the check last ran | the `heartbeat` row in `monitorState` |

**Key invariants**
- A report never holds a name, email, phone, answer, flag, link code, referral code, token, message text or query string.
- Reporting never throws into, delays or blocks the app.
- No cookie, stored id or third party script is added to any page.
- No production code path can be made to fail real traffic for a test.

**Security model**: the forwarder is public, so it checks method, type, origin and size, and redacts; the PostHog key is a write only project key but stays off the browser anyway. The team and `/s/*` pages (with `connect-src 'self'`) are not in scope; a same-origin POST would be allowed if they were added. Compliance scope: India's Digital Personal Data Protection Act, 2023 (children's data). PostHog EU is a processor; the privacy page says so. Owed to the lawyer: monitoring on by default for minors with no choice asked.

**Configuration required**:
- `POSTHOG_PROJECT_KEY`, `POSTHOG_HOST`: in Convex (per deployment) and in Pages (production and preview).
- `ENVIRONMENT` (Pages) and `MONITOR_ENV` (Convex).
- `MONITOR_TEST_FAIL`: dev and preview only.

**Critical test scenarios**
- `redact` removes every kind of personal sample and keeps the allowlist, verifies **AC-6**.
- The forwarder rejects an oversize body, a wrong method, a wrong content type and a cross origin call, redacts again, answers 204 on every path, verifies **AC-3, AC-12**.
- The browser reporter sends at most 5 per load, skips offline errors, keeps only our own frames, sets no cookie or storage, never throws, verifies **AC-1, AC-2**.
- A forwarder 5xx is reported once; `monitor.check` reports each condition once per hour and not again within it, and `claim` is safe when called twice at once, verifies **AC-4, AC-5, AC-12**.
- Settings unset means no network call and no change; production ignores `MONITOR_TEST_FAIL`, verifies **AC-8, AC-9**.
- `/api/health` answers 503 when the heartbeat is old, verifies **AC-11**.
- Forced failures on dev for sign in, saving and the Sheet copy each produce an alert in the channel, verifies **AC-9**.
- Source scan: no third party script or address added to pages, no `error.message` forwarded, verifies **AC-1, AC-2**.

## Build plan

Build approach: Tracer Bullet (the project default): one real error to one real alert first.

1. **M1 The thin thread**: `redact`, the forwarder and `js/errors.js` on one page with the version meta, a PostHog EU project with the first alert to a test channel (the free alert limit checked here), proved by a forced browser error reaching the channel, satisfies **AC-1, AC-2, AC-3, AC-6, AC-7**.
2. **M2 The pages and the forwarders**: `errors.js` on every funnel and frame page, the shared helper reporting a 5xx from the auth and other forwarders, the settings and the environment values, satisfies **AC-1, AC-5, AC-8**.
3. **M3 The health check**: `monitor.claim`, `monitor.report`, `monitor.check`, `monitorState`, the Sheet and report copy checks, the heartbeat and the `/api/health` 503, satisfies **AC-4, AC-11, AC-12**.
4. **M4 Words and setup**: the privacy page section, `tools/MONITORING.md` with the PostHog settings (discard client IP, spend limit, alerts) and the outside ping, the `AGENTS.md` line, satisfies **AC-7, AC-10, AC-11**.
5. **M5 Proof**: tests, the three forced failure checks on dev ending in an alert, satisfies **AC-9**.

## Consequences

**Positive**:
- The team hears about problems from a channel, with errors grouped and no student data in them.
- No new vendor beyond PostHog, which row 8 will also use.
- Works on the free Convex plan, and Convex's Sentry feature can be added later without redoing this.

**Negative / tradeoffs**:
- A thrown Convex query or mutation is not seen unless a browser call to it fails or a record shows it.
- A total outage needs the outside ping, set up by hand; if PostHog itself is down, reports are lost silently.
- The free PostHog plan allows few alerts and a capped volume (checked at build).
- Monitoring on by default with no choice asked depends on the lawyer's view.

**Neutral**:
- Row 8 shares this PostHog project; analytics events there will be a separate, consent gated stream with their own environment tag.

## Follow-up

- [ ] Lawyer check: error monitoring on by default for minors, with no personal data.
- [ ] Owner approves the privacy page words and creates the PostHog EU project (with "discard client IP data" on and a spend limit) and the team channel.
- [ ] Check the PostHog alert limits and the free tier on the real account during M1.
- [ ] Record the installed skills (`posthog-instrumentation`, `workers-best-practices`) in `AGENTS.md`, which still says none are installed.
- [ ] Row 8 (analytics) uses the same project but its own environment and waits for consent.
- [ ] If the Convex Pro plan is bought later (row 26), switch on Convex's Sentry exception reporting or a log stream as an extra, not a replacement.
- [ ] Cross check (same model, 2026-10-11) gaps are closed in this spec.
