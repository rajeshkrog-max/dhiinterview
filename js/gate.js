/* Dhirise · landing gate. No backend: the Gmail button is a stub that saves who the student is,
   with their consent, in localStorage (dhirise.gate.v1) and opens the check where the student left it. */
(function () {
  "use strict";
  var KEY = "dhirise.gate.v1";
  var $ = function (id) { return document.getElementById(id); };
  var form = $("form"), back = $("back"), btn = $("go");
  var name = $("name"), age = $("age"), cls = $("cls"), consent = $("consent");

  function read() { try { var g = JSON.parse(localStorage.getItem(KEY)); return g && g.name ? g : null; } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (e) { return false; } }
  /* a new student meets Dhi first (meet.html); a returning one resumes the check (localStorage "dhirise.check.v1"):
     first unanswered question, or once finished the teaser (done.html), or the report once they joined or skipped */
  function go() {
    var url = "meet.html";
    try {
      var c = JSON.parse(localStorage.getItem("dhirise.check.v1")), g = read();
      if (c && c.answers && c.profile && g && c.profile.name === g.name && Object.keys(c.answers).length) {
        if (c.completedAt) {
          var lead = JSON.parse(localStorage.getItem("dhirise.lead.v1"));
          url = lead && lead.completedAt === c.completedAt ? "report-student.html" : "done.html";
        }
        else {
          url = "questions.html?q=18";
          for (var n = 1; n <= 18; n++) if (!c.answers["q" + n]) { url = n === 1 ? "question.html" : n === 2 ? "question2.html" : "questions.html?q=" + n; break; }
        }
      }
    } catch (e) {}
    location.href = url;
  }

  /* returning student: "Continue as <name>" / "Not you" */
  var saved = read();
  if (saved) { $("backName").textContent = saved.name; back.hidden = false; form.hidden = true; }
  $("continueAs").addEventListener("click", go);
  $("notYou").addEventListener("click", function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    consent.checked = false; consent.removeAttribute("aria-invalid"); $("consentErr").textContent = "";   /* clear the tick too */
    back.hidden = true; form.hidden = false; syncButton(); name.focus();
  });

  /* field rules */
  var cleanName = function () { return name.value.trim().replace(/\s+/g, " "); };
  var ageOk = function () { var a = Number(age.value); return age.value !== "" && Number.isInteger(a) && a >= 10 && a <= 25; };
  function complete() { return !!cleanName() && ageOk() && !!cls.value && consent.checked; }

  /* the button looks disabled until everything is set, but still takes a click so we can say what's missing */
  function syncButton() { btn.setAttribute("aria-disabled", complete() ? "false" : "true"); }

  function setErr(input, msgEl, msg) {
    $(msgEl).textContent = msg || "";
    if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
    return !msg;
  }
  function check() {
    var ok = true;
    ok = setErr(name, "nameErr", cleanName() ? "" : "Please tell us your name.") && ok;
    ok = setErr(age, "ageErr", age.value === "" ? "Please enter your age." : ageOk() ? "" : "Age should be between 10 and 25.") && ok;
    ok = setErr(cls, "clsErr", cls.value ? "" : "Please choose your class.") && ok;
    ok = setErr(consent, "consentErr", consent.checked ? "" : "Please confirm before you continue.") && ok;
    return ok;
  }

  [name, age, cls, consent].forEach(function (el) {
    el.addEventListener(el === name || el === age ? "input" : "change", function () {
      if (el.getAttribute("aria-invalid")) check();   /* clear an error as soon as it's fixed */
      syncButton();
    });
  });
  syncButton();

  /* ---------- consent sheet ----------
     The box isn't ticked by hand: tapping the row or box opens the sheet; "I agree" ticks it.
     Closes only by the X. "I agree" unlocks once the body has been scrolled to the end. */
  var dim = $("sheetDim"), sheetBody = $("sheetBody"), agree = $("agree"), hint = $("sheetHint");
  var lastFocus = null;
  var CONSENT_TEXT = Array.prototype.map.call(document.querySelectorAll("#consentLines p"), function (p) { return p.textContent.trim(); }).join("\n\n");   /* the full notice, as shown */

  function atEnd() { return sheetBody.scrollTop + sheetBody.clientHeight >= sheetBody.scrollHeight - 4; }
  function syncAgree() {
    var ok = atEnd(), was = agree.getAttribute("aria-disabled") === "false";
    agree.setAttribute("aria-disabled", ok ? "false" : "true");
    hint.hidden = ok;
    if (ok && !was) {                              /* just became active: one gentle pulse (css/landing.css) */
      agree.classList.remove("pulse"); void agree.offsetWidth; agree.classList.add("pulse");
    }
  }
  function openSheet() {
    lastFocus = document.activeElement;
    dim.hidden = false;
    sheetBody.scrollTop = 0;
    syncAgree();                                   /* short text that already fits counts as read */
    $("sheetX").focus({ preventScroll: true });
  }
  function closeSheet() {
    dim.hidden = true;
    var to = lastFocus && document.contains(lastFocus) && !dim.contains(lastFocus) ? lastFocus : consent;
    to.focus({ preventScroll: true });
  }
  sheetBody.addEventListener("scroll", syncAgree, { passive: true });
  window.addEventListener("resize", function () { if (!dim.hidden) syncAgree(); });
  $("sheetX").addEventListener("click", closeSheet);
  agree.addEventListener("click", function () {
    if (agree.getAttribute("aria-disabled") === "true") return;
    consent.checked = true;
    consent.dispatchEvent(new Event("change", { bubbles: true }));   /* updates the button and clears any error */
    closeSheet();
  });
  /* tapping the box or its label opens the sheet instead of ticking; a ticked box can still be unticked */
  consent.addEventListener("click", function (e) {
    if (consent.checked) {                         /* the click just ticked it: undo and ask first */
      e.preventDefault();
      openSheet();
    }
  });
  /* the dim layer never closes the sheet; keep Tab inside it while open */
  dim.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var items = [$("sheetX"), sheetBody, agree];
    var i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus({ preventScroll: true });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!check()) { var bad = form.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    var now = new Date().toISOString();
    write({ name: cleanName(), age: Number(age.value), class: cls.value, provider: "google", at: now, consent: true, consentAt: now, consentText: CONSENT_TEXT });
    go();
  });

  /* keyboard open on phones: size the stage to the visible area and keep the focused field in view */
  var vv = window.visualViewport;
  function fit() { if (vv) document.documentElement.style.setProperty("--vh", vv.height + "px"); }
  if (vv) { vv.addEventListener("resize", fit); fit(); }
  form.addEventListener("focusin", function (e) {
    var t = e.target;
    if (t === consent) return;                     /* returning from the sheet: the form must not move */
    setTimeout(function () { if (t.scrollIntoView) t.scrollIntoView({ block: "nearest" }); }, 250);
  });

  /* ---------- falling leaves ----------
     A few leaves drift down; about half aim for the card and up to 4 settle on its top rim.
     One requestAnimationFrame loop, no timers; paused while the tab is hidden; off for reduced motion. */
  (function leaves() {
    var mq = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq || mq.matches) return;
    var card = $("card");
    var layer = document.createElement("div");
    layer.className = "leaves"; layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    var COLORS = ["#d98a2b", "#c27a1f", "#7f8a3a", "#6d7a33", "#c9a24a", "#d8b45e"];   /* amber, olive, dry gold */
    var MAX_SETTLED = 4, RIM_SLOTS = [0.14, 0.36, 0.62, 0.84];
    var leaves = [], settled = 0, raf = 0, last = 0, nextSpawn = 0;
    var rand = function (a, b) { return a + Math.random() * (b - a); };
    var maxLeaves = function () { return innerWidth >= 900 ? 12 : 7; };

    function svg(color) {
      return '<svg viewBox="0 0 24 24"><path d="M12 1.5C6.5 6 4.2 11.4 6 16.6c1.1 3.1 3.6 5 6 5.9 2.4-.9 4.9-2.8 6-5.9 1.8-5.2-.5-10.6-6-15.1z" fill="' + color +
        '"/><path d="M12 4v18M12 10l-3.2-2.6M12 13.5l3.4-2.8M12 17l-3-2.2" stroke="rgba(60,35,5,.45)" stroke-width="1" fill="none" stroke-linecap="round"/></svg>';
    }
    function freeSlot() {
      var used = leaves.filter(function (l) { return l.state === "settled" || l.target != null; }).map(function (l) { return l.target; });
      var open = RIM_SLOTS.map(function (_, i) { return i; }).filter(function (i) { return used.indexOf(i) < 0; });
      return open.length ? open[Math.floor(Math.random() * open.length)] : null;
    }
    function spawn(now) {
      var size = rand(14, 22), el = document.createElement("div");
      el.className = "leaf"; el.style.width = el.style.height = size + "px";
      el.innerHTML = svg(COLORS[Math.floor(Math.random() * COLORS.length)]);
      layer.appendChild(el);
      var r = card.getBoundingClientRect(), H = innerHeight;
      /* about half aim at the card's rim while there is room; the rest drift past */
      var slot = (settled + pendingAims() < MAX_SETTLED && Math.random() < 0.5 && card.offsetParent) ? freeSlot() : null;
      var endX = slot != null ? r.left + r.width * RIM_SLOTS[slot] : rand(-10, innerWidth + 10);
      var startX = endX + rand(-70, 70);
      leaves.push({ el: el, size: size, state: "fall", target: slot, x0: startX, x1: endX, y: -size - rand(0, 40),
        speed: (H + 80) / rand(9, 16), swayAmp: rand(10, 26), swayFreq: rand(0.5, 1.1), phase: rand(0, 6.28),
        spin: rand(-40, 40), t: 0, total: 0, born: now });
    }
    function pendingAims() { return leaves.filter(function (l) { return l.state === "fall" && l.target != null; }).length; }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      var r = card.getBoundingClientRect(), H = innerHeight, cardShown = !!card.offsetParent;
      var rimY = r.top;

      if (now >= nextSpawn && leaves.length < maxLeaves()) { spawn(now); nextSpawn = now + rand(1400, 4200); }

      for (var i = leaves.length - 1; i >= 0; i--) {
        var l = leaves[i];
        if (l.state === "settled") {
          /* ride the card's top rim, mostly above it, so it never sits on a field or the button */
          var sx = r.left + r.width * RIM_SLOTS[l.target] - l.size / 2, sy = rimY - l.size * 0.7;
          l.el.style.transform = "translate(" + sx + "px," + sy + "px) rotate(" + l.rest + "deg)";
          l.el.style.opacity = cardShown ? "0.8" : "0";
          continue;
        }
        l.t += dt; l.y += l.speed * dt;
        var progress = Math.min(1, Math.max(0, (l.y + l.size) / (H + l.size)));
        var baseX = l.target != null ? r.left + r.width * RIM_SLOTS[l.target] + (l.x0 - l.x1) * (1 - Math.min(1, l.y / Math.max(1, rimY))) : l.x0 + (l.x1 - l.x0) * progress;
        var x = baseX + Math.sin(l.t * l.swayFreq * 2 + l.phase) * l.swayAmp - l.size / 2;
        var rot = Math.sin(l.t * l.swayFreq + l.phase) * 35 + l.spin * l.t * 0.2;

        if (l.target != null && l.y + l.size * 0.3 >= rimY) {
          if (settled < MAX_SETTLED && cardShown) {
            l.state = "settled"; l.rest = rot % 360; settled++;
            l.el.style.transition = "opacity .8s ease";
            continue;
          }
          l.target = null; l.x0 = x + l.size / 2; l.x1 = l.x0 + rand(-60, 60);   /* rim is full: fall on through */
        }
        if (l.y > H + 40) { l.el.remove(); leaves.splice(i, 1); continue; }
        l.el.style.transform = "translate(" + x + "px," + l.y + "px) rotate(" + rot + "deg)";
      }
    }
    function start() { if (!raf) { last = 0; nextSpawn = performance.now() + rand(300, 1500); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else start(); });
    var onMotion = function (e) { if (e.matches) { stop(); layer.remove(); } };
    if (mq.addEventListener) mq.addEventListener("change", onMotion); else if (mq.addListener) mq.addListener(onMotion);
    window.addEventListener("pagehide", stop);
    if (!document.hidden) start();
  })();
})();
