/* Dhirise · meet Dhi. One screen before question 1: the student's first name, the leaves, Back and Start. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  try {
    var g = JSON.parse(localStorage.getItem("dhirise.gate.v1"));
    var first = g && g.name ? String(g.name).trim().split(/\s+/)[0] : "";
    if (first) $("who").textContent = first.charAt(0).toUpperCase() + first.slice(1);
  } catch (e) {}
  $("back").addEventListener("click", function () { location.href = "landing.html"; });
  $("start").addEventListener("click", function () { location.href = "question.html"; });
  if (window.dhiriseLeaves) window.dhiriseLeaves();
})();
