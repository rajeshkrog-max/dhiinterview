/* Dhirise · the public report page's boot (spec 0010). The page is served for every /s/<code> address (a rewrite in public/_redirects), so
   it holds no student data: this script reads the link code from the address, fetches the report's data with a plain fetch (no sign in,
   no Convex client, no cookie), stubs the few pieces of the student page that js/report-student.js reads (DhiStore, DhiSession), sets
   window.DHI_SHARED (the public mode flag), loads js/report-student.js, and then adds the Founding Card on top and the banner.
   Needs loaded first: js/funnel-config.js, js/engine/questions.js, js/engine/reportText.js, js/card-export.js, js/card-image.js, js/avatar.js.
   The page shows exactly one of these states (the words are in shared.astro, not here):
     #shReport   the report, with #shBanner above it
     #shGone     the link is off, ended, altered or unknown: one message for all of them, so a visitor learns nothing about which (AC-7)
     #shSlow     too many people opened it in a minute (429)
     #shError    the report could not be loaded (no connection, a server problem): a Try again button
   It sets no cookie and writes no localStorage or sessionStorage (AC-13). The link code stays in the address and in one request header;
   it is never written to the page, the console or an event. No analytics, no sound, no leaves. */
(function () {
  "use strict";
  var root = document.getElementById("report");

  function show(id) {
    ["shGone", "shSlow", "shError"].forEach(function (s) { document.getElementById(s).hidden = s !== id; });
    document.getElementById("shBanner").hidden = true;
    root.textContent = "";
    document.body.setAttribute("data-state", id.replace(/^sh/, "").toLowerCase());
  }

  var retry = document.getElementById("shRetry");
  if (retry) retry.addEventListener("click", function () { location.reload(); });

  /* /s/<code>, with or without a last slash. The code is dots, letters, digits, dashes and underscores. */
  var match = /^\/s\/([A-Za-z0-9._-]{1,120})\/?$/.exec(location.pathname);
  if (!match) { show("shGone"); return; }
  var code = match[1];

  var T = window.DhiReportText;
  if (!T || !window.DhiQuestions || !window.DhiCardImage) { show("shError"); return; }

  document.body.setAttribute("data-state", "loading");
  fetch("/api/shared/payload", { headers: { "x-share-token": code }, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer" })
    .then(function (res) {
      if (res.status === 404) { show("shGone"); return null; }
      if (res.status === 429) { show("shSlow"); return null; }
      if (!res.ok) throw new Error("payload");
      return res.json();
    })
    .then(function (data) { if (data) start(data); })
    .catch(function () { show("shError"); });

  function start(data) {
    if (!data || !data.result || !data.profile || !data.completedAt) { show("shError"); return; }

    /* the report page reads the check and the result from these two; nothing is saved and nothing is marked as seen */
    var check = { completedAt: data.completedAt, profile: data.profile, seed: data.seed, feedbackSavedAt: null, answers: {} };
    window.DhiStore = {
      get: function () { return check; },
      seed: function () { return data.seed; },
      requireLead: function () { return true; },
      firstMissing: function () { return 0; },
      urlFor: function () { return ""; }
    };
    window.DhiSession = {
      result: function () { return Promise.resolve(data.result); },
      markReportSeen: function () { return Promise.resolve(); }
    };
    window.DHI_SHARED = { drawn: function () { afterDrawn(data); } };

    var s = document.createElement("script");
    s.src = "js/report-student.js";
    s.onerror = function () { show("shError"); };
    document.head.appendChild(s);
  }

  /* The banner, then the Founding Card on top of the report. A card that cannot be made leaves the report as it is: the report is the
     point, the card is a nicety. */
  function afterDrawn(data) {
    var first = String(data.profile.name || "").trim().split(/\s+/)[0] || "";
    var banner = document.getElementById("shBanner");
    var line = document.getElementById("shBannerText");
    line.textContent = first ? line.getAttribute("data-named").replace("{name}", first) : line.getAttribute("data-unnamed");
    banner.hidden = false;
    document.body.setAttribute("data-state", "report");

    DhiCardImage.forData(data).then(function (card) {
      card.alt = first ? first + "’s DhiRise Founding Card" : "A DhiRise Founding Card";
      var wrap = document.createElement("section");
      wrap.className = "card fc-copy span2";
      wrap.setAttribute("aria-label", card.alt);
      wrap.appendChild(card);
      root.insertBefore(wrap, root.firstChild);
    }).catch(function () {});
  }
})();
