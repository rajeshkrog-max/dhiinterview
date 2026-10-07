/* Dhirise · reveal, teaser, join. A constellation of the 18 answers draws itself on the 7-area shape (~7 s),
   then "You are <style>"; "See your result" opens a teaser (name, style badge, Dhi starting score, two locked cards).
   "Unlock my full report" opens the join: +91 mobile (shown 3-3-4) + WhatsApp early-access tick. On Submit the form
   gives way to a thank-you, then who.html (the story), then report-student.html, opens after 2.5 s.
   The lead is kept in localStorage "dhirise.lead.v1" and, if DHI_FUNNEL.leadEndpoint is set, POSTed there (no-cors). */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var REPORT = "who.html", LEAD = "dhirise.lead.v1";

  /* only a finished check reaches this page */
  var check = DhiStore.get();
  if (!check.completedAt) {
    var missing = DhiStore.firstMissing();
    location.replace(missing ? DhiStore.urlFor(missing) : DhiStore.urlFor(DhiQuestions.TOTAL));
    return;
  }
  var r = DhiScore.score(check.answers, { seed: DhiStore.seed() });
  var profile = check.profile || {};

  /* reveal: 18 points (one per answer) on the 7-area shape, joined, then the shape glows in the style colour,
     then "You are …" with reveal.mp3. About 7 s; reduced motion shows the finished constellation with a fade. */
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var theme = DhiIdentity.theme(r);
  var youName = DhiIdentity.styleName(r) || DhiQuestions.STYLE_NAMES[r.styleKey];
  $("youName").textContent = youName;
  var timers = [];
  var T_POINTS = 300, T_STEP = 140, T_LINES = 2900, T_GLOW = 4100, T_TEXT = 5200, T_BUTTON = 6600, T_END = 5600;
  var sky = $("sky"), ctx = sky.getContext && sky.getContext("2d");
  var size = 0, dpr = 1, pts = [], loop = [], verts = [], dust = [];

  function geometry() {
    size = sky.getBoundingClientRect().width || 300;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    sky.width = sky.height = Math.round(size * dpr);
    var c = size / 2, R = size * 0.4, AR = DhiQuestions.AREAS;
    var ang = function (a) { return -Math.PI / 2 + AR.indexOf(a) * 2 * Math.PI / AR.length; };
    var rad = function (a) { return R * (0.22 + 0.78 * r.areas[a].score / 100); };
    verts = AR.map(function (a) { return { x: c + Math.cos(ang(a)) * rad(a), y: c + Math.sin(ang(a)) * rad(a) }; });
    /* each answer sits on its first area's axis (spread a little when an axis holds several);
       how far out follows the area score, nudged by that answer's own value. The profile-only question is the centre. */
    var byArea = {};
    DhiQuestions.list.forEach(function (q) { if (q.areas.length) (byArea[q.areas[0]] = byArea[q.areas[0]] || []).push(q.n); });
    pts = DhiQuestions.list.map(function (q) {
      if (!q.areas.length) return { x: c, y: c, a: -9, centre: true };
      var a = q.areas[0], sib = byArea[a], k = sib.indexOf(q.n);
      var o = DhiQuestions.option(check.answers["q" + q.n]);
      var v = o && o.areas[a] != null ? (o.areas[a] + 2) / 4 : 0.5;
      var t = ang(a) + (k - (sib.length - 1) / 2) * 0.16, rr = rad(a) * (0.8 + 0.2 * v);
      return { x: c + Math.cos(t) * rr, y: c + Math.sin(t) * rr, a: t };
    });
    loop = pts.filter(function (p) { return !p.centre; }).sort(function (p, q) { return p.a - q.a; });
    var s = 7;                                              /* a quiet field of dust, the same every time */
    dust = [];
    for (var i = 0; i < 46; i++) { s = (s * 9301 + 49297) % 233280; var x = s / 233280; s = (s * 9301 + 49297) % 233280; dust.push({ x: x * size, y: s / 233280 * size, o: 0.05 + (i % 5) * 0.03 }); }
  }

  function mix(h1, h2, k) {
    var a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    var ch = function (sh) { return Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k); };
    return "rgb(" + ch(16) + "," + ch(8) + "," + ch(0) + ")";
  }
  function clamp01(x) { return Math.max(0, Math.min(1, x)); }
  function ease(x) { return 1 - Math.pow(1 - x, 3); }

  function draw(t) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    var c = size / 2, glow = ease(clamp01((t - T_GLOW) / 1000)), lines = clamp01((t - T_LINES) / 1200);
    dust.forEach(function (d) { ctx.fillStyle = "rgba(255,255,255," + d.o + ")"; ctx.fillRect(d.x, d.y, 1, 1); });
    /* seven faint axes */
    ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
    DhiQuestions.AREAS.forEach(function (a, i) {
      var t2 = -Math.PI / 2 + i * 2 * Math.PI / 7;
      ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.cos(t2) * size * 0.4, c + Math.sin(t2) * size * 0.4); ctx.stroke();
    });
    /* the shape glows */
    if (glow > 0) {
      ctx.save();
      ctx.beginPath();
      verts.forEach(function (v, i) { if (i) ctx.lineTo(v.x, v.y); else ctx.moveTo(v.x, v.y); });
      ctx.closePath();
      ctx.globalAlpha = glow;
      ctx.fillStyle = theme.ink; ctx.fill();
      ctx.shadowColor = theme.glow; ctx.shadowBlur = 18;
      ctx.strokeStyle = theme.glow; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.restore();
    }
    /* thin lines join the points, drawn around the shape */
    if (lines > 0) {
      var segs = loop.map(function (p, i) { var q = loop[(i + 1) % loop.length]; return [p, q, Math.hypot(q.x - p.x, q.y - p.y)]; });
      var total = segs.reduce(function (s, g) { return s + g[2]; }, 0), left = total * ease(lines);
      ctx.strokeStyle = glow > 0 ? mix("#f6dca0", theme.glow2, glow) : "rgba(246,220,160,.55)";
      ctx.globalAlpha = 0.55 + 0.3 * glow; ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (var i = 0; i < segs.length && left > 0; i++) {
        var g = segs[i], k = Math.min(1, left / g[2]);
        ctx.moveTo(g[0].x, g[0].y); ctx.lineTo(g[0].x + (g[1].x - g[0].x) * k, g[0].y + (g[1].y - g[0].y) * k);
        left -= g[2];
      }
      ctx.stroke();
      ctx.globalAlpha = 0.12 * lines; ctx.beginPath();                 /* faint spokes to the centre star */
      loop.forEach(function (p) { ctx.moveTo(c, c); ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    /* the 18 points, one by one */
    pts.forEach(function (p, i) {
      var k = ease(clamp01((t - T_POINTS - i * T_STEP) / 400));
      if (k <= 0) return;
      var col = mix("#f6dca0", theme.glow2, glow), R = (p.centre ? 11 : 8) * (0.6 + 0.4 * k);
      var gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.55 * k; ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, 2 * Math.PI); ctx.fill();
      ctx.globalAlpha = k; ctx.fillStyle = "#fff8e6";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.centre ? 2.2 : 1.6, 0, 2 * Math.PI); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function showText() {
    $("youare").classList.add("on");
    $("youare").removeAttribute("aria-hidden");
    $("line").textContent = "You are " + youName;
    DhiIdentity.sfx("assets/cards/reveal.mp3", 0.7);
  }
  function showButton() {
    var b = $("see"); b.hidden = false;
    requestAnimationFrame(function () { b.classList.add("on"); b.focus({ preventScroll: true }); });
  }

  geometry();
  if (reduced) {
    draw(T_END + 1000);
    sky.classList.add("on");
    showText();
    timers.push(setTimeout(showButton, 800));
  } else {
    sky.classList.add("on");
    var t0 = 0;
    (function frame(now) {
      if (!t0) t0 = now;
      var t = now - t0;
      draw(t);
      if (t < T_END) requestAnimationFrame(frame);
    })(performance.now());
    timers.push(setTimeout(function () { $("line").textContent = "DhiRise is sketching your pattern"; }, T_LINES));
    timers.push(setTimeout(showText, T_TEXT));
    timers.push(setTimeout(showButton, T_BUTTON));
  }
  window.addEventListener("resize", function () { geometry(); draw(1e9); });
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
  function digits() { return phone.value.replace(/\D/g, ""); }
  function group(d) { return d.replace(/^(\d{3})(\d{1,3})?(\d{1,4})?$/, function (m, a, b, c) { return [a, b, c].filter(Boolean).join(" "); }); }
  /* keep the 3-3-4 spaces while typing, deleting or pasting; the caret stays after the same digit */
  phone.addEventListener("input", function (e) {
    var v = phone.value, at = phone.selectionStart == null ? v.length : phone.selectionStart;
    var before = v.slice(0, at).replace(/\D/g, "").length, d = v.replace(/\D/g, "");
    var prev = phone.dataset.d || "";
    /* Backspace/Delete took only a space: take the digit next to it */
    if (d === prev && e.inputType === "deleteContentBackward" && before > 0) { d = d.slice(0, before - 1) + d.slice(before); before--; }
    else if (d === prev && e.inputType === "deleteContentForward") { d = d.slice(0, before) + d.slice(before + 1); }
    /* pasted with a country code or trunk 0 */
    if (d.length > 10 && d.slice(0, 2) === "91") { before = Math.max(0, before - 2); d = d.slice(2); }
    else if (d.length === 11 && d.charAt(0) === "0") { before = Math.max(0, before - 1); d = d.slice(1); }
    d = d.slice(0, 10); before = Math.min(before, d.length);
    var out = group(d), pos = 0, seen = 0;
    while (pos < out.length && seen < before) { if (/\d/.test(out.charAt(pos))) seen++; pos++; }
    phone.value = out; phone.dataset.d = d;
    if (document.activeElement === phone) phone.setSelectionRange(pos, pos);
    if (phone.getAttribute("aria-invalid")) check10();
  });
  function check10() {
    var ok = /^[6-9]\d{9}$/.test(digits());
    $("phoneErr").textContent = ok ? "" : "Please enter a valid 10-digit mobile number.";
    if (ok) phone.removeAttribute("aria-invalid"); else phone.setAttribute("aria-invalid", "true");
    return ok;
  }
  function areaScores() { var o = {}; DhiQuestions.AREAS.forEach(function (a) { o[a] = r.areas[a].score; }); return o; }
  function keep(v) { try { localStorage.setItem(LEAD, JSON.stringify(v)); } catch (e) {} }
  /* challenge status for the sheet (js/api.js); read early so the submit stays instant */
  var challenge = { challengeJoined: false, joinedAt: null };
  if (window.DhiApi) DhiApi.getMe().then(function (m) { challenge = { challengeJoined: !!(m && m.joined), joinedAt: (m && m.joinedAt) || null }; }, function () {});

  $("join").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!check10()) { phone.focus(); return; }
    var lead = {
      name: profile.name || "", age: profile.age || "", class: profile.class || "",
      phone: digits(), wantsCommunity: $("community").checked, foundingId: DhiIdentity.foundingId(profile),
      styleKey: r.styleKey, areas: areaScores(), indices: r.indices, dhiStart: r.dhiStart, flags: r.flags,
      completedAt: check.completedAt,
      challengeJoined: challenge.challengeJoined, joinedAt: challenge.joinedAt
    };
    var cfg = window.DHI_FUNNEL || {};
    keep({ lead: lead, completedAt: check.completedAt, sent: !!cfg.leadEndpoint, at: new Date().toISOString() });
    $("submit").disabled = true;
    if (cfg.leadEndpoint) {                                  /* no endpoint: kept locally only */
      /* keepalive finishes the send even after we leave */
      try {
        fetch(cfg.leadEndpoint, { method: "POST", mode: "no-cors", keepalive: true,
          headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(lead) }).catch(function () {});
      } catch (err) {}
    }
    $("join").hidden = true; $("thanks").hidden = false;
    setTimeout(function () { location.href = REPORT; }, 2500);
  });
})();
