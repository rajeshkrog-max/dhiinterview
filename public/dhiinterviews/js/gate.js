/* Dhirise · landing. Google first (spec 0002): the page reads who is here (window.DhiSession, src/lib/session.ts) and
   paints exactly one state: signed out (Google button + short notice), needs details (the form), or signed in
   ("Continue as", "Not you"). Nothing is saved until the form is submitted. Needs js/engine/store.js, js/api.js
   (referral check) and the page guard loaded first; the guard starts this script once the page may run. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var S = window.DhiSession;
  var REF_KEY = "dhirise.ref.v1";
  var CODE_OK = /^[A-Z0-9]{1,8}$/;
  var states = ["stSignedOut", "stBlocked", "form", "back", "stImport", "stUnknown"];
  var form = $("form"), btn = $("go");
  var name = $("name"), age = $("age"), cls = $("cls"), consent = $("consent"), guardian = $("guardian");

  function show(id) { states.forEach(function (s) { $(s).hidden = s !== id; }); }
  function say(el, text, kind) { el.textContent = text || ""; el.hidden = !text; if (kind) el.classList.add("kind"); }
  var params = new URLSearchParams(location.search);

  /* ---------- referral code across the Google trip: kept in localStorage, sent once with the form ---------- */
  function cleanCode(v) { return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
  (function keepRef() {
    var fromUrl = cleanCode(params.get("ref"));
    if (fromUrl) { try { localStorage.setItem(REF_KEY, fromUrl); } catch (e) {} }
  })();
  function storedRef() { try { return cleanCode(localStorage.getItem(REF_KEY)); } catch (e) { return ""; } }

  /* ---------- painting the state ---------- */
  function messageFromReturn() {
    if (params.get("signin") !== "error") return "";
    var why = params.get("error") || "";
    return /access_denied|cancel/i.test(why)
      ? "No problem. You can try again whenever you like."
      : "Google did not let this account in. If you were asked to be a test user, please tell the DhiRise team. You can also try another account.";
  }
  function clearReturnParams() {
    if (!params.has("signin") && !params.has("error")) return;
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }

  function paintSignedOut() {
    if (S.isBlockedBrowser()) { show("stBlocked"); return; }
    show("stSignedOut");
    say($("signMsg"), messageFromReturn(), true);
    if (params.get("test") !== null) $("testBtn").hidden = false;
  }
  function paintForm() {
    show("form");
    if (!name.value) name.value = (S.googleName || "").slice(0, 60);
    var code = storedRef();
    if (code && !$("ref").value) { $("ref").value = code; validateRef(); }
    syncButton();
    try { name.focus({ preventScroll: true }); } catch (e) {}
  }
  function paintBack(displayName) {
    $("backName").textContent = displayName;
    say($("outMsg"), "");
    $("notYou").textContent = "Not you";
    $("notYou").dataset.force = "";
    show("back");
  }
  function paintReady() {
    var check = DhiStore.get();
    var answered = Object.keys(check.answers || {}).length;
    /* answers an earlier version kept only in this browser: asked once, and only when the server has none */
    if (!check.completedAt && answered === 0 && S.oldAnswers()) { show("stImport"); return; }
    paintBack((check.profile && check.profile.name) || "");
  }

  function paint(state) {
    if (state === "ready") paintReady();
    else if (state === "needsProfile") paintForm();
    else if (state === "signedOut") paintSignedOut();
    else if (S.cachedName()) paintBack(S.cachedName());      /* cannot reach the server, but this device knows the student */
    else show("stUnknown");
    clearReturnParams();
    S.reveal();
  }
  S.ready().then(paint);

  /* ---------- signed out ---------- */
  $("google").addEventListener("click", function () {
    $("google").setAttribute("aria-busy", "true");
    S.signInWithGoogle().catch(function () {
      $("google").removeAttribute("aria-busy");
      say($("signMsg"), "We could not start Google sign in. Please try again.", true);
    });
  });
  $("readNotice").addEventListener("click", function () { openSheet(true); });
  $("copyLink").addEventListener("click", function () {
    var done = function (ok) { $("copyNote").textContent = ok ? "Link copied. Paste it into Chrome or Safari." : "Press and hold the address bar to copy the link."; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.origin + location.pathname).then(function () { done(true); }, function () { done(false); });
    else done(false);
  });
  $("testBtn").addEventListener("click", function () {
    var n = params.get("test"), email = n && n !== "1" ? "test.student" + n.replace(/[^a-z0-9]/gi, "") + "@example.com" : "test.student@example.com";
    S.testSignIn(email).then(function (r) {
      if (!r.ok) { say($("signMsg"), "Test sign in refused: " + r.message, true); return; }
      S.ready().then(paint);
    });
  });
  $("tryAgain").addEventListener("click", function () { location.reload(); });

  /* ---------- signed in ---------- */
  $("continueAs").addEventListener("click", function () { location.href = DhiStore.resumeTarget(); });
  $("notYou").addEventListener("click", function () {
    var force = $("notYou").dataset.force === "1";
    S.signOut(force).then(function (r) {
      if (r.ok) { form.reset(); syncButton(); paint("signedOut"); return; }
      if (r.offline) {                             /* the server could not end the session: nothing was cleared */
        say($("outMsg"), "We could not sign you out because we could not reach DhiRise. Please connect and try again.", true);
        return;
      }
      say($("outMsg"), r.unsent + (r.unsent === 1 ? " answer has" : " answers have") + " not been sent yet. If you sign out now, they will be lost.", true);
      $("notYou").textContent = "Sign out anyway"; $("notYou").dataset.force = "1";
    });
  });
  $("importYes").addEventListener("click", function () { S.importOld().then(function () { paintBack(DhiStore.get().profile.name); }); });
  $("importNo").addEventListener("click", function () { S.dismissOld(); paintBack(DhiStore.get().profile.name); });

  /* ---------- field rules ---------- */
  var cleanName = function () { return name.value.trim().replace(/\s+/g, " "); };
  var ageNum = function () { return Number(age.value); };
  var ageOk = function () { return age.value !== "" && Number.isInteger(ageNum()) && ageNum() >= 10 && ageNum() <= 25; };
  var isMinor = function () { return ageOk() && ageNum() < 18; };
  function complete() { return !!cleanName() && ageOk() && !!cls.value && consent.checked && (!isMinor() || guardian.checked); }

  /* the button looks disabled until everything is set, but still takes a click so we can say what's missing */
  function syncButton() {
    $("guardianRow").hidden = !isMinor();
    btn.setAttribute("aria-disabled", complete() ? "false" : "true");
  }
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
    ok = setErr(guardian, "guardianErr", !isMinor() || guardian.checked ? "" : "A parent or guardian needs to be with you and agree.") && ok;
    return ok;
  }
  [name, age, cls, consent, guardian].forEach(function (el) {
    el.addEventListener(el === name || el === age ? "input" : "change", function () {
      if (el.getAttribute("aria-invalid")) check();   /* clear an error as soon as it's fixed */
      $("formErr").textContent = "";
      syncButton();
    });
  });

  /* ---------- consent sheet ----------
     The box isn't ticked by hand: tapping the row or box opens the sheet; "I agree" ticks it.
     Closes only by the X. "I agree" unlocks once the body has been scrolled to the end.
     From "Read the full notice" (signed out) the sheet is read only. */
  var dim = $("sheetDim"), sheetBody = $("sheetBody"), agree = $("agree"), hint = $("sheetHint");
  var lastFocus = null;

  function atEnd() { return sheetBody.scrollTop + sheetBody.clientHeight >= sheetBody.scrollHeight - 4; }
  function syncAgree() {
    var ok = atEnd(), was = agree.getAttribute("aria-disabled") === "false";
    agree.setAttribute("aria-disabled", ok ? "false" : "true");
    hint.hidden = ok;
    if (ok && !was) {                              /* just became active: one gentle pulse (css/landing.css) */
      agree.classList.remove("pulse"); void agree.offsetWidth; agree.classList.add("pulse");
    }
  }
  function openSheet(readOnly) {
    lastFocus = document.activeElement;
    if (readOnly) dim.setAttribute("data-readonly", ""); else dim.removeAttribute("data-readonly");
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
      openSheet(false);
    }
  });
  /* the dim layer never closes the sheet; keep Tab inside it while open */
  dim.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var items = [$("sheetX"), sheetBody].concat(dim.hasAttribute("data-readonly") ? [] : [agree]);
    var i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus({ preventScroll: true });
  });

  /* ---------- submit: creates the student, the consent and the check on the server ---------- */
  var ERRORS = {
    guardian_required: "A parent or guardian needs to be with you and agree.",
    invalid_input: "Something in the form does not look right. Please check your name, age and class.",
    consent_text_changed: "The notice was just updated. Please refresh this page and read it again.",
    account_conflict: "This Google email is already used by another sign in. Please use the Google account you started with.",
    not_signed_in: "Please sign in with Google again.",
    offline: "We could not reach DhiRise. Please check your connection and try again."
  };
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (btn.getAttribute("aria-busy") === "true") return;
    if (!check()) { var bad = form.querySelector('[aria-invalid="true"]'); if (bad) bad.focus(); return; }
    var code = refCode();
    btn.setAttribute("aria-busy", "true"); $("formErr").textContent = "";
    S.createProfile({
      name: cleanName(), age: ageNum(), "class": cls.value, guardianPresent: isMinor() ? guardian.checked : false,
      referralCode: code || undefined
    }).then(function (r) {
      if (!r.ok) {
        btn.removeAttribute("aria-busy");
        if (r.code === "not_signed_in") { paint("signedOut"); return; }
        $("formErr").textContent = ERRORS[r.code] || ERRORS.offline;
        return;
      }
      /* the mock challenge layer notes the referral use (js/api.js); a wrong code never blocks */
      var go = function () { location.href = DhiStore.resumeTarget(); };
      if (!code || !window.DhiApi) { go(); return; }
      DhiApi.recordReferralUse(code).then(go, go);
    });
  });

  /* ---------- referral code (optional) ----------
     Checked on blur: a green tick and "Invited by <name>", or a muted note. Uppercase, letters and digits only, max 8. */
  var ref = $("ref"), refStatus = $("refStatus");
  var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function refCode() { var c = cleanCode(ref.value); return CODE_OK.test(c) ? c : ""; }
  function showRef(ok, text) {
    refStatus.className = "ref-status" + (ok ? " ok" : "");
    refStatus.innerHTML = ok ? TICK : "";
    refStatus.appendChild(document.createTextNode(text));
  }
  var checking = 0;
  function validateRef() {
    var code = refCode(), mine = ++checking;
    if (!code) { refStatus.textContent = ""; return; }
    if (!window.DhiApi) return;
    DhiApi.validateCode(code).then(function (v) {
      if (mine !== checking) return;                         /* an older answer arrived late */
      if (v.ok) showRef(true, "Invited by " + v.referrerFirstName);
      else if (v.reason === "self") showRef(false, "That's your own code. You can still continue.");
      else if (v.reason === "ended") showRef(false, "The challenge has ended. You can still continue.");
      else showRef(false, "Code not found. You can still continue.");
    }, function () { if (mine === checking) refStatus.textContent = ""; });
  }
  ref.addEventListener("input", function () {
    var at = ref.selectionStart, clean = cleanCode(ref.value);
    if (ref.value !== clean) { ref.value = clean; try { ref.setSelectionRange(at, at); } catch (e) {} }
    refStatus.textContent = ""; checking++;
  });
  ref.addEventListener("blur", validateRef);

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
