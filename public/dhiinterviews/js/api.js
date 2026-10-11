/* DhiRise · the challenge data layer. The ONLY place the Founding Circle Challenge reads or writes data.
   Every function is async and returns plain objects. Each one says where its data comes from ("// BACKEND: …").

   LIVE (spec 0015, rows 10 to 12): getMe, joinChallenge, getMyReferral, getLeaderboard and getMyRank call the server through DhiSession.challenge
   (src/lib/session.ts → convex/challenge.ts). A friend's referral is recorded by the server when the friend's profile is created
   (convex/students.ts, from the code the landing form sends), and a referral turns valid in a job that runs every 5 minutes
   (convex/challengeBoard.ts), so there are no calls here to record a use, mark the report seen or save feedback.
   Also live: validateCode (the code hint on the landing page, GET /api/referral/validate), setHideName and leaveChallenge.
   Nothing is stored in this browser any more, and there are no demo rows: the board is the rows the server job wrote (convex/challengeBoard.ts).

   Rules for a valid referral (the SERVER enforces them, convex/challengeCore.ts decideReferral): the friend is new (a profile made with the code),
   finished all 18 questions on a fresh check, reached the report, and left genuine feedback (≥ minFeedbackChars, not repeated characters), all by the
   deadline. No self-referrals. The top 10 are reviewed by hand before a winner is announced.

   Needs: js/challenge-config.js (window.DHI_CHALLENGE), js/funnel-config.js (shareUrl), window.DhiSession (the page guard starts this file's page
   script after it exists; with none, the live calls answer "not joined"). Reads the style label from the saved result copy on the device (dhirise.result.v1, spec 0005). */
