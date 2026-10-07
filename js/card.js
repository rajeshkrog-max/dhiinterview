/* DhiRise · the Founding Card, at the top of report-student.html (css/card.css), built from assets/cards/card-mockup (1).html:
   ivory card, colour window with the owl breaking out of it, the style tag, the first name, a gold rule,
   the community line and the Founding Batch seal. Blends use the main style.
   It enters as the card back and flips (flip.mp3 unless the music is muted), with a subtle shine and a 6° tilt;
   reduced motion shows the front with none of these.
   "Save card" downloads the card PNG; "Share to Instagram" shares the story PNG (or downloads it with a hint).
   Both are drawn by js/card-export.js, ahead of time, so the share keeps the tap's permission.
   The founding ID is not printed; it stays in storage and the lead (js/engine/identity.js). */
(function () {
  "use strict";
  var root = document.getElementById("report");
  if (!root || !window.DhiStore || !window.DhiIdentity) return;
  var check = DhiStore.get();
  if (!check.completedAt) return;
  var r = DhiScore.score(check.answers, { seed: DhiStore.seed() });
  var profile = check.profile || {};
  var cfg = window.DHI_FUNNEL || {};
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DIR = "assets/cards/";

  /* style → owl, tag, colour; sink = how far the owl's foot sits below the window edge (from the mockup) */
  var STYLES = {
    builder:  { tag: "THE STEADY BUILDER",    c: "#b5452f", sink: 0.03 },
    achiever: { tag: "THE FOCUSED ACHIEVER",  c: "#3d7a3a", sink: 0.04 },
    explorer: { tag: "THE CREATIVE EXPLORER", c: "#2f5f9e", sink: 0.04 }
  };
  var key = DhiIdentity.theme(r).key, S = STYLES[key];

  /* the window's gradient, as the mockup's color-mix(): 55% style + #fff8e6, 85% style + #10122a */
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var ch = function (s) { return Math.round(((x >> s) & 255) * t + ((y >> s) & 255) * (1 - t)); };
    return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  var winA = mix(S.c, "#fff8e6", 0.55), winB = mix(S.c, "#10122a", 0.85);

  var first = String(profile.name || "").trim().split(/\s+/)[0] || "";
  /* Title Case for the community line ("Rana", "Mary-Anne"); the big NAME uses caps. The export gets the same value. */
  first = first ? first.toLowerCase().replace(/(^|[-'’])(\S)/g, function (m, p, ch) { return p + ch.toUpperCase(); }) : "Student";
  var shareUrl = String(cfg.shareUrl || "");
  var shareShown = shareUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function img(src, cls, alt) { var i = el("img", cls); i.src = src; i.alt = alt || ""; i.decoding = "async"; i.draggable = false; return i; }

  /* ---------- the card ---------- */
  var wrap = el("section", "fc-wrap span2");
  wrap.setAttribute("aria-label", "Your DhiRise Founding Card");
  var card = el("div", "fc fc-" + key);
  card.style.setProperty("--c", S.c);
  card.style.setProperty("--win-a", winA);
  card.style.setProperty("--win-b", winB);
  card.style.setProperty("--sink", S.sink * 100 + "%");
  card.setAttribute("role", "img");
  card.setAttribute("aria-label", "DhiRise Founding Card: " + first + ", " + S.tag.toLowerCase().replace(/(^|\s)\w/g, function (m) { return m.toUpperCase(); }) +
    ". " + first + " completed the DhiRise Mind & Study Check and took the first step into the DhiRise community. Founding Batch 2026.");
  var tilt = el("div", "fc-tilt"), flip = el("div", "fc-flip");

  var front = el("div", "fc-face fc-front");
  var owl = img(DIR + "owl-" + key + ".webp", "fc-owl");
  var nameEl = el("div", "fc-name", first.toUpperCase());
  var line = el("p", "fc-line");
  add(line, el("b", null, first), document.createTextNode(" completed the DhiRise Mind & Study Check and took the first step into the "),
    el("b", null, "DhiRise community"), document.createTextNode(", for growth in studies, habits and life."));
  var seal = img(DIR + "seal-founding-cut.webp", "fc-seal", "Founding Batch 2026 seal");
  add(front, owl, el("span", "fc-tag", S.tag), nameEl, el("div", "fc-rule"), line, seal, reduced ? null : el("div", "fc-shine"));

  var back = add(el("div", "fc-face fc-back"), img(DIR + "card-back.webp"));
  add(flip, front, back);
  add(tilt, flip);
  add(card, tilt);

  var saveBtn = el("button", "btn-gold", "Save card"), shareBtn = el("button", "btn-ghost", "Share to Instagram");
  saveBtn.type = shareBtn.type = "button";
  saveBtn.id = "cardSave"; shareBtn.id = "cardShare";
  add(wrap, card, add(el("div", "fc-actions"), saveBtn, shareBtn));
  root.insertBefore(wrap, root.firstChild);

  /* the name shrinks until it fits the card's inner width */
  function fit() {
    var w = front.clientWidth - parseFloat(getComputedStyle(front).paddingLeft) * 2;
    if (!w) return;
    var size = card.clientWidth * 34 / 290;
    nameEl.style.fontSize = size + "px";
    while (nameEl.scrollWidth > w && size > 8) { size -= 0.5; nameEl.style.fontSize = size + "px"; }
  }
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener("resize", fit);

  /* entrance: the back first, then the flip once the owl has loaded */
  if (reduced) card.classList.add("front", "still");
  else new Promise(function (ok) { if (owl.complete) ok(); else owl.onload = owl.onerror = function () { ok(); }; }).then(function () {
    setTimeout(function () {
      card.classList.add("front");
      DhiIdentity.sfx(DIR + "flip.mp3", 0.6);
    }, 700);
  });

  /* tilt: follow the pointer (or a drag) up to 6° */
  if (!reduced) {
    var raf = 0;
    card.addEventListener("pointermove", function (e) {
      var b = card.getBoundingClientRect();
      var px = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), py = Math.max(0, Math.min(1, (e.clientY - b.top) / b.height));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        card.classList.add("tilting");
        card.style.setProperty("--ry", ((px - 0.5) * 12).toFixed(2) + "deg");
        card.style.setProperty("--rx", ((0.5 - py) * 12).toFixed(2) + "deg");
      });
    });
    var rest = function () {
      cancelAnimationFrame(raf);
      card.classList.remove("tilting");
      card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg");
    };
    card.addEventListener("pointerleave", rest);
    card.addEventListener("pointercancel", rest);
    card.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse") rest(); });
  }

  /* ---------- Save card / Share to Instagram ---------- */
  if (!window.DhiCardExport) return;
  var ex = DhiCardExport.create({ key: key, c: S.c, winA: winA, winB: winB, sink: S.sink, tag: S.tag, first: first, url: shareShown });
  setTimeout(function () {                                   /* draw both images once the card has settled */
    var warm = function () { ex.card(); ex.story(); };
    if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 3000 }); else warm();
  }, 2200);

  function download(blob, file) {
    var a = el("a"), href = URL.createObjectURL(blob);
    a.href = href; a.download = file; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(href); }, 4000);
  }
  var toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = el("div", "fc-toast"); toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg;
    toastEl.classList.add("on");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 4200);
  }
  function busy(btn, on) { btn.disabled = on; if (on) btn.setAttribute("aria-busy", "true"); else btn.removeAttribute("aria-busy"); }
  var base = "DhiRise_" + (first.replace(/[^A-Za-z0-9]/g, "") || "Student");

  saveBtn.addEventListener("click", function () {
    busy(saveBtn, true);
    ex.card().then(function (blob) { if (blob) download(blob, base + ".png"); })
      .catch(function () {}).then(function () { busy(saveBtn, false); });
  });
  shareBtn.addEventListener("click", function () {
    busy(shareBtn, true);
    var fallback = function (blob) {
      download(blob, base + "_story.png");
      toast("Saved! Open Instagram → Story → choose this image.");
    };
    ex.story().then(function (blob) {
      if (!blob) return;
      var file = null;
      try { file = new File([blob], base + "_story.png", { type: "image/png" }); } catch (e) {}
      if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: "My DhiRise card", text: shareUrl || new URL("landing.html", location.href).href })
          .catch(function (err) { if (!err || err.name !== "AbortError") fallback(blob); });
      }
      fallback(blob);
    }).catch(function () {}).then(function () { busy(shareBtn, false); });
  });
})();
