/* Dhirise · background music from the landing page through question 18.
   One looped track at a soft volume. Autoplay is tried on load; browsers usually block it, so the student's first
   tap, click, key press or scroll also starts it. The play position is kept in sessionStorage (every second and on
   pagehide), so the next page picks up where this one left off with a quick fade-in.
   A round mute button sits top-right; the choice is kept in localStorage. If the file fails to load, the button hides.
   Q18's Finish calls DhiMusic.finish(go): a 2 s fade-out, then go. Never shows an error. */
(function () {
  "use strict";
  var SRC = "assets/music/hero.mp3", VOL = 0.35;
  var POS = "dhirise.music.pos", MUTED = "dhirise.music.muted";

  function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function sdel(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var audio = new Audio();
  audio.preload = "auto";
  audio.loop = true;
  audio.volume = 0;
  audio.src = SRC;

  var muted = lget(MUTED) === "1", failed = false, finishing = false, fadeRaf = 0;
  var saved = null;
  try { saved = JSON.parse(sget(POS)); } catch (e) {}
  var resuming = !!(saved && saved.t > 0);
  var FADE_IN = resuming ? 500 : 2000;

  /* ---------- volume fades ---------- */
  function fade(to, ms, done) {
    cancelAnimationFrame(fadeRaf);
    var from = audio.volume, start = performance.now();
    (function tick(now) {
      var k = Math.min(1, (now - start) / ms);
      try { audio.volume = from + (to - from) * k; } catch (e) {}
      if (k < 1) fadeRaf = requestAnimationFrame(tick);
      else if (done) done();
    })(start);
  }

  /* ---------- resume where the last page stopped ---------- */
  function seekSaved() {
    if (!resuming) return;
    var t = saved.t + Math.min(10, Math.max(0, (Date.now() - (saved.at || 0)) / 1000));
    if (audio.duration && isFinite(audio.duration)) t = t % audio.duration;
    try { audio.currentTime = t; } catch (e) {}
    resuming = false;
  }
  audio.addEventListener("loadedmetadata", seekSaved);

  function save() {
    if (failed || finishing || !audio.currentTime) return;
    sset(POS, JSON.stringify({ t: audio.currentTime, at: Date.now() }));
  }
  setInterval(function () { if (!audio.paused) save(); }, 1000);
  window.addEventListener("pagehide", save);

  /* ---------- play / pause ---------- */
  function play() {
    if (muted || failed || finishing || !audio.paused) return;
    if (audio.readyState >= 1) seekSaved();
    audio.volume = 0;
    var p;
    try { p = audio.play(); } catch (e) { return; }
    if (p && p.then) p.then(function () { stopWaiting(); fade(VOL, FADE_IN); }, function () {});
    else { stopWaiting(); fade(VOL, FADE_IN); }
  }
  function pause() { save(); cancelAnimationFrame(fadeRaf); audio.pause(); }

  /* the first gesture starts it; listeners stay until playback really begins */
  var GESTURES = ["pointerdown", "touchstart", "click", "keydown", "scroll", "wheel"];
  function onGesture(e) { if (btn && e && btn.contains(e.target)) return; play(); }
  function stopWaiting() { GESTURES.forEach(function (g) { window.removeEventListener(g, onGesture, true); }); }
  GESTURES.forEach(function (g) { window.addEventListener(g, onGesture, { capture: true, passive: true }); });

  /* ---------- mute button ---------- */
  var ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  var OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  var css = document.createElement("style");
  css.textContent =
    ".dhi-music{position:fixed;z-index:15;top:calc(14px + env(safe-area-inset-top));right:calc(16px + env(safe-area-inset-right));" +
    "width:40px;height:40px;padding:0;display:grid;place-items:center;border-radius:50%;cursor:pointer;" +
    "background:rgba(20,17,14,.6);border:1px solid rgba(233,185,92,.45);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}" +
    ".dhi-music svg{width:20px;height:20px;fill:none;stroke:#e9b95c;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}" +
    ".dhi-music:focus-visible{outline:2px solid #fff;outline-offset:3px}" +
    ".dhi-music[hidden]{display:none}" +
    /* question screens: the bar and gold track stop short of the button so the counter and progress stay clear */
    "@media (max-width:899px){html.has-music .qscreen .topbar{margin-right:48px}html.has-music .qscreen .track{margin-right:54px}}";
  document.head.appendChild(css);

  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dhi-music";
  function paint() {
    btn.innerHTML = muted ? OFF : ON;
    btn.setAttribute("aria-label", muted ? "Play music" : "Mute music");
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
  }
  paint();
  btn.addEventListener("click", function () {
    /* unmuted but still blocked: this tap starts the music rather than muting it */
    if (!muted && audio.paused) { play(); return; }
    muted = !muted;
    lset(MUTED, muted ? "1" : "0");
    paint();
    if (muted) pause(); else play();
  });
  function mount() { document.body.appendChild(btn); document.documentElement.classList.add("has-music"); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  /* a missing or broken file: no button, no music, no message */
  audio.addEventListener("error", function () {
    failed = true;
    stopWaiting();
    btn.hidden = true;
    document.documentElement.classList.remove("has-music");
  });

  /* back/forward cache: the page comes back as it was; resume quietly */
  window.addEventListener("pageshow", function (e) { if (e.persisted) { finishing = false; FADE_IN = 500; play(); } });

  /* ---------- Q18 Finish: fade out over 2 s, then leave; done.html and the report have no music ---------- */
  window.DhiMusic = {
    finish: function (go) {
      if (finishing) return;
      finishing = true;
      sdel(POS);
      if (audio.paused || failed) { go(); return; }
      fade(0, 2000, function () { audio.pause(); go(); });
    }
  };

  play();
})();
