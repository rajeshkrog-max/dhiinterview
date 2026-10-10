# Review, feat/report-copy-and-privacy, 2026-10-10

**Reviewed by**: claude-opus-5-5 (author on a different model)
**Scope**: 56 files (spec 0011 Google profile picture only), branch vs main
**Verdict**: Changes requested

## Summary
This change copies each student's Google picture into DhiRise storage, serves it from a random key at `/api/avatar/<key>` through a Pages forwarder, and draws it (or initials) on the student's screens, the report PDF copy, the team pages and, later, the leaderboard. The server side is careful and well tested: the host rule, no redirects, the 5 second limit, the size cap, the type check from the first bytes, the lease token, and Remove winning over a fetch in flight all hold up. Two things should be fixed before merge: the clean up that is meant to delete held pictures when the team switches to the asked mode can never run from a real browser, and the privacy page tells existing students that ticks they gave under v1 to v3 cover the picture, which those texts never mentioned. The rest are smaller points on edge cases, cache length, a Better Auth endpoint that lets a student set their own picture address, and focus handling.

## Major

### 🟠 The asked mode clean up of held pictures is unreachable from the browser, `convex/avatarState.ts:74`
**Problem**: `avatars.ensure` (`convex/avatars.ts:53` to `69`) deletes the stored file of a student who has not agreed, which is how a switch to `PICTURE_CONSENT_REQUIRED=true` is meant to clear pictures that were copied when nobody was asked (spec Follow up, item (1) of the cross check). But the browser calls `ensure` only when `me.pictureDue` is true or `pictureRecheckAt` has passed (`src/lib/session.ts:313`), and `pictureView` returns `due: false, recheckAt: null` for every student who has not agreed (`avatarState.ts:74` to `77`). So in the asked mode the bridge never calls `ensure` for exactly the students whose file should be dropped. There is no scheduled job either. The test `a later switch to the asked mode hides a held picture...` (`convex/avatars.test.ts:686`) calls `ensure` directly, so it passes while the real flow never does this.
**Why it matters**: The asked mode is the documented fallback if the lawyer says the picture needs a separate agreement. In that case every minor's picture already copied stays in Convex storage indefinitely without agreement. It is hidden (byKey answers 404), but it is still held personal data that the spec says is deleted.
**Suggested fix**: Either make `pictureView` say `due: true` for a not agreed student who still holds a file (and let `ensure` drop it), or add a one off internal mutation, run by the team when they flip the switch, that walks `avatars` in batches and deletes files of students who have not agreed. Change the test so it goes through `me` then the bridge rule (or a source scan of the bridge condition), not a direct `ensure` call.

### 🟠 The privacy page says the earlier ticks cover the picture, `src/pages/dhiinterviews/privacy.astro:57`
**Problem**: Section 5 says "There is no separate question about it. It is on for every student, and the ticks you gave when you began cover it." For every student who signed up under v1, v2 or v3, the text they ticked does not mention a picture at all (the test at `convex/consentText.test.ts` proves the frozen texts never contain the picture line). In the default mode this page is the only notice those students get (AC-15).
**Why it matters**: This is a statement about consent for minors' personal data that is not true for the existing students. It is the kind of line a parent or a regulator will read closely, and it weakens the position the owner decision relies on. The owner decision itself (on by default, nobody asked) is known and not reported here; this finding is only about the wording claiming a consent that was not given.
**Suggested fix**: Say what is true: new students' notice names the picture; students who joined earlier were not asked about it, and can remove it at any time with the Remove control. Add it to the legal question already open in the spec Follow up.

## Minor

### 🟡 A student can set their own picture address through Better Auth's update user route, `convex/auth.ts:22`
**Problem**: The Better Auth instance exposes `POST /api/auth/update-user` (checked in `node_modules/better-auth/dist/api/routes/update-user.mjs`, and `better-auth/minimal` uses the same router), which lets any signed in user set `image` to any string. `ensure` trusts `user.image` as "the Google picture". The host rule still limits the fetch to `lh[0-9].googleusercontent.com`, so there is no SSRF beyond Google, but a student can point it at any image hosted there (Blogger and Photos images are served from those hosts, as are other people's profile pictures), and can change the address every 10 minutes to force fresh fetches that count against the shared daily pool.
**Why it matters**: AC-10 and AC-11 say only the student's own Google picture is read. In practice the address is user controlled, which matters for moderation (another student's face) and for the shared `avatarDay` cap (a few dozen accounts could use it up).
**Suggested fix**: Disable `/update-user` (Better Auth `disabledPaths`) or have the forwarder in `functions/api/auth` refuse it, since the app never needs it. Add a test that the route is refused.

### 🟡 A Remove may stay visible for up to about two hours, not one, `functions/api/avatar/[[path]].ts:89`
**Problem**: The edge copy is stored with `cache-control: public, max-age=3600` and is returned as is on a hit (`toClient(hit, ...)`), so a browser that receives it 59 minutes into the edge hour may keep it for another full hour. Unless the Cache API adds an accurate `Age` header on a match (I am not sure it does), the total can approach two hours.
**Why it matters**: The confirm text and the privacy page promise "up to an hour" to students and parents.
**Suggested fix**: On a cache hit, rewrite `cache-control` to the remaining time (store the put time in a header and compute it), or give the browser a shorter max age (for example 600 seconds) than the edge keeps, so the sum stays within an hour.

