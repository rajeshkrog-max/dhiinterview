# Verify: live challenge · spec 0015 · updated 2026-10-11
_Steps derived from the acceptance criteria of specs 0015, 0016, 0017, 0018 and 0019. `/check verify` runs these; `/test` locks the durable ones. Milestones 1 and 2 (rows 10 and 11) come first, milestones 3 and 4 (rows 12 and 13) are appended at the end._

## UI / manual (dev site, `CHALLENGE_LIVE=true` on dev; two Google accounts, A and B, both new)
- [ ] A signs in, fills the form, finishes the 18 questions, leaves a number, opens `challenge.html`, ticks "I agree to the rules", taps "Scratch to join" → a code shows, three letters from A's first name then four characters → 0017 AC-1, 0016 AC-1
- [ ] A reloads `challenge.html` → the same code shows, no second join → 0017 AC-1
- [ ] A copies the link (`.../landing.html?ref=CODE`) and opens it in a private window → the code is in the referral box on the form → 0016 AC-3
- [ ] B signs in with Google in that window and sends the form → B lands on the first question; nothing is said about the code being wrong → 0016 AC-3
- [ ] B finishes all 18, leaves a number, opens the report, leaves a note of 30+ real characters → thank you shows
- [ ] A reloads `leaderboard.html` before 5 minutes pass → "0 valid · 1 pending", no name or email of B anywhere → 0016 AC-8, 0015 AC-2
- [ ] Within 5 minutes (or after `npx convex run challengeBoard:run '{}'`) A reloads → "1 valid · 0 pending" → 0016 AC-5, AC-7
- [ ] C (new account, under 18) opens `challenge.html` → the parent tick shows; without it the button stays off; with it the join works → 0017 AC-2
- [ ] C makes a code with a wrong shape in the referral box (`ZZZZZZZ`) and signs in → sign in is not blocked → 0016 AC-3
- [ ] Value sourcing: a student named in Devanagari joins → the code starts `DHI`; a one letter name → padded with `X` → 0016 AC-1
- [ ] Value sourcing: an existing student (with a profile) opens a friend's `?ref=` link and signs in again → the friend's pending count does not change → 0016 AC-4
- [ ] Value sourcing: B leaves a note made of one repeated character, not a real one → after the job A's count stays pending → 0016 AC-5, AC-9
- [ ] With `CHALLENGE_LIVE` unset on dev, `challenge.html` says "The challenge has not opened yet" and no entry is made → 0015 AC-3

## UI / manual, milestone 2 (dev site, two accounts)
- [ ] A's join form shows the four lines of words, the rules tick, a "Show me as Anonymous <style> on the leaderboard" tick, and for an under 18 account the parent tick → 0017 AC-2, AC-5
- [ ] A joins with the hide tick on; a private window with A's link and a new Google account shows "Invited by a friend. An invite counts when you are new to DhiRise." under the referral box → 0016 AC-2, AC-4, AC-10
- [ ] A turns the hide switch off on `challenge.html` → "Saved. Your first name will show."; reload the other window, tab out of the box → "Invited by Ananya" → 0017 AC-5
- [ ] A taps Leave once → the button asks to tap again; a second tap → the join form shows again, and the old link now shows no "Invited by" → 0017 AC-6
- [ ] A joins again → a new code; the old valid count (if any) is back → 0017 AC-6
- [ ] A friend whose first note was a weak one (only possible by a direct call) gets a genuine one saved before the deadline → the referral becomes valid after the job and the Sheet row has the new note → 0016 AC-9
- [ ] Value sourcing: type a lower case code, a code with a space, and `ZZZZZZZ` in the referral box → the first two work, the last says "Code not found. You can still continue." → 0016 AC-2
- [ ] Value sourcing: 40 quick code checks from one browser → later ones show no message at all (429 is treated as unchecked), another browser still works → 0016 AC-2

