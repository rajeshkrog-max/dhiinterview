/* Dhirise · fills the question screen from js/engine/questions.js and hands it to the shared screen (js/question.js).
   One page holds all 18 questions: Next and Back swap the question, the options, the progress and the background in place
   (history.pushState keeps the address right, the music never stops). Options are shown in this student's shuffled order;
   the screen still works in positions 1–4, which are mapped to option ids here, so only ids are stored. Q18's Finish waits
   until all 18 answers are confirmed on the server (DhiSession.finish), then opens done.html. A scoring_failed answer from the
   server shows a kind "try again" line. Needs js/engine/store.js, js/qbg.js and the page guard (window.DhiSession). */
(function () {
  "use strict";
  /* a small kind line under the Finish button; empty text clears it */
  function finishNote(btn, text) {
    var p = document.getElementById("finishNote");
    if (!p && !text) return;
    if (!p) {
      p = document.createElement("p");
      p.id = "finishNote";
      p.setAttribute("role", "status");
      p.style.cssText = "margin:8px 0 0;text-align:center;font-size:14px;line-height:1.4";
      btn.parentNode.insertBefore(p, btn.nextSibling);
    }
    p.textContent = text;
  }
  /* All 18 questions live in one page. dhiriseScreen(start) shows question `start`; Next and Back then swap the question,
     the options, the progress and the background in place and move the address with history.pushState (question.html,
     question2.html, questions.html?q=N, as urlFor gives them), so a reload, a bookmark and the browser's Back all land
     on the right question and the page, and the music, never reload between questions. */
  window.dhiriseScreen = function (start) {
    var TOTAL = DhiQuestions.TOTAL;
    var $ = function (id) { return document.getElementById(id); };
    var buttons = Array.prototype.slice.call(document.querySelectorAll("#options button"));
    var next = $("next"), n = 0, ctl = null;

    /* fills the screen for question k and returns its config for js/question.js */
    function build(k) {
      var q = DhiQuestions.question(k);
      var ids = DhiScore.order(k, DhiStore.seed());
      var tips = {};
      $("qText").textContent = q.text;
      buttons.forEach(function (b, i) {
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

      return {
        n: k,
        tips: tips,
        renderTip: renderTip,
        load: function () { var i = ids.indexOf(DhiStore.get().answers["q" + k]); return i < 0 ? null : i + 1; },
        save: function (choice) { DhiStore.answer(k, ids[choice - 1]); },
        back: k === 1 ? "meet.html" : function () { go(k - 1, "push"); },
        next: k < TOTAL ? function () { go(k + 1, "push"); } : finish
      };
    }

    /* Q18's Finish: any skipped question first, then wait until all 18 answers are confirmed on the server */
    function finish(nextBtn) {
      var missing = DhiStore.firstMissing();
      if (missing) { go(missing, "push"); return; }
      nextBtn.disabled = true; nextBtn.textContent = "Saving…"; finishNote(nextBtn, "");
      DhiSession.finish().then(function (r) {
        if (r.ok) {
          var done = function () { location.href = "done.html"; };
          if (window.DhiMusic) DhiMusic.finish(done); else done();   /* the music fades out first */
        } else if (r.code === "answers_missing") {       /* the server is missing one: send them back to it */
          go(DhiStore.firstMissing() || 1, "push");
        } else if (r.code === "scoring_failed") {        /* the server could not make the result: nothing was finished, every answer is kept (spec 0005) */
          nextBtn.disabled = false; nextBtn.textContent = "Try again";
          finishNote(nextBtn, "We could not finish just now, but your answers are safe. Please try again in a moment.");
        } else {                                         /* offline or answers still waiting to be sent */
          nextBtn.disabled = false; nextBtn.textContent = "Connect to finish";
        }
      });
    }

    /* mode: "first" (page just loaded), "push" (Next or Back: new address) or "pop" (the browser's Back or Forward) */
    function go(k, mode) {
      if (!(k >= 1 && k <= TOTAL) || !DhiQuestions.question(k)) { location.replace(DhiStore.urlFor(1)); return; }
      var moved = !!n;
      n = k;
      if (mode === "push") { try { history.pushState({ q: k }, "", DhiStore.urlFor(k)); } catch (e) { location.href = DhiStore.urlFor(k); return; } }
      document.title = "DhiRise · " + k + " / 18";
      $("step").textContent = k + " / 18";
      $("track").style.setProperty("--n", k);
      $("track").setAttribute("aria-valuenow", k);
      $("track").setAttribute("aria-label", "Question " + k + " of 18");
      next.textContent = k === TOTAL ? "Finish" : "Next";   /* the last question: Finish, not Next */
      finishNote(next, "");
      var cfg = build(k);
      if (ctl) ctl.set(cfg); else ctl = dhiriseQuestion(cfg);
      if (window.DhiQBg) DhiQBg.show(k, moved);
      if (moved) {
        var panel = $("panel");
        if (panel.animate && !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) {
          panel.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 350, easing: "ease-out" });
        }
        window.scrollTo(0, 0);
        var h = $("qText"); h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) {}
      }
    }

    /* the browser's Back / Forward between questions */
    window.addEventListener("popstate", function () {
      var m = /\/(question|question2|questions)(?:\.html)?$/.exec(location.pathname);   /* Pages may serve it without .html */
      if (!m) return;
      var k = m[1] === "questions" ? parseInt(new URLSearchParams(location.search).get("q"), 10) : m[1] === "question2" ? 2 : 1;
      go(k, "pop");
    });

    go(start, "first");
  };
})();
