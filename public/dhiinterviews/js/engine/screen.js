/* Dhirise · fills one question screen from js/engine/questions.js and hands it to the shared screen (js/question.js).
   Options are shown in this student's shuffled order; the screen still works in positions 1–4,
   which are mapped to option ids here, so only ids are stored. Q18's Finish waits until all 18 answers are confirmed on the
   server (DhiSession.finish), then opens done.html. Needs js/engine/store.js and the page guard (window.DhiSession). */
(function () {
  "use strict";
  window.dhiriseScreen = function (n, back) {
    var q = DhiQuestions.question(n);
    var ids = DhiScore.order(n, DhiStore.seed());
    var tips = {};

    document.getElementById("qText").textContent = q.text;
    Array.prototype.forEach.call(document.querySelectorAll("#options button"), function (b, i) {
      var o = DhiQuestions.option(ids[i]);
      b.textContent = o.text;
      tips[i + 1] = DhiQuestions.tipText(o);
    });

    /* the card: mirror line, gold room pill, how Dhi helps, and how many students chose the same */
    function renderTip(el, choice) {
      var o = DhiQuestions.option(ids[choice - 1]), t = o.tip || {};
      el.textContent = "";
      if (!t.mirror && !t.line) { el.textContent = tips[choice]; return; }
      function part(cls, text) { if (!text) return; var s = document.createElement("span"); s.className = cls; s.textContent = text; el.appendChild(s); }
      part("tip-mirror", t.mirror);
      part("tip-room", t.room ? "In Dhi · " + t.room : "");
      part("tip-line", t.line);
      part("tip-peer", typeof o.peerSeed === "number" ? o.peerSeed + "% of students chose this too" : "");
    }

    dhiriseQuestion({
      n: n,
      tips: tips,
      renderTip: renderTip,
      load: function () { var i = ids.indexOf(DhiStore.get().answers["q" + n]); return i < 0 ? null : i + 1; },
      save: function (choice) { DhiStore.answer(n, ids[choice - 1]); },
      back: back,
      next: n < DhiQuestions.TOTAL ? DhiStore.urlFor(n + 1) : function (nextBtn) {
        var missing = DhiStore.firstMissing();             /* Finish: any skipped question first */
        if (missing) { location.href = DhiStore.urlFor(missing); return; }
        nextBtn.disabled = true; nextBtn.textContent = "Saving…";
        DhiSession.finish().then(function (r) {
          if (r.ok) {
            var go = function () { location.href = "done.html"; };
            if (window.DhiMusic) DhiMusic.finish(go); else go();   /* the music fades out first */
          } else if (r.code === "answers_missing") {       /* the server is missing one: send them back to it */
            location.href = DhiStore.urlFor(DhiStore.firstMissing() || 1);
          } else {                                         /* offline or answers still waiting to be sent */
            nextBtn.disabled = false; nextBtn.textContent = "Connect to finish";
          }
        });
      }
    });
  };
})();
