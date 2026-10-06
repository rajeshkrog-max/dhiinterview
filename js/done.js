/* Dhirise · wait, teaser, join. The gold line fills once over 8 s while four sentences show one at a time;
   then "See your result" opens a teaser (name, style badge, Dhi starting score, two locked cards).
   "Unlock my full report" opens the join: mobile + WhatsApp early-access tick → report-student.html.
   The lead is kept in localStorage "dhirise.lead.v1" and, if DHI_FUNNEL.leadEndpoint is set, POSTed there (no-cors).
   Skip also opens the report; nothing is sent. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var REPORT = "report-student.html", LEAD = "dhirise.lead.v1";

  /* only a finished check reaches this page */
  var check = DhiStore.get();
  if (!check.completedAt) {
    var missing = DhiStore.firstMissing();
    location.replace(missing ? DhiStore.urlFor(missing) : DhiStore.urlFor(DhiQuestions.TOTAL));
    return;
  }
  var r = DhiScore.score(check.answers, { seed: DhiStore.seed() });
  var profile = check.profile || {};

  /* wait */
  var FILL_MS = 8000;
  var LINES = ["Dhirise is reading your answers", "Dhirise is sketching your pattern", "Dhirise is preparing your result", "Almost done"];
  var step = FILL_MS / LINES.length, timers = [];
  var line = $("line");
  requestAnimationFrame(function () { $("fill").classList.add("go"); });
  LINES.forEach(function (text, i) {
    timers.push(setTimeout(function () {
      line.classList.remove("on");
      timers.push(setTimeout(function () { line.textContent = text; line.classList.add("on"); }, i ? 200 : 0));
    }, i * step));
  });
  timers.push(setTimeout(function () {
    var b = $("see"); b.hidden = false;
    requestAnimationFrame(function () { b.classList.add("on"); b.focus({ preventScroll: true }); });
  }, FILL_MS));
  window.addEventListener("pagehide", function () { timers.forEach(clearTimeout); });

  /* teaser */
  var first = profile.name ? String(profile.name).trim().split(/\s+/)[0] : "";
  $("tName").textContent = first ? first.charAt(0).toUpperCase() + first.slice(1) + ", here is your start." : "Here is your start.";
  var S = DhiQuestions.STYLE_NAMES, A = DhiQuestions.AREA_NAMES;
  var order = ["v", "p", "k"].sort(function (a, b) { return r.style[b] - r.style[a]; });
  $("tBadge").textContent = r.confidence === "blended" ? "A blend: " + S[order[0]].toLowerCase() + ", " + S[order[1]].toLowerCase() : S[r.styleKey];
  $("tScore").textContent = r.dhiStart;
  $("tRing").setAttribute("aria-label", "Dhi starting score " + r.dhiStart + " out of 100");
  function lockText(item) {
    if (!item) return "";
    return A[item.area] + " · " + item.band + (item.said ? "\nYou said: “" + item.said.text + "”" : "");
  }
  $("tTop").textContent = lockText(r.top[0]);
  $("tGrow").textContent = lockText(r.bottom[0]);

  var C = 2 * Math.PI * 52, fg = $("ringFg");
  fg.style.strokeDasharray = C;
  fg.style.strokeDashoffset = C;

  $("see").addEventListener("click", function () {
    $("wait").hidden = true; $("teaser").hidden = false;
    requestAnimationFrame(function () { requestAnimationFrame(function () { fg.style.strokeDashoffset = C * (1 - r.dhiStart / 100); }); });
    $("unlock").focus({ preventScroll: true });
  });
  $("unlock").addEventListener("click", function () {
    $("teaser").hidden = true; $("joinCard").hidden = false;
    window.scrollTo(0, 0);
    $("phone").focus({ preventScroll: true });
  });

  /* join */
  var phone = $("phone");
  function digits() { return phone.value.replace(/[\s\-()]/g, ""); }
  function check10() {
    var ok = /^\d{10}$/.test(digits());
    $("phoneErr").textContent = ok ? "" : "Please enter a 10-digit mobile number.";
    if (ok) phone.removeAttribute("aria-invalid"); else phone.setAttribute("aria-invalid", "true");
    return ok;
  }
  function areaScores() { var o = {}; DhiQuestions.AREAS.forEach(function (a) { o[a] = r.areas[a].score; }); return o; }
  function keep(v) { try { localStorage.setItem(LEAD, JSON.stringify(v)); } catch (e) {} }

  phone.addEventListener("input", function () { if (phone.getAttribute("aria-invalid")) check10(); });
  $("join").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!check10()) { phone.focus(); return; }
    var lead = {
      name: profile.name || "", age: profile.age || "", class: profile.class || "",
      phone: digits(), wantsCommunity: $("community").checked,
      styleKey: r.styleKey, areas: areaScores(), indices: r.indices, dhiStart: r.dhiStart, flags: r.flags,
      completedAt: check.completedAt
    };
    var cfg = window.DHI_FUNNEL || {};
    keep({ lead: lead, completedAt: check.completedAt, sent: !!cfg.leadEndpoint, at: new Date().toISOString() });
    $("submit").disabled = true;
    var go = function () { location.href = REPORT; };
    if (!cfg.leadEndpoint) { go(); return; }               /* no endpoint: kept locally only */
    var sent;
    try {
      sent = fetch(cfg.leadEndpoint, { method: "POST", mode: "no-cors", keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(lead) });
    } catch (err) { sent = Promise.resolve(); }
    /* wait for the send, at most 1.5 s; keepalive finishes it even after we leave */
    Promise.race([sent, new Promise(function (ok) { setTimeout(ok, 1500); })]).then(go, go);
  });
  $("skip").addEventListener("click", function () {
    keep({ lead: null, skipped: true, completedAt: check.completedAt, at: new Date().toISOString() });
  });
})();