## Commands
- [ ] `pnpm exec vitest run --project convex convex/challenge.test.ts convex/challengeCore.test.ts convex/feedback.test.ts` → 100 tests pass → 0015 AC-1, 3, 4; 0016 AC-1 to 10; 0017 AC-1 to 9; scenarios 1 to 9 and 11
- [ ] `pnpm exec vitest run --project pages tests/referral-forwarder.test.js tests/api.test.js` → pass → 0016 AC-2
- [ ] `pnpm test` → all 808 pass, including `tests/challenge-rules.test.js` (deadline and code pattern equal on server and browser) → 0015 AC-4. The first test of a Convex file can time out on a cold start; a rerun passes.
- [ ] `pnpm exec tsc --noEmit` → no output
- [ ] `pnpm exec playwright test e2e/challenge.spec.ts` (dev, switch on) → 4 specs pass → 0016 AC-2, AC-3, AC-5, AC-7; 0017 AC-1, AC-2, AC-5, AC-6
- [ ] `pnpm exec convex env get CHALLENGE_LIVE --prod` → empty (production switch stays off) → 0015 AC-3
- [ ] Search the repo for `recordReferralUse`, `markReportComplete`, `dhirise.challenge.mock.v1` → no match in `public/` or `src/` → 0015 AC-7

## Acceptance-criteria coverage (milestones 1 and 2)
- 0015 AC-1 server enforces · AC-2 nothing public · AC-3 switch · AC-4 deadline · AC-7 no localStorage mock for the live parts: covered above
- 0015 AC-5: scenarios 1 to 9 and 11 are tests; 10 and 12 come with the leaderboard (M3). AC-6: leave is done; the erase part waits for spec 0014
- 0016 AC-1 to AC-10: covered
- 0017 AC-1 to AC-9: covered

## UI / manual, milestone 3: the live leaderboard (dev site, `CHALLENGE_LIVE=true`; accounts A, B and C, all new, C under 18)
- [ ] Before anyone has a valid friend, `leaderboard.html` for A shows "No one is on the board yet. The first friend to finish counts." (when the dev board is empty), no demo names (Aarav S., Ananya R. ...), and the card reads "–" with "Your first valid friend puts you on the board." → 0018 AC-8
- [ ] A has two friends finish all steps, B has one, then `pnpm exec convex run challengeBoard:run '{}'` → A's row is marked "(you)" and the card's place is the row's place; B is below A; the footer reads "Updated <time> · Every 5 minutes ·" → 0018 AC-1, AC-7, AC-8
- [ ] B joined with "Show me as Anonymous <style>": B's row says "Anonymous Builder" (or Achiever or Explorer) and shows no class; the card for B says "N more to pass #M" where M is the place above → 0018 AC-2, AC-7
- [ ] B turns the hide switch off on `challenge.html`, reloads `leaderboard.html` at once (no job run) → the name and class show; hide on again → "Anonymous" at once → 0017 AC-5
- [ ] A taps Leave on `challenge.html`, B reloads `leaderboard.html` at once → A's row is gone and B moved up; no job run needed → 0018 AC-3, AC-5
- [ ] Value sourcing: two students with the same count; the one whose last friend finished earlier is higher → 0018 AC-1
- [ ] Value sourcing: a student named in Devanagari (प्रिया शर्मा) shows as "प्रिया श."; a one word name shows alone → 0018 AC-2
- [ ] Value sourcing: nothing on the page, in its network answer (`DhiSession.challenge.leaderboard()` in the console) or in the page source holds an email, phone number, age, flag, student id or last name; each row has only rank, displayName, cls, style, valid (and avatar only with `LEADERBOARD_PICTURES_ENABLED` on) → 0018 AC-2, AC-9; scenario 12
- [ ] A signed out window opening `leaderboard.html` is sent to the landing page; `DhiSession.challenge.leaderboard()` on the landing page returns `null` → 0018 AC-6
- [ ] With the server clock past the deadline (cannot be done on a deployed server; see the convex-test step below) the page shows "Challenge ended · Winner will be announced soon", "Ended" in the top chip, "Final board" in the footer, and the card says "The challenge has ended." → 0018 AC-4, AC-8

