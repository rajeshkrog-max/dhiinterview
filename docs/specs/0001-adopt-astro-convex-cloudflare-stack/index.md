# 0001. Adopt Astro, Convex and Cloudflare Pages for the live app

**Date**: 2026-10-08
**Status**: In Progress

## Summary

The DhiRise funnel stays a browser app made of static pages, but it moves into Astro (a page builder that ships very little JavaScript) and is hosted on Cloudflare Pages. All server work (sign in, saving data, the leaderboard, the Google Sheet copy, scheduled jobs) lives in Convex, a managed backend with a built in database, so you run no server of your own. Sign in is Google only through Better Auth, and analytics is PostHog. The existing pages are lifted across first and converted to components later, so the 30 Oct challenge date stays reachable.

## Decision

**Chosen option**: Option 1: Astro static site + Convex backend + Better Auth + Cloudflare Pages.

Build the live app as a static Astro site on Cloudflare Pages that talks to one managed Convex backend, with Convex as the only place that stores data, checks rules and runs jobs.

**Implementation skills**: `astro` (`astrolicious/agent-skills`, `.agents/skills/astro/`) · Convex set (`get-convex/agent-skills`, `.agents/skills/convex*/`, start with `convex`, `convex-auth`, `convex-authz`, `convex-crons`, `convex-env`, `convex-test`) · `better-auth-best-practices` (`better-auth/skills`, `.agents/skills/better-auth-best-practices/`) · `better-auth-security-best-practices` (`better-auth/skills`, `.agents/skills/better-auth-security-best-practices/`) · `wrangler` (`cloudflare/skills`, `.agents/skills/wrangler/`) · `workers-best-practices` (`cloudflare/skills`, `.agents/skills/workers-best-practices/`) · `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`) · `playwright-cli` (`microsoft/playwright-cli`, `.agents/skills/playwright-cli/`)

**MCP servers** (recommended, you connect them in your own settings): Convex (`npx -y convex@latest mcp start`), PostHog (`https://mcp.posthog.com/mcp`), Cloudflare docs (`https://docs.mcp.cloudflare.com/mcp`), Playwright (`@playwright/mcp`).

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Application shape | A client side app: static pages in the browser plus one managed backend. No server of your own | You have no VPS and deploy on Cloudflare Pages. One deployable frontend and one backend is the smallest thing that works |
| Language | TypeScript, strict mode, for all new code. Existing page scripts stay plain JavaScript until a screen is converted | You build in TypeScript with AI help. Convex shares types end to end |
| Package manager | pnpm | Fast and strict about dependencies, supported by Cloudflare Pages and Convex |
| Framework | Astro, static output (no server rendering adapter). Each existing `.html` becomes an Astro page. CSS and scripts move unchanged first, then become components | Best first load speed and SEO for public pages, easiest path for 37 existing scripts |
| Backend and database | Convex (queries, mutations, actions, scheduled functions, HTTP actions). Pick the region closest to India that the project offers when it is created | No server to run, serial transactions for referral rules, live updates for the leaderboard, built in jobs for the sheet copy |
| Auth | Better Auth through the Convex component, Google sign in only. Store each student's email as a unique value, and phone numbers as unique values when given, for later use | Your stated choice. Google only matches today's screen and keeps the build small |
| Hosting | Cloudflare Pages for the static site, on a custom domain from day one (for example dhirise.com). One small Cloudflare Pages Function forwards `/api/auth/*` to Convex, so the browser sees a single address. Convex hosts the backend | One stable address for sign in cookies, callbacks, share previews and referral links. iPhone Safari and Firefox block cookies set across two addresses |
| Background jobs | Convex scheduled functions | Built in, so no queue to run. Used for the sheet copy retries and the leaderboard freeze |
| Sheet copy | A Convex scheduled action writes rows to the team's Google Sheet through the Google Sheets API with a service account. Convex stays the source of truth | Private, retried, and visible when it fails. A sheet outage never loses data |
| Analytics | PostHog Cloud EU, cookieless mode. Signed in students are identified with the internal student ID (not name, phone or email). Session replay, autocapture and text capture stay off | Your pick, on the basis that students use the app under parental supervision per your terms. PostHog has no India region. Open risk about minors, see Follow-up |
| Error monitoring | PostHog error tracking for pages, plus the Convex dashboard for backend failures. A daily health check job writes sheet copy and sign in failures to a table, shown as a failure count on the admin view, and you review it once a day | One fewer account. The free plan has no alerts, so a daily look replaces them |
| Abuse limits | Per student rate limits inside Convex functions. Every write needs a signed in student | Stops floods and scripted fake referrals without another service |
| Email sending | None now | Google only sign in sends no email. WhatsApp welcome is deferred |
| File storage | Convex file storage for one use only: each student's report PDF (spec 0002, built after scope row 6). Images and audio stay as static assets served by Cloudflare | The card export is drawn in the browser. The report PDF is made in the browser and uploaded once |
| Testing | Vitest for pure code (scoring), `convex-test` with a mocked identity for Convex functions, Playwright for funnel flows. Google sign in cannot run in a test browser, so a test only sign in path (a fake student) exists on dev and preview deployments and is switched off in production by an environment flag | The scoring file already runs in Node. A guarded test path keeps the most important flow under automatic test. Runner up: Node test runner plus Cypress |

