/* Dhirise · the one time picture notice (spec 0011, AC-2). Hangs one global on window: DhiPictureNotice. Needs window.DhiSession (the
   page guard has let the page through) and css/picture-notice.css. It is for a student who agreed to an older consent text: a card
   that says, in the words of the current notice, that DhiRise would like to save their Google picture, with I agree and Not now.
   It is shown only when DhiSession.pictureNotice() says "ask" (asked mode only: in the default mode the server never says it), on the
   report page and the landing welcome back state, never on the question pages, and never blocks the report.
   The agree line shown is the same line the server checks (DhiSession.consent.pictureLine), so the page and the server cannot drift.
   Under 18 a parent or guardian tick is required; the server checks it too. ES5 style. */
(function () {
  "use strict";

  var ID = "pictureNotice";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  var SAYS = {
    needs_guardian: "Please ask a parent or guardian to be with you, then tick the box.",
    consent_text_changed: "This notice has changed. Please reload the page and read it again.",
    offline: "We could not save that. Please check your connection and try again."
  };

  /* `flavour` "landing" is the same card without the report's card frame, sitting inside the landing's own glass card, with that page's buttons */
  function build(profile, flavour) {
    var consent = DhiSession.consent;
    var under18 = typeof profile.age !== "number" || profile.age < 18; /* an unknown age is treated as under 18: the box is drawn, the server decides */
    var landing = flavour === "landing";

    var card = el("section", landing ? "pnotice pn-landing" : "card span2 pnotice");
    card.id = ID;
    card.setAttribute("aria-labelledby", "pnTitle");
    var title = el("h2", "pn-title", "Show your Google picture?");
    title.id = "pnTitle";
    var text = el("p", "pn-text", consent.pictureLine);

    var more = el("details", "pn-more");
    add(more, el("summary", "", "Read the full notice"));
    for (var i = 0; i < consent.lines.length; i++) add(more, el("p", "", consent.lines[i]));

    var tick = null;
    var guardian = null;
    if (under18) {
      guardian = el("label", "pn-guardian");
      tick = el("input");
      tick.type = "checkbox";
      add(guardian, tick, el("span", "", "A parent or guardian is with me and agrees."));
    }

    var msg = el("p", "pn-msg");
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");

    var agree = el("button", landing ? "btn" : "btn-gold", "I agree, show my picture");
    agree.type = "button";
    var later = el("button", landing ? "btn ghost" : "btn-ghost", "Not now");
    later.type = "button";

    var busy = false;
    agree.addEventListener("click", function () {
      if (busy) return;
      busy = true;
      agree.setAttribute("aria-busy", "true");
      msg.textContent = "";
      DhiSession.acceptPicture(!!(tick && tick.checked)).then(function (res) {
        busy = false;
        agree.removeAttribute("aria-busy");
        if (res.ok) {
          card.innerHTML = "";
          add(card, el("p", "pn-text", "Thank you. Your picture will show in a moment."));
          card.setAttribute("role", "status");
          setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 4000);
        } else if (res.code === "off") {
          if (card.parentNode) card.parentNode.removeChild(card);
        } else {
          msg.textContent = SAYS[res.code] || SAYS.offline;
        }
      });
    });
    later.addEventListener("click", function () {
      DhiSession.declinePicture();
      if (card.parentNode) card.parentNode.removeChild(card);
    });

    return add(card, title, text, more, guardian, msg, agree, later);
  }

  /* Puts the notice right after `anchor` (the report heading) once the server has said whether to ask. Does nothing when the feature
     is off in the browser, when there is nothing to ask, or when the card is already there. */
  function wanted() { return !!(window.DhiSession && DhiSession.pictureEnabled && DhiSession.pictureEnabled()); }

  function mountAfter(anchor, profile) {
    if (!wanted()) return;
    DhiSession.ready().then(function () {
      if (DhiSession.pictureNotice() !== "ask") return;
      if (document.getElementById(ID) || !anchor.parentNode) return;
      anchor.parentNode.insertBefore(build(profile || {}, "report"), anchor.nextSibling);
    });
  }

  /* The landing's welcome back state: the same notice at the end of `container`, on the same conditions. */
  function mountIn(container, profile) {
    if (!wanted()) return;
    DhiSession.ready().then(function () {
      if (DhiSession.pictureNotice() !== "ask") return;
      if (document.getElementById(ID) || container.hidden) return;
      container.appendChild(build(profile || {}, "landing"));
    });
  }

  window.DhiPictureNotice = { mountAfter: mountAfter, mountIn: mountIn };
})();
