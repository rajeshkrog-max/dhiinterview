/* Dhirise · the picture row on the report page (spec 0011, AC-9). Hangs one global on window: DhiPictureControl. Needs window.DhiSession
   (the page guard has let the page through) and css/picture-control.css; uses DhiAvatar for the small circle when it is loaded.
   It is the student's way to take their Google picture back: "Remove my picture", after a confirm step, and then "Use my Google picture".
   Remove is a control over the picture, not a consent. DhiSession.pictureControl() says which row to show (remove, restore, or none), so
   the row stays hidden when the feature is off, nothing is stored, the student has not agreed, or the team has blocked the picture.
   The confirm words say what Remove cannot undo: browser copies for up to an hour, and the report copies and share links already made.
   Not drawn in the saved PDF copy. ES5 style, no motion. */
(function () {
  "use strict";

  var SAYS = {
    title: "Your picture",
    shown: "Your picture is shown across DhiRise.",
    off: "Your picture is off. Your initial shows instead.",
    removeButton: "Remove my picture",
    restoreButton: "Use my Google picture",
    confirm: "Your picture will be taken off every screen and deleted from DhiRise. It can stay in browser copies for up to an hour. Report copies and share links already made keep the picture they drew.",
    confirmYes: "Yes, remove my picture",
    confirmNo: "Keep my picture",
    removed: "Done. Your picture is removed.",
    restoring: "Getting your picture…",
    restored: "Your picture is back.",
    notYet: "We could not find a picture to show. If your Google account has one, it will appear the next time you open DhiRise.",
    reload: "Please reload this page and try again.",
    offline: "We could not do that. Please check your connection and try again."
  };

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
  function button(cls, text) {
    var b = el("button", cls, text);
    b.type = "button";
    return b;
  }

  /* Adds the row to `root` (the report's main element) at this point and draws it once the session has answered. `profile` has the name
     for the initials. Does nothing when the feature is off in this browser. */
  function mount(root, profile) {
    var S = window.DhiSession;
    if (!S || !S.pictureEnabled || !S.pictureEnabled() || !S.pictureControl) return;

    var card = el("section", "card span2 pcontrol");
    card.setAttribute("aria-labelledby", "pcTitle");
    card.hidden = true;

    var circle = window.DhiAvatar ? DhiAvatar.mine({ size: 40, name: profile && profile.name }) : null;
    var message = "";      /* what the last action said, kept across a redraw */
    var confirming = false;
    var busy = false;

    /* The heading, the text and the status line are built once. Only the text and the buttons are redrawn, so the status line is in
       the page before its words change (a screen reader announces a change, not a line that arrives with its words already in it). */
    var title = el("h2", "pc-title", SAYS.title);
    title.id = "pcTitle";
    var head = add(el("div", "pc-head"), circle, title);
    var text = el("p", "pc-text");
    var msg = el("p", "pc-msg");
    msg.setAttribute("role", "status");
    msg.setAttribute("aria-live", "polite");
    var actions = el("div", "pc-actions");
    add(card, head, text, msg, actions);
    add(root, card);

    function say(words) {
      message = words || "";
      msg.textContent = message;
    }

    function draw(focusFirst) {
      var kind = S.pictureControl();
      /* a row that has nothing to offer is hidden, unless it still has a message to deliver (the "Done" after a Remove) */
      if (kind === "none" && !message) { card.hidden = true; return; }
      card.hidden = false;
      actions.textContent = "";
      msg.textContent = message;
      var first = null;

      if (kind === "remove" && confirming) {
        var yes = button("btn-ghost", SAYS.confirmYes);
        var no = button("btn-gold", SAYS.confirmNo);
        yes.addEventListener("click", function () { doRemove(yes); });
        no.addEventListener("click", function () { confirming = false; say(""); draw(true); });
        text.textContent = SAYS.confirm;
        add(actions, no, yes);
        first = no;
      } else if (kind === "remove") {
        var rm = button("btn-ghost", SAYS.removeButton);
        rm.addEventListener("click", function () { confirming = true; say(""); draw(true); });
        text.textContent = SAYS.shown;
        add(actions, rm);
        first = rm;
      } else if (kind === "restore") {
        var use = button("btn-gold", SAYS.restoreButton);
        use.addEventListener("click", function () { doRestore(use); });
        text.textContent = SAYS.off;
        add(actions, use);
        first = use;
      } else {
        text.textContent = "";
      }
      if (focusFirst && first) first.focus();
    }

    function doRemove(btn) {
      if (busy) return;
      busy = true;
      btn.setAttribute("aria-busy", "true");
      S.removePicture().then(function (res) {
        busy = false;
        confirming = false;
        say(res.ok ? SAYS.removed : SAYS.offline);
        draw(true);
      });
    }

    /* The button stays where it is (disabled and marked busy) while the picture is fetched, so a keyboard or screen reader student keeps
       their place; the row is redrawn only when the answer is in. */
    function doRestore(btn) {
      if (busy) return;
      busy = true;
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
      say(SAYS.restoring);
      S.restorePicture().then(function (res) {
        busy = false;
        if (res.ok) say(S.picture() ? SAYS.restored : SAYS.notYet);
        else say(res.code === "offline" ? SAYS.offline : SAYS.reload);
        draw(true);
      });
    }

    S.ready().then(function () { draw(false); });
    /* a picture that lands later (a first fetch, or a Restore) changes which row is right; a busy action draws for itself, and the
       confirm step is left alone so the student's place is not taken away while they decide */
    if (S.onPicture) S.onPicture(function () { if (!busy && !confirming) draw(false); });
  }

  window.DhiPictureControl = { mount: mount };
})();
