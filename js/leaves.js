/* Dhirise · falling leaves for the question screens. One shared function: call dhiriseLeaves() once per screen.
   Fall-only (nothing settles): leaves drift over the photo, may cross the panel, fall off the bottom and are removed.
   Fixed layer, pointer-events: none, so taps pass through. Paused while the tab is hidden; off for reduced motion. */
(function () {
  "use strict";
  var COLORS = ["#d98a2b", "#c27a1f", "#7f8a3a", "#6d7a33", "#c9a24a", "#d8b45e"];   /* amber, olive, dry gold */
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  function svg(color) {
    return '<svg viewBox="0 0 24 24" style="display:block;width:100%;height:100%"><path d="M12 1.5C6.5 6 4.2 11.4 6 16.6c1.1 3.1 3.6 5 6 5.9 2.4-.9 4.9-2.8 6-5.9 1.8-5.2-.5-10.6-6-15.1z" fill="' + color +
      '"/><path d="M12 4v18M12 10l-3.2-2.6M12 13.5l3.4-2.8M12 17l-3-2.2" stroke="rgba(60,35,5,.45)" stroke-width="1" fill="none" stroke-linecap="round"/></svg>';
  }

  window.dhiriseLeaves = function (opts) {
    opts = opts || {};
    var mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq || mq.matches || document.querySelector(".leaves")) return;   /* reduced motion: no leaves; never two layers */
    var maxMobile = opts.mobile || 6, maxWide = opts.wide || 10;
    var layer = document.createElement("div");
    layer.className = "leaves"; layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    var leaves = [], raf = 0, last = 0, nextSpawn = 0;
    var max = function () { return innerWidth >= 900 ? maxWide : maxMobile; };

    function spawn() {
      var size = rand(14, 22), el = document.createElement("div");
      el.className = "leaf"; el.style.width = el.style.height = size + "px";
      el.innerHTML = svg(COLORS[Math.floor(Math.random() * COLORS.length)]);
      layer.appendChild(el);
      var x0 = rand(-10, innerWidth + 10);
      leaves.push({ el: el, size: size, x0: x0, x1: x0 + rand(-80, 80), y: -size - rand(0, 40),
        speed: (innerHeight + 80) / rand(9, 16), swayAmp: rand(10, 26), swayFreq: rand(0.5, 1.1), phase: rand(0, 6.28), spin: rand(-40, 40), t: 0 });
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (now >= nextSpawn && leaves.length < max()) { spawn(); nextSpawn = now + rand(1400, 4200); }
      var H = innerHeight;
      for (var i = leaves.length - 1; i >= 0; i--) {
        var l = leaves[i];
        l.t += dt; l.y += l.speed * dt;
        if (l.y > H + 40) { l.el.remove(); leaves.splice(i, 1); continue; }   /* off the bottom: gone */
        var p = Math.min(1, Math.max(0, (l.y + l.size) / (H + l.size)));
        var x = l.x0 + (l.x1 - l.x0) * p + Math.sin(l.t * l.swayFreq * 2 + l.phase) * l.swayAmp - l.size / 2;
        var rot = Math.sin(l.t * l.swayFreq + l.phase) * 35 + l.spin * l.t * 0.2;
        l.el.style.transform = "translate(" + x + "px," + l.y + "px) rotate(" + rot + "deg)";
      }
    }
    function start() { if (!raf) { last = 0; nextSpawn = performance.now() + rand(300, 1500); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    var onMotion = function (e) { if (e.matches) { stop(); layer.remove(); leaves = []; } };
    if (mq.addEventListener) mq.addEventListener("change", onMotion); else if (mq.addListener) mq.addListener(onMotion);
    window.addEventListener("pagehide", stop);
    if (!document.hidden) start();
  };
})();
