# Verify: team link to the saved report · spec 0008 · updated 2026-10-09
_Steps derived from spec 0008 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Before you start: set `TEAM_EMAILS` on the deployment you are checking (`pnpm exec convex env set TEAM_EMAILS "you@gmail.com"`), and make sure the account is a Google sign in test user. On dev the setting already holds `team.e2e@example.com`, the fake account the browser tests use. Dev has no Browser Run and no Sheet, so a ready copy there is made by hand, and the Sheet steps run on production only (or a preview with its own Sheet).

## UI / manual
- [ ] Signed out, open `/dhiinterviews/team.html` → a "Sign in with Google" button, no list, no names                          → AC-4
- [ ] Signed out, open a Sheet link `/dhiinterviews/team-report.html?s=<code>`, sign in with a team Google account → you land on the same report and the PDF shows inside the page   → AC-3, AC-4
- [ ] Sign in with a Google account that is not on the list (a student's) → a plain refusal, a Sign out button, no student name anywhere; then Sign out and use a team account    → AC-4
- [ ] On the Google screen, cancel or refuse → the page shows "Google did not let you in" with the sign in button still there (`?signin=error`)   → AC-4
- [ ] Team member opens the list → newest copy first; each row shows name, class, date and an Open link; no phone, email, score or flag     → AC-1
- [ ] Value source: change the computer's time zone (for example to Los Angeles), reload the list → the same India time is shown for each copy     → AC-1
- [ ] With more than 50 ready copies, the list shows 50 and a Load more button; Load more adds the rest and the button goes away     → AC-1
- [ ] Paste a reference code from column A of the Sheet, with spaces before and after → exactly that student; an empty box, a made up code and a code from another table all say "No saved report found" (no error page)    → AC-2
- [ ] Click Open on a row → a new tab opens the report; the PDF shows inside the page; Download saves `DhiRise-report-<first name>.pdf`      → AC-3
- [ ] Open the saved file and the stored one: the bytes match (same `sha256` as in `reportViews`)     → AC-3, AC-5
- [ ] On a phone at 390px wide (and a real phone that cannot show a PDF inline) → no sideways scroll; if the PDF does not show, Download works    → AC-3 (follow up in the spec)
- [ ] A student named `<img src=x onerror=alert(1)>` with a ready copy → shown as text on the list, no alert, no image    → AC-10
- [ ] A student with no stored copy: their Sheet link or `?s=` address says "This report copy is not ready."; an empty, odd or unknown `s` says the same     → AC-7
- [ ] Remove your email from `TEAM_EMAILS`, then reload the open list without signing out → refused straight away     → AC-9
- [ ] Production: a team Google account whose email Google has not verified is refused; on dev the fake test sign in works      → AC-4
- [ ] Open reports until you reach 200 in an hour (a script is fine) → the 201st says when to try again, in India time; a reload of the viewer counts as an open; a second team member is not affected     → AC-6
- [ ] Using the list and the code box many times does not use up the 200       → AC-6
- [ ] Sheet: a student who has a Leads row and a ready copy has the link in column N, written as plain text starting with `https://`, and it is clickable   → AC-8
- [ ] Sheet: before the copy is ready column N is empty; about a minute after the copy first becomes ready it fills in; the Feedback tab has no link; a student with no phone step has no row   → AC-8
- [ ] Sheet: run `pnpm exec convex run sheetAdmin:refill` once after deploy → copies that were ready before this shipped get their link, rows are updated in place     → AC-8
- [ ] Landing page, open the notice before signing in → seven lines, the new team line is the fifth, the agree line is last; a new student's consent row says `v3`     → AC-11
- [ ] A student who agreed under v1 or v2 signs in → they are not asked again     → AC-11
- [ ] Privacy page, section 4 → says named members of the DhiRise team can open your report and each open is recorded     → AC-11

## Commands
- [ ] `pnpm exec tsc --noEmit` → no errors
- [ ] `pnpm test` → all suites pass, including `convex/team.test.ts`, `convex/teamSheet.test.ts` and `convex/consentText.test.ts` (v1 and v2 fingerprints pinned)      → AC-1 to AC-11
- [ ] `pnpm test:e2e e2e/team.spec.ts` → passes on the dev deployment                                    → AC-1 to AC-4, AC-6, AC-7, AC-10
- [ ] `pnpm exec convex data reportViews` after one open → one new row with the student id, the file id, the file's `sha256` and `reportVersion`, your lowercase email and the time; a refused, not found or rate limited open adds none     → AC-5
- [ ] `curl -I https://<site>/dhiinterviews/team-report` and `.../team-report.html`, and the same for `team` → each answers `noindex`, `private, no-store` and a `content-security-policy` that allows only this site's scripts and a `blob:` frame     → AC-9, AC-10
- [ ] `curl -s -i https://<site>/api/team/list` with no token → 401 `{"code":"not_signed_in"}` and `cache-control: private, no-store`    → AC-4, AC-9
- [ ] Search the Convex logs for `team:` → refusals show a reason, the team email only for a team member, and never a student name, phone or email     → AC-5, AC-10
- [ ] `pnpm exec convex env get TEAM_EMAILS` on each deployment → the list you expect (production holds the real team, never the fake test address)     → AC-4

## Acceptance-criteria coverage
- AC-1 … list steps (order, 50 and Load more, India time, no private fields), `team.test.ts`, `e2e/team.spec.ts` · AC-2 … code box steps, `team.test.ts`, `e2e/team.spec.ts` · AC-3 … Open, viewer, Download and byte match steps, `team.test.ts`, `e2e/team.spec.ts`
- AC-4 … signed out, refused account, `?signin=error`, verified email steps, `team.test.ts`, `e2e/team.spec.ts` · AC-5 … `reportViews` row steps, `team.test.ts` (source scan) · AC-6 … 200 an hour steps, `team.test.ts`, `e2e/team.spec.ts`
- AC-7 … not ready steps, `team.test.ts`, `e2e/team.spec.ts` · AC-8 … four Sheet steps, `teamSheet.test.ts` (the live clickable check is still owed, dev has no Sheet) · AC-9 … removed email and header steps, `team.test.ts`
- AC-10 … HTML name, headers and log steps, `team.test.ts`, `e2e/team.spec.ts` · AC-11 … notice, privacy page and v3 steps, `consentText.test.ts`, `tests/privacy-page.test.js`
