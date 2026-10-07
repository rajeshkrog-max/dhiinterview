/* Dhirise · "Who you are". Six cards built only from the answers and score(), words from js/engine/storyText.js.
   Swipe (scroll-snap) or tap Next / Back; the last card's button opens report-student.html. */
(function () {
  "use strict";
  var T = window.DhiStoryText, Q = window.DhiQuestions;
  var REPORT = "report-student.html";
  var check = DhiStore.get();
  if (!check.completedAt) {
    var missing = DhiStore.firstMissing();
    location.replace(missing ? DhiStore.urlFor(missing) : DhiStore.urlFor(Q.TOTAL));
    return;
  }
  var r = DhiScore.score(check.answers, { seed: DhiStore.seed() });
  var a = check.answers;
  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* style key: one style, or the blend of the two strongest (v, p, k order) */
  var order = ["v", "p", "k"].sort(function (x, y) { return r.style[y] - r.style[x]; });
  var key = r.confidence === "blended" ? ["v", "p", "k"].filter(function (k) { return k === order[0] || k === order[1]; }).join("") : order[0];
  var dominant = ["calm", "restless", "low"].sort(function (x, y) { return r.state[y] - r.state[x]; })[0];
  var name = profileName();
  function profileName() {
    var n = check.profile && check.profile.name ? String(check.profile.name).trim().split(/\s+/)[0] : "";
    return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
  }
  function withName(s) { return name ? s.replace("{name}", name) : s.replace(/^\{name\},\s*/, "").replace(/^./, function (c) { return c.toUpperCase(); }); }
  function A(n) { return T.answers[a["q" + n]] || ""; }
  function seeded(list) {
    if (list.length < 2) return list[0];
    var s = DhiStore.seed(), h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return list[h % list.length];
  }
  var topArea = r.top[0] ? r.top[0].area : null;

  var cards = [
    { img: "Q13", title: T.think.titles[key], lines: [T.think.style[key], A(13), A(9)], note: T.think.note },
    { img: "Q4", title: T.feel.titles[dominant], lines: [A(4), A(5), A(12)], note: T.feel.note },
    { img: "Q10", title: T.letIn.titles[a.q11], lines: [A(10), A(11)], note: T.letIn.note },
    { img: "Q7", title: T.drive.titles[key], lines: [A(7), A(8), A(14)], note: T.drive.note },
    { img: "Q17", title: T.dream.titles[a.q17], lines: [A(17), A(18)], note: T.dream.note },
    { img: "Q1", title: T.closing.title, lines: [
        withName(seeded(T.closing.style[key] || T.closing.style[order[0]])),
        topArea ? T.closing.area.replace("{area}", T.closing.areaWords[topArea]) : "",
        T.closing.last], note: T.closing.note }
  ];

  /* backgrounds: assets/report/web/slideN.webp (jpg fallback), one per slide by position, in a fixed stack under the track,
     so the cards swipe while the photos crossfade. Each loads only when its slide (or the one before it) is shown. */
  var bgs = document.createElement("div");
  bgs.className = "bgs"; bgs.setAttribute("aria-hidden", "true");
  var layers = cards.map(function (c, i) {
    var layer = document.createElement("div"); layer.className = "bg";
    var pic = document.createElement("picture");
    var src = document.createElement("source"); src.type = "image/webp";
    var img = document.createElement("img"); img.alt = ""; img.decoding = "async";
    pic.appendChild(src); pic.appendChild(img); layer.appendChild(pic); bgs.appendChild(layer);
    return { el: layer, src: src, img: img, n: i + 1, loaded: false };
  });
  document.body.insertBefore(bgs, document.body.firstChild);
  function load(i) {
    var l = layers[i];
    if (!l || l.loaded) return;
    l.loaded = true;
    l.src.srcset = "assets/report/web/slide" + l.n + ".webp";
    l.img.src = "assets/report/web/slide" + l.n + ".jpg";
  }
  function activate(i) {
    load(i); load(i + 1);                                   /* the next one is ready before the swipe */
    layers.forEach(function (l, j) {
      var on = j === i;
      if (on && !l.el.classList.contains("on")) {
        l.el.classList.remove("kb"); void l.el.offsetWidth; l.el.classList.add("kb");   /* restart the slow zoom */
      }
      l.el.classList.toggle("on", on);
      if (!on) l.el.classList.remove("kb");
    });
  }

  /* build */
  var track = $("track"), dots = $("dots"), slides = [];
  cards.forEach(function (c, i) {
    var s = document.createElement("section");
    s.className = "slide";
    s.setAttribute("aria-roledescription", "slide");
    s.setAttribute("aria-label", (i + 1) + " of " + cards.length);
    var panel = document.createElement("div");
    panel.className = "panel";
    var h = document.createElement("h1"); h.textContent = c.title || ""; panel.appendChild(h);
    c.lines.filter(Boolean).forEach(function (ln) { var p = document.createElement("p"); p.textContent = ln; panel.appendChild(p); });
    var note = document.createElement("p"); note.className = "from"; note.textContent = T.fromLabel + ": " + c.note; panel.appendChild(note);
    s.appendChild(panel);
    track.appendChild(s); slides.push(s);
    dots.appendChild(document.createElement("i"));
  });
  if (name) $("who").textContent = name;

  /* where are we */
  var index = 0;
  function show(i) {
    index = Math.max(0, Math.min(cards.length - 1, i));
    $("step").textContent = T.stepLabel.replace("{i}", index + 1).replace("{n}", cards.length);
    Array.prototype.forEach.call(dots.children, function (d, j) { d.className = j === index ? "on" : ""; });
    $("back").disabled = index === 0;
    $("next").textContent = index === cards.length - 1 ? T.finish : T.next;
    $("next").classList.toggle("wide", index === cards.length - 1);
    slides.forEach(function (s, j) { s.setAttribute("aria-hidden", j === index ? "false" : "true"); });
    activate(index);
  }
  function go(i) {
    i = Math.max(0, Math.min(cards.length - 1, i));
    track.scrollTo({ left: i * track.clientWidth, behavior: reduced ? "auto" : "smooth" });
    show(i);
  }
  var raf = 0;
  track.addEventListener("scroll", function () {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== index) show(i); });
  }, { passive: true });
  window.addEventListener("resize", function () { track.scrollLeft = index * track.clientWidth; });

  $("back").addEventListener("click", function () { go(index - 1); });
  $("next").addEventListener("click", function () { if (index === cards.length - 1) location.href = REPORT; else go(index + 1); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  });

  show(0);
  if (window.dhiriseLeaves) window.dhiriseLeaves({ mobile: 5, wide: 8 });
})();
