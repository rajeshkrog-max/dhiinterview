/* Dhirise · fills one question screen from js/engine/questions.js and hands it to the shared screen (js/question.js).
   Options are shown in this student's shuffled order; the screen still works in positions 1–4,
   which are mapped to option ids here, so only ids are stored. Q18's Finish opens done.html once all 18 are answered. */
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

    dhiriseQuestion({
      n: n,
      tips: tips,
      load: function () { var i = ids.indexOf(DhiStore.get().answers["q" + n]); return i < 0 ? null : i + 1; },
      save: function (choice) { DhiStore.answer(n, ids[choice - 1]); },
      back: back,
      next: n < DhiQuestions.TOTAL ? DhiStore.urlFor(n + 1) : function () {
        var missing = DhiStore.firstMissing();             /* Finish: any skipped question first */
        if (missing) { location.href = DhiStore.urlFor(missing); return; }
        DhiStore.complete();
        location.href = "done.html";
      }
    });
  };
})();