**Deploys and environments**:
- One push does both: the Cloudflare Pages build command is `npx convex deploy --cmd "pnpm build"`. Convex deploys first, Astro builds second with the Convex URL injected. Verify the exact Cloudflare steps in the first spike.
- Backend changes stay additive within a release (add fields, never rename or delete a field in the same release as the code that stops using it), so rolling back the site still works.
- One Convex dev deployment per developer, one production deployment, and a Convex preview deployment per branch for Cloudflare preview builds, so test data never mixes with real students. Whether the free plan allows preview deployments is unverified; the spike checks it. Fallback: one shared dev deployment.

**Configuration and secrets**:
- Public values, set as Cloudflare Pages build variables: the Convex URL, the PostHog project key and host, the site address (the `shareUrl` today).
- Secrets and server settings, set only as Convex environment variables, per environment: `BETTER_AUTH_URL` (the site address, since auth is served through it), `BETTER_AUTH_SECRET`, the Google OAuth client ID and secret, the Google service account key (check the size limit for one variable, and never log it), the sheet ID, and the test sign in flag (on for dev and preview only). Note a rotation date for each secret. Never in the repo or in front end code.
- `js/funnel-config.js` is replaced by these build variables. The rule stays: no secrets in front end code.

**Sign in addresses** (Google does not allow wildcard redirect addresses, so list them exactly):
- Production: `https://<domain>/api/auth/callback/google`.
- Local development: `http://localhost:4321/api/auth/callback/google`.
- One stable staging alias for testing real Google sign in on a branch. Other previews use the test only sign in.
- Better Auth trusted origins hold exactly these addresses. The page a student returns to after sign in is checked against an allowlist.
- The Google consent screen is set to Production (test mode caps users at 100 and expires tokens in 7 days) and links a new privacy page on the site, written from the consent text in `BACKEND.md`.

**Domain and headers**: attach the custom domain to Cloudflare Pages before the sign in spike. A `_headers` file sets HTTPS only (HSTS), `frame-ancestors`, and a content security policy that allows only the PostHog EU host and the Convex origin.

**Security model**: the browser is untrusted. Every rule (who may write, referral validity, rate limits, under 18 consent) is enforced inside Convex functions, never in page scripts. Public reads (the leaderboard) use a dedicated function that returns only first name plus last initial, class and style. Sensitive flags are stored apart and never returned to public functions. Compliance scope: students under 18 in India, covered by the Digital Personal Data Protection Act, 2023 (consent, erasure).

## Consequences

**Positive**:
- No server, database host or job runner to operate; one developer can run it.
- Live leaderboard and referral counts update without polling.
- The existing screens keep working during the move, so there is no big bang rewrite.
- Static pages on Cloudflare load fast and cost little.

**Negative / tradeoffs**:
- The data is relational but Convex has no database level constraints. Uniqueness (email, phone, one referral use per new student) must be enforced in code inside mutations. A missed check is a real bug.
- Vendor lock in: Convex functions are not portable to another database without a rewrite.
- The free Convex plan has no streaming export or daily backups (per its pricing page). Data export and deletion (scope row 15) and backups need their own plan, or a paid plan before launch.
- No India region is confirmed for Convex or PostHog, so student data may live outside India. The privacy notice must say where.
- Google only sign in excludes students without a Google account.
- Auth is served through your own domain by one small Cloudflare Pages Function. That is one extra piece to build and test, and it is a thin server side seam in an otherwise static app.
- Identifying every student in PostHog while also using cookieless mode weakens the privacy reason for cookieless mode. Relying on "parental supervision" in your terms is not the same as verifiable parental consent under India's data protection act. This needs a legal check before launch.
- The free Convex plan has no alerts and about 1M function calls a month. Live queries and reconnects can use that up during a launch spike, so budget for the paid plan.

