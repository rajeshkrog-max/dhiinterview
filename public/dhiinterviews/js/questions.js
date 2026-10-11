/* Dhirise · the question page for all 18 questions: question.html (1), question2.html (2) and questions.html?q=N (3 to 18).
   The address says which question to open first; after that Next and Back move inside this page (js/engine/screen.js),
   so nothing reloads and the music (js/music.js) keeps playing. The background is js/qbg.js (assets/interview bg/Q{N}.png).
   Text, order and tips come from js/engine/questions.js; answers are saved as option ids in localStorage "dhirise.session.v1"
   and sent to the server. Needs js/qbg.js, js/engine/screen.js and js/question.js loaded first. */
(function () {
  "use strict";
  var file = /([^\/]+?)(?:\.html)?$/.exec(location.pathname);   /* Pages may serve it without .html */
  var name = file ? file[1] : "";
  var n = name === "question" ? 1 : name === "question2" ? 2 : parseInt(new URLSearchParams(location.search).get("q"), 10);
  if (!(n >= 1 && n <= 18) || !DhiQuestions.question(n)) { location.replace("question.html"); return; }
  dhiriseScreen(n);
})();
