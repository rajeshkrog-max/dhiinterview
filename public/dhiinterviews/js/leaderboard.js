/* DhiRise · leaderboard.html. Podium (top 3), ranks 4–50, and a sticky card with your rank, milestones and Share
   (or "Join the challenge →" if you haven't joined). Refreshes every 5 minutes until endsAt; after that the board freezes.
   Data only through js/api.js. Owl avatars by style: assets/cards/owl-{builder|achiever|explorer}.webp, cropped to the face in CSS. */
(function () {
  "use strict";
  var C = window.DHI_CHALLENGE, api = window.DhiApi;
  if (!C || !api) return;
  var $ = function (id) { return document.getElementById(id); };
  var END = Date.parse(C.endsAt);
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var OWL = { Builder: "builder", Achiever: "achiever", Explorer: "explorer" };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
  function avatar(style, cls) {
    var a = el("span", "lb-av" + (cls ? " " + cls : ""));
    a.style.backgroundImage = 'url("assets/cards/owl-' + (OWL[style] || "builder") + '.webp")';
    a.setAttribute("aria-hidden", "true");
    return a;
  }

  /* ---------- top bar chip + prize ---------- */
  function paintChip() {
    var ms = END - Date.now();
    if (ms <= 0) { $("lbChip").textContent = "Closed"; return; }
    var d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60;
    $("lbChip").textContent = d ? d + "d " + h + "h left" : h + "h " + m + "m left";
  }
  paintChip();
  var chipT = setInterval(paintChip, 60000);
  var prize = $("lbPrize");
  prize.onerror = function () { prize.onerror = null; prize.src = C.prize.imageFallback; };
  prize.src = C.prize.image;

  /* ---------- the board ---------- */
  var first = true;
  function load() {
    var over = api.isOver();
    $("lbClosed").hidden = !over;
    return Promise.all([api.getLeaderboard(), api.getMe(), api.getMyRank()]).then(function (a) {
      podium(a[0].slice(0, 3));
      list(a[0].slice(3));
      you(a[1] || {}, a[2] || {}, over);
      first = false;
    }).catch(function () {});
  }
  var refresh = 0;
  load().then(function () {
    if (api.isOver()) { clearInterval(chipT); return; }                 /* closed: the list freezes */
    refresh = setInterval(function () {
      if (api.isOver()) { clearInterval(refresh); clearInterval(chipT); paintChip(); load(); return; }
      load();
    }, 5 * 60 * 1000);
  });

  function podium(top) {
    var box = $("lbPodium");
    box.textContent = "";
    /* left #2, centre #1, right #3 */
    [[top[1], 2, "silver"], [top[0], 1, "gold"], [top[2], 3, "bronze"]].forEach(function (t, i) {
      var row = t[0];
      var spot = el("div", "lb-spot lb-" + t[2] + (row && row.me ? " me" : ""));
      if (!row) { spot.classList.add("empty"); add(box, spot); return; }
      if (first && !reduced) { spot.classList.add("rise"); spot.style.animationDelay = [120, 0, 240][i] + "ms"; }
      var crown = t[1] === 1 ? el("span", "lb-crown") : null;
      if (crown) crown.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z"/></svg>';
      add(spot, crown, avatar(row.style, "big"),
        el("span", "lb-medal", "#" + row.rank),
        el("span", "lb-name", row.displayName + (row.me ? " (you)" : "")),
        el("span", "lb-valid", row.valid + " valid"),
        el("span", "lb-base"));
      spot.setAttribute("aria-label", "Rank " + row.rank + ": " + row.displayName + ", " + row.valid + " valid referrals");
      add(box, spot);
    });
  }

  function list(rows) {
    var ol = $("lbList");
    ol.textContent = "";
    rows.forEach(function (row) {
      var li = el("li", "lb-row" + (row.me ? " me" : ""));
      if (row.me) li.setAttribute("aria-current", "true");
      add(li, el("span", "lb-rank", String(row.rank)), avatar(row.style),
        add(el("span", "lb-who"), el("span", "lb-name", row.displayName + (row.me ? " (you)" : "")), el("span", "lb-cls", row.cls)),
        el("span", "lb-count", String(row.valid)));
      add(ol, li);
    });
  }

  /* ---------- sticky: your card, or the join link ---------- */
  var sharePanel = null;
  function you(me, rank, over) {
    var box = $("lbYou");
    box.textContent = "";
    if (!me.joined) {
      if (over) { box.hidden = true; return; }
      var j = el("a", "lb-join", "Join the challenge →"); j.href = "challenge.html";
      add(box, j); box.hidden = false; box.classList.add("join");
      document.body.classList.add("has-you");
      return;
    }
    box.classList.remove("join");
    var head = add(el("div", "lb-you-head"),
      el("span", "lb-you-rank", rank.rank ? "#" + rank.rank : "–"),
      add(el("div", "lb-you-text"),
        el("span", "lb-you-title", "You"),
        el("span", "lb-you-sub", rank.valid + " valid · " + rank.pending + " pending")));
    var shareBtn = null;
    if (!over) {
      shareBtn = el("button", "lb-share-btn", "Share"); shareBtn.type = "button";
      shareBtn.setAttribute("aria-expanded", "false");
      add(head, shareBtn);
    }
    /* progress to the next rank */
    var line = rank.nextRank ? rank.toNext + " more to pass #" + rank.nextRank : "You're leading. Keep going.";
    var pct = rank.nextRank ? Math.round(rank.valid / (rank.valid + rank.toNext) * 100) : 100;
    var prog = add(el("div", "lb-prog"), el("span", "lb-prog-text", line),
      add(el("span", "lb-prog-bar"), (function () { var i = el("i"); i.style.width = pct + "%"; return i; })()));
    /* milestones */
    var badges = el("div", "lb-badges");
    badges.setAttribute("aria-label", "Milestones");
    (C.milestones || [1, 5, 10, 25]).forEach(function (m) {
      var got = rank.valid >= m, b = el("span", "lb-badge" + (got ? " on" : ""), String(m));
      b.setAttribute("aria-label", m + " valid referral" + (m > 1 ? "s" : "") + (got ? ", earned" : ", not yet"));
      add(badges, b);
    });
    add(box, head, prog, badges);
    if (shareBtn) {
      api.getMyReferral().then(function (ref) {
        sharePanel = shares(ref);
        add(box, sharePanel);
        shareBtn.addEventListener("click", function () {
          var open = sharePanel.hidden;
          sharePanel.hidden = !open;
          shareBtn.setAttribute("aria-expanded", open ? "true" : "false");
        });
      });
    }
    box.hidden = false;
    document.body.classList.add("has-you");
  }

  function shares(ref) {
    var text = "I joined the DhiRise Founding Circle. Take the check with my code " + ref.code + ": " + ref.link;
    var row = el("div", "fc-share lb-shares");
    row.hidden = true;
    var ig = DhiShareIcons.button("ig", "Instagram", null);
    ig.addEventListener("click", function () {
      if (navigator.share) navigator.share({ title: "DhiRise Founding Circle", text: text }).catch(function (err) { if (!err || err.name !== "AbortError") copy(text); });
      else copy(text);
    });
    add(row,
      DhiShareIcons.button("wa", "WhatsApp", "https://wa.me/?text=" + encodeURIComponent(text)),
      ig,
      DhiShareIcons.button("fb", "Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(ref.link)));
    return row;
  }
  var toastEl = null, toastT = 0;
  function copy(text) {
    var show = function (msg) {
      if (!toastEl) { toastEl = el("div", "fc-toast"); toastEl.setAttribute("role", "status"); document.body.appendChild(toastEl); }
      toastEl.textContent = msg; toastEl.classList.add("on");
      clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("on"); }, 3200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { show("Copied! Paste it in your Instagram story or DM."); }, function () { show("Couldn't copy."); });
    else show("Couldn't copy.");
  }
})();
