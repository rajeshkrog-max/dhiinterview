/* DhiRise · the share flow (spec 0010). Hangs one global on window: DhiShare. Needs loaded first: js/engine/shareText.js, and DhiSession
   (src/lib/session.ts). js/card.js binds it (the three buttons under the Founding Card) and js/report-student.js calls DhiShare.go("any")
   from the report's own Share button, so both use ONE flow (AC-10).
   What a tap does (the words are in js/engine/shareText.js, the notice words are the consent text in convex/consentText.ts):
     - the link feature off (DHI_FUNNEL.publicShare is not true), or the check not finished: the picture and the landing address, as before
       (AC-16, AC-17), no notice and no Stop sharing line
     - the link is on: share the Founding Card story picture with a text that holds the public link, at once, in the tap (AC-1). Instagram
       also copies the link. The tap also moves the end date, in the background (AC-6). Where files cannot be shared (a computer),
       WhatsApp and Facebook open their links with the public link in them, and Instagram saves the picture and opens a dialog with a QR
       code that opens the student's own report on their phone (AC-2)
     - not agreed yet: the notice dialog first, with a tick for under 18s; "Share" records it and makes the link, "Not now" records nothing;
       the first tap is used up by the dialog, so the student taps again (AC-3)
     - agreed but no live link (ended, or stopped): the link is made, then the student taps again
     - the link cannot be made (offline, rate limit, server): the picture is still shared with the landing address, and a line says so (AC-9)
   The Stop sharing line (AC-5, AC-18) sits under the share row while a link is on. Nothing here reaches localStorage; the link lives in
   DhiSession's memory. The QR maker (js/vendor/qrcode-generator.2.0.4.min.js) is loaded only when that dialog opens. ES5 style. */
