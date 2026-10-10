# 0011. Rationale: Google profile picture across the screens

## Context

> ⚠️ Premise note (updated 2026-10-10): the engineer then decided that the picture is on by default and that nobody is asked, so there is no consent step for the picture at all, only the v4 text that informs. The Data Protection Act, 2023 point below becomes stronger: with no agreement, the picture of a child is processed on the basis of the sign in alone. This spec builds what was decided and keeps the asked flow behind `PICTURE_CONSENT_REQUIRED=true` so it can be restored without a rebuild. The Remove control and a production hold (`PROFILE_PICTURE_ENABLED=false`) are the two things standing between this and a real student before the lawyer check. The engineer may override this note; it is raised so that it is a conscious choice.

> Earlier premise note: the engineer chose to show each student's picture wherever the student appears, to other students and on public links, instead of an opt in switch (the recommended option). The picture is a face, often of a child, chosen by the student with no check from DhiRise. India's Digital Personal Data Protection Act, 2023 expects verifiable parental consent before a child's personal data is processed, and a profile photo shown to strangers is among the most sensitive uses. This spec builds what was chosen, and adds a consent text that names the picture, a remove control, a team removal function, a short cache life and a deploy switch, and it records a lawyer check and a moderation question as follow ups that should be settled before launch on 30 October. The Founding Card image and the shared story picture were deliberately left out, which keeps the picture off the thing that is posted most widely.

DhiRise signs students in with Google only. Better Auth already saves the Google profile picture address as the user record's `image` when an account is created, but nothing in DhiRise reads it. Today the student appears only as a first name in text; there is no avatar anywhere. The leaderboard runs on demo rows until scope row 12, and the public report link is designed in spec 0010.