(function (root) {
  "use strict";
  var CFG = root.DHI_CHALLENGE || { minFeedbackChars: 30, leaderboardSize: 50 };
  var RESULT_KEY = "dhirise.result.v1";     /* the saved result of the finished check, { v:1, owner, result }, filled by src/lib/session.ts */
  var SESSION_KEY = "dhirise.session.v1";   /* the signed in student's cached check, filled by src/lib/session.ts */
  var CODE_RE = /^[A-Z]{3}[A-HJ-NP-Z2-9]{4}$/;   /* the same pattern as convex/challengeRules.ts (tests/challenge-rules.test.js fails if they differ) */
  var STYLE = { v: "Explorer", p: "Achiever", k: "Builder" };

  /* ---------- local helpers ---------- */
  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function gate() { var c = read(SESSION_KEY); return (c && c.profile) || {}; }   /* { name, age, class } of the signed in student */
  function check() { return read(SESSION_KEY) || {}; }
  function firstName(name) { var f = String(name || "").trim().split(/\s+/)[0] || ""; return f ? f.charAt(0).toUpperCase() + f.slice(1).toLowerCase() : ""; }
  /* the same owner and finished checks as DhiStore.result() in js/engine/store.js (the challenge pages do not load that
     file): change them together */
  function styleOf() {
    var c = check(), s = read(RESULT_KEY);
    if (!c.completedAt || !c.owner || !s || s.v !== 1 || s.owner !== c.owner || !s.result) return null;   /* none on this device yet */
    return STYLE[s.result.styleKey] || null;
  }
  /* the one rule lives in convex/feedbackRules.ts; the page bridge (src/lib/session.ts) exposes it */
  function genuine(text) { return !!(root.DhiSession && root.DhiSession.isGenuine && root.DhiSession.isGenuine(text)); }
  function shareBase() {
    var u = String((root.DHI_FUNNEL && root.DHI_FUNNEL.shareUrl) || "").replace(/\/+$/, "");
    return u || (typeof location !== "undefined" ? location.href.replace(/[^/]*([?#].*)?$/, "").replace(/\/+$/, "") : "");
  }
  /* this student's challenge state from the server, or null when it cannot be had (offline, no bridge on this page) */
  function live() {
    var S = root.DhiSession;
    if (!S || !S.challenge) return Promise.resolve(null);
    return S.challenge.me().then(function (m) { return m || null; }, function () { return null; });
  }

  /* the public board from the server, or null when it cannot be had (offline, no bridge on this page) */
  var lastBoard = null;
  function board() {
    var S = root.DhiSession;
    if (!S || !S.challenge || !S.challenge.leaderboard) return Promise.resolve(null);
    return S.challenge.leaderboard().then(function (b) { return b || null; }, function () { return null; });
  }

  /* ---------- the API ---------- */
  var api = {
    /* who is signed in, and where they are in the challenge */
    getMe: function () {
      // BACKEND (live): name, age, class, style and the three step flags come from this device's copy of the check (filled by the server);
      // joined, code, hideName, valid, pending and open come from DhiSession.challenge.me() (convex/challenge.ts `me`).
      // `open` is false while the server switch CHALLENGE_LIVE is off. `feedbackGiven` is a note saved, genuine or not.
      return live().then(function (m) {
        var g = gate(), c = check();
        return {
          name: g.name || "", firstName: firstName(g.name), email: null, age: g.age || null, "class": g["class"] || "",
          style: styleOf(), code: m && m.code ? m.code : null, joined: !!(m && m.joined), hideName: !!(m && m.hideName),
          open: m ? m.open : true, valid: m ? m.valid : 0, pending: m ? m.pending : 0,
          finished: !!c.completedAt, reportComplete: !!c.reportSeenAt, feedbackGiven: !!c.feedbackSavedAt
        };
      });
    },

    /* is this a real code, and whose? → { ok, referrerFirstName } or { ok: false, reason: "format" | "unknown" | "ended" | "unchecked" } */
    validateCode: function (code) {
      // BACKEND (live): GET /api/referral/validate?code= (public, rate limited; convex/referral.ts). A hidden owner shows "a friend". There is
      // no "self" answer: the route cannot tell who is asking. "unchecked" means the check could not be had (offline, over the limit): the page
      // says nothing, and the server still records the referral when the profile is created, so a good code works whatever this hint says.
      var c = String(code || "").trim().toUpperCase();
      if (!CODE_RE.test(c)) return Promise.resolve({ ok: false, reason: "format" });
      if (api.isOver()) return Promise.resolve({ ok: false, reason: "ended" });
      if (typeof fetch !== "function") return Promise.resolve({ ok: false, reason: "unchecked" });
      return fetch("/api/referral/validate?code=" + encodeURIComponent(c), { credentials: "omit", cache: "no-store" })
        .then(function (res) { return res.status === 200 ? res.json() : null; })
        .then(function (body) {
          if (body && body.ok === true && typeof body.referrerFirstName === "string") return { ok: true, referrerFirstName: body.referrerFirstName };
          if (body && body.ok === false && (body.reason === "format" || body.reason === "unknown" || body.reason === "ended")) return { ok: false, reason: body.reason };
          return { ok: false, reason: "unchecked" };
        })
        .catch(function () { return { ok: false, reason: "unchecked" }; });
    },

    /* join the challenge; the server needs the rules tick, and under 18 a parent's tick
       → { ok, code } or { ok: false, reason: "rules" | "parentConsent" | "ended" | "not_open" | "no_result" | "rate_limited" | "offline" } */
    joinChallenge: function (opts) {
      // BACKEND (live): DhiSession.challenge.join → convex/challenge.ts `join`. The server reads the age itself, adds a `challenge` consent
      // (version, age, parent tick, time), makes the code and refuses after the deadline or while CHALLENGE_LIVE is off.
      opts = opts || {};
      if (api.isOver()) return Promise.resolve({ ok: false, reason: "ended" });
      var S = root.DhiSession;
      if (!S || !S.challenge) return Promise.resolve({ ok: false, reason: "offline" });
      return S.challenge.join({ rulesAccepted: opts.rulesAccepted === true, parentConsent: !!opts.parentConsent, hideName: !!opts.hideName })
        .then(function (r) { return r.ok ? { ok: true, code: r.code } : { ok: false, reason: r.code }; });
    },

    /* show me as "Anonymous <style>" on the leaderboard, or not → { ok } or { ok: false, reason: "not_joined" | "ended" | "offline" } */
    setHideName: function (hide) {
      // BACKEND (live): DhiSession.challenge.setHideName → convex/challenge.ts `setHideName` (allowed until the deadline).
      var S = root.DhiSession;
      if (!S || !S.challenge) return Promise.resolve({ ok: false, reason: "offline" });
      return S.challenge.setHideName(!!hide).then(function (r) { return r.ok ? { ok: true } : { ok: false, reason: r.code }; });
    },

    /* leave the challenge → { ok } or { ok: false, reason: "offline" }; the code stops working and the consent stays on record */
    leaveChallenge: function () {
      // BACKEND (live): DhiSession.challenge.leave → convex/challenge.ts `leave` (allowed at any time).
      var S = root.DhiSession;
      if (!S || !S.challenge) return Promise.resolve({ ok: false, reason: "offline" });
      return S.challenge.leave().then(function (r) { return r.ok ? { ok: true } : { ok: false, reason: r.code }; });
    },

    /* the words and tick labels of the join, from the server's own text (challenge-v1); null where the bridge is missing */
    joinWords: function () {
      var S = root.DhiSession;
      return S && S.challenge && S.challenge.consent ? S.challenge.consent : null;
    },

    /* my code, link and counts → { code, link, valid, pending } (code and link are null until joined) */
    getMyReferral: function () {
      // BACKEND (live): DhiSession.challenge.me() → code, valid (the job's count, up to 5 minutes behind), pending (counted live).
      // The link is built here from `shareUrl` in js/funnel-config.js (set at deploy time) and the code. A friend's name or email is never sent.
      return live().then(function (m) {
        if (!m || !m.joined || !m.code) return { code: null, link: null, valid: 0, pending: 0 };
        return { code: m.code, link: shareBase() + "/landing.html?ref=" + m.code, valid: m.valid, pending: m.pending };
      });
    },

    /* top leaderboardSize rows → [{ rank, displayName, cls, style, valid, avatar, me }], or null when the board cannot be had right now;
       `avatar` is a same origin picture path or null; `me` marks the signed in student's own row */
    getLeaderboard: function () {
      // BACKEND (live, spec 0018): DhiSession.challenge.leaderboard() → convex/challenge.ts `leaderboard` (signed in students only). The rows are what the
      // 5 minute job wrote: rank, displayName (first name + last initial, or "Anonymous <style>"), cls (omitted when hidden), style, valid, avatar. Nothing
      // else ever arrives (no email, phone, age, flag, id or last name), so nothing else is drawn. `avatar` (spec 0011, AC-4) comes from
      // convex/avatarState.ts `leaderboardPictureFor`: a path only while LEADERBOARD_PICTURES_ENABLED is on, the name is not hidden, and the student
      // agreed, has not removed it and is not blocked; otherwise absent. `boardInfo()` has the time and the frozen flag of the same answer.
      return board().then(function (b) {
        lastBoard = b ? { computedAt: b.computedAt, frozen: !!b.frozen, endsAt: b.endsAt } : null;
        if (!b) return null;
        return b.rows.slice(0, CFG.leaderboardSize || 50).map(function (r) {
          return { rank: r.rank, displayName: r.displayName, cls: r.cls || "", style: r.style, valid: r.valid, avatar: typeof r.avatar === "string" ? r.avatar : null, me: b.myRank === r.rank };
        });
      });
    },

    /* about the board last read by getLeaderboard → { computedAt (ms or null), frozen, endsAt (ms) }, or null before the first read or when it failed */
    boardInfo: function () { return lastBoard; },

    /* where I stand → { rank, valid, pending, toNext, nextRank } (rank, toNext and nextRank are null until I have a valid referral or have joined) */
    getMyRank: function () {
      // BACKEND (live, spec 0018): `rank`, `toNext` and `nextRank` from DhiSession.challenge.me() (the job writes them onto the student's own entry, so they can be
      // up to 5 minutes behind). toNext = the count of the place above minus mine plus 1; first place has toNext 0 and nextRank null.
      return live().then(function (m) {
        if (!m || !m.joined || !m.code) return { rank: null, valid: 0, pending: 0, toNext: null, nextRank: null };
        return { rank: m.rank, valid: m.valid, pending: m.pending, toNext: m.toNext, nextRank: m.nextRank };
      });
    },

    /* the feedback rule, for live hints on the page (no data access; the server re-checks) */
    isGenuine: function (text) { return genuine(text); },

    /* has the challenge ended? (local clock; the server decides for real) */
    isOver: function () { return Date.now() > Date.parse(CFG.endsAt || "2026-10-30T23:59:00+05:30"); }
  };

  root.DhiApi = api;
})(typeof window !== "undefined" ? window : globalThis);
