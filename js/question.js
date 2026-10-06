/* Dhirise · shared question screen. One engine for every question; each screen passes its own config:
   dhiriseQuestion({ n, tips: {1..4}, load(): choice|null, save(choice), back: url, next: url })
   Choosing an option shows the tip card for 10 seconds (a gold line drains under it); then it drifts away
   and Next unlocks. No auto-advance. Coming back to a screen shows the saved answer still marked. */
(function () {
  "use strict";
  window.dhiriseQuestion = function (cfg) {
    var $ = function (id) { return document.getElementById(id); };
    var READ_MS = 10000, OUT_MS = 700;
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* first name from the landing gate, or "Student" */
    try {
      var g = JSON.parse(localStorage.getItem("dhirise.gate.v1"));
      var first = g && g.name ? String(g.name).trim().split(/\s+/)[0] : "";
      if (first) $("who").textContent = first.charAt(0).toUpperCase() + first.slice(1);
    } catch (e) {}

    var options = $("options"), tip = $("tip"), next = $("next"), panel = $("panel");
    var buttons = Array.prototype.slice.call(options.querySelectorAll("button"));
    var readTimer = 0, outTimer = 0;

    /* centre the tip in the open space between the top bar and the panel */
    function placeTip() {
      var top = document.querySelector(".track").getBoundingClientRect().bottom;
      var bottom = panel.getBoundingClientRect().top;
      var h = tip.offsetHeight || 120;
      tip.style.setProperty("--tip-top", Math.max(top + 12, (top + bottom) / 2 - h / 2) + "px");
    }
    function clearTimers() { clearTimeout(readTimer); clearTimeout(outTimer); readTimer = outTimer = 0; }
    function showTip(choice) {
      clearTimers();
      if (cfg.renderTip) cfg.renderTip($("tipText"), choice); else $("tipText").textContent = cfg.tips[choice];
      tip.classList.remove("enter", "leave", "reading");
      tip.hidden = false;
      placeTip();
      void tip.offsetWidth;                                   /* restart the animations */
      tip.style.setProperty("--read", READ_MS + "ms");
      tip.classList.add("enter", "reading");
      readTimer = setTimeout(hideTip, READ_MS);               /* 10 seconds to read, motion or not */
    }
    function hideTip() {
      readTimer = 0;
      tip.classList.remove("enter");
      if (reduced) { tip.hidden = true; next.disabled = false; return; }
      tip.classList.add("leave");
      outTimer = setTimeout(function () { outTimer = 0; tip.hidden = true; tip.classList.remove("leave", "reading"); next.disabled = false; }, OUT_MS);
    }
    function mark(choice) {
      buttons.forEach(function (b) { b.setAttribute("aria-checked", Number(b.dataset.choice) === choice ? "true" : "false"); });
      options.classList.add("chosen");                        /* the chosen option stays marked; the others dim */
    }
    function choose(btn) {
      var choice = Number(btn.dataset.choice);
      mark(choice);
      next.disabled = true;                                   /* Next waits until the tip has left */
      try { cfg.save(choice); } catch (e) {}
      showTip(choice);
    }

    buttons.forEach(function (b) { b.addEventListener("click", function () { choose(b); }); });
    options.addEventListener("keydown", function (e) {      /* arrow keys move within the radio group */
      var i = buttons.indexOf(document.activeElement); if (i < 0) return;
      var d = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault(); var t = buttons[(i + d + buttons.length) % buttons.length]; t.focus(); choose(t);
    });

    /* returning to this screen: the saved answer is still marked and Next is open (the tip was already read) */
    var saved = null;
    try { saved = cfg.load(); } catch (e) {}
    if (saved >= 1 && saved <= 4) { mark(saved); next.disabled = false; }

    window.addEventListener("resize", function () { if (!tip.hidden) placeTip(); });
    $("back").addEventListener("click", function () { location.href = cfg.back; });
    next.addEventListener("click", function () {
      if (next.disabled) return;
      if (typeof cfg.next === "function") cfg.next(next); else location.href = cfg.next;
    });
    window.addEventListener("pagehide", clearTimers);

    if (window.dhiriseLeaves) window.dhiriseLeaves();        /* the shared leaf layer (js/leaves.js) */
  };
})();
