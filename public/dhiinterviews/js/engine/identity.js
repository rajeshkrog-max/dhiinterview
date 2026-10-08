/* DhiRise · who the card says you are. Shared by the reveal (done.html) and the Founding Card (report-student.html).
   DhiIdentity.theme(r)       → "explorer" | "achiever" | "builder" (a blend uses its main style) + colours.
   DhiIdentity.styleName(r)   → the name the report uses ("The Steady Builder", or a blend's name). Needs js/engine/reportText.js.
   DhiIdentity.foundingId(p)  → "DR-XXXX", made once per student and kept in localStorage "dhirise.founding.v1". */
(function (root) {
  "use strict";
  var THEMES = {
    v: { key: "explorer", glow: "#a68bff", glow2: "#7cc8ff", ink: "rgba(124,104,255,.28)" },   /* violet / sky */
    p: { key: "achiever", glow: "#ff9a4a", glow2: "#f3c45a", ink: "rgba(255,138,61,.26)" },    /* ember / gold */
    k: { key: "builder",  glow: "#3fd69a", glow2: "#8fe6c2", ink: "rgba(47,208,138,.24)" }     /* emerald / jade */
  };
  function ranked(r) { return ["v", "p", "k"].sort(function (a, b) { return r.style[b] - r.style[a]; }); }

  function theme(r) { return THEMES[r.styleKey] || THEMES.k; }

  /* the same rule as report-student.js: a blended result takes the blend's name */
  function styleName(r) {
    var T = root.DhiReportText, o = ranked(r);
    if (!T) return "";
    if (r.confidence === "blended") {
      var bk = ["v", "p", "k"].filter(function (k) { return k === o[0] || k === o[1]; }).join("");
      if (T.blends && T.blends[bk]) return T.blends[bk].name;
    }
    return T.styles[o[0]].name;
  }

  /* DR- + 4 from A–Z / 2–9 without O, 0, I, 1 */
  var KEY = "dhirise.founding.v1", ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function make() {
    var out = "", buf = new Uint32Array(4);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(buf);
    else for (var j = 0; j < 4; j++) buf[j] = Math.floor(Math.random() * 4294967296);
    for (var i = 0; i < 4; i++) out += ABC.charAt(buf[i] % ABC.length);
    return "DR-" + out;
  }
  function foundingId(profile) {
    var name = profile && profile.name ? String(profile.name).trim().toLowerCase() : "";
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (saved && saved.id && saved.name === name) return saved.id;
    var id = make();
    try { localStorage.setItem(KEY, JSON.stringify({ id: id, name: name, at: new Date().toISOString() })); } catch (e) {}
    return id;
  }

  function muted() { try { return localStorage.getItem("dhirise.music.muted") === "1"; } catch (e) { return false; } }
  /* a short sound effect; silently nothing if muted or blocked */
  function sfx(src, vol) {
    if (muted()) return;
    try { var a = new Audio(src); a.volume = vol == null ? 0.6 : vol; var p = a.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }

  root.DhiIdentity = { theme: theme, styleName: styleName, foundingId: foundingId, muted: muted, sfx: sfx };
})(typeof window !== "undefined" ? window : globalThis);