Google serves the picture from its own address (`lh3.googleusercontent.com`). A page that loads it from there tells Google, on every view, which student address opened the screen, and the address can change or stop working. Many of the pages are protected by strict content security policies (the team pages allow only the site's own images) and the project rule is to keep student related requests away from outside services (spec 0009 hosts fonts for the same reason).

The app asks Google for no offline access and holds no standing Google token, so it cannot ask Google later for a student's new photo. It learns the new picture address only when the student signs in with Google again. Better Auth rewrites the user record's `image` at sign in only when `overrideUserInfoOnSignIn` is on, which it is not today.

## Options considered

### Option A: Load Google's picture address directly in each page

Keep the address Better Auth stores and put it in an `<img>`.

**Pros**:
- Almost no code and nothing stored.
- Always as fresh as Google's copy.

**Cons**:
- Every screen view tells Google a student's address and the page they are on.
- The address can change or fail, leaving broken images.
- The strict policies of the team and public pages would have to allow Google's host.
- The address is shown to anyone who can see the page source, and cannot be revoked.

### Option B: Copy the picture into DhiRise storage and serve it by a random key

A server action fetches the picture once at a small size, checks it, stores it, and every screen loads `/api/avatar/<key>` from our own address. Refresh at sign in and by a weekly quiet check.

**Pros**:
- Google learns nothing per view; the strict policies need no change.
- A key can be revoked: a removal or an erase deletes the file and the key answers 404.
- Small, bounded cost: one fetch per student, then a re-check at most weekly.

**Cons**:
- A minor's image is now stored by DhiRise, so it must be erased on request and counted in the privacy page.
- The fetch is the one server request to an outside address, which needs strict guarding.
- Refresh is limited to sign in and the weekly re-check.

### Option C: Pass the picture through our server on every request

The route fetches from Google each time, with a cache.

**Pros**:
- Nothing stored; always current.

**Cons**:
- Every view calls Google from our server and fails if Google is slow or blocks us.
- Needs a cache anyway, which is a stored copy in disguise.

### Option D: Opt in picture only, with a switch for everyone

Nothing is fetched until the student turns the picture on.

**Pros**:
- Strongest for children: nothing is stored without a clear choice.

**Cons**:
- Few students would turn it on, so most screens would show initials; this was offered as a consent choice and not picked.

## Update, 2026-10-10: on by default, nobody asked

Options weighed for the consent step, after the first build showed the cost of asking:
- **Ask first (the original design).** Strongest for children. Cost found in testing: an existing student sees only initials until a notice is answered, so the feature looked broken on the owner's own account, and every extra step lowers how many students ever get a picture.
- **On by default, nobody asked, as a setting (chosen).** The picture just appears, which is what the owner wants for the product. The asked flow is kept intact behind `PICTURE_CONSENT_REQUIRED=true`, so a lawyer's answer or a complaint can switch it back without new code. Cons: no consent trail for the picture, and the legal and moderation risks above.
- **On by default with no way back (delete the asked flow).** Smaller code, but removing it would make a later return to asking a rebuild. Not chosen.

The default for a missing setting is now on (`PROFILE_PICTURE_ENABLED` is off only when it is exactly `false`). This is the opposite of the first design, where a missing setting meant off, and it means a production deploy turns the feature on unless the setting is set first. That is recorded as a launch blocker in the spec.

## Rationale

Option B is the only choice that answers the privacy force in Context and the content policy force together. The cost of reading and storing a picture is small, and what it buys is that no screen talks to Google, a policy that already guards the team and public pages keeps working, and a removal is real (the file is deleted and the key stops working). Option A looks cheaper but fails the rule about outside requests on every view. Option C keeps the same weaknesses as A on the server side.

The refresh design follows from a limit that is easy to miss. Because the app holds no Google token, a weekly timer could only re-read the same address. So the real refresh happens at sign in (turning on `overrideUserInfoOnSignIn`, checked in the installed Better Auth source to rewrite the user record's name and image), and the weekly check, run only when the student opens the app, covers the case where Google keeps an address but changes its content. It runs only for students who are active, costs at most one conditional request each, and is capped per student and per day, which is what "mindfully, not an always running job" asks for.

The recommended rule for who can see the picture was opt in for others. The engineer chose to always show it. The spec keeps the choice and surrounds it with the controls a parent can understand: consent text that names the picture and says where it shows, a remove control, a team removal function, a one hour cache, no picture on the shared card image, and a switch to keep the feature off in production until the lawyer check is done.

The consent is a new landing text (v4), as chosen, rather than a separate picture notice. That keeps one consent trail for the profile data, and existing students agree once with the same under 18 tick as at the start. The cost is that the whole v4 text is shown to existing students, not only the new line; the notice should present the new line first.

## References

**Project sources**:
- `AGENTS.md` (sensitive data rules, parent consent under 18, no outside requests with student data, no secrets in front end code)
- Spec [0002](../0002-google-sign-in-and-saved-check/index.md) (Google sign in, the landing consent, the guardian tick)
- Spec [0006](../0006-report-copy-saved-when-seen/index.md) (the render payload and render page the PDF copy uses)
- Spec [0008](../0008-team-link-to-saved-report/index.md) (the team pages and their strict policy)
- Spec [0009](../0009-site-frame-root-and-404/index.md) (hosting fonts ourselves, the same reason)
- Spec [0010](../0010-share-report-public-link/index.md) (the public shared report that now shows the picture)
- `convex/auth.ts` (the Google provider options) and `convex/consentText.ts` (the frozen consent versions)
- The installed Better Auth source, `oauth2/link-account.mjs`, where `overrideUserInfoOnSignIn` rewrites the user record's name and image

**Practices & standards**:
- Data minimisation: keep only the picture, at a small size, nothing else from the Google profile
- Server side request forgery protection: allow one host family, no redirects, a time limit, a size limit and a content check
- Consent for a child's data, with a way to withdraw it

**Links** (web verified only):
- Better Auth, social provider options (`overrideUserInfoOnSignIn` is described only as overriding "user information", the per field behaviour was confirmed in the installed source): https://www.better-auth.com/docs/concepts/oauth
- Convex, serving files (a stored file's address works until the file is deleted; an HTTP action can read a file and return it): https://docs.convex.dev/file-storage/serve-files
- Google, image sizing parameters (`s`, `w`, `h`, `c`; no official page confirms the `lh3` host or `=s96-c` for profile photos): https://developers.google.com/people/image-sizing
- MDN, Referrer-Policy header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy
