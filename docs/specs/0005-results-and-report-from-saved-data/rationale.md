# 0005. Results and report from saved data: rationale

## Context

Today the browser works out every student's result each time a page opens. It reads the saved answers and the seed, and calls `DhiScore.score` in `done.js`, `who.js`, `report-student.js`, `card.js` and the style label in `api.js`. The server holds the answers and `checks.reportSeenAt`, but no result and no scoring version. The scoring weights, the area names and the "said" lines all live in two browser files (`questions.js`, `score.js`).

That leaves three problems. A change to the scoring or to a question silently changes every earlier student's report, because the result is recomputed from the answers each time. The team cannot see a result without opening the student's browser, which blocks the team link in scope row 23. And a browser can in principle be edited to show anything. The scope row asks that the report opens from saved data on a second device with the same score, style and flags, and that the scoring version is stored with each result.

The student is often under 18, the data is personal, and the flags (`selfDoubt`, `lowMood` and others) are sensitive. `AGENTS.md` says they are never public and never used to label a student. India's data protection law on children's data applies (named, not linked, see References).

Spec 0002 left a note that this spec should take the scoring version and the report PDF together. The scope has since split the PDF and the saved report copy into row 22, so this spec carries only the scoring version and the report version constant that row 22 will use.

## Options considered

### Option 1: The server makes and saves the result at Finish, using the one existing scoring file (chosen)

`checks.complete` scores on the server in the same transaction that sets `completedAt`, then saves a `results` row and a `resultFlags` row. Pages read the saved result.

**Pros**:
- One scoring file, run in both places, so no drift.
- The result is made atomically with finishing, so a finished check always has one.
- A student cannot send a made up result.
- The team can read results without a browser.

**Cons**:
- Needs a spike to prove Convex can load the browser files; a small copy step is the fallback.
- A scoring bug at Finish blocks finishing.

### Option 2: The browser scores, then uploads its result

The pages keep scoring and send the answer to the server to store.

**Pros**:
- No change to how scoring runs and no spike.

**Cons**:
- The server trusts the browser, so a saved result can be wrong or forged.
- Two devices could upload different results for one check if the scoring file differed between loads.
- The team link would show whatever a browser claimed.

### Option 3: A second copy of the scoring, written as TypeScript on the server

**Pros**:
- Runs natively in Convex, easy to unit test.

**Cons**:
- Two copies of the weights that must stay in step; the questions file also holds tip cards and text the browser needs, so the browser copy cannot go away.
- Every scoring edit becomes a double edit.

### Storage shape (decided in the same pass)

- **Typed headline fields plus one `detail` block (chosen).** The team can sort on `dhiStart` and style; the report's charts can change without a schema migration. Con: the block is not queryable inside.
- **Everything typed.** Strictly queryable, but every new number in the report forces a migration.
- **One block only.** Simplest, but the team could never filter by style or score.

### Where the flags live

- **A separate `resultFlags` table (chosen).** A query that reads results cannot return a flag by accident. Con: a second read for the owner.
- **Inside the result block, hidden by code.** One read, but every function that returns a result must remember to strip the flags; one slip leaks a minor's sensitive data.

### How the version is named

- **A whole number in `score.js` plus a locked test (chosen).** Con: someone must bump it by hand; the test catches forgetting when the output changes.
- **A fingerprint of the scoring and question files.** Cannot be forgotten, but changes on harmless edits such as a typo fix in a question.
- **A date stamp.** Readable, but says nothing about whether the scoring changed.

## Rationale

The forces are the three problems in Context: old reports must not move, the team needs results without a browser, and the data is a minor's. Option 1 is the only one that answers all three. Option 2 leaves the server trusting the browser, which is the wrong direction for the team link and for sensitive data. Option 3 buys type safety at the cost of two copies of the weights, and the whole point of the result is that there is one answer.

Doing the scoring inside `checks.complete` uses Convex's rule that a mutation either commits all its writes or none (see Links), so a finished check can never exist without its result. That is why a scoring failure at Finish fails the finish whole (AC-6) rather than leaving a half state for every page to cope with. The older checks get their result through an idempotent `ensure`, which the same transaction rule makes safe when two devices ask at once. A backfill job was weighed and left out, because the on demand step is still needed for any student who finishes during a rollout, so a job would only add something to run and watch.

The separate flags table follows the `AGENTS.md` rule that flags are never public. It costs one extra read and removes a whole class of mistake. The version is a hand bumped whole number because the question that matters is "did the numbers change", which only a test on fixed answers can answer; a file fingerprint would mark a typo fix as a scoring change.

The `detail` block is small (a few kilobytes), far below Convex's one megabyte document limit and its nesting limit of 16 levels, which the result stays well inside (see Links). Storing the question and option text in the "said" lines freezes the words that explained the number, which is wanted for an immutable result.

The engineer's recommended picks were all taken. The one open technical risk is whether Convex can bundle files from `public/`; the Convex bundling page says the CLI bundles by traversing `convex/`, and the docs do not say whether an import from outside that folder is allowed, so the build plan starts with a spike and names the copy script as the fallback.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md` (root): flags never public, answers stored as option ids, no labels by ability or rank
- `public/dhiinterviews/js/engine/AGENTS.md`: scoring is pure, changing scoring changes saved results, the backend stores an engine version
- `convex/schema.ts`, `convex/checks.ts`, `convex/students.ts`, `convex/helpers.ts`: the existing tables and the `requireStudent` owner check
- Spec [0002](../0002-google-sign-in-and-saved-check/index.md): the check and answers tables, AC-13 and its note that this spec supplies the version
- Spec [0003](../0003-leads-and-feedback-saved/index.md) and [0004](../0004-sheet-copy-of-leads-and-feedback/index.md): leads and the Sheet copy never carry results or flags (0004 AC-11)
- Scope rows 6, 15, 22 and 23 in `docs/scope/scope.md`

**Practices & standards**:
- Transactions: a mutation commits all its writes or none, used to make "finished means it has a result" true
- Immutable records with a version stamp, so old data keeps its meaning when the rules change
- Strangler migration, switching pages one at a time
- India's Digital Personal Data Protection Act, 2023, on children's data and parental consent (cited by name only, the official text could not be opened to confirm)

**Links** (web verified only):
- [Convex mutations are transactions: https://docs.convex.dev/functions/mutation-functions](https://docs.convex.dev/functions/mutation-functions) (writes commit together, a thrown mutation saves nothing)
- [Convex limits: https://docs.convex.dev/production/state/limits](https://docs.convex.dev/production/state/limits) (1 MiB per document, nesting and field limits)
- [Convex data types: https://docs.convex.dev/database/types](https://docs.convex.dev/database/types) (value size, 16 levels of nesting)
- Not verified, so no link: the Digital Personal Data Protection Act, 2023, section 9 (the official pages returned an error), and Convex's rules on importing code from outside the `convex/` folder.
