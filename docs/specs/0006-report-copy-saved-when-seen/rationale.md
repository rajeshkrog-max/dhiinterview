# 0006 rationale: report copy saved when seen, with Download

## Context

Scope row 22 asks for a frozen copy of the report, saved once when a student sees it, looking as they saw it, plus a Download button that gives the same report as a PDF. Saving must never slow or block the report. Spec 0002 (AC-13) had already sketched a PDF made in the student's browser with `html2pdf.js` and uploaded to Convex file storage, and spec 0001 said the same.

Four forces shaped the decision. The report is drawn in the browser by `report-student.js` from the saved result, so there is no server side HTML to print. The report page shows passages that come from the sensitive flags (self doubt, low mood), and the project rule is that flags are never public. Many students use cheap phones, and a picture of a long page made on such a phone is slow and large. And row 23 will let the team open the copy and link it from the Sheet, so the file must be something we can trust.

An earlier draft kept the browser made PDF and accepted that a student could upload any PDF as their "report". The engineer's steer was to generate the PDF from the HTML we show the student, not to take a file from the student. That removed the weakest point and led to this design.

## Options considered

### Where the PDF is drawn

**Option 1: In the student's browser, uploaded (spec 0002's design).** `html2pdf.js` photographs the page and the phone uploads the file.
- Pros: no new service, no cost, already vendored.
- Cons: the server can only check "is it a PDF", so a student can upload anything; the file is a picture (1 to 3 MB, text not selectable); slow and memory hungry on cheap phones; the copy exists only if that phone succeeds.

**Option 2: A saved HTML page, PDF made on tap.** Store the finished page as HTML.
- Pros: small, crisp, no PDF service.
- Cons: the stored HTML also comes from the browser (the same trust problem); row 23 needs a viewer page; a later style change can change how an old copy looks.

**Option 3: The server draws it with Cloudflare Browser Run from our own page (chosen).**
- Pros: the file can only be the real report; a real text PDF; no work on the student's phone; the same code draws screen and paper.
- Cons: a new service with a cost and two secrets; not instant; a bot rule on the site could block it.

### How the render page gets the student's data

**Option A: A short lived signed token in the address fragment, and a data route (chosen).** The server signs a token (student, check, 2 minute expiry), the page sends it to a route that returns the saved data without flags.
- Pros: nothing sensitive in the address that servers see, no student session shared with another service, flags can be excluded at the source, and a signed token needs no table, hashing or sweep (a stored, single use token was the first draft, dropped after the cross check).
- Cons: a new route and a signing secret to protect, and no single use (the 2 minute life covers it).

**Option B: Pass the student's session cookie to Browser Run.** Browser Run can set cookies.
- Pros: the page would not change.
- Cons: hands a live sign in to a third party service, and the page would still carry the flags.

**Option C: Build the whole report as an HTML string on the server and pass it as `html`.**
- Pros: no render page, no token.
- Cons: the report is built by about 500 lines of browser DOM code and its words; rebuilding it on the server means two copies that drift, the exact problem spec 0005 avoided for scoring.

### How the student's browser proves who it is when it fetches the file

**A Bearer token, fetched and saved by the page (chosen).** Convex functions know the student only from a Bearer token, which the Founding Card download pattern already uses, so the route can use the normal identity check. A plain link would send only the cookie.
**Check the cookie inside the HTTP action.** Lets a raw link work (handy for a Sheet link) but needs a second way to find the student and breaks the "no function takes an auth user id" convention for a case row 23 can solve with a team page.

### Download when the copy is not ready

**Poll every 3 seconds up to 60 seconds, then fall back (chosen).** The tap always ends in a file or a clear next step.
**Make it on the phone on tap.** Brings back the trust problem and the heavy work.
**Say "not ready, try later".** Simplest, but a student who taps early may never get a file.

### The report version the server compares

**A server constant tied to the page's version by a test (chosen).** One line to bump beside `VERSION`, and a test fails if they differ.
**Import `reportText.js` into Convex like `scoring.ts` does.** It starts with `window.DhiReportText =`, which fails in Convex, and it would bundle 400 lines of words into the backend only to read a number.
**Trust a version the browser sends.** Brings back client input for no gain.

## Rationale

The first force, a client drawn report, rules out printing it on the server from scratch, and the trust force rules out taking a file from the student. That leaves a headless browser opening our own page, and Browser Run is the managed way to do that on the platform already hosting the site, with a REST call a Convex action can make, no new server to run. The token in the fragment gives the page just enough access for two minutes, and serving the data from a route that never selects the flags table turns a promise ("flags are never public") into a property of the code.

The cost and bot rule risks are real but small and measurable: about $0.0003 a copy on the paid plan, and milestone 1 proves the headless browser is let in before any other work is built on it. Waiting up to 60 seconds on Download is the price of not trusting the phone, and the print dialog covers the rare failure.

The engineer's stated pick of the browser made PDF in the first round was changed by the engineer once the weakness was clear. The result needs the engineer to accept one new paid service, which the Follow up list calls out.
