/* Dhirise · the question background. Owns the two stacked layers in #qbg and the blur fade between question images.
   DhiQBg.show(n, animate) puts assets/interview bg/Q{n}.png on screen: the first one at once, the next ones are loaded and
   decoded first, then the new image sharpens in over the old one while the old one blurs out (about 0.45 s, 12px).
   The next question's image is loaded quietly ahead (not on data saver or a 2g link). A failed load keeps the old image.
   Reduced motion or no Web Animations: a short plain fade. Needs the #qbg markup in the page; load before js/questions.js. */
(function () {
  "use strict";
  var host = document.getElementById("qbg");
  if (!host) return;
  var layers = host.querySelectorAll("i");
  if (layers.length < 2) return;

  var MS = 450, BLUR = "blur(12px)";
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var front = 0;                      /* index of the layer that is showing */
  var token = 0;                      /* only the latest request may change the screen */
  var shown = 0;                      /* the question whose image is on screen */
  var cache = {};                     /* n -> promise of "loaded"; the Image is kept so the browser keeps it decoded */
  var imgs = {};

  function url(n) { return "assets/interview%20bg/Q" + n + ".png"; }

  function load(n) {
    if (cache[n]) return cache[n];
    var img = imgs[n] = new Image();
    cache[n] = new Promise(function (resolve) {
      img.onload = function () {
        if (img.decode) img.decode().then(function () { resolve(true); }, function () { resolve(true); });   /* a decode error on a loaded image counts as loaded */
        else resolve(true);
      };
      img.onerror = function () { delete cache[n]; delete imgs[n]; resolve(false); };
    });
    img.src = url(n);
    return cache[n];
  }

  function stop(el) {
    if (el.getAnimations) el.getAnimations().forEach(function (a) { a.cancel(); });
  }

  function swap(n, animate) {
    var out = layers[front], inc = layers[1 - front];
    stop(out); stop(inc);
    front = 1 - front;
    inc.style.backgroundImage = 'url("' + url(n) + '")';
    inc.style.zIndex = 2; out.style.zIndex = 1;
    inc.style.opacity = 1; out.style.opacity = 1;
    if (!animate || !inc.animate) { out.style.opacity = 0; return; }
    var opts = { duration: reduced ? 150 : MS, easing: "ease-out" };
    var frames = reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, filter: BLUR, transform: "scale(1.05)" }, { opacity: 1, filter: "blur(0px)", transform: "scale(1)" }];
    inc.animate(frames, opts);
    if (reduced) { setTimeout(function () { if (layers[front] === inc) out.style.opacity = 0; }, opts.duration); return; }
    var a = out.animate([{ filter: "blur(0px)", transform: "scale(1)" }, { filter: BLUR, transform: "scale(1.05)" }], opts);
    a.onfinish = function () { if (layers[front] === inc) out.style.opacity = 0; };   /* the old image stays solid underneath, so nothing dips dark */
  }

  /* quietly load the next image once this one is up; never on data saver or a very slow link */
  function warm(n) {
    var c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return;
    if (n < 1 || n > 18) return;
    var go = function () { load(n); };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 }); else setTimeout(go, 300);
  }

  window.DhiQBg = {
    show: function (n, animate) {
      var t = ++token;
      if (!shown || !animate) {              /* first image: straight onto the screen, the browser paints it when it can */
        shown = n;
        swap(n, false);
        load(n).then(function () { if (t === token) warm(n + 1); });
        return;
      }
      load(n).then(function (ok) {
        if (t !== token || !ok) return;      /* a newer request took over, or the file failed: keep the old image */
        shown = n;
        swap(n, true);
        warm(n + 1);
      });
    }
  };
})();