**Neutral**:
- `BACKEND.md` describes a generic REST and SQL design. Its API contract becomes Convex functions, so the document needs a refresh.
- The 33 Convex skills add reading load; use the few named above first.
- The deadline: the challenge ends 30 Oct 2026, so Slice 1 comes first and the challenge date may need to move.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Follow-up

- [x] (Proven 2026-10-08: a real Google account signed in on dhirise.com and Convex recognised it; the Convex preview deployment and exact Cloudflare steps question stays open) First build task: a thin spike of Google sign in with Better Auth on Convex from a static Astro page, with `/api/auth/*` forwarded through the site's own address by a Pages Function, tested on iPhone Safari and Android Chrome. Also confirm in the spike: Google sign in works through the Better Auth Convex component, the free plan allows Convex preview deployments, and the exact Cloudflare build steps. If it fails, fall back to the Convex Auth library (see `rationale.md`)
- [ ] Check which regions Convex offers and pick the closest to India. Record the answer in the privacy notice
- [ ] Legal check before launch: PostHog (cookieless plus identified students) for students under 18, and the "parental supervision per our terms" basis against verifiable parental consent. Settle it before launch, not after. Revisit scope row 8 at its own spec. Keep names, phone numbers, emails and sensitive flags out of every event
- [ ] Write the new privacy page (linked from the landing consent and Google's consent screen) and appoint a grievance contact
- [ ] Limit the columns copied to the Google Sheet (no sensitive flags), restrict who can see it, and log access

**Cross check items routed to the specs that own them** (decisions not settled here, kept so none are lost):
- [ ] Row 2, data model: identity is Google's stable ID, email is an attribute (lowercase). Phone is optional and unverified, unique only when present, kept in a separate claim table, so it is not an identity key. One clock, Asia/Kolkata, day keys computed on the server
- [x] Row 4, sign in: which pages are public static and which need a session; what happens to answers saved in the browser before sign in (settled in spec 0002: only landing and terms are public; old browser answers are offered for import once)
- [ ] Row 5, leads: concrete rate limits per function and a bot check at sign in
- [ ] Row 7, sheet copy: an outbox table, one scheduled job sending in batches, upsert by student ID, retries in code, a visible failure count, a CSV export fallback
- [ ] Row 10, referrals: keep `?ref=` out of the Google round trip, send it once after first sign in as one repeat safe call, first use wins, no self referral
- [ ] Row 11, parent consent: how age is captured, what counts as a minor (under 18), how parental consent is stored, and what is blocked without it
- [ ] Row 12, leaderboard: a precomputed top list refreshed every 10 to 30 seconds, a tie break rule, one config holding the end and freeze times, a display name the student confirms
- [ ] Row 14, admin view: a role set from an allowlist of verified Google emails, with an audit log of admin reads
- [ ] Row 15, deletion: the delete job also removes the student's row from the Google Sheet, and a retention period is stated
- [ ] Before launch: budget the paid Convex plan (call limits, backups, export, alerts), and note that school or children's Google accounts may be unable to sign in
- [ ] Decide backups and export before launch: free plan limits (no streaming export, no daily backups) against scope row 15
- [ ] Check that Cloudflare Pages is still the right static target, or whether static hosting on Workers is now the better home. Both serve static files
- [ ] Capture unique email and phone handling in the data model spec (scope row 2)
- [ ] Refresh `BACKEND.md` and `INTEGRATION.md` for Convex functions after the data model spec (`/sync`)
- [ ] Root `AGENTS.md` `## Stack` and `## Agent skills` are out of date: run `/audit` (scope row 3). Skills to list: the eight above. `MCP servers:` convex, posthog, cloudflare docs, playwright (recommended)
- [ ] Review the installed skills: they run with full agent permissions
- [ ] Google Sheets: no skill or MCP was installed. A Google Workspace CLI skill and a preview Sheets MCP exist but were not confirmed
- [ ] Add a plan to remove the legacy interviewer tool when the Astro move is done (listed under Deferred in the scope)
