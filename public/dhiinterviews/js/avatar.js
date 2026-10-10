/* Dhirise · the profile picture circle (spec 0011). Hangs one global on window: DhiAvatar. Needs css/avatar.css; loads after nothing.
   DhiAvatar.make({ url, name, size, lazy }) returns a fixed size circle (size 28, 40 or 64): the picture when `url` is given (always a
   same origin path such as /api/avatar/<key>), otherwise the student's first initial on a fixed colour, or a neutral person shape when
   the name has no letter to show (an emoji, a digit, nothing). If the picture fails to load it turns into the initials on its own.
   DhiAvatar.update(el, url) swaps the picture later (the bridge learns of it after the page has drawn).
   DhiAvatar.mine({ size, name, lazy }) is the signed in student's own circle, wired to DhiSession (needs it loaded; null when off).
   The circle is decorative (aria-hidden): a name always sits beside it. It sets no storage, makes no request of its own except the
   image, and never points at a third party host. ES5 style, no motion. */
(function () {
  "use strict";

  var COLORS = 6;                       /* css/avatar.css defines .dhi-avatar--c0 to c5, each tested for 4.5 to 1 against white */
  var SIZES = { 28: true, 40: true, 64: true };
  var SVGNS = "http://www.w3.org/2000/svg";

  /* the first letter of the first word, upper cased, or "" when that first character is not a letter */
  function initialOf(name) {
    var word = String(name == null ? "" : name).replace(/^\s+|\s+$/g, "").split(/\s+/)[0] || "";
    if (!word) return "";
    var first = "";
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      var it = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(word)[Symbol.iterator]().next();
      first = it.done ? "" : it.value.segment;
    } else if (Array.from) {
      first = Array.from(word)[0] || "";
    } else {
      first = word.charAt(0);
    }
    var isLetter;
    try { isLetter = new RegExp("^\\p{L}", "u").test(first); } catch (e) { isLetter = /^[A-Za-zÀ-ɏऀ-ॿఀ-౿஀-௿]/.test(first); }
    if (!isLetter) return "";
    return first.toLocaleUpperCase();
  }

  /* the same name always gets the same colour */
  function colorIndex(name) {
    var s = String(name == null ? "" : name), h = 0, i;
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % COLORS;
  }

  function person() {
    var svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var head = document.createElementNS(SVGNS, "circle");
    head.setAttribute("cx", "12"); head.setAttribute("cy", "9"); head.setAttribute("r", "4");
    var body = document.createElementNS(SVGNS, "path");
    body.setAttribute("d", "M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z");
    svg.appendChild(head); svg.appendChild(body);
    return svg;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  function showInitials(el) {
    var st = el.dhiAvatar;
    clear(el);
    var letter = initialOf(st.name);
    el.className = "dhi-avatar dhi-avatar--" + st.size + (letter ? " dhi-avatar--c" + colorIndex(st.name) : " dhi-avatar--neutral");
    if (letter) el.appendChild(document.createTextNode(letter)); else el.appendChild(person());
    st.shown = "initials";
  }

  function showPicture(el, url) {
    var st = el.dhiAvatar;
    clear(el);
    el.className = "dhi-avatar dhi-avatar--" + st.size + " dhi-avatar--photo";
    var img = document.createElement("img");
    img.width = st.size; img.height = st.size;
    img.alt = "";
    img.decoding = "async";
    img.setAttribute("referrerpolicy", "no-referrer");
    img.loading = st.lazy ? "lazy" : "eager";
    img.onerror = function () { img.onerror = null; st.failed = url; showInitials(el); };   /* a failed picture is not tried again here */
    img.src = url;
    el.appendChild(img);
    st.shown = "picture";
  }

  function make(opts) {
    opts = opts || {};
    var size = SIZES[opts.size] ? opts.size : 40;
    var el = document.createElement("span");
    el.setAttribute("aria-hidden", "true");
    el.dhiAvatar = { name: opts.name, size: size, lazy: !!opts.lazy, shown: "", failed: "" };
    update(el, opts.url);
    return el;
  }

  /* `url` null shows the initials; a url that already failed on this element is not tried again */
  function update(el, url) {
    var st = el && el.dhiAvatar;
    if (!st) return;
    if (url && typeof url === "string" && url.indexOf("/api/avatar/") === 0 && st.failed !== url) {
      if (st.shown === "picture" && el.firstChild && el.firstChild.getAttribute("src") === url) return;
      showPicture(el, url);
    } else {
      if (st.shown !== "initials") showInitials(el);
    }
  }

  /* The signed in student's own circle, for the pages that show "you" (spec 0011, AC-3): the picture, or the initials of their name, kept
     in step with DhiSession so a first picture that lands after the page has drawn (or a Remove) shows without a reload. Returns null
     when the feature is off in this browser (DHI_FUNNEL.profilePicture is false) or there is no session bridge, so the caller draws
     nothing at all. One listener serves every circle made here; circles that have left the page are dropped when it next fires. */
  var mineList = [], mineBound = false;
  function mine(opts) {
    var S = window.DhiSession;
    if (!S || !S.pictureEnabled || !S.pictureEnabled()) return null;
    opts = opts || {};
    var name = opts.name != null ? opts.name : (S.cachedName ? S.cachedName() : "");
    var el = make({ url: S.picture(), name: name, size: opts.size, lazy: opts.lazy });
    mineList.push(el);
    if (!mineBound && S.onPicture) {
      mineBound = true;
      S.onPicture(function (url) {
        mineList = mineList.filter(function (e) { return e.isConnected !== false; });
        for (var i = 0; i < mineList.length; i++) update(mineList[i], url);
      });
    }
    return el;
  }

  window.DhiAvatar = { make: make, update: update, mine: mine, initialOf: initialOf, colorIndex: colorIndex, COLORS: COLORS };
})();
