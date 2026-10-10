# Review, feat/report-copy-and-privacy (re check, commit 8444866), 2026-10-10

**Reviewed by**: claude-opus-5-5 (author on claude-sonnet-5-5)
**Scope**: commit 8444866 only, spec 0011 files (about 70 of 84; prize helper and the other rows' changes left out), branch vs main
**Verdict**: Approve with nits

## Summary
This is a re check of the fixes for the first review (`docs/reviews/2026-10-10-feat-report-copy-and-privacy.md`), plus a fresh pass over the picture feature. All 14 earlier findings are fixed, and none of the fixes adds a real bug. The asked mode clean up now runs from the browser and cannot loop. The privacy page now says what is true. `/update-user` is off. A failed swap deletes its file. The clear branch drops the lease and resets `sourceUrl`. The browser and edge lifetimes add up to an hour. The limits are sharded, and the picture row keeps one status line. What is left is small: the asked mode clean up only reaches students who come back, and one Restore path still loses keyboard focus.

## Fix by fix

| # | Finding | Fixed? | Notes |
|---|---|---|---|
| 1 | Asked mode clean up unreachable | Yes | `pictureView` (`convex/avatarState.ts:78`) says `due: held` for a not agreed student. `ensure` drops the file and sets `checkedAt: 0`, and the next `me` says `due: false`, so there is no loop: at most one `ensure` per page load, and only while a file is held. It costs no rate limit token. Removed and blocked rows never hold a file (Remove and `adminBlock` delete it in the same step), so `held` is false for them and `ensure` returns at once. A fetch in flight is still refused by `apply` (it re-checks consent and frees the lease). The flag tells the student only something about themselves. The test at `convex/avatars.test.ts:736` now goes through `me`. Remaining gap: see Minor 1. |
| 2 | Privacy page claimed old ticks cover the picture | Yes | Section 5 now says the earlier words did not mention it and that this page is the notice. |
| 3 | `/update-user` lets a student set `image` | Yes | `disabledPaths: ["/update-user"]` matches Better Auth's router check (`node_modules/better-auth/dist/api/index.mjs:166`, normalized path). No other enabled route writes `image` from user input: email sign up is dev only, and social sign in takes the image from Google. The test is a source regex (nit). |
| 4 | Orphaned file when `apply` throws | Yes | `convex/avatars.ts:281` deletes `storedId` and rethrows. Test at `avatars.test.ts:441`. |
| 5 | Clear branch: week long wait and late landing | Yes | `NO_FILE` drops the lease, and `sourceUrl: ""` makes a returning address count as `changed` (no ETag and no `knownSha` are sent, which is correct). `immediateReason` with no address and no file is null, so this does not loop either. Tests at 405 and 421. |
| 6 | Remove visible up to two hours | Yes | The edge keeps 3000 s, and the browser is told 600 s on a hit, a miss and a 304. A revalidation 304 from an edge copy still ends within 50 + 10 minutes of the edge put. Tested in `tests/avatar-forwarder.test.js:41,80,82`. |
| 7 | One rate limiter document | Yes | `shards: 10` on both day limits. The component divides rate and capacity by the shard count and uses power of two choices (`node_modules/@convex-dev/rate-limiter/dist/component/internal.js:19-27`). The total stays 5000 and 4000. Near the cap, a call can be refused while other shards still have room, so the real daily cap is a little under 5000. A refused fetch just stays due, so this does no harm; see the nit. |
| 8 | Focus and status in the picture row | Mostly | There is now one persistent `role="status"` line. Restore updates its button in place. Background redraws are skipped while confirming or busy. Remove then Restore focuses the next control. The print copy never mounts the row (`report-student.js`, `!PRINT`), and `render-boot.js` stubs no picture control. One path still drops focus: see Minor 2. |
| 9 | Nits (consent comment, restore wait, lease first, unknown age, `=w-h` suffix) | Yes | All five are done. `restorePicture` returns at once on `scheduled: false`. The page then shows the "not yet" words with no Restore button, because `pictureRemoved` is now false and no picture is held. That matches the server: the picture is due, and the next page load asks again. |

## Minor

### 🟡 The asked mode clean up only reaches students who open DhiRise again, `convex/avatarState.ts:78`
**Problem**: The fix is lazy. A held file is dropped only when that student next loads a page and the bridge calls `ensure`. Students who finished the check and never come back keep their copied picture in storage for as long as the asked mode lasts. The clean up is also gated on the browser switch (`src/lib/session.ts:309`, `pictureEnabled()` reads `DHI_FUNNEL.profilePicture`). If a deploy sets that to false while the server is in the asked mode, the clean up never runs.
**Why it matters**: The asked mode exists for the case where a lawyer says the picture needs separate agreement. Most of the pictures copied without agreement are minors', and many of those students will not return. `byKey` already hides them (404), so nothing is exposed. They are still held, though, and the spec's promise is that they are deleted.
**Suggested fix**: Add a one off internal mutation for the team to run when they switch modes, such as `npx convex run avatars:dropUnagreed`. It should walk `avatars` in pages, check `isPictureAgreed`, and delete files, scheduling itself until it is done. Keep the lazy path as well. Note the step in the convex AGENTS.md gotchas next to `adminBlock`.

### 🟡 Restore that finds no picture leaves keyboard focus on nothing, `public/dhiinterviews/js/picture-control.js:130`
**Problem**: In `doRestore`, a successful Restore that has not landed a picture (`scheduled: false`, or the fetch is slower than 6 seconds) leads to `draw(true)` with kind `none`. That clears `actions`, removing the focused button, and there is no `first` to focus, so focus falls to the body. Separately, `btn.disabled = true` on the focused button can itself move focus in real browsers (Firefox blurs a focused control when it becomes disabled). The unit test at `tests/picture-control.test.js:171` passes only because its fake DOM keeps `activeElement`.
**Why it matters**: A keyboard or screen reader student loses their place, which is the same kind of problem as the earlier finding, on the path that is likely for students hit by a limit.
**Suggested fix**: Use `aria-disabled="true"` plus the `busy` guard instead of `disabled`. When the row ends with no buttons, move focus to the status line (give it `tabindex="-1"`) or to the row's heading.

## Nits
- ⚪ `convex/limits.ts:24`: with shards, the 1000 a day kept back for first fetches (5000 minus the 4000 recheck pool) is now only approximate. `startFetch` also takes the student's 10 minute token, and for a recheck the recheck pool token, before the day pool can refuse, so a refusal near the cap costs the student 10 minutes. This existed before; sharding only makes early refusals a little more likely. A comment that says so is enough.
- ⚪ `public/dhiinterviews/js/picture-control.js:83`: `draw` writes `msg.textContent = message` again after `say` has already set it. Rewriting identical text replaces the text node, and some screen readers announce it twice. `say` already owns that line, so drop the line in `draw`.
- ⚪ `public/dhiinterviews/js/picture-control.js:23`: the `notYet` words ("We could not find a picture to show") are also shown when a limit held the fetch back and the account does have a photo. Something like "Your picture is on its way. It will appear the next time you open DhiRise." would be true in both cases.
- ⚪ `tests/api-surface.test.js:60`: the `/update-user` check is a source regex. A convex-test `t.fetch("/api/auth/update-user", { method: "POST" })` that expects a 404 would also catch a Better Auth change in how paths are matched.
- ⚪ `src/lib/session.ts:379`: the new `scheduled: false` branch of `restorePicture` (no 6 second wait) has no bridge level test. The control test stubs `restorePicture`, so it does not exercise this branch.

## Strengths
- Each fix comes with a test that drives the real path: `me` then `ensure` for the asked mode clean up, an `apply` that throws for the orphan, a late `sync` after a lost photo, and the forwarder's lifetimes on hit, miss and 304.
- The `due: held` fix is small and self limiting. It turns false as soon as the work is done, so there is no loop, and it leaks nothing to anyone but the student.
- The server side is still strong: one safe fetch with a host allow list, no redirects, a size and time cap, and a type sniffed from the bytes. The lease token makes Remove, block and consent changes win races. `byKey` gives one 404 for every hidden case. The render payload and the team rows take the path only from `pictureFor`.
- The picture control's status line and confirm step are now built so that background updates cannot disturb a student who is deciding.

## Test coverage
Coverage of the fixes is good. Gaps are small: the Restore paths are not tested for real browser focus (the fake DOM keeps focus where real browsers may not), the bridge's `scheduled: false` branch has no test, there is no behavior test that `/update-user` answers 404, and nothing tests the sharded limits near the cap (acceptable, since that is library behavior).
