/* Dhirise · questions 3–18 on one page: questions.html?q=N. The image is assets/interview bg/Q{N}.png.
   Text, order and tips come from js/engine/questions.js (via js/engine/screen.js);
   answers are saved as option ids in localStorage "dhirise.check.v1". */
(function () {
  "use strict";
  var n = parseInt(new URLSearchParams(location.search).get("q"), 10);
  if (!(n >= 3 && n <= 18) || !DhiQuestions.question(n)) { location.replace("question.html"); return; }
  var $ = function (id) { return document.getElementById(id); };

  document.title = "Dhirise · " + n + " / 18";
  $("qscreen").style.backgroundImage = 'url("assets/interview%20bg/Q' + n + '.png")';
  $("step").textContent = n + " / 18";
  $("track").style.setProperty("--n", n);
  $("track").setAttribute("aria-valuenow", n);
  $("track").setAttribute("aria-label", "Question " + n + " of 18");
  if (n === 18) $("next").textContent = "Finish";   /* the last question: Finish, not Next */

  dhiriseScreen(n, n === 3 ? "question2.html" : "questions.html?q=" + (n - 1));
})();
