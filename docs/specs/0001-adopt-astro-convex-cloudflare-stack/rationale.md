# 0001. Rationale: Adopt Astro, Convex and Cloudflare Pages

## Context

> ⚠️ Premise note: Your data is relational (students, answers, referral codes and uses, rankings), and Convex is a document database with ids and indexes. That is the "document store for relational data" pattern, which usually costs you database enforced constraints and joins. It is acceptable here only because Convex runs each mutation as a serial transaction, so uniqueness and the referral rules can be enforced safely in code. The price is that every rule is your code, with no database to catch a missed check. A second note: the app is client side, so the browser cannot be trusted. All rules must run in the backend.

The DhiRise funnel is a finished static frontend (37 page scripts, 17 or more screens) that keeps everything in the browser. It must become a live app: real Google sign in, saved answers, leads and feedback, a copy of the data in the team's Google Sheet, product analytics, and later a working referral challenge with a public leaderboard. The audience is students from Class 8 to college in India, many under 18, so consent, erasure and sensitive data handling matter.

The constraints that shaped the choice:
- One developer working with AI help, in TypeScript, and no server to run (no VPS). Hosting is Cloudflare Pages.
- The challenge in `js/challenge-config.js` ends 30 Oct 2026, 22 days from today.
- Student data should preferably be in India, but any secure region is acceptable.
- Sign in is Google only for now. Email and phone are stored as unique values for later.
- The database is the source of truth. The Google Sheet is a copy.

Without a decision, the data layer cannot be built: sign in, the data model and every later slice depend on this stack.

## Options considered

### Option 1: Astro static site + Convex + Better Auth + Cloudflare Pages (chosen)

Static Astro pages on Cloudflare Pages call a Convex backend for all data, sign in (Better Auth via the Convex component), jobs and the sheet copy.

**Pros**:
- Nothing to operate: no server, database host, queue or cron runner.
- Serial transactions make referral and uniqueness rules safe to enforce.
- Live queries give the leaderboard real time updates; scheduled functions give the sheet copy retries.
- One language and shared types from database to page.

**Cons**:
- Constraints live in code, not in the database.
- India region unconfirmed; vendor lock in.
- Free plan has no streaming export or daily backups.
- Auth would sit on a different address than the site, so browser cookie rules bite. Fixed by serving auth through the site's own address (see Rationale).

### Option 2: Astro static site + Neon Postgres + Drizzle + Better Auth, with an API on Cloudflare Workers

Relational data in Neon, an API written as Workers, scheduled jobs through Workers cron.

**Pros**:
- Real constraints, SQL for rankings, exports and deletes across tables.
- Better Auth's Drizzle adapter is documented.
- Portable if you outgrow the host.

**Cons**:
- No India region (the nearest is Singapore, per Neon's region list).
- You build and run an API layer, migrations and the retry logic for the sheet copy yourself. Roughly a week more work than Option 1 in a 22 day window.
- More moving parts for one developer.

### Option 3: Next.js full stack (React) with Convex or a database, deployed through a Cloudflare adapter

One React codebase with server code inside it.

**Pros**:
- Strongest server features in one place. Large community.

**Cons**:
- Every screen is rewritten as React; heavier pages and a slower first load.
- Running Next.js on Cloudflare needs an adapter, another thing to maintain.
- The server features go unused, because Convex already does the server work.

### Option 4: Astro static site + MongoDB Atlas + an API on Cloudflare Workers

**Pros**:
- Atlas lists a Mumbai region.
- Flexible documents.

**Cons**:
- Free tier support in Mumbai was not confirmed.
- The relational shape gives the document model no benefit, and you still build and run an API layer.
- No managed job or live query layer comparable to Convex.

## Rationale

The decisive forces are time and operation. With one developer, 22 days and no server, the stack that removes the most moving parts wins. Convex gives the database, API, jobs and live updates in one managed service, and the sheet copy needs exactly what it provides: scheduled retries with visible failures. Option 2 is the better database for relational data and the better answer for long term portability, but its extra API layer, migrations and job setup would take the time the challenge date does not allow. If the project later needs SQL reporting, an export into a warehouse is the clean path, not a rewrite now.

Astro was your preference. It suits the forces: public pages benefit from real HTML and fast first loads, the existing scripts can move across unchanged, and the server work already lives in Convex, so the strongest argument for Next.js (server code in the framework) does not apply. Vite on its own would be a single page app, which weakens SEO and share previews.

Compared with your stated leanings: you preferred Convex over MongoDB and Neon with Drizzle, and I agree for the reasons above. One caution I raise: PostHog cookieless mode is your choice and is built to here, but whether it is enough for minors is not settled, so it is recorded as an open question rather than a closed one.

A cross check (same model, read only) raised that auth on a Convex address would set cookies on a different address from the site, which iPhone Safari and Firefox block. You chose to serve auth through your own domain from day one with a small Cloudflare Pages Function, so the browser sees one address. If the spike still fails, the fallback is to switch sign in to the Convex Auth library, which keeps this stack.

On PostHog, you chose to identify every student, on the basis that they use the app under parental supervision per your terms. I recommended anonymous events only, because cookieless mode and a persistent student ID pull in opposite directions and verifiable parental consent is a different thing from a terms line. Your choice is built to, and the legal check is recorded as a launch blocker in Follow-up.

## Evidence: landscape check (web, October 2026)

Gathered by a read only subagent. Items it could not confirm are marked unverified and are not relied on.

- Convex free plan: 1M function calls, 0.5 GB database, 1 GB files, scheduled functions available, streaming export and daily backups not on the free plan. A selectable data region exists, but no India region was confirmed (unverified). Undated page.
- Better Auth + Convex: the Convex component `@convex-dev/better-auth` is maintained by Convex. The page shows email and password and GitHub, not Google. Google through this component is unverified.
- Better Auth Drizzle adapter: supports Postgres, MySQL and SQLite.
- Neon: no India region in its list; the nearest is ap-southeast-1.
- MongoDB Atlas: lists ap-south-1 Mumbai. Free tier availability there is unverified.
- PostHog Cloud: US and EU regions only, from search results (unverified). Cookieless mode details also from search results (unverified).
- Agent Skills and MCP servers were checked at repo level only; individual skill contents are unverified.

## References

**Project sources**
- Root `AGENTS.md` (plain HTML/JS stack, rules on sensitive data and consent)
- `docs/scope/scope.md` (rows 1 to 17, Tracer Bullet, workflow GA)
- `BACKEND.md` and `INTEGRATION.md` (flow, payloads, challenge rules)

**Practices & standards**
- Monolith first and managed services over self run infrastructure for a small team
- Authentication from a proven library, never built from scratch
- Enforce every rule on the server when the client cannot be trusted
- India's Digital Personal Data Protection Act, 2023, on children's data, consent and erasure (named, link not verified)

**Links** (web verified only)
- [Convex pricing](https://www.convex.dev/pricing)
- [Better Auth with Convex](https://better-auth.com/docs/integrations/convex)
- [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle)
- [Neon regions](https://neon.com/docs/introduction/regions)
- [MongoDB Atlas AWS regions](https://www.mongodb.com/docs/atlas/reference/amazon-aws/)
- Not verified, so no link: PostHog regions and cookieless mode, the Convex region list, Google sign in through the Better Auth Convex component
