/* DhiRise · the challenge data layer. The ONLY place the Founding Circle Challenge reads or writes data.
   Every function is async and returns plain objects, so the mock below can be swapped for real fetch calls
   without touching the screens. Each one says where the backend goes ("// BACKEND: …").

   MOCK (today): everything lives in this browser's localStorage.
     "dhirise.challenge.v1"       this student: { id, code, joined, parentConsent, joinedAt, usedCode, reportComplete, feedback }
     "dhirise.challenge.mock.v1"  a tiny local "server": { codes: { CODE: { owner, firstName } }, uses: [ { code, by, … } ] }
   So you can test on one machine: student A joins and gets a code; student B opens landing.html?ref=CODE, finishes,
   reaches the report and leaves genuine feedback; A's count goes up. 30 demo rows (demo: true) fill the leaderboard.

   Rules for a valid referral (the backend must enforce them; the mock imitates them):
   the friend is new (a new email), used the code at sign-in, finished all 18 questions, reached the report,
   and submitted genuine feedback (≥ minFeedbackChars, not repeated characters). No self-referrals.
   The top 10 are reviewed by hand before a winner is announced.

   Needs: js/challenge-config.js (window.DHI_CHALLENGE), js/funnel-config.js (shareUrl). Uses DhiScore if loaded (style). */