## UI / manual, milestone 4: the winner review (dev only, in a terminal you own; never in an AI session on real data)
- [ ] `pnpm exec convex run challengeAdmin:top10` → up to 10 referrers in board order; each referral shows status, the four times, the note, the friend's email and warnings (a test friend who answered 18 questions in a second shows `fast_finish`) → 0019 AC-1
- [ ] `node tools/winner-csv.mjs review-test.csv` → "Wrote review-test.csv (N rows, dev)"; the file opens in a spreadsheet with one line per referral and the agreed columns; running it again refuses ("already exists"); delete the file afterwards → 0019 AC-2
- [ ] `pnpm exec convex run challengeAdmin:reject '{"referralId":"<id from top10>","reason":"check","note":"dev test"}'` (PowerShell: escape each inner double quote as `\"`) → `ok: true, status: rejected` and the referrer's new count; `challengeAdmin:ranking` shows one less; the public board is unchanged until the next job run (before the deadline) → 0019 AC-3, AC-4
- [ ] The same `reject` again → `bad_state`; an unknown email → `no_match`; a blank reason → `no_reason`; both an id and an email → `give_one`; none of these changes a row → 0019 AC-3, AC-7
- [ ] `challengeAdmin:restore` with the same id → `ok: true, status: valid` and the count is back; the referral's `reviewNote` holds both the reject words and the restore words in `top10` → 0019 AC-3, AC-5
- [ ] `tools/WINNER-REVIEW.md` read start to finish by the person who will run it: the steps are clear, the PowerShell quoting works on their machine → 0019 AC-6


## Commands, milestones 3 and 4
- [ ] `pnpm exec vitest run --project convex convex/challengeBoard.test.ts convex/challengeAdmin.test.ts` → 62 tests pass → 0018 AC-1 to AC-10; 0019 AC-1 to AC-5, AC-7; scenarios 10 and 12
- [ ] `pnpm exec vitest run --project convex -t "covers scenario"` → 12 tests pass, one for each scenario of BACKEND.md section 15 → 0015 AC-5
- [ ] `pnpm exec vitest run --project pages tests/api.test.js tests/avatar-places.test.js tests/winner-review.test.js` → pass → 0018 AC-6 to AC-9; 0019 AC-2, AC-6
- [ ] `pnpm test` → all 888 pass (808 before this milestone) → everything above
- [ ] `pnpm exec tsc --noEmit` → no output
- [ ] `pnpm exec playwright test e2e/leaderboard.spec.ts` (dev, switch on) → 1 spec passes: two referrers with real friends, the job, the board and the "you" cards, a hidden name shown and hidden again at once, nothing private, then `top10`, the CSV, a reject and a restore from the terminal → 0018 AC-1 to AC-8; 0019 AC-1 to AC-5
- [ ] `pnpm exec playwright test e2e/picture.spec.ts -g "leaderboard rows"` → pass (rows of the live shape, with and without a picture path) → 0018 AC-9
- [ ] The moved clock (a deployed server cannot have one), in `convex/challengeBoard.test.ts` under "the freeze at the deadline": the first run after 23:59 freezes the board; later runs and new referrals change nothing; a step at 23:58:50 counts even when the run is days late; a run that began before the deadline is not the final one; a leave after the freeze closes the ranks up and a reject in review does not change the public board → 0018 AC-4, AC-5
- [ ] `pnpm exec convex env get CHALLENGE_LIVE --prod` → empty (production stays off); `grep -rn "challengeAdmin" src public convex/http.ts` → no match (no browser can reach a review command) → 0015 AC-1, AC-3

## Acceptance-criteria coverage (milestones 3 and 4)
- 0018 AC-1 order and tie rule · AC-2 the row · AC-3 the job and its snapshot · AC-4 freeze · AC-5 leave or erase after the freeze (erase itself waits for spec 0014, which must call `dropEntry`) · AC-6 signed in only · AC-7 own rank on `me` · AC-8 the page · AC-9 pictures behind the switch (unit and synthetic rows; a real picture on a real board is owed) · AC-10 tests: covered above
- 0019 AC-1 to AC-7: covered above. AC-3 differs from the spec in one way: `restore` settles the referral itself at once instead of waiting for "the next job run", because the job does nothing after the freeze
- Owed, not done here: real Google accounts on the board; the words "Your first valid friend puts you on the board.", "No one is on the board yet. The first friend to finish counts." and "Challenge ended · Winner will be announced soon" were approved by the owner in chat on 2026-10-11 ("i approve")

