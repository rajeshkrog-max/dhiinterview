/* Dhirise · the one answer store: a fast local copy of the signed in student's check, so the quiz never waits
   for the network. localStorage "dhirise.session.v1" =
   { v:1, owner, profile:{name, age, class}, seed, startedAt, completedAt, reportSeenAt, leadSavedAt, feedbackSavedAt,
     answers:{ qN: optionId } }.
   The server (Convex) is the truth: src/lib/session.ts fills this copy at sign in and sends each answer in the
   background (DhiSession.queueAnswer). Pages only read it here. Needs nothing loaded first; the page guard
   (window.DhiSession) has already let the page through. */
(function (root) {
  "use strict";
  var KEY = "dhirise.session.v1", TOTAL = 18;

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} return s; }
  function empty() { return { v: 1, owner: null, profile: null, seed: "", startedAt: null, completedAt: null, reportSeenAt: null, leadSavedAt: null, feedbackSavedAt: null, answers: {} }; }

  /* the current check; an empty one when this device holds none */
  function get() {
    var s = readJSON(KEY);
    return s && s.v === 1 && s.answers && typeof s.answers === "object" ? s : empty();
  }
  /* keep the answer on the device now; the sync queue sends it to the server */
  function answer(n, optionId) {
    var s = get();
    if (!s.owner) return s;
    s.answers["q" + n] = optionId;
    write(s);
    if (root.DhiSession) root.DhiSession.queueAnswer(n, optionId);
    return s;
  }
  function firstMissing(check) {
    var a = (check || get()).answers;
    for (var n = 1; n <= TOTAL; n++) if (!a["q" + n]) return n;
    return 0;
  }
  function urlFor(n) { return n === 1 ? "question.html" : n === 2 ? "question2.html" : "questions.html?q=" + n; }
  function seed() { return get().seed; }

  /* where a student goes after sign in, and where every guard sends them: one pure function (spec 0002) */
  function resumeTarget(check) {
    var c = check || get(), answered = 0;
    for (var n = 1; n <= TOTAL; n++) if (c.answers && c.answers["q" + n]) answered++;
    if (c.completedAt) return c.leadSavedAt && c.reportSeenAt ? "report-student.html" : "done.html";   /* no saved lead: the phone step first (spec 0003) */
    if (answered === 0) return "meet.html";
    var missing = firstMissing(c);
    return urlFor(missing || TOTAL);                 /* all 18 answered but not finished: question 18, with Finish */
  }

  /* The flow gate for who.html and report-student.html (spec 0003): true when this student's number is saved. Otherwise
     it sends them to done.html (after asking the server once, in case the lead was saved on another device) and
     returns false, so the page stops. A flow gate in the browser, not a security boundary. */
  function requireLead(check) {
    var c = check || get();
    if (c.leadSavedAt) return true;
    var S = root.DhiSession, go = function () { root.location.replace("done.html"); };
    if (S && S.ready) S.ready().then(function () { if (get().leadSavedAt) root.location.reload(); else go(); }, go);
    else go();
    return false;
  }

  root.DhiStore = { KEY: KEY, get: get, answer: answer, firstMissing: firstMissing, urlFor: urlFor, seed: seed, resumeTarget: resumeTarget, requireLead: requireLead };
})(typeof window !== "undefined" ? window : globalThis);
