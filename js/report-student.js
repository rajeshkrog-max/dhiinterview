/* Dhirise · the student report. Built from DhiScore.score() and the words in js/engine/reportText.js.
   Inline SVG only. Numbers count up and charts draw in once, when their card comes into view (instant for reduced motion).
   Week 1 ticks are kept in localStorage "dhirise.path.v1" for this check only. */
(function () {
  "use strict";
  var T = window.DhiReportText, Q = window.DhiQuestions;
  var check = DhiStore.get();
  if (!check.completedAt) {                                   /* only a finished check has a report */
    var missing = DhiStore.firstMissing();
    location.replace(missing ? DhiStore.urlFor(missing) : DhiStore.urlFor(Q.TOTAL));
    return;
  }
  var r = DhiScore.score(check.answers, { seed: DhiStore.seed() });
  var profile = check.profile || {};
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SVGNS = "http://www.w3.org/2000/svg";
  var root = document.getElementById("report");

  /* ---------- helpers ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(parent) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]); return parent; }
  function S(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function fill(str, vars) { return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }); }
  function cap(s) { s = String(s || "").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
  function card(cls, eyebrow) {
    var c = el("section", "card" + (cls ? " " + cls : ""));
    if (eyebrow) add(c, el("h2", "eyebrow", eyebrow));
    return c;
  }
  function bar(value) {
    var b = el("div", "bar"), i = el("i");
    b.setAttribute("aria-hidden", "true");
    add(b, i);
    onShow(b, function () { tween(900, function (e) { i.style.width = (value * e) + "%"; }); });
    return b;
  }
  function counter(value, cls) {
    var n = el("span", cls || "num", "0");
    onShow(n, function () { tween(1000, function (e) { n.textContent = Math.round(value * e); }); });
    return n;
  }

  /* run each animation once, when it first comes into view */
  var queue = [];
  function onShow(node, fn) { queue.push([node, fn]); }
  function tween(ms, fn) {
    if (reduced) { fn(1); return; }
    var t0 = 0;
    function step(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      fn(e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function startAnimations() {
    if (reduced || !("IntersectionObserver" in window)) { queue.forEach(function (q) { q[1](); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        queue.forEach(function (q) { if (q[0] === en.target) q[1](); });
      });
    }, { threshold: 0.25 });
    queue.forEach(function (q) { io.observe(q[0]); });
  }

  var styleOrder = ["v", "p", "k"].sort(function (a, b) { return r.style[b] - r.style[a]; });
  /* the style the page speaks to: one style, or a blend of the two strongest (key in v, p, k order) */
  var blendKey = ["v", "p", "k"].filter(function (k) { return k === styleOrder[0] || k === styleOrder[1]; }).join("");
  var blend = r.confidence === "blended" ? T.blends[blendKey] : null;
  var S1 = T.styles[styleOrder[0]], S2 = T.styles[styleOrder[1]];
  var styleName = blend ? blend.name : S1.name;

  /* one variant per student: seeded by the student and the key, so the same page always reads the same */
  var seed = DhiStore.seed();
  function hash(s) { var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function pick(list, key) { return Array.isArray(list) ? list[hash(seed + "~" + key) % list.length] : list; }
  function styled(text) { return fill(text, { block: T.block[styleOrder[0]], pace: T.pace[styleOrder[0]] }); }
  function answerOf(said) { return said ? said.text : ""; }
  var first = cap(profile.name ? String(profile.name).trim().split(/\s+/)[0] : "");
  var activeFlags = T.flagOrder.filter(function (f) { return r.flags[f] === true; });

  var fullKey = blend ? blendKey : styleOrder[0];          /* v, p, k, or a blend vp / vk / pk */

  /* ---------- 0. soft warning chip ---------- */
  add(root, el("p", "warn span2", T.warnChip));

  /* ---------- 1. header ---------- */
  (function header() {
    var h = el("header", "card head span2");
    var logo = el("img", "logo");
    logo.src = "assets/dhirise-logo-light.png"; logo.alt = "DhiRise"; logo.width = 40; logo.height = 40;
    logo.onerror = function () { logo.onerror = null; logo.src = "assets/dhirise-logo.png"; };
    var d = new Date(check.completedAt);
    var date = isNaN(d) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    var title = el("h1", "title", first ? fill(T.title, { name: first }) : fill(T.title, { name: "Your" }).replace(/^Your's/, "Your"));
    add(h, logo, add(el("div", "head-text"), title,
      el("p", "meta", [profile.class, date].filter(Boolean).join(" · ")),
      el("span", "pill", styleName)));
    add(root, h);
  })();

  /* ---------- 2. Dhi starting score ---------- */
  (function start() {
    var c = card("start", T.startLabel);
    var R = 62, C = 2 * Math.PI * R;
    var svg = S("svg", { viewBox: "0 0 160 160", "aria-hidden": "true" });
    var fg = S("circle", { cx: 80, cy: 80, r: R, "class": "ring-fg", "stroke-dasharray": C, "stroke-dashoffset": C });
    add(svg, S("circle", { cx: 80, cy: 80, r: R, "class": "ring-bg" }), fg);
    var ring = add(el("div", "ring"), svg, counter(r.dhiStart, "ring-num"));
    ring.setAttribute("role", "img");
    ring.setAttribute("aria-label", T.startLabel + " " + r.dhiStart + " out of 100");
    onShow(ring, function () { tween(1200, function (e) { fg.setAttribute("stroke-dashoffset", C * (1 - r.dhiStart / 100 * e)); }); });
    add(c, ring, el("p", "lede", T.startLine));
    add(root, c);
  })();

  /* ---------- 3. KPI 2×2 ---------- */
  (function kpis() {
    var c = card("kpis");
    var grid = el("div", "kpi-grid");
    ["studyReadiness", "emotionalBalance", "focusEnergy", "direction"].forEach(function (k) {
      var v = r.indices[k];
      add(grid, add(el("div", "kpi"),
        el("p", "kpi-name", T.indices[k].name),
        add(el("p", "kpi-val"), counter(v), el("span", "band", T.indices[k].bands[DhiScore.band(v)])),
        bar(v)));
    });
    add(c, grid);
    add(root, c);
  })();

  /* ---------- 4. overview: radar + mind-state donut ---------- */
  (function overview() {
    var c = card("overview span2", T.overviewTitle);
    var wrap = el("div", "overview-grid");

    /* radar */
    var W = 380, H = 300, cx = 190, cy = 150, R = 90, n = Q.AREAS.length;
    var pt = function (i, f) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
    var svg = S("svg", { viewBox: "0 0 " + W + " " + H, "class": "radar", role: "img",
      "aria-label": Q.AREAS.map(function (a) { return T.axes[a] + " " + r.areas[a].score; }).join(", ") });
    [1 / 3, 2 / 3, 1].forEach(function (f) {
      add(svg, S("polygon", { "class": "radar-grid", points: Q.AREAS.map(function (_, i) { return pt(i, f).join(","); }).join(" ") }));
    });
    Q.AREAS.forEach(function (a, i) {
      var p = pt(i, 1), lp = pt(i, 1.22);
      add(svg, S("line", { "class": "radar-axis", x1: cx, y1: cy, x2: p[0], y2: p[1] }));
      var anchor = Math.abs(lp[0] - cx) < 8 ? "middle" : lp[0] > cx ? "start" : "end";
      var t = S("text", { x: lp[0], y: lp[1], "text-anchor": anchor, "class": "radar-label" });
      /* two short lines: split at " & ", else at the first space */
      var name = T.axes[a], amp = name.indexOf(" & "), sp = name.indexOf(" ");
      var lines = amp > 0 ? [name.slice(0, amp + 2), name.slice(amp + 3)] : sp > 0 ? [name.slice(0, sp), name.slice(sp + 1)] : [name];
      var dy0 = lp[1] < cy - 20 ? -(lines.length - 1) * 12 : lp[1] > cy + 20 ? 0 : -(lines.length - 1) * 6;
      lines.forEach(function (ln, j) { var ts = S("tspan", { x: lp[0], dy: j ? 12 : dy0 + 4 }); ts.textContent = ln; add(t, ts); });
      add(svg, t);
    });
    var shape = S("polygon", { "class": "radar-shape", points: Q.AREAS.map(function () { return cx + "," + cy; }).join(" ") });
    add(svg, shape);
    var dots = Q.AREAS.map(function () { var d = S("circle", { "class": "radar-dot", r: 3, cx: cx, cy: cy }); add(svg, d); return d; });
    onShow(svg, function () {
      tween(1100, function (e) {
        shape.setAttribute("points", Q.AREAS.map(function (a, i) { return pt(i, r.areas[a].score / 100 * e).join(","); }).join(" "));
        Q.AREAS.forEach(function (a, i) { var p = pt(i, r.areas[a].score / 100 * e); dots[i].setAttribute("cx", p[0]); dots[i].setAttribute("cy", p[1]); });
      });
    });

    /* donut */
    var keys = ["calm", "restless", "low"], DR = 46, DC = 2 * Math.PI * DR;
    var dsvg = S("svg", { viewBox: "0 0 120 120", "class": "donut", "aria-hidden": "true" });
    add(dsvg, S("circle", { cx: 60, cy: 60, r: DR, "class": "donut-bg" }));
    var segs = keys.map(function (k) {
      var s = S("circle", { cx: 60, cy: 60, r: DR, "class": "seg seg-" + k, "stroke-dasharray": "0 " + DC, "stroke-dashoffset": 0 });
      add(dsvg, s); return s;
    });
    var dominant = keys.slice().sort(function (a, b) { return r.state[b] - r.state[a]; })[0];
    var donut = add(el("div", "donut-wrap"), dsvg, add(el("div", "donut-center"), counter(r.state[dominant], "donut-num"), el("span", "donut-cap", T.states[dominant])));
    donut.setAttribute("role", "img");
    donut.setAttribute("aria-label", keys.map(function (k) { return T.states[k] + " " + r.state[k] + "%"; }).join(", "));
    onShow(donut, function () {
      tween(1100, function (e) {
        var at = 0;
        keys.forEach(function (k, i) {
          var len = DC * r.state[k] / 100 * e;
          segs[i].setAttribute("stroke-dasharray", len + " " + (DC - len));
          segs[i].setAttribute("stroke-dashoffset", -at);
          at += len;
        });
      });
    });
    var legend = el("ul", "legend");
    keys.forEach(function (k) { add(legend, add(el("li"), el("i", "dot dot-" + k), el("span", null, T.states[k]), el("b", null, r.state[k] + "%"))); });

    add(wrap, add(el("div", "radar-box"), svg),
      add(el("div", "state-box"), donut, legend, el("p", "note", fill(pick(T.stateLine[dominant], "state"), { pct: r.state[dominant] }))));
    add(c, wrap);
    add(root, c);
  })();

  /* ---------- 5. learning style ---------- */
  (function style() {
    var c = card("style", T.styleTitle);
    var list = el("ul", "lines");
    /* a blend takes two how-you-learn lines from the stronger style and one from the other */
    var lines = blend ? S1.learn.slice(0, 2).concat(S2.learn[hash(seed + "~learn") % S2.learn.length]) : S1.learn;
    lines.forEach(function (ln) { add(list, el("li", null, ln)); });
    add(c, el("p", "big", styleName),
      el("p", "lede headline", blend ? blend.headline : S1.headline),
      list,
      add(el("p", "row-meta"), el("span", "tag", T.confidence[r.confidence]), el("span", null, fill(T.peersLine, { pct: S1.peers }))));
    add(root, c);
  })();

  /* ---------- 6. what's working / next to grow ---------- */
  (function areas() {
    /* the words for one area at its band, with the student's own answer in "what we noticed" */
    function words(item) {
      var a = (T.areas[item.area] || {})[item.band] || {};
      return { title: a.title || "", matters: a.matters || "", step: a.step || "",
        noticed: a.noticed ? fill(pick(a.noticed, item.area), { answer: answerOf(item.said) }) : "" };
    }

    var w = card("working", T.workingTitle);
    r.top.forEach(function (t) {
      var x = words(t);
      add(w, add(el("div", "arow"),
        add(el("p", "arow-head"), el("span", null, T.axes[t.area]), el("b", null, T.bands[t.band])),
        bar(t.score),
        el("p", "atitle", x.title),
        el("p", "said", x.noticed)));
    });
    add(root, w);

    var g = card("grow", T.growTitle);
    r.bottom.forEach(function (b) {
      var x = words(b);
      add(g, add(el("div", "arow"),
        add(el("p", "arow-head"), el("span", null, T.axes[b.area]), el("b", null, T.bands[b.band])),
        bar(b.score),
        el("p", "atitle", x.title),
        add(el("p", "kv"), el("span", "k", T.noticedLabel), el("span", null, x.noticed)),
        add(el("p", "kv"), el("span", "k", T.mattersLabel), el("span", null, x.matters)),
        add(el("p", "kv"), el("span", "k", T.stepLabel), el("span", null, x.step))));
    });
    add(root, g);
  })();

  /* ---------- 7. gentle signals (only if any; max 2) ---------- */
  if (activeFlags.length) (function signals() {
    var c = card("signals span2", T.signalsTitle);
    activeFlags.slice(0, 2).forEach(function (f) { add(c, add(el("p", "signal"), el("i", "leafdot"), el("span", null, pick(T.flags[f], f)))); });
    add(root, c);
  })();

  /* ---------- 8. study blueprint ---------- */
  (function blueprint() {
    /* a blend takes revision and notes from the second style; the rest from the stronger one */
    var from = { bestTime: S1, session: S1, revision: blend ? S2 : S1, notes: blend ? S2 : S1, exam: S1 };
    var c = card("blueprint", T.blueprintTitle);
    var dl = el("dl", "bp");
    ["bestTime", "session", "revision", "notes", "exam"].forEach(function (k) {
      add(dl, add(el("div", "bp-row"), el("dt", null, T.blueprintLabels[k]), el("dd", null, from[k][k])));
    });
    /* "needs extra care" is the class they said feels heaviest (question 15), with a tip for their style */
    var heavy = r.subject && T.subjects[r.subject.heavy];
    var care = heavy ? [heavy.name, heavy.tips[styleOrder[0]]] : S1.care;
    add(c, dl, add(el("div", "chips"),
      add(el("div", "chip chip-good"), el("span", "chip-k", T.naturalLabel + " · " + S1.natural[0]), el("span", "chip-tip", S1.natural[1])),
      add(el("div", "chip chip-care"), el("span", "chip-k", T.careLabel + " · " + care[0]), el("span", "chip-tip", care[1]))));
    add(root, c);
  })();

  /* ---------- 8b. food, sports & hobbies, careers (style + strongest areas) ---------- */
  var topAreas = r.top.map(function (t) { return t.area; });
  (function food() {
    var f = T.food[fullKey];
    var c = card("food", T.foodTitle);
    function list(label, items, cls) {
      var ul = el("ul", "foods " + cls);
      items.forEach(function (x) { add(ul, el("li", null, x)); });
      return add(el("div", "food-col"), el("p", "food-k", label), ul);
    }
    add(c, add(el("div", "food-grid"), list(T.foodGoodLabel, f.good, "good"), list(T.foodHeavyLabel, f.heavy, "heavy")),
      el("p", "note", T.foodLine));
    add(root, c);
  })();
  (function sports() {
    var picks = T.sports[fullKey].slice(0, 3);
    var extra = topAreas.length && T.areaSports[topAreas[0]];
    picks.push(extra && picks.every(function (p) { return p[0] !== extra[0]; }) ? extra : T.sports[fullKey][3]);
    var c = card("sports", T.sportsTitle);
    var grid = el("div", "chipgrid");
    picks.forEach(function (p) { add(grid, add(el("div", "hchip"), el("span", "hchip-k", p[0]), el("span", "hchip-tip", p[1]))); });
    add(c, grid);
    add(root, c);
  })();
  (function careers() {
    var list = T.careers[fullKey].slice(0, 3);
    topAreas.slice(0, 2).forEach(function (a) { var x = T.areaCareers[a]; if (x && list.indexOf(x) < 0) list.push(x); });
    T.careers[fullKey].slice(3).forEach(function (x) { if (list.length < 5 && list.indexOf(x) < 0) list.push(x); });
    var c = card("careers", T.careersTitle);
    var wrap = el("div", "cchips");
    list.slice(0, 5).forEach(function (x) { add(wrap, el("span", "cchip", x)); });
    add(c, wrap, el("p", "note", T.careersLine));
    add(root, c);
  })();

  /* ---------- 9. 21-day path ---------- */
  (function path() {
    var KEY = "dhirise.path.v1";
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!saved || saved.completedAt !== check.completedAt) saved = { completedAt: check.completedAt, ticks: {} };
    function keep() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} }

    /* the plan for their lowest area; {block} and {pace} follow their style */
    var lowA = r.bottom[0] ? r.bottom[0].area : "routine";
    var plan = T.plan[lowA];
    function weekHead(i) { return fill(T.weekLabel, { n: i + 1 }) + " · " + plan[i].title; }
    var c = card("path", T.pathTitle);
    add(c, add(el("div", "week-head"), el("p", "week-title", weekHead(0)), el("span", "room-pill", "In Dhi · " + plan[0].room)));
    add(c, el("p", "note week-how", T.weekHow[styleOrder[0]]));
    plan[0].actions.map(styled).forEach(function (text, ai) {
      var days = el("div", "days");
      for (var d = 1; d <= 7; d++) (function (d) {
        var id = "a" + ai + "d" + d;
        var b = el("button", "tick", String(d));
        b.type = "button";
        b.setAttribute("aria-label", text + ", " + T.dayLabel + " " + d);
        b.setAttribute("aria-pressed", saved.ticks[id] ? "true" : "false");
        b.addEventListener("click", function () {
          saved.ticks[id] = !saved.ticks[id];
          if (!saved.ticks[id]) delete saved.ticks[id];
          b.setAttribute("aria-pressed", saved.ticks[id] ? "true" : "false");
          keep();
        });
        add(days, b);
      })(d);
      add(c, add(el("div", "action"), el("p", "action-text", text), days));
    });
    [1, 2].forEach(function (i) {
      var detail = el("p", "blur", plan[i].actions.map(styled).join(" · "));
      detail.setAttribute("aria-hidden", "true");
      add(c, add(el("div", "week-locked"),
        add(el("div", "week-head"), el("p", "week-title", weekHead(i)), el("span", "room-pill", "In Dhi · " + plan[i].room)),
        detail));
    });
    add(c, el("p", "note", T.continuesLine));
    add(root, c);
  })();

  /* ---------- 10. your Dhi rooms ---------- */
  var ICONS = {
    "Home": "M4 11l8-7 8 7v9h-5v-6H9v6H4z",
    "Exams": "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
    "Meal Tracker": "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16zM12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
    "Mood Tracker": "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5h.01M15 9.5h.01",
    "Habit Tracker": "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 12.5l2.7 2.7L16.5 9.5",
    "Modules": "M4 6h16v12H4zM10.5 9.5l4 2.5-4 2.5z",
    "DHI desk": "M4 5h16v11H10l-5 4v-4H4z",
    "Study hour": "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5V12l3 2",
    "Counseling": "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
    "Blog": "M5 19l1-4L16 5l3 3L9 18zM14 7l3 3",
    "Progress": "M4 20h16M7 20v-6M12 20V8M17 20v-9"
  };
  (function rooms() {
    var used = [], rows = [];
    function pick(choices) {
      for (var i = 0; i < choices.length; i++) if (used.indexOf(choices[i][0]) < 0) { used.push(choices[i][0]); return choices[i]; }
      return null;
    }
    r.bottom.forEach(function (b) { var p = pick(T.areaRooms[b.area] || []); if (p) rows.push(p); });
    var extra = activeFlags.length ? pick(T.flagRooms[activeFlags[0]] || []) : null;
    if (!extra) extra = pick([T.styleRooms[r.styleKey]]);
    if (extra) rows.push(extra);

    var c = card("rooms", T.roomsTitle);
    rows.slice(0, 3).forEach(function (row) {
      var svg = S("svg", { viewBox: "0 0 24 24", "class": "room-icon", "aria-hidden": "true" });
      add(svg, S("path", { d: ICONS[row[0]] || ICONS.Home }));
      add(c, add(el("div", "room"), svg, add(el("div", "room-text"), el("p", "room-name", row[0]), el("p", "room-line", row[1]))));
    });
    add(root, c);
  })();

  /* ---------- 11. join ---------- */
  (function join() {
    var cfg = window.DHI_FUNNEL || {};
    var lead = null;
    try { lead = JSON.parse(localStorage.getItem("dhirise.lead.v1")); } catch (e) {}
    var l = lead && lead.completedAt === check.completedAt ? lead.lead : null;
    var joined = !!(l && l.phone && l.wantsCommunity);
    var c = card("join", T.joinTitle);
    add(c, el("p", "lede", T.joinLine));
    if (joined) {
      add(c, el("p", "joined", fill(T.joinedLine, { last4: String(l.phone).slice(-4) })));
      if (cfg.whatsappInvite) { var g = el("a", "btn-ghost", T.openGroup); g.href = cfg.whatsappInvite; g.target = "_blank"; g.rel = "noopener"; add(c, g); }
    } else if (cfg.whatsappInvite) {
      var a = el("a", "btn-gold", T.joinButton); a.href = cfg.whatsappInvite; a.target = "_blank"; a.rel = "noopener"; add(c, a);
    } else {
      add(c, el("p", "soon", T.joinSoon));
    }
    var share = el("button", "btn-ghost", T.shareButton);
    share.type = "button";
    var status = el("p", "share-status");
    status.setAttribute("aria-live", "polite");
    share.addEventListener("click", function () {
      var url = new URL("landing.html", location.href).href;
      if (navigator.share) { navigator.share({ title: "DhiRise", text: T.shareText, url: url }).catch(function () {}); return; }
      var done = function () { status.textContent = T.shareCopied; setTimeout(function () { status.textContent = ""; }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(T.shareText + " " + url).then(done, function () {});
    });
    add(c, share, status);
    add(root, c);
  })();

  /* ---------- 11b. feedback: stars, a note, optional share; saved locally and POSTed to feedbackEndpoint ---------- */
  (function feedback() {
    var KEY = "dhirise.reportFeedback.v1";
    var cfg = window.DHI_FUNNEL || {};
    var c = card("feedback span2", T.feedbackTitle);
    var prior = null;
    try { prior = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    var thanks = el("p", "thanks", T.feedbackThanks);
    thanks.setAttribute("aria-live", "polite");
    if (prior && prior.completedAt === check.completedAt) { add(c, thanks); add(root, c); return; }

    var rating = 0;
    var stars = el("div", "stars");
    stars.setAttribute("role", "radiogroup");
    stars.setAttribute("aria-label", T.feedbackAsk);
    var starBtns = [1, 2, 3, 4, 5].map(function (n) {
      var b = el("button", "star", "★");
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", "false");
      b.setAttribute("aria-label", fill(T.feedbackStar, { n: n }));
      b.addEventListener("click", function () { rating = n; paint(); hint.textContent = ""; });
      add(stars, b);
      return b;
    });
    function paint() { starBtns.forEach(function (b, i) { b.classList.toggle("on", i < rating); b.setAttribute("aria-checked", i + 1 === rating ? "true" : "false"); }); }
    var text = el("textarea", "fb-text");
    text.rows = 4; text.maxLength = 1000; text.placeholder = T.feedbackPlaceholder;
    text.setAttribute("aria-label", T.feedbackPlaceholder);
    var share = el("input"); share.type = "checkbox"; share.id = "fbShare";
    var shareLabel = el("label", null, T.feedbackShare); shareLabel.htmlFor = "fbShare";
    var hint = el("p", "fb-hint"); hint.setAttribute("aria-live", "polite");
    var submit = el("button", "btn-gold", T.feedbackSubmit); submit.type = "button";

    submit.addEventListener("click", function () {
      if (!rating) { hint.textContent = T.feedbackNeedStars; starBtns[0].focus(); return; }
      var lead = null;
      try { lead = JSON.parse(localStorage.getItem("dhirise.lead.v1")); } catch (e) {}
      var l = lead && lead.completedAt === check.completedAt ? lead.lead : null;
      var payload = { type: "feedback", rating: rating, text: text.value.trim(), canShare: share.checked,
        styleKey: r.styleKey, completedAt: check.completedAt };
      if (l && l.phone) payload.phone = l.phone;
      try { localStorage.setItem(KEY, JSON.stringify({ feedback: payload, completedAt: check.completedAt, sent: !!cfg.feedbackEndpoint, at: new Date().toISOString() })); } catch (e) {}
      if (cfg.feedbackEndpoint) {
        try {
          fetch(cfg.feedbackEndpoint, { method: "POST", mode: "no-cors", keepalive: true,
            headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).catch(function () {});
        } catch (e) {}
      }
      c.textContent = "";
      add(c, el("h2", "eyebrow", T.feedbackTitle), thanks);
    });

    add(c, el("p", "fb-ask", T.feedbackAsk), stars, text,
      add(el("div", "fb-share"), share, shareLabel), hint, submit);
    add(root, c);
  })();

  /* ---------- 12. footer ---------- */
  add(root, el("footer", "foot span2", T.footer));

  startAnimations();
  if (window.dhiriseLeaves) window.dhiriseLeaves({ mobile: 4, wide: 6 });
})();
