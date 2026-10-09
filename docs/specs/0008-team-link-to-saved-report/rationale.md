# 0008. Rationale: team link to the saved report

## Context

> ⚠️ Premise note: the privacy page published on 2026-10-09 says "Only you can open your report and download your PDF copy", and the consent text says nothing about the team reading reports. Team access makes that sentence untrue. This spec therefore includes the notice change (AC-11) as part of the feature, not as a later tidy up. The wording is the owner's to approve.

Spec 0006 saves one PDF copy of each student's report. Only the student can fetch it, through a route that finds the file from the signed in student. The team has no way to see it. Spec 0004 already reserved column N of the Leads tab for a "team only link" and left it empty, and scope row 23 asks for a private list plus that Sheet link.

The files are reports of students, many under 18, held for a company in India, so the Digital Personal Data Protection Act, 2023 applies. Any link that reaches a report must refuse everyone except named people, must be recorded, and must be disclosed to students. The team is small, has no company login system, and already uses Google accounts for the Sheet. The app already signs people in with Google through Better Auth, but its page guard treats every signed in person as a student and sends anyone without a profile to the landing page.

Two limits shape the build. Google's sign in screen is in test mode (100 users), and the daily clean up deletes sign in accounts with no student profile after 7 days idle. Neither blocks a small team.

## Options considered

### Option 1: Team gate on one email setting, bearer routes, Pages forwarders (chosen)

Team members sign in with Google. Every team route checks the verified email against a `TEAM_EMAILS` setting on every request, then lists, serves or logs. It reuses the route pattern of the student download.

**Pros**:
- Reuses everything already running: Google sign in, `getSignedInUser`, the Convex HTTP routes, the Pages forwarders.
- Named accounts exactly as the owner chose; adding or removing a person is one setting change, effective at once.
- Nothing to host and nothing new to operate.

**Cons**:
- The team list lives in a setting, with no history of who was added when.
- No roles: any team member can open any ready report (limited to 200 an hour).

### Option 2: A `teamMembers` table with a command to add and remove people

Same gate, but the allowed emails live in a table that an internal command edits.

**Pros**:
- A record of who was added and when; room for roles later.

**Cons**:
- More to build and test, and a chicken and egg first member.
- The owner only asked for named accounts; roles belong to row 14.

### Option 3: Secret links in the Sheet that anyone holding them can open

Each row gets a long random address that serves the PDF with no sign in.

**Pros**:
- Nothing to sign in to; the simplest for the team.

**Cons**:
- A link pasted into a chat or an email opens a minor's report for anyone. The Sheet is shared and copied around.
- Cannot record who opened it, and cannot be revoked per person.
- Fails the owner's "named Google accounts only" choice.

### Option 4: Open the file straight from the Convex dashboard

The team uses the Convex dashboard's storage view.

**Pros**:
- Nothing to build.

**Cons**:
- Gives dashboard access, which also shows every table and secret, to people who only need reports.
- No link in the Sheet, no list, no log.

## Rationale

Option 1 is the smallest design that meets all four forces: named people only (an email list), a click from the Sheet row (a link to a page that signs in), a record of access (an audit table that keeps the fingerprint of the exact file served), and a bound on damage if an account is misused (a fixed hourly limit). It adds no service and no new login. Option 3 fails the owner's own condition and the DPDP duty to protect minors' data; Option 4 over shares and gives no link. Option 2 is Option 1 with extra moving parts that the team does not need until row 14.

The audit table and the limit follow the rule that anything touching access control or a minor's data gets a log from day one, and that retrofitting one is painful. The notice change is in scope because the feature is what makes the existing privacy sentence untrue; shipping the access first and the words later would put the page and the app out of step.

The viewer shows the PDF inside the team page from a blob address, so the file never has a public address and the page can keep a Download button (with the proper file name) and a Sign out button. An early draft replaced the whole page with the blob address; the cross check found that loses the file name, breaks on reload and leaves no way to sign out, so it was dropped. Phones that cannot show a PDF inline download it instead, which is acceptable for a team tool.

## References

**Project sources**:
- `convex/reportHttp.ts` and `functions/api/files/[[path]].ts` (spec 0006): the route and forwarder pattern reused here.
- `convex/helpers.ts` (`getSignedInUser`): the identity check, with `emailVerified`.
- `convex/sheetRowsCore.ts`, spec 0004 (AC-7, AC-11): column N is reserved and the app writes only columns A to X.
- `convex/purge.ts` (spec 0002, AC-10): the 7 day clean up of accounts with no student.
- Scope rows 14, 15, 18, 20, 23, 25 and the privacy page `src/pages/dhiinterviews/privacy.astro`.

**Practices & standards**:
- Audit logs for any access to personal data of minors, added from the start.
- Least privilege with a rate limit on bulk reads of personal data.
- Fail closed: an unset allow list refuses everyone.
- India's Digital Personal Data Protection Act, 2023: tell the person what their data is used for.

## Cross check (2026-10-09, same model, read only)

A fresh reading of the first draft found nine gaps and seven soundness items, all applied: the dev sign in rule (the fake sign in leaves the email unverified), one definition of ready (a stored file, as the student download already uses), an audit row that pins the exact file, a true fixed hourly window, the audit row written only after the file is confirmed, the sign in return address that keeps the report code, the Sheet link plumbing and backfill, the rule that only erasure deletes audit rows, text only rendering of student names with a content security policy, the embedded viewer, console lines for refusals, dropping the unneeded `me` route, and two wording fixes. The one soundness point left as a known limit is that Google test mode caps sign in users at 100, shared by students and the team.
