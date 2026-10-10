/* Dhirise · the Founding Card as one image, for the pages that draw a report from fetched data (spec 0006 and spec 0010).
   Hangs one global on window: DhiCardImage. Needs loaded first: js/funnel-config.js (optional, for the small address on the card),
   js/card-export.js. Used by js/render-boot.js (the saved PDF copy) and js/shared-boot.js (the public report page).
   DhiCardImage.forData(data) → Promise<HTMLImageElement> (class "fc-print", already decoded), for data shaped like the payloads of both
   pages: { result: { styleKey }, profile: { name } }. It rejects if the card could not be made; the caller decides what that means.
   Mirrors js/card.js (STYLES and mix) and js/engine/identity.js (THEMES): style key → card style. identity.js is not loaded on those
   pages because it would also make and keep a founding id. tests/render-boot.test.js fails if these drift. */
(function () {
  "use strict";
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
  function forData(data) {
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
  window.DhiCardImage = { forData: forData };
})();
