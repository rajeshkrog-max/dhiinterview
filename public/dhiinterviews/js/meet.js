/* Dhirise · the screen before question 1: logo, the founding-batch card, the leaves, Back and Start. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  $("back").addEventListener("click", function () { location.href = "landing.html"; });
  $("start").addEventListener("click", function () { location.href = "question.html"; });
  if (window.dhiriseLeaves) window.dhiriseLeaves();
})();