### 🟡 A failed `apply` call leaves an orphaned picture in storage, `convex/avatars.ts:280`
**Problem**: In `sync`, if `ctx.runMutation(internal.avatars.apply, ...)` throws (an OCC retry limit, a deploy, a transient error), the blob stored a few lines earlier is never deleted and no row points at it.
**Why it matters**: A minor's picture stays in storage with nothing linking it to the student, so the erase of scope row 15 cannot find it.
**Suggested fix**: Wrap the `runMutation` in try/catch and delete `storedId` when it fails, then rethrow or return.

### 🟡 Every fetch contends on one rate limiter document, `convex/limits.ts:22`
**Problem**: `avatarDay` and `avatarRecheckDay` use one key, "all", with no shards. Every `ensure` that schedules a fetch writes the same document.
**Why it matters**: The spec expects a burst on launch day (every existing student triggers a first fetch at their next page load). Concurrent `ensure` calls will conflict and retry, and some may fail, which the bridge swallows, leaving the picture due until a later load.
**Suggested fix**: Give both limits `shards` (the rate limiter component supports it) sized for the expected burst.

### 🟡 Focus is lost when the picture row redraws, `public/dhiinterviews/js/picture-control.js:117`
**Problem**: `doRestore` calls `draw(false)` straight after the click, which empties the card and destroys the focused "Use my Google picture" button, so focus falls to the page body for the 6 seconds or more of the wait. The `onPicture` listener (line 128) also redraws with `draw(false)` while the confirm step may be open, which removes the focused "Keep my picture" button. The known issue (aria-busy lost because the row redraws) has the right cause, but its effect is wider than aria-busy: keyboard and screen reader users lose their place. Also, the status paragraph with `role="status"` is created with its text already inside, which many screen readers do not announce.
**Why it matters**: The confirm step and Remove are the student's only way out of the picture in the default mode; they should be usable without sight.
**Suggested fix**: Keep one persistent status element outside the redrawn part and set its text after it is in the page; during a Restore update the button in place (disabled, aria-busy) instead of redrawing; skip background redraws while `confirming` is true.

### 🟡 After the account loses and regains the same photo, the picture waits up to 7 days, `convex/avatars.ts:81`
**Problem**: The `clear` branch keeps `sourceUrl` at the old address and sets `checkedAt` to now. If the same address comes back, `immediateReason` sees no change and nothing is fetched until the weekly check.
**Why it matters**: A student sees initials for up to a week for no reason. Small, but it is a state the tests do not cover.
**Suggested fix**: In the `clear` branch set `sourceUrl` to "" (or `checkedAt` to 0) so a returning address counts as changed.

### 🟡 `clear` does not respect a fetch in flight, `convex/avatars.ts:79`
**Problem**: The `clear` branch deletes the file but leaves `leaseToken` in place, so a fetch started just before (for the old address) can land afterwards and store a picture for an account that now has none. It heals on the next `ensure`, but only when the browser next calls it.
**Suggested fix**: Clear `leaseUntil` and `leaseToken` in the `clear` patch, as Remove does with `NO_FILE`.

## Nits
- ⚪ `convex/consentText.ts:43`, the comment says students under v1 to v3 "are asked once, in a notice, before any picture is fetched or shown", which is only true in the asked mode now.
- ⚪ `src/lib/session.ts:377`, `restorePicture` waits the full 6 seconds even when `restore` answered `scheduled: false`; it could answer at once with the "not yet" words.
- ⚪ `convex/avatars.ts:113`, the per student token is taken before the lease check, so a second tab uses up the 10 minute token without a fetch. This matches the spec order, but a lease check first would cost nothing and read more naturally.
- ⚪ `public/dhiinterviews/js/picture-notice.js:33`, if `profile.age` is missing the guardian box is not drawn, yet the server can still answer `needs_guardian` and the message asks the student to "tick the box" that is not there. Asked mode only.
- ⚪ `convex/avatarCore.ts:40`, an address with a `=w..-h..` suffix gets `=s192-c` appended after it rather than replacing it; worth a test with a real Google address shape.

## Strengths
- `fetchPicture` is a model of a safe outbound fetch: the address is checked again inside the function, `redirect: "manual"` plus the `opaqueredirect` and `redirected` checks, a timeout that covers the body, a declared and a counted size limit, and the type taken from the bytes. `avatarCore.test.ts` covers each refusal, including the look alike host.
- The lease token and the re-check in `apply` make Remove, a team block and a consent change all win over a fetch in flight, and the tests drive each of those races through the real action.
- Nothing a browser can call takes an id or an address; the team functions are internal; `byKey` gives the same 404 for every hidden case; the HTTP route uses the key as its ETag so Google's ETag never leaves the server. The no leak test checks the serialized answers for the address, storage id, ETag and hash.
- The browser helper draws only `/api/avatar/` paths, writes names as text, and the team and leaderboard code never builds HTML from server strings.

## Test coverage
Coverage is broad and mostly meaningful: convex-test suites for every state, refusal and race in `avatars.ts`, pure tests for every rule in `avatarCore.ts`, the forwarder's headers, cache and failure paths, the circle, the control and the notice, and Playwright for the screens and the leaderboard contract. Gaps: the asked mode clean up test calls `ensure` directly and so hides the Major above; there is no test that `/api/auth/update-user` is refused; no test for the orphaned blob when `apply` fails; no test that a cache hit cannot extend the browser lifetime past an hour; no test for focus after Remove, Restore or a background redraw. The pinned `test.fails` for aria-busy is an honest way to record a known bug.
