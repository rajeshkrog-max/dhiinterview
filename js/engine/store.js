/* Dhirise · the one answer store. localStorage "dhirise.check.v1" =
   { profile:{name, age, class}, answers:{ qN: optionId }, startedAt, completedAt }.
   Survives a refresh. A different student name at the gate starts a fresh check. Needs js/engine/score.js for seed(). */
(function (root) {
  "use strict";
  var KEY = "dhirise.check.v1", GATE = "dhirise.gate.v1", TOTAL = 18;

  function readJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} return s; }
  function profileOf(g) { return g && g.name ? { name: g.name, age: g.age, class: g.class } : null; }
  function fresh(g) { return { profile: profileOf(g), answers: {}, startedAt: new Date().toISOString(), completedAt: null }; }

  /* the current check; starts one if there is none or the student changed */
  function get() {
    var s = readJSON(KEY), g = readJSON(GATE);
    if (!s || typeof s.answers !== "object" || !s.answers || !s.startedAt) return write(fresh(g));
    if (g && g.name && s.profile && s.profile.name !== g.name) return write(fresh(g));
    if (g && g.name && !s.profile) { s.profile = profileOf(g); write(s); }
    return s;
  }
  function answer(n, optionId) { var s = get(); s.answers["q" + n] = optionId; return write(s); }
  function firstMissing() {
    var a = get().answers;
    for (var n = 1; n <= TOTAL; n++) if (!a["q" + n]) return n;
    return 0;
  }
  function complete() { var s = get(); s.completedAt = new Date().toISOString(); return write(s); }
  function urlFor(n) { return n === 1 ? "question.html" : n === 2 ? "question2.html" : "questions.html?q=" + n; }
  function seed() { var s = get(); return root.DhiScore.seedOf(s.profile, s.startedAt); }

  root.DhiStore = { KEY: KEY, get: get, answer: answer, firstMissing: firstMissing, complete: complete, urlFor: urlFor, seed: seed };
})(typeof window !== "undefined" ? window : globalThis);
