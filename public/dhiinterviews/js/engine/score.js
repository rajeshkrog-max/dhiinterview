/* Dhirise · scoring. Pure functions, no DOM, no storage. Needs js/engine/questions.js first.
   DhiScore.score(answers, { seed }) → the whole result. answers = { q1: "q1o4", … } (option ids).
   DhiScore.order(n, seed) → the option ids of question n in this student's screen order.
   The seed is checks.seed, made on the server (DhiStore.seed()), so the order is the same on every device. */
(function (root) {
  "use strict";
  var Q = root.DhiQuestions;
  var AREAS = Q.AREAS;
  /* which area counts as "lowest" on a tie (earlier = picked first) */
  var LOW_ORDER = ["emotions", "routine", "drive", "purpose", "connection", "clarity", "expression"];
  var STATE_WEIGHT = { 4: 1.5, 5: 1.5, 11: 1.5, 16: 1.5, 18: 1.5 };

  /* ---------- seeded shuffle ---------- */
  function hash(str) {                                     /* FNV-1a, 32 bit */
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function rng(seed) {                                     /* mulberry32 */
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function order(n, seed) {
    var ids = Q.byN[n].options.map(function (o) { return o.id; });
    var r = rng(hash(String(seed) + "#" + n));
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    return ids;
  }

  /* ---------- helpers ---------- */
  function clamp(x) { return Math.max(0, Math.min(100, x)); }
  function avg(xs) { return xs.reduce(function (s, x) { return s + x; }, 0) / xs.length; }
  /* whole-number percentages that add up to 100 (largest remainder) */
  function percents(obj) {
    var keys = Object.keys(obj), total = keys.reduce(function (s, k) { return s + obj[k]; }, 0), out = {};
    if (!total) { keys.forEach(function (k, i) { out[k] = Math.floor(100 / keys.length) + (i < 100 % keys.length ? 1 : 0); }); return out; }
    var rest = 100, parts = keys.map(function (k) {
      var raw = obj[k] * 100 / total; out[k] = Math.floor(raw); rest -= out[k];
      return { k: k, r: raw - out[k] };
    });
    parts.sort(function (a, b) { return b.r - a.r; });
    for (var i = 0; i < rest; i++) out[parts[i % parts.length].k]++;
    return out;
  }
  function band(x) { return x >= 70 ? "Strong" : x >= 45 ? "Growing" : "Next to grow"; }

  /* answered questions, in order: [{ q, o }] */
  function picks(answers) {
    var out = [];
    Q.list.forEach(function (q) {
      var o = answers && Q.option(answers["q" + q.n]);
      if (o && o.id.indexOf("q" + q.n + "o") === 0) out.push({ q: q, o: o });
    });
    return out;
  }
  function said(p, area) {
    return { q: p.q.n, question: p.q.text, optionId: p.o.id, text: p.o.text, value: p.o.areas[area] };
  }

  /* ---------- the score ---------- */
  function score(answers, opts) {
    opts = opts || {};
    var list = picks(answers);

    /* style: v quick and creative, p sharp and driven, k steady and patient (internal) */
    var st = { v: 0, p: 0, k: 0 };
    list.forEach(function (x) { if (!x.q.profileOnly) { st.v += x.o.style.v; st.p += x.o.style.p; st.k += x.o.style.k; } });
    var style = percents(st);
    var ranked = ["v", "p", "k"].sort(function (a, b) { return style[b] - style[a]; });
    var gap = style[ranked[0]] - style[ranked[1]];
    var confidence = gap >= 15 ? "clear" : gap >= 6 ? "leaning" : "blended";

    /* mind state */
    var sw = { calm: 0, restless: 0, low: 0 };
    list.forEach(function (x) { if (!x.q.profileOnly) sw[x.o.state] += STATE_WEIGHT[x.q.n] || 1; });
    var state = percents(sw);

    /* areas: (sum − min) / (max − min), over the answered questions that touch the area */
    var acc = {};
    AREAS.forEach(function (a) { acc[a] = { sum: 0, min: 0, max: 0, neg: 0, picks: [] }; });
    list.forEach(function (x) {
      x.q.areas.forEach(function (a) {
        var vals = x.q.options.map(function (o) { return o.areas[a]; });
        var v = x.o.areas[a];
        acc[a].sum += v; acc[a].min += Math.min.apply(null, vals); acc[a].max += Math.max.apply(null, vals);
        if (v < 0) acc[a].neg++;
        acc[a].picks.push(x);
      });
    });
    var areas = {};
    AREAS.forEach(function (a) {
      var c = acc[a], s = c.max === c.min ? 50 : Math.round((c.sum - c.min) / (c.max - c.min) * 100);
      areas[a] = { score: s, band: band(s), negatives: c.neg };
    });

    /* top 3 high → low; bottom 2 low → high (ties: more negative answers, then LOW_ORDER), never overlapping */
    var lowFirst = AREAS.slice().sort(function (a, b) {
      return areas[a].score - areas[b].score || areas[b].negatives - areas[a].negatives || LOW_ORDER.indexOf(a) - LOW_ORDER.indexOf(b);
    });
    var highFirst = lowFirst.slice().reverse();
    var top = highFirst.slice(0, 3);
    var bottom = lowFirst.filter(function (a) { return top.indexOf(a) < 0; }).slice(0, 2);
    /* the one answer that moved the area most: highest value for a top area, lowest for a bottom area */
    function mover(a, high) {
      var best = null;
      acc[a].picks.forEach(function (x) {
        var v = x.o.areas[a];
        if (!best || (high ? v > best.o.areas[a] : v < best.o.areas[a])) best = x;
      });
      return best ? said(best, a) : null;
    }
    var topAreas = top.map(function (a) { return { area: a, score: areas[a].score, band: areas[a].band, said: mover(a, true) }; });
    var bottomAreas = bottom.map(function (a) { return { area: a, score: areas[a].score, band: areas[a].band, said: mover(a, false) }; });

    /* indices */
    var A = function (a) { return areas[a].score; };
    var indices = {
      studyReadiness: Math.round(avg([A("routine"), A("drive"), A("expression")])),
      emotionalBalance: Math.round(clamp(avg([A("emotions"), A("connection"), A("purpose")]) - (state.low >= 35 ? 10 : 0))),
      focusEnergy: Math.round(clamp(A("drive") * 0.6 + state.calm * 0.4)),
      direction: Math.round(avg([A("clarity"), A("purpose")]))
    };
    var dhiStart = Math.round(avg([indices.studyReadiness, indices.emotionalBalance, indices.focusEnergy, indices.direction]));

    /* subject profile: the heaviest class (Q15) and the style */
    var q15 = list.filter(function (x) { return x.q.n === 15; })[0];
    var subject = q15 ? { heavy: q15.o.subject, style: ranked[0], key: q15.o.subject + "-" + ranked[0], optionId: q15.o.id } : null;

    /* flags */
    var has = function (f) { return list.some(function (x) { return x.o.flags.indexOf(f) >= 0; }); };
    var flags = {
      keepsFeelingsInside: has("keepsFeelingsInside"),
      lowCareerClarity: has("lowCareerClarity") || A("clarity") < 45,
      heavyExpectations: has("heavyExpectations"),
      selfDoubt: has("selfDoubt"),
      sleepStrain: has("sleepStrain"),
      lowMood: has("lowMood") || state.low >= 35,
      lowConsistency: null
    };
    /* the same screen position picked 12+ times (needs the seed to rebuild each screen's order) */
    if (opts.seed != null) {
      var pos = [0, 0, 0, 0];
      list.forEach(function (x) { var i = order(x.q.n, opts.seed).indexOf(x.o.id); if (i >= 0) pos[i]++; });
      flags.lowConsistency = Math.max.apply(null, pos) >= 12;
    }

    return {
      answered: list.length,
      complete: list.length === Q.TOTAL,
      style: style, styleKey: ranked[0], styleGap: gap, confidence: confidence,
      state: state,
      areas: areas,
      top: topAreas, bottom: bottomAreas,
      lowest: bottom[0] || null,
      indices: indices,
      dhiStart: dhiStart,            /* a starting point, never a rank */
      subject: subject,
      flags: flags
    };
  }

  root.DhiScore = { score: score, order: order, band: band };
})(typeof window !== "undefined" ? window : globalThis);
