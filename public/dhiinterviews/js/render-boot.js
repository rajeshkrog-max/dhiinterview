/* Dhirise · the report render page's boot (spec 0006). Opened only by Cloudflare Browser Run, with a short lived signed
   token in the address fragment (#t=...), to draw the report the server turns into the saved PDF copy.
   Needs loaded first: js/funnel-config.js, js/engine/questions.js, js/engine/reportText.js, js/card-export.js.
   It reads the token, fetches the student's data with a plain fetch (no sign in, no Convex client), stubs the few pieces of
   the student page that js/report-student.js reads (DhiStore, DhiSession), sets window.DHI_RENDER (the print flag),
   loads js/report-student.js, adds the Founding Card as an image, and marks #report:
     data-ready="1"  only when the data has loaded, the report has drawn, the report fonts are in and the images are decoded
     data-error="<code>" on any failure, with the page left blank, so the job never prints a half made or wrong report
   No analytics, no sign in, no localStorage, no sound, no leaves. */
(function () {
  "use strict";
  var root = document.getElementById("report");
  var finished = false;

  function fail(code) {
    if (finished) return;
    finished = true;
    root.textContent = "";
    root.removeAttribute("data-ready");
    root.setAttribute("data-error", code);
  }
  function ready() {
    if (finished) return;
    finished = true;
    root.setAttribute("data-ready", "1");
  }
  window.addEventListener("error", function () { fail("script_error"); });
  window.addEventListener("unhandledrejection", function () { fail("script_error"); });

  var match = /^#t=([A-Za-z0-9._-]{1,400})$/.exec(location.hash);
  if (!match) { fail("no_token"); return; }
  var token = match[1];
  try { history.replaceState(null, "", location.pathname); } catch (e) {}      /* the token is not needed again */

  var T = window.DhiReportText;
  if (!T || !window.DhiQuestions) { fail("script_missing"); return; }

  fetch("/api/render/payload", { headers: { "x-render-token": token }, cache: "no-store", credentials: "omit" })
    .then(function (res) { if (!res.ok) throw new Error("payload_" + res.status); return res.json(); })
    .then(start)
    .catch(function (e) { fail(e && /^payload_\d+$/.test(e.message) ? e.message : "payload_failed"); });

  function start(data) {
    /* AC-13: a page build of another report version must never produce a copy stamped with this one */
    if (!data || data.wantedVersion !== T.VERSION) { fail("version_mismatch"); return; }
    if (!data.result || !data.profile || !data.completedAt) { fail("payload_bad"); return; }

    var check = { completedAt: data.completedAt, profile: data.profile, seed: data.seed, feedbackSavedAt: null, answers: {} };
    window.DhiStore = {
      get: function () { return check; },
      seed: function () { return data.seed; },
      requireLead: function () { return true; },
      firstMissing: function () { return 0; },
      urlFor: function () { return ""; }
    };
    window.DhiSession = {
      result: function () { return Promise.resolve(data.result); },
      markReportSeen: function () { return Promise.resolve(); }
    };
    window.DHI_RENDER = { drawn: function () { afterDrawn(data); } };

    var s = document.createElement("script");
    s.src = "js/report-student.js";
    s.onerror = function () { fail("script_missing"); };
    document.head.appendChild(s);
  }

  /* ---------- the Founding Card, as an image (the card, not the story) ---------- */
  /* Mirrors js/card.js (STYLES and mix) and js/engine/identity.js (THEMES): style key → card style. identity.js is not
     loaded here because it would also make and keep a founding id. tests/render-page.test.js fails if these drift. */
  var CARD = {
    v: { key: "explorer", tag: "THE CREATIVE EXPLORER", c: "#2f5f9e", sink: 0.04 },
    p: { key: "achiever", tag: "THE FOCUSED ACHIEVER", c: "#3d7a3a", sink: 0.04 },
    k: { key: "builder", tag: "THE STEADY BUILDER", c: "#b5452f", sink: 0.03 }
  };
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var ch = function (sh) { return Math.round(((x >> sh) & 255) * t + ((y >> sh) & 255) * (1 - t)); };
    return "#" + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  function founding(data) {
    var S = CARD[data.result.styleKey] || CARD.k;
    var first = String(data.profile.name || "").trim().split(/\s+/)[0] || "";
    first = first ? first.toLowerCase().replace(/(^|[-'’])(\S)/g, function (m, p, ch) { return p + ch.toUpperCase(); }) : "Student";
    var shareUrl = String((window.DHI_FUNNEL || {}).shareUrl || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!window.DhiCardExport) return Promise.reject(new Error("card"));
    return DhiCardExport.create({
      key: S.key, c: S.c, winA: mix(S.c, "#fff8e6", 0.55), winB: mix(S.c, "#10122a", 0.85),
      sink: S.sink, tag: S.tag, first: first, url: shareUrl
    }).card().then(function (blob) {
      if (!blob) throw new Error("card");
      var img = new Image();
      img.alt = "Your DhiRise Founding Card";
      img.className = "fc-print";
      img.src = URL.createObjectURL(blob);
      return img.decode().then(function () { return img; });
    });
  }

  /* True when a face of every family is really loaded. (document.fonts.check() says true when no face is declared at all,
     which is exactly what happens if the Google Fonts stylesheet could not be reached.) */
  function fontsLoaded(families) {
    if (!document.fonts || !document.fonts.forEach) return false;
    var got = {};
    document.fonts.forEach(function (face) {
      if (face.status === "loaded") got[String(face.family).replace(/["']/g, "")] = true;
    });
    return families.every(function (f) { return got[f]; });
  }

  function decoded(img) {
    return img.complete && img.naturalWidth ? Promise.resolve() : img.decode();
  }

  function afterDrawn(data) {
    if (finished) return;
    founding(data).then(function (card) {
      var wrap = document.createElement("section");
      wrap.className = "card fc-copy span2";
      wrap.setAttribute("aria-label", "Your DhiRise Founding Card");
      wrap.appendChild(card);
      root.insertBefore(wrap, root.firstChild);

      var logo = root.querySelector("img.logo");
      var fonts = document.fonts ? document.fonts.ready : Promise.resolve();
      return Promise.all([fonts, logo ? decoded(logo) : Promise.resolve()]).then(function () {
        /* the report must be in its own fonts: if Google Fonts could not be reached, say so instead of printing in another face */
        if (!fontsLoaded(["Playfair Display", "Mukta"])) throw new Error("fonts");
        if (!root.querySelector(".card.head")) throw new Error("empty");
        ready();
      });
    }).catch(function (e) { fail(e && e.message === "fonts" ? "fonts_missing" : "render_failed"); });
  }
})();
