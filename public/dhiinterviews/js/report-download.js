/* Dhirise · the Download button's logic (spec 0006, AC-6), apart from the page so a test can run it with a pretend server and clock.
   DhiReportDownload.run(d) → Promise of what happened: "saved" | "print" | "signin" | "offline". Never rejects.
   d.copy   the server side: { status(), request(force), download() }   (window.DhiSession.reportCopy)
   d.T      the words (js/engine/reportText.js): downloadPreparing, downloadFailed, downloadOffline, downloadSignin
   d.say    shows a line under the button ("" clears it)
   d.print  opens the browser's print page (the clean print layout in css/report-student.css)
   d.wait / d.now   optional, for tests: a promise that ends after ms, and the clock.
   Rules: a ready copy downloads at once. Otherwise it asks for one if none was ever asked for, says "Getting your PDF ready",
   checks every 3 seconds, and after 60 seconds, or when the copy has failed, shows a kind message and opens the print page.
   Needs loaded first: nothing. Loaded before js/report-student.js. */
(function (root) {
  "use strict";
  var POLL_MS = 3000, GIVE_UP_MS = 60000;

  function run(d) {
    var copy = d.copy, T = d.T, say = d.say;
    var now = d.now || function () { return Date.now(); };
    var wait = d.wait || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };

    function fallback() { say(T.downloadFailed); d.print(); return "print"; }
    function save() {
      return copy.download().then(function (res) {
        if (res.ok) { say(""); return "saved"; }
        if (res.code === "signin") { say(T.downloadSignin); return "signin"; }
        if (res.code === "offline") { say(T.downloadOffline); return "offline"; }
        return fallback();                                    /* not_ready or failed */
      });
    }
    function poll(since) {
      return copy.status().then(function (st) {
        if (st && st.ready) return save();
        if (st && (st.state === "failed" || st.state === "none")) return fallback();
        if (now() - since >= GIVE_UP_MS) return fallback();
        return wait(POLL_MS).then(function () { return poll(since); });
      });
    }

    return copy.status().then(function (st) {
      if (st && st.ready) return save();
      if (!st) { say(T.downloadOffline); return "offline"; }
      say(T.downloadPreparing);
      if (st.state === "failed") return fallback();
      var asked = st.state === "none" ? copy.request(true) : Promise.resolve();   /* the first ask was lost: ask again */
      return asked.then(function () { return poll(now()); });
    }).catch(function () { return fallback(); });
  }

  root.DhiReportDownload = { run: run, POLL_MS: POLL_MS, GIVE_UP_MS: GIVE_UP_MS };
})(typeof window !== "undefined" ? window : globalThis);
