# 0003. Rationale: leads and feedback saved in Convex

## Context

> ⚠️ Premise note: two choices in this feature go against the recommendation and are recorded as the engineer's decision. The full report stays locked until a mobile number is given, and the WhatsApp early access tick starts ticked. For a product whose students are mostly under 18, a number demanded in return for the result, and an opt in that is already ticked, are the kind of consent the Digital Personal Data Protection Act, 2023 treats as weak (consent should be free, specific and a clear action). The recommended alternative was a phone step with a Skip and an unticked box, which costs some leads but keeps the consent clean. The decision stands, with a legal check added to Follow-up and the tradeoffs named in Consequences. A second concern: the number is typed and never verified, so the team could add a person to a WhatsApp group who never agreed.

**Where things are today.** After the 18 questions, `done.html` asks for a +91 mobile number and a WhatsApp tick, and `report-student.html` asks for a star rating and a note. Both are sent from the browser as a plain post to a Google Apps Script address held in `js/funnel-config.js`. That address is empty in the repo, so in practice both are kept only in the browser (`dhirise.lead.v1`, `dhirise.reportFeedback.v1`). Nothing checks what arrives, nothing limits floods, and a cleared browser loses everything. The post also carries a large snapshot (style, area scores, indices, flags, challenge status) that the browser computed.

**What has changed since.** Spec 0001 moved the app to Convex with every write needing a signed in student, and spec 0002 built the student, consent, check and answers behind it. Scope row 5 asks for leads and feedback to be stored for real, with checks and abuse limits. Scope row 7 (sheet copy) then needs a database to copy from, and scope row 10 (referrals) needs a trustworthy `genuine` flag for feedback.

**Forces.** Students include many minors, so a phone number and a free text note are personal data of children. Siblings and friends often share one parent's phone. Phone and feedback are not part of the landing consent. The team adds early access students to a WhatsApp group by hand from a list. The scoring, flags and challenge data already have their own rows (6, 10, 11), so copying them into a lead would duplicate and go stale. Without a decision, the browser keeps posting unchecked data to a public address or keeps nothing.

## Options considered

### Option 1: Save leads and feedback in Convex first, with the Sheet as a later copy

Two tables hold what the student gave, behind the signed in student, with server checks, a consent record, and per student rate limits. The sheet copy (row 7) is built after, reading from these tables.

**Pros**:
- One source of truth that survives a cleared browser, with the consent text kept as evidence.
- Server side checks and limits replace an open address anyone can post to.
- Matches spec 0001 and the order of the scope (row 5 before row 7).
- The `genuine` flag the referral rules need is decided in one place.

**Cons**:
- More to build now than switching the endpoint on.
- Until row 7 ships, the team has no Sheet, only the Convex dashboard.
- A new dependency for rate limiting.

### Option 2: Keep the browser post to the Sheet and add checks in the Apps Script

Fill in `leadEndpoint` and `feedbackEndpoint`, and have the script validate, dedupe and rate limit.

**Pros**:
- Fastest: set two values at deploy time.
- No backend work, and the team already has `tools/lead-sheet.gs`.

**Cons**:
- The address is public in the page, so anyone can post to it, and the script has no student identity to tie a post to.
- No consent evidence, no per student limit, no way to enforce one lead per student, and phone and feedback sit outside the database that referrals depend on.
- Erasure has to reach a Sheet that is the only copy.

### Option 3: Browser to a Convex web address, which forwards to the Sheet straight away

Save in Convex and in the same step send the row to the Sheet from the server.

**Pros**:
- The team sees rows in the Sheet immediately, with server checks first.

**Cons**:
- It builds row 7 (retries, a visible failure count, a refill) in a hurry inside this feature, and a Sheet outage would either lose the row or block the student.
- Mixes two decisions: what is stored, and how the copy is kept in step.

## Rationale

Option 1 follows the forces directly. The database already knows who the student is and which check is finished, so a lead is a few facts hung off that, and the server can refuse a bad number, a missing guardian tick or a flood without trusting the browser. Option 2 would leave the most sensitive new field (a minor's phone number) behind a public address, with no consent record, which the compliance scope in Context rules out. Option 3 is Option 1 plus a half built row 7; splitting them keeps each decision small, and the Sheet failing can never lose a lead.

The lead holds only the new facts: the number, the WhatsApp choice, and the consent it came with. Name, age and class are on the student, results will be on the saved result (row 6), and challenge status is on rows 10 and 11. The sheet row is assembled from those later, so a change in scoring cannot leave a stale snapshot in a lead.

Two details come from real behaviour of the platform and the product. First, a Convex function that throws rolls back everything it wrote, including the rate limiter's count, so returning a result object for expected refusals is what makes a refused attempt count against the limit. Second, siblings share phones, so the same number on two students is allowed and flagged rather than blocked, which changes a line in spec 0001 that said a phone is unique when present.

The engineer chose a required phone and a pre ticked tick against the recommendation. The spec builds exactly that, and records the risk (Consequences, Follow-up) and the one line change that would switch to the recommended behaviour, so the decision can be revisited after the legal check without a redesign.

## Decisions that were asked and how they were answered

| Question | Choice | Recommended? |
|---|---|---|
| Resubmitting the phone step | First one kept | Yes |
| Same number on two students | Allowed, flagged | Yes |
| How the phone and WhatsApp agreement is recorded | New consent row, guardian tick again under 18 | Yes |
| Feedback after it is saved | One per check, first kept | Yes |
| What the lead stores | Only the new facts | Yes |
| When the phone step cannot reach the server | Stay on the step with a retry | Yes |
| Abuse limits | Convex rate limiter component | Yes |
| WhatsApp status on the lead | A simple status now | No (recommended: later with the admin view) |
| Phone required for the report | Required for everyone | No (recommended: optional with a skip) |
| WhatsApp tick starting state | Starts ticked | No (recommended: unticked) |
| How the status is changed before row 14 | By hand in the Convex dashboard | Yes |
| Agent Skills | Find them; the one hit could not be installed | n/a |
| References | None | Yes |

## Evidence: what the Agent Skill search found

Searched the skills registry for the rate limiter and the stack on 2026-10-08. Official `get-convex/agent-skills` packages are already installed (including `convex-suggest`). The one extra hit was `imfa-solutions/skills@convex-rate-limiter` (17 installs, third party). Installing it failed because the repository could not be found, so nothing was installed. The Convex MCP server is already connected.