(function () {
  "use strict";
  var T = window.DhiShareText;
  var B = null;                                   /* what card.js bound: { nets, story, base, style, download, toast, busy, controlParent } */
  var canFiles = false;
  var ctl = null, confirming = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function fill(str, vars) { return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }); }
  function S() { return window.DhiSession && window.DhiSession.share; }
  function landing() { return new URL("landing.html", location.href).href; }
  function netOf(id) {
    for (var i = 0; i < B.nets.length; i++) if (B.nets[i].id === id) return B.nets[i];
    return { id: "any", label: "Share", node: null };
  }

  /* ---------- clipboard ---------- */
  function legacyCopy(text) {
    try {
      var t = el("textarea");
      t.value = text; t.setAttribute("readonly", "");
      t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(t);
      return !!ok;
    } catch (e) { return false; }
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  /* ---------- a small modal: focus goes in, Tab stays in, Esc and a tap outside close it, focus goes back ---------- */
  function modal(title, build) {
    var opener = document.activeElement;
    var ov = el("div", "sh-ov");
    var dlg = el("div", "sh-dlg");
    var h = el("h2", "sh-title", title);
    h.id = "shTitle" + Math.floor(Math.random() * 1e6);
    dlg.setAttribute("role", "dialog");
    dlg.setAttribute("aria-modal", "true");
    dlg.setAttribute("aria-labelledby", h.id);
    dlg.tabIndex = -1;
    add(dlg, h);
    add(ov, dlg);
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.classList.remove("sh-lock");
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      if (opener && opener.focus) { try { opener.focus(); } catch (e) {} }
    }
    function focusables() {
      return Array.prototype.filter.call(dlg.querySelectorAll("button, a[href], input, [tabindex]:not([tabindex='-1'])"), function (n) { return !n.disabled && !n.hidden; });
    }
    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); return; }
      if (e.key !== "Tab") return;
      var f = focusables();
      if (!f.length) { e.preventDefault(); return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey, true);
    document.documentElement.classList.add("sh-lock");
    document.body.appendChild(ov);
    build(dlg, close);
    var f0 = focusables()[0];
    (f0 || dlg).focus();
    return { close: close, dlg: dlg };
  }

  /* ---------- the notice before the first link (AC-3) ---------- */
  function showNotice(n) {
    var S0 = S(), minor = S0.isMinor();
    modal(T.noticeTitle, function (dlg, close) {
      S0.notice.lines.forEach(function (line) { add(dlg, el("p", "sh-text", line)); });
      var tick = null;
      if (minor) {
        var label = el("label", "sh-tick");
        tick = el("input"); tick.type = "checkbox";
        add(label, tick, el("span", null, S0.notice.tick));
        add(dlg, label);
      }
      var msg = el("p", "sh-msg");
      msg.setAttribute("role", "alert");
      var go = el("button", "btn-gold sh-btn", T.noticeShare); go.type = "button";
      var no = el("button", "btn-ghost sh-btn", T.noticeNotNow); no.type = "button";
      no.addEventListener("click", close);                              /* Not now: nothing is made and nothing is recorded */
      go.addEventListener("click", function () {
        if (go.getAttribute("aria-busy")) return;
        if (minor && !tick.checked) { msg.textContent = T.noticeNeedTick; tick.focus(); return; }
        msg.textContent = "";
        go.setAttribute("aria-busy", "true");
        S0.make({ agreed: true, guardianTick: minor && tick.checked }).then(function (res) {
          go.removeAttribute("aria-busy");
          if (res.ok) { close(); refreshHrefs(); B.toast(fill(n.id === "any" ? T.readyAny : T.ready, { net: n.label })); return; }
          msg.textContent = res.code === "needs_guardian" ? T.noticeNeedTick : res.code === "consent_text_changed" ? T.consentChanged : T.noticeFailed;
        });
      });
      add(dlg, msg, add(el("div", "sh-act"), go, no));
    });
  }

  /* ---------- the Instagram dialog on a computer (AC-2) ---------- */
  var qrLoad = null;
  function loadQr() {
    if (window.qrcode) return Promise.resolve(true);
    if (!qrLoad) qrLoad = new Promise(function (ok) {
      var s = document.createElement("script");
      s.src = "js/vendor/qrcode-generator.2.0.4.min.js";
      s.onload = function () { ok(!!window.qrcode); };
      s.onerror = function () { qrLoad = null; ok(false); };
      document.head.appendChild(s);
    });
    return qrLoad;
  }
  function showQr() {
    var address = new URL("report-student.html", location.href).href;     /* the student's own report: the phone signs in, and its share sheet works */
    loadQr().then(function (loaded) {
      var svg = "";
      if (loaded) { try { var q = window.qrcode(0, "M"); q.addData(address); q.make(); svg = q.createSvgTag({ scalable: true, margin: 2 }); } catch (e) { svg = ""; } }
      modal(T.igTitle, function (dlg, close) {
        add(dlg, el("p", "sh-text", svg ? T.igBody : T.igNoQr));
        if (svg) {
          var box = el("div", "sh-qr");
          box.setAttribute("role", "img");
          box.setAttribute("aria-label", T.igQrLabel);
          box.innerHTML = svg;                                             /* the markup comes from the vendored QR maker, never from the page address */
          add(dlg, box);
        }
        var msg = el("p", "sh-msg");
        msg.setAttribute("role", "status");
        var cp = el("button", "btn-gold sh-btn", T.igCopy); cp.type = "button";
        var cl = el("button", "btn-ghost sh-btn", T.igClose); cl.type = "button";
        cp.addEventListener("click", function () { copy(address).then(function (ok) { msg.textContent = ok ? T.igCopied : T.igCopyFailed; }); });
        cl.addEventListener("click", close);
        add(dlg, msg, add(el("div", "sh-act"), cp, cl));
      });
    });
  }

  /* ---------- sending the picture ---------- */
  function saveStory(n, blob) {
    if (!blob) return;
    B.download(blob, B.base + "_story.png");
    B.toast(n.id === "wa" ? T.toastWa : n.id === "fb" ? T.toastFb : n.id === "ig" ? T.toastIg : T.toastSaved);
  }

  /* One tap's platform action, with `link` the public link or null for the landing address. Where files can be shared this runs in the tap
     itself, so the share sheet keeps its permission; the story picture was drawn ahead of time (js/card-export.js). */
  function act(n, ev, link, resume) {
    var text = fill(link ? T.postReport : T.postCheck, { style: B.style, link: link || landing() });
    var none = Promise.resolve();
    if (n.id === "any" && !canFiles) {
      if (navigator.share) return navigator.share({ title: T.shareTitle, text: text }).catch(function () {});
      return copy(text).then(function (ok) { if (ok) B.toast(T.toastTextCopied); });
    }
    if (canFiles) {
      if (ev) ev.preventDefault();                                          /* the share sheet instead of the link */
      if (!resume && n.node && n.node.getAttribute("aria-busy")) return none;   /* a second tap while it works; `resume`: go() already holds the busy mark */
      if (n.node) B.busy(n.node, true);
      if (n.id === "ig" && link) copy(link);                                /* Instagram ignores text, so the link is copied in the tap */
      return B.story().then(function (blob) {
        if (!blob) return;
        var file = null;
        try { file = new File([blob], B.base + "_story.png", { type: "image/png" }); } catch (err) {}
        if (!file || !navigator.canShare({ files: [file] })) { saveStory(n, blob); return; }
        return navigator.share({ files: [file], title: T.shareTitle, text: text }).then(
          function () { if (n.id === "ig" && link) B.toast(T.toastIgCopied); },
          function (err) { if (!err || err.name !== "AbortError") saveStory(n, blob); }
        );
      }).catch(function () {}).then(function () { if (n.node) B.busy(n.node, false); });
    }
    /* a computer: WhatsApp and Facebook are real links (their address is set now, before the tap's own navigation); the picture is saved alongside */
    if (n.id === "wa") n.node.href = "https://wa.me/?text=" + encodeURIComponent(text);
    if (n.id === "fb") n.node.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(link || landing());
    return B.story().then(function (blob) {
      saveStory(n, blob);
      if (n.id === "ig") showQr();
    }).catch(function () {});
  }

  /* the picture is shared and a line says the link could not be added (AC-9) */
  function fallback(n) {
    return act(n, null, null, true).then(function () { B.toast(T.linkFailed); });
  }

  function refreshHrefs() {
    var s = S(), info = s && s.enabled() ? s.current() : null;
    var text = fill(info && info.url ? T.postReport : T.postCheck, { style: B.style, link: (info && info.url) || landing() });
    B.nets.forEach(function (n) {
      if (n.id === "wa") n.node.href = "https://wa.me/?text=" + encodeURIComponent(text);
      if (n.id === "fb") n.node.href = "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent((info && info.url) || landing());
    });
  }

  function ready(n) { refreshHrefs(); B.toast(fill(n.id === "any" ? T.readyAny : T.ready, { net: n.label })); }

  /* ---------- one tap on WhatsApp, Instagram, Facebook, or the report's own Share button ("any") ---------- */
  function go(id, ev) {
    if (!B) return false;
    var n = netOf(id), s = S();
    var info = s && s.enabled() ? s.current() : null;
    if (!s || !s.enabled()) { act(n, ev, null); return true; }               /* AC-17: as it was before the link feature */
    if (info && !info.ready) { act(n, ev, null); return true; }              /* AC-16: the picture and the landing address only */
    if (info && info.active && info.url) {                                   /* AC-1: at once, in the tap */
      act(n, ev, info.url);
      s.make();                                                              /* AC-6: this tap moves the end date; a failure shows nothing */
      return true;
    }
    if (ev) ev.preventDefault();
    if (n.node && n.node.getAttribute("aria-busy")) return true;
    if (n.node) B.busy(n.node, true);
    (info ? Promise.resolve(info) : s.status()).then(function (cur) {
      if (!cur) return fallback(n);                                          /* could not find out: AC-9 */
      if (!cur.ready) return act(n, null, null, true);
      if (!cur.consented) { showNotice(n); return; }                         /* AC-3 */
      return s.make().then(function (res) {                                  /* agreed, but the last link ended or was stopped */
        if (res.ok) { ready(n); return; }
        if (res.code === "consent_text_changed") { B.toast(T.consentChanged); return; }
        if (res.code === "needs_consent") { showNotice(n); return; }
        return fallback(n);
      });
    }).then(function () { if (n.node) B.busy(n.node, false); });
    return true;
  }

  /* ---------- the Stop sharing line (AC-5, AC-18) ---------- */
  var IN = "Asia/Kolkata";
  function inDay(ms) { return new Date(ms).toLocaleDateString("en-CA", { timeZone: IN }); }
  function inDate(ms) { return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: IN }); }

  function renderControl() {
    if (!ctl) return;
    var s = S(), info = s && s.enabled() ? s.current() : null;
    ctl.textContent = "";
    if (!info || !info.ready || (!info.active && !info.off && info.expiresAt === null)) { ctl.hidden = true; return; }
    ctl.hidden = false;
    if (!info.active) {                                                       /* stopped (by the student or the team) or ended */
      var off = el("p", "sh-ctl-text", T.controlOff);
      off.tabIndex = -1;
      add(ctl, off);
      return;
    }
    if (confirming) {
      var sure = el("p", "sh-ctl-text", T.controlSure);
      var yes = el("button", "sh-ctl-btn sh-ctl-danger", T.controlConfirm); yes.type = "button";
      var keep = el("button", "sh-ctl-btn", T.controlKeep); keep.type = "button";
      yes.addEventListener("click", function () {
        if (yes.getAttribute("aria-busy")) return;
        yes.setAttribute("aria-busy", "true");
        s.stop().then(function (res) {
          confirming = false;
          if (res.ok) { renderControl(); var m = ctl.querySelector(".sh-ctl-text"); if (m) m.focus(); return; }
          renderControl();
          add(ctl, el("p", "sh-msg", T.controlFailed));
          var again = ctl.querySelector(".sh-ctl-btn");
          if (again) again.focus();
        });
      });
      keep.addEventListener("click", function () { confirming = false; renderControl(); var b = ctl.querySelector(".sh-ctl-btn"); if (b) b.focus(); });
      add(ctl, sure, add(el("div", "sh-ctl-row"), yes, keep));
      return;
    }
    var today = info.expiresAt !== null && inDay(info.expiresAt) === inDay(Date.now());
    var line = el("p", "sh-ctl-text", today ? T.controlLastDay : fill(T.controlOn, { date: inDate(info.expiresAt) }));
    var stop = el("button", "sh-ctl-btn", T.controlStop); stop.type = "button";
    stop.addEventListener("click", function () { confirming = true; renderControl(); var b = ctl.querySelector(".sh-ctl-danger"); if (b) b.focus(); });
    add(ctl, line, stop);
  }

  /* ---------- card.js hands over the three buttons ---------- */
  function bind(o) {
    B = o;
    try {
      canFiles = !!(navigator.share && navigator.canShare &&
        navigator.canShare({ files: [new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" })] }));
    } catch (e) { canFiles = false; }
    B.nets.forEach(function (n) { n.node.addEventListener("click", function (e) { go(n.id, e); }); });
    refreshHrefs();
    var s = S();
    if (s && s.enabled() && o.controlParent) {
      ctl = el("div", "sh-ctl");
      ctl.setAttribute("role", "status");
      ctl.setAttribute("aria-live", "polite");
      ctl.hidden = true;
      add(o.controlParent, ctl);
      s.onChange(function () { refreshHrefs(); renderControl(); });
      s.status();                                                            /* once per page load; reading never moves the end date */
    }
  }

  window.DhiShare = { bind: bind, go: go };
})();
