/* DhiRise · challenge.html. Five calm sections; this file fills the hero (prize, countdown) and the join section.
   Join: "I agree to the rules" (+ "My parent or guardian agrees" under 18) unlocks the gold "Scratch to join" → DhiApi.joinChallenge,
   then a scratch card (canvas 300×180, brushed-gold foil with an owl watermark) reveals the code at ~55% scratched, with a short sparkle.
   Reduced motion: tap to reveal. Students who already joined see their code and rank straight away.
   All data goes through js/api.js. */
(function () {
  "use strict";
  var C = window.DHI_CHALLENGE, api = window.DhiApi;
  if (!C || !api) return;
  var $ = function (id) { return document.getElementById(id); };
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var END = Date.parse(C.endsAt);

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }

  /* ---------- 1. hero ---------- */
  var prize = $("cpPrize");
  prize.onerror = function () { prize.onerror = null; prize.src = C.prize.imageFallback; };
  prize.src = C.prize.image;
  $("cpPrizeLine").textContent = "Top referrer wins a " + C.prize.title.charAt(0).toLowerCase() + C.prize.title.slice(1);
  var clock = $("cpClock");
  var units = ["days", "hrs", "min"].map(function (u) { var b = el("b", null, "0"); add(clock, add(el("span", "ch-unit"), b, el("small", null, u))); return b; });
  function paintClock() {
    var ms = Math.max(0, END - Date.now());
    units[0].textContent = Math.floor(ms / 86400000);
    units[1].textContent = String(Math.floor(ms / 3600000) % 24).padStart(2, "0");
    units[2].textContent = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
    clock.setAttribute("aria-label", "Ends in " + units[0].textContent + " days, " + units[1].textContent + " hours, " + units[2].textContent + " minutes");
  }
  paintClock();
  setInterval(paintClock, 30000);

  /* ---------- 5. join ---------- */
  var body = $("cpJoinBody");
  var toastEl = null, toastT = 0;
  function toast(msg) {
    if (!toastEl) { toastEl = el("div", "fc-toast"); toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 3200);
  }
  function copy(text, msg) {
    var done = function () { toast(msg); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; }
    fallback();
    function fallback() {
      var t = el("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("Couldn't copy. Select it and copy by hand."); }
      t.remove();
    }
  }

  Promise.all([api.getMe(), api.getMyRank()]).then(function (a) {
    var me = a[0] || {}, rank = a[1] || {};
    if (api.isOver()) return closed();
    if (!me.name) return signedOut();
    if (me.joined) return api.getMyReferral().then(function (ref) { ticket(ref, rank, false); });
    joinForm(me);
  }).catch(function () {});

  function closed() {
    var a = el("a", "cp-link", "See winners →"); a.href = "leaderboard.html";
    add(body, el("p", "cp-note", "The challenge has closed. Thank you for helping us find the Founding Circle."), a);
  }
  function signedOut() {
    var a = el("a", "cp-gold", "Take the DhiRise check"); a.href = "landing.html";
    add(body, el("p", "cp-note", "Take the check first. Then come back to join."), a);
  }

  function joinForm(me) {
    var minor = Number(me.age) > 0 && Number(me.age) < 18;
    var agree = tickRow("cpAgree", "I agree to the rules");
    var parent = minor ? tickRow("cpParent", "My parent or guardian agrees") : null;
    var btn = el("button", "cp-gold", "Scratch to join"); btn.type = "button"; btn.disabled = true;
    var msg = el("p", "cp-msg"); msg.setAttribute("aria-live", "polite");
    function sync() { btn.disabled = !(agree.box.checked && (!parent || parent.box.checked)); }
    agree.box.addEventListener("change", sync);
    if (parent) parent.box.addEventListener("change", sync);
    btn.addEventListener("click", function () {
      if (btn.disabled) return;
      btn.disabled = true; btn.setAttribute("aria-busy", "true");
      api.joinChallenge({ parentConsent: !!(parent && parent.box.checked) }).then(function (res) {
        if (!res || !res.ok) {
          btn.removeAttribute("aria-busy"); sync();
          msg.textContent = res && res.reason === "ended" ? "The challenge has closed." :
            res && res.reason === "parentConsent" ? "Please tick that your parent or guardian agrees." : "Something went wrong. Please try again.";
          return;
        }
        return Promise.all([api.getMyReferral(), api.getMyRank()]).then(function (a) {
          body.textContent = "";
          ticket(a[0], a[1], true);
        });
      }).catch(function () { btn.removeAttribute("aria-busy"); sync(); msg.textContent = "Something went wrong. Please try again."; });
    });
    add(body, agree.row, parent && parent.row, btn, msg);
  }
  function tickRow(id, label) {
    var box = el("input"); box.type = "checkbox"; box.id = id;
    var lab = el("label", null, label); lab.htmlFor = id;
    return { box: box, row: add(el("div", "cp-tick"), box, lab) };
  }

  /* ---------- the ticket: code reveal (scratch or direct), then copy / share / leaderboard ---------- */
  function ticket(ref, rank, scratch) {
    var wrap = el("div", "cp-ticket");
    var reveal = add(el("div", "cp-reveal"),
      el("p", "cp-in", "You're in the race!"),
      el("p", "cp-code", ref.code),
      el("span", "cp-badge", "Early Access"));
    add(wrap, reveal);
    var after = el("div", "cp-after");
    if (scratch) { after.hidden = true; reveal.setAttribute("aria-hidden", "true"); }
    add(body, wrap, after);
    fillAfter(after, ref, rank);
    if (scratch) foil(wrap, function () { reveal.removeAttribute("aria-hidden"); after.hidden = false; });
  }

  function fillAfter(after, ref, rank) {
    if (rank && rank.rank) {
      add(after, el("p", "cp-rank", "Rank #" + rank.rank + " · " + rank.valid + " valid" + (rank.pending ? " · " + rank.pending + " pending" : "")));
    }
    var text = "I joined the DhiRise Founding Circle. Take the check with my code " + ref.code + ": " + ref.link;
    var copyCode = el("button", "cp-ghost", "Copy code"), copyLink = el("button", "cp-ghost", "Copy link");
    copyCode.type = copyLink.type = "button";
    copyCode.addEventListener("click", function () { copy(ref.code, "Code copied"); });
    copyLink.addEventListener("click", function () { copy(ref.link, "Link copied"); });

    var row = el("div", "fc-share cp-share");
    var wa = DhiShareIcons.button("wa", "WhatsApp", "https://wa.me/?text=" + encodeURIComponent(text));
    var ig = DhiShareIcons.button("ig", "Instagram", null);
    var fb = DhiShareIcons.button("fb", "Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(ref.link));
    ig.addEventListener("click", function () {
      if (navigator.share) {
        navigator.share({ title: "DhiRise Founding Circle", text: text }).catch(function (err) {
          if (!err || err.name !== "AbortError") copy(text, "Copied! Paste it in your Instagram story or DM.");
        });
      } else copy(text, "Copied! Paste it in your Instagram story or DM.");
    });
    add(row, wa, ig, fb);

    var board = el("a", "cp-link", "See leaderboard →"); board.href = "leaderboard.html";
    add(after, add(el("div", "cp-copy"), copyCode, copyLink), row, board);
  }

  /* ---------- scratch foil ---------- */
  function foil(wrap, onReveal) {
    var W = 300, H = 180, dpr = Math.min(2, window.devicePixelRatio || 1);
    var cv = el("canvas", "cp-foil");
    cv.width = W * dpr; cv.height = H * dpr;
    cv.tabIndex = 0;
    cv.setAttribute("role", "button");
    cv.setAttribute("aria-label", reduced ? "Tap to reveal your code" : "Scratch to reveal your code, or press Enter");
    wrap.appendChild(cv);
    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    paintFoil(ctx, W, H);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = 34;

    var done = false, drawing = false, last = null, checkT = 0;
    function pos(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * W / b.width, y: (e.clientY - b.top) * H / b.height }; }
    function scratchTo(p) {
      ctx.beginPath();
      if (last) { ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      else { ctx.arc(p.x, p.y, 17, 0, Math.PI * 2); ctx.fill(); }
      last = p;
      if (!checkT) checkT = setTimeout(function () { checkT = 0; if (cleared() >= 0.55) finish(); }, 120);
    }
    function cleared() {
      var data = ctx.getImageData(0, 0, cv.width, cv.height).data, step = 4 * 6, clear = 0, n = 0;
      for (var i = 3; i < data.length; i += step) { n++; if (data[i] === 0) clear++; }
      return n ? clear / n : 0;
    }
    function finish() {
      if (done) return;
      done = true;
      cv.classList.add("gone");
      if (!reduced) sparkle(wrap);
      setTimeout(function () { cv.remove(); }, reduced ? 0 : 450);
      onReveal();
    }
    if (reduced) { cv.addEventListener("click", finish); }
    else {
      cv.addEventListener("pointerdown", function (e) {
        if (done) return;
        drawing = true; last = null;
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
        scratchTo(pos(e));
      });
      cv.addEventListener("pointermove", function (e) { if (drawing && !done) scratchTo(pos(e)); });
      var stop = function () { drawing = false; last = null; };
      cv.addEventListener("pointerup", stop);
      cv.addEventListener("pointercancel", stop);
    }
    cv.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); finish(); } });
    cv.focus({ preventScroll: true });
  }

  /* brushed gold: a diagonal gradient, fine horizontal grain, an owl watermark and "SCRATCH HERE" */
  function paintFoil(ctx, W, H) {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#b8862f"); g.addColorStop(0.35, "#f6d58e"); g.addColorStop(0.6, "#e9b95c"); g.addColorStop(1, "#a9782a");
    ctx.fillStyle = g;
    roundRect(ctx, 0, 0, W, H, 16); ctx.fill();
    ctx.save();
    roundRect(ctx, 0, 0, W, H, 16); ctx.clip();
    for (var y = 0; y < H; y += 1) {                       /* brushed grain */
      var light = (y * 7919) % 3 === 0;
      ctx.strokeStyle = light ? "rgba(255,248,225," + (0.05 + ((y * 37) % 9) / 100) + ")" : "rgba(110,72,12," + (0.03 + ((y * 53) % 7) / 100) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
    }
    var sheen = ctx.createLinearGradient(0, 0, W, 0);       /* a soft sheen band */
    sheen.addColorStop(0.2, "rgba(255,255,255,0)"); sheen.addColorStop(0.45, "rgba(255,255,255,.22)"); sheen.addColorStop(0.7, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H);
    owl(ctx, W / 2, H / 2 - 8, "rgba(90,58,10,.2)");       /* fine owl watermark */
    ctx.fillStyle = "rgba(70,45,8,.55)";
    ctx.font = "700 13px Cinzel, Georgia, serif";
    ctx.textAlign = "center";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
    ctx.fillText(reduced ? "TAP TO REVEAL" : "SCRATCH HERE", W / 2, H - 20);
    ctx.restore();
    ctx.strokeStyle = "rgba(255,240,200,.6)"; ctx.lineWidth = 1.5;
    roundRect(ctx, 6, 6, W - 12, H - 12, 12); ctx.stroke();
  }
  function owl(ctx, x, y, col) {
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.lineJoin = ctx.lineCap = "round";
    ctx.beginPath();                                        /* body with ear tufts */
    ctx.moveTo(x - 30, y - 30); ctx.lineTo(x - 18, y - 22); ctx.quadraticCurveTo(x, y - 30, x + 18, y - 22); ctx.lineTo(x + 30, y - 30);
    ctx.quadraticCurveTo(x + 36, y + 4, x + 22, y + 30); ctx.quadraticCurveTo(x, y + 44, x - 22, y + 30); ctx.quadraticCurveTo(x - 36, y + 4, x - 30, y - 30);
    ctx.stroke();
    [-12, 12].forEach(function (dx) {                       /* eyes */
      ctx.beginPath(); ctx.arc(x + dx, y - 8, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + dx, y - 8, 3, 0, Math.PI * 2); ctx.stroke();
    });
    ctx.beginPath(); ctx.moveTo(x - 3, y + 2); ctx.lineTo(x, y + 8); ctx.lineTo(x + 3, y + 2); ctx.stroke();   /* beak */
    ctx.beginPath(); ctx.moveTo(x - 12, y + 18); ctx.quadraticCurveTo(x, y + 24, x + 12, y + 18); ctx.stroke(); /* breast */
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function sparkle(wrap) {
    for (var i = 0; i < 14; i++) {
      var s = el("i", "cp-spark");
      var a = (i / 14) * Math.PI * 2, d = 70 + (i % 3) * 22;
      s.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
      s.style.setProperty("--dy", Math.round(Math.sin(a) * d * 0.7) + "px");
      s.style.animationDelay = (i % 4) * 40 + "ms";
      wrap.appendChild(s);
    }
    setTimeout(function () { Array.prototype.forEach.call(wrap.querySelectorAll(".cp-spark"), function (n) { n.remove(); }); }, 1100);
  }
})();
