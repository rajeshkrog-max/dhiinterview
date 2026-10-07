/* DhiRise · the Founding Circle Challenge on the report (report-student.html). Data only through js/api.js.
   - A pill under the card's share buttons: "Win ₹2,999 · Join the challenge", or once joined "Your code … · Rank #n · Leaderboard →",
     or after the end "Challenge closed · See winners".
   - A full-screen invite right after a valid feedback (event "dhirise:feedback" from js/report-student.js),
     and again on later report visits: at most DHI_CHALLENGE.maxInviteShows times in total. Esc / "Maybe later" close it.
   - After "Maybe later" (or once the invites are used up): a slim sticky bar at the bottom.
   - After endsAt: no invite, no bar. Reduced motion: no entrance animation. Styles: css/challenge.css. */
(function () {
  "use strict";
  var C = window.DHI_CHALLENGE, api = window.DhiApi;
  var root = document.getElementById("report");
  if (!C || !api || !root || !window.DhiStore || !DhiStore.get().completedAt) return;

  var SHOWS_KEY = "dhirise.challenge.invite.v1";
  var END = Date.parse(C.endsAt);
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var over = api.isOver();

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function shows() { try { return Number(localStorage.getItem(SHOWS_KEY)) || 0; } catch (e) { return 0; } }
  function bump() { try { localStorage.setItem(SHOWS_KEY, String(shows() + 1)); } catch (e) {} }
  function daysLeft() { return Math.max(0, Math.ceil((END - Date.now()) / 86400000)); }
  function endsIn() { var d = daysLeft(); return d <= 1 ? "ends today" : "ends in " + d + " days"; }
  var TROPHY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/></svg>';
  function joinedText(me, rank) { return "Your code " + me.code + (rank && rank.rank ? " · Rank #" + rank.rank : "") + " · Leaderboard →"; }

  /* reaching the report counts toward a valid referral */
  api.markReportComplete().catch(function () {});

  Promise.all([api.getMe(), api.getMyRank()]).then(function (a) {
    var me = a[0] || {}, rank = a[1] || {};
    pill(me, rank);
    if (over) return;
    if (me.joined) { bar(joinedText(me, rank), "leaderboard.html", null); return; }
    /* not joined: after their feedback, the invite (up to maxInviteShows), then the bar */
    if (me.feedbackGiven) {
      if (shows() < (C.maxInviteShows || 2)) openInvite(); else joinBar();
    }
    document.addEventListener("dhirise:feedback", function () { if (!api.isOver()) openInvite(); });
  }).catch(function () {});

  /* ---------- the pill under the share buttons ---------- */
  function pill(me, rank) {
    var p = el("a", "ch-pill");
    if (over) { p.textContent = "Challenge closed · See winners"; p.href = "leaderboard.html"; }
    else if (me.joined && me.code) { p.textContent = joinedText(me, rank); p.href = "leaderboard.html"; }
    else { p.textContent = "Win ₹2,999 · Join the challenge"; p.href = "challenge.html"; }
    var slot = document.querySelector(".fc-actions");
    if (slot) slot.appendChild(p);
    else root.insertBefore(add(el("div", "ch-pill-wrap span2"), p), root.firstChild);
  }

  /* ---------- the sticky bar ---------- */
  var barEl = null;
  function joinBar() { bar("Founding Circle Challenge · " + endsIn(), "challenge.html", "Join"); }
  function bar(text, href, action) {
    if (barEl) barEl.remove();
    barEl = el("div", "ch-bar");
    barEl.setAttribute("role", "region");
    barEl.setAttribute("aria-label", "Founding Circle Challenge");
    var ico = el("span", "ch-bar-ico"); ico.innerHTML = TROPHY;
    var a = el("a", "ch-bar-link"); a.href = href;
    if (action) add(barEl, ico, el("span", "ch-bar-text", text), add(a, document.createTextNode(action)));
    else { a.classList.add("wide"); add(a, el("span", "ch-bar-text", text)); add(barEl, ico, a); }
    document.body.appendChild(barEl);
    document.body.classList.add("has-ch-bar");
  }

  /* ---------- the full-screen invite ---------- */
  var dlg = null, lastFocus = null, tick = 0;
  function openInvite() {
    if (dlg || api.isOver()) return;
    if (shows() >= (C.maxInviteShows || 2)) { joinBar(); return; }   /* the invite is used up: the bar instead */
    bump();
    lastFocus = document.activeElement;

    dlg = el("div", "ch-dim" + (reduced ? "" : " anim"));
    var panel = el("div", "ch-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "chTitle");
    panel.setAttribute("aria-describedby", "chLine");

    var img = el("img", "ch-prize");
    img.alt = C.prize.title; img.width = 160; img.height = 160; img.decoding = "async";
    img.onerror = function () { img.onerror = null; img.src = C.prize.imageFallback; };
    img.src = C.prize.image;

    var title = el("h2", "ch-title", "Founding Circle Challenge"); title.id = "chTitle";
    var line = el("p", "ch-line", "You're one of the first. Help us find students who feel the same way."); line.id = "chLine";
    var prize = el("p", "ch-prize-line", "Top referrer wins a gift hamper worth ₹2,999");

    var clock = el("div", "ch-clock");
    clock.setAttribute("role", "timer");
    clock.setAttribute("aria-live", "off");
    var parts = ["days", "hrs", "min"].map(function (u) {
      var n = el("b", null, "0"), box = add(el("span", "ch-unit"), n, el("small", null, u));
      add(clock, box);
      return n;
    });
    function paint() {
      var ms = Math.max(0, END - Date.now());
      parts[0].textContent = Math.floor(ms / 86400000);
      parts[1].textContent = String(Math.floor(ms / 3600000) % 24).padStart(2, "0");
      parts[2].textContent = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
      clock.setAttribute("aria-label", "Ends in " + parts[0].textContent + " days, " + parts[1].textContent + " hours, " + parts[2].textContent + " minutes");
      if (!ms) close();
    }
    paint();
    tick = setInterval(paint, 30000);

    var join = el("a", "ch-join", "Join the challenge"); join.href = "challenge.html";
    var later = el("button", "ch-later", "Maybe later"); later.type = "button";
    later.addEventListener("click", function () { close(); joinBar(); });

    add(panel, img, title, line, prize, clock, join, later);
    add(dlg, panel);
    document.body.appendChild(dlg);
    document.documentElement.classList.add("ch-locked");
    join.focus({ preventScroll: true });

    dlg.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); joinBar(); return; }
      if (e.key !== "Tab") return;                        /* keep focus inside the panel */
      var f = [join, later], i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus({ preventScroll: true });
    });
  }
  function close() {
    if (!dlg) return;
    clearInterval(tick);
    dlg.remove(); dlg = null;
    document.documentElement.classList.remove("ch-locked");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
})();