(function (root) {
  "use strict";
  var CFG = root.DHI_CHALLENGE || { minFeedbackChars: 30, leaderboardSize: 50 };
  var ME_KEY = "dhirise.challenge.v1", MOCK_KEY = "dhirise.challenge.mock.v1";
  var GATE_KEY = "dhirise.gate.v1", CHECK_KEY = "dhirise.check.v1";
  var ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";            /* A–Z and 2–9 without O, 0, I, 1 */
  var CODE_RE = /^[A-Z]{3}[A-HJ-NP-Z2-9]{4}$/;
  var STYLE = { v: "Explorer", p: "Achiever", k: "Builder" };

  /* ---------- local helpers (mock only) ---------- */
  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} return v; }
  function now() { return new Date().toISOString(); }
  function rand(n) {
    var out = "", buf = new Uint32Array(n);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(buf);
    else for (var j = 0; j < n; j++) buf[j] = Math.floor(Math.random() * 4294967296);
    for (var i = 0; i < n; i++) out += ABC.charAt(buf[i] % ABC.length);
    return out;
  }
  function gate() { return read(GATE_KEY) || {}; }
  function check() { return read(CHECK_KEY) || {}; }
  function firstName(name) { var f = String(name || "").trim().split(/\s+/)[0] || ""; return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : ""; }
  function displayName(name) {
    var parts = String(name || "").trim().split(/\s+/);
    var f = firstName(name) || "Student";
    return parts.length > 1 ? f + " " + parts[parts.length - 1].charAt(0).toUpperCase() + "." : f;
  }
  function owner() { return String(gate().name || "").trim().toLowerCase(); }   /* mock stand-in for the account email */
  function me() {
    var m = read(ME_KEY);
    if (!m || m.owner !== owner()) m = { id: rand(8), owner: owner(), code: null, joined: false, parentConsent: false, joinedAt: null,
      usedCode: null, reportComplete: false, feedback: null };
    return m;
  }
  function saveMe(m) { return write(ME_KEY, m); }
  function mock() { var d = read(MOCK_KEY); return d && d.codes && d.uses ? d : { codes: {}, uses: [] }; }
  function saveMock(d) { return write(MOCK_KEY, d); }
  function styleOf() {
    var c = check();
    if (!c.completedAt || !root.DhiScore || !root.DhiQuestions) return null;
    try { return STYLE[root.DhiScore.score(c.answers).styleKey] || null; } catch (e) { return null; }
  }
  function genuine(text) {
    var t = String(text || "").trim();
    if (t.length < (CFG.minFeedbackChars || 30)) return false;
    var letters = t.toLowerCase().replace(/[^a-zऀ-ॿ]/g, "");
    var distinct = {}; for (var i = 0; i < letters.length; i++) distinct[letters[i]] = 1;
    return Object.keys(distinct).length >= 8 && !/(.)\1{5,}/.test(t);       /* not "aaaaaa…" or a few keys mashed */
  }
  function shareBase() {
    var u = String((root.DHI_FUNNEL && root.DHI_FUNNEL.shareUrl) || "").replace(/\/+$/, "");
    return u || (typeof location !== "undefined" ? location.href.replace(/[^/]*([?#].*)?$/, "").replace(/\/+$/, "") : "");
  }
  /* counts for one code in the mock: valid = every rule met; pending = started, not yet complete */
  function counts(code) {
    var d = mock(), own = d.codes[code] && d.codes[code].owner;
    var valid = 0, pending = 0;
    d.uses.forEach(function (u) {
      if (u.code !== code || u.by === own) return;                       /* no self-referrals */
      if (u.finished && u.report && u.feedback) valid++; else pending++;
    });
    return { valid: valid, pending: pending };
  }

  /* ---------- demo leaderboard (demo: true; remove when the backend serves real rows) ---------- */
  var DEMO = [
    ["Aarav S.", "Class 11", "Achiever", 14], ["Ananya R.", "Class 10", "Explorer", 12], ["Ishaan P.", "Class 12", "Builder", 11],
    ["Diya M.", "Class 9", "Explorer", 9], ["Vihaan K.", "Class 11", "Achiever", 9], ["Saanvi T.", "Class 10", "Builder", 8],
    ["Arjun N.", "College", "Achiever", 7], ["Myra G.", "Class 12", "Explorer", 7], ["Kabir D.", "Class 9", "Builder", 6],
    ["Aadhya V.", "Class 11", "Builder", 6], ["Reyansh B.", "Class 10", "Explorer", 5], ["Kiara J.", "Class 12", "Achiever", 5],
    ["Ayaan H.", "Class 8", "Explorer", 5], ["Pari C.", "Class 10", "Builder", 4], ["Atharv L.", "Class 11", "Achiever", 4],
    ["Navya S.", "Class 9", "Explorer", 4], ["Rudra A.", "Class 12", "Builder", 3], ["Anika P.", "College", "Explorer", 3],
    ["Dhruv R.", "Class 10", "Achiever", 3], ["Meera I.", "Class 11", "Builder", 3], ["Krish Y.", "Class 9", "Explorer", 2],
    ["Riya E.", "Class 12", "Achiever", 2], ["Shaurya F.", "Class 10", "Builder", 2], ["Tara K.", "Class 8", "Explorer", 2],
    ["Advik M.", "Class 11", "Achiever", 1], ["Ira N.", "Class 10", "Builder", 1], ["Veer S.", "Class 12", "Explorer", 1],
    ["Zara Q.", "Class 9", "Achiever", 1], ["Aryan W.", "College", "Builder", 1], ["Siya O.", "Class 10", "Explorer", 0]
  ].map(function (r) { return { displayName: r[0], cls: r[1], style: r[2], valid: r[3], demo: true }; });

  /* everyone, ranked: most valid first; ties keep their order (earlier joiners first, demo rows before you) */
  function ranking() {
    var rows = DEMO.slice(), m = me();
    if (m.joined && m.code) {
      var c = counts(m.code), g = gate();
      rows.push({ displayName: displayName(g.name), cls: g["class"] || "", style: styleOf() || "", valid: c.valid, me: true });
    }
    rows = rows.map(function (r, i) { r._i = i; return r; })
      .sort(function (a, b) { return b.valid - a.valid || a._i - b._i; });
    rows.forEach(function (r, i) { r.rank = i + 1; delete r._i; });
    return rows;
  }

  /* ---------- the API ---------- */
  var api = {
    /* who is signed in, and where they are in the challenge */
    getMe: function () {
      // BACKEND: replace with fetch("/api/me") → { name, firstName, email, age, class, style, code, joined, usedCode, reportComplete }
      var g = gate(), m = me(), c = check();
      return Promise.resolve({
        name: g.name || "", firstName: firstName(g.name), email: g.email || null, age: g.age || null, "class": g["class"] || "",
        style: styleOf(), code: m.code, joined: m.joined, parentConsent: m.parentConsent,
        usedCode: m.usedCode ? m.usedCode.code : null, finished: !!c.completedAt, reportComplete: m.reportComplete,
        feedbackGiven: !!(m.feedback && m.feedback.genuine)
      });
    },

    /* is this a real code, and whose? → { ok, referrerFirstName } or { ok: false, reason: "format" | "unknown" | "self" | "ended" } */
    validateCode: function (code) {
      // BACKEND: replace with fetch("/api/referral/validate?code=" + code) → { ok, referrerFirstName, reason }
      var c = String(code || "").trim().toUpperCase();
      if (!CODE_RE.test(c)) return Promise.resolve({ ok: false, reason: "format" });
      if (api.isOver()) return Promise.resolve({ ok: false, reason: "ended" });
      var d = mock(), hit = d.codes[c];
      if (!hit) return Promise.resolve({ ok: false, reason: "unknown" });
      if (hit.owner && hit.owner === owner()) return Promise.resolve({ ok: false, reason: "self" });
      return Promise.resolve({ ok: true, referrerFirstName: hit.firstName });
    },

    /* the friend signed in with a code: remember it once (the first code wins) */
    recordReferralUse: function (code) {
      // BACKEND: replace with fetch("/api/referral/use", { method: "POST", body: { code } }); the server checks the email is new
      return api.validateCode(code).then(function (v) {
        if (!v.ok) return v;
        var m = me(), c = String(code).trim().toUpperCase();
        if (m.usedCode) return { ok: m.usedCode.code === c, reason: m.usedCode.code === c ? null : "already", referrerFirstName: v.referrerFirstName };
        m.usedCode = { code: c, at: now() };
        saveMe(m);
        var d = mock();
        d.uses.push({ code: c, by: owner(), at: now(), finished: false, report: false, feedback: false });
        saveMock(d);
        return { ok: true, referrerFirstName: v.referrerFirstName };
      });
    },

    /* the student reached the report (and so finished all 18) */
    markReportComplete: function () {
      // BACKEND: replace with fetch("/api/report/complete", { method: "POST", body: { completedAt } })
      var m = me(), c = check();
      m.reportComplete = !!c.completedAt;
      saveMe(m);
      updateUse(function (u) { u.finished = !!c.completedAt; u.report = m.reportComplete; });
      return Promise.resolve({ ok: m.reportComplete });
    },

    /* report feedback; genuine = at least minFeedbackChars of real words */
    submitFeedback: function (fb) {
      // BACKEND: replace with fetch("/api/feedback", { method: "POST", body: { rating, text } }); judge "genuine" on the server
      fb = fb || {};
      var ok = genuine(fb.text), m = me();
      m.feedback = { rating: Number(fb.rating) || 0, text: String(fb.text || "").slice(0, 1000), genuine: ok, at: now() };
      saveMe(m);
      updateUse(function (u) { u.feedback = ok; });
      return Promise.resolve({ ok: true, genuine: ok, minChars: CFG.minFeedbackChars || 30 });
    },

    /* join the challenge; under 18 needs a parent's consent → { ok, code } or { ok: false, reason: "parentConsent" | "ended" } */
    joinChallenge: function (opts) {
      // BACKEND: replace with fetch("/api/challenge/join", { method: "POST", body: { parentConsent } }) → { ok, code }
      opts = opts || {};
      if (api.isOver()) return Promise.resolve({ ok: false, reason: "ended" });
      var g = gate(), m = me();
      if (Number(g.age) < 18 && !opts.parentConsent) return Promise.resolve({ ok: false, reason: "parentConsent" });
      ensureCode(m);
      m.joined = true; m.parentConsent = !!opts.parentConsent; m.joinedAt = m.joinedAt || now();
      saveMe(m);
      return Promise.resolve({ ok: true, code: m.code });
    },

    /* my code, link and counts → { code, link, valid, pending } */
    getMyReferral: function () {
      // BACKEND: replace with fetch("/api/referral/me") → { code, link, valid, pending }
      var m = me();
      ensureCode(m);
      saveMe(m);
      var c = counts(m.code);
      return Promise.resolve({ code: m.code, link: shareBase() + "/landing.html?ref=" + m.code, valid: c.valid, pending: c.pending });
    },

    /* top leaderboardSize rows → [{ rank, displayName, cls, style, valid, me? }] */
    getLeaderboard: function () {
      // BACKEND: replace with fetch("/api/challenge/leaderboard") → [{ rank, displayName, cls, style, valid }] (first name + initial only)
      return Promise.resolve(ranking().slice(0, CFG.leaderboardSize || 50).map(function (r) {
        return { rank: r.rank, displayName: r.displayName, cls: r.cls, style: r.style, valid: r.valid, me: !!r.me, demo: !!r.demo };
      }));
    },

    /* where I stand → { rank, valid, pending, toNext, nextRank } (rank null until joined) */
    getMyRank: function () {
      // BACKEND: replace with fetch("/api/challenge/rank") → { rank, valid, pending, toNext, nextRank }
      var m = me();
      if (!m.joined || !m.code) return Promise.resolve({ rank: null, valid: 0, pending: 0, toNext: null, nextRank: null });
      var rows = ranking(), mine = rows.filter(function (r) { return r.me; })[0], c = counts(m.code);
      var ahead = rows.filter(function (r) { return r.valid > mine.valid; });
      var target = ahead.length ? ahead[ahead.length - 1] : null;         /* the closest row with more valid referrals */
      return Promise.resolve({
        rank: mine.rank, valid: c.valid, pending: c.pending,
        toNext: target ? target.valid - mine.valid + 1 : 0,                 /* referrals needed to pass them */
        nextRank: target ? target.rank : null
      });
    },

    /* has the challenge ended? (local clock; the server decides for real) */
    isOver: function () { return Date.now() > Date.parse(CFG.endsAt || "2026-10-30T23:59:00+05:30"); }
  };

  /* a code once per student: first 3 letters of the first name + 4 from A–Z / 2–9 (no O, 0, I, 1), unique in the mock */
  function ensureCode(m) {
    if (m.code) return m.code;
    var g = gate(), letters = String(firstName(g.name) || "").toUpperCase().replace(/[^A-Z]/g, "");
    var head = (letters + "XXX").slice(0, 3), d = mock(), code;
    do { code = head + rand(4); } while (d.codes[code]);
    m.code = code;
    d.codes[code] = { owner: owner(), firstName: firstName(g.name) || "A friend", at: now() };
    saveMock(d);
    return code;
  }
  /* update my own use of someone's code (mock) */
  function updateUse(fn) {
    var m = me();
    if (!m.usedCode) return;
    var d = mock(), who = owner();
    d.uses.forEach(function (u) { if (u.code === m.usedCode.code && u.by === who) fn(u); });
    saveMock(d);
  }

  root.DhiApi = api;
})(typeof window !== "undefined" ? window : globalThis);
