/* Dhirise · wait, then join. The gold line fills once over 8 s while four sentences show one at a time;
   when it is full, "See your result" fades in. Join saves { phone, at } locally, then opens result.html. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var FILL_MS = 8000;
  var LINES = ["Dhirise is reading your answers", "Dhirise is sketching your pattern", "Dhirise is preparing your result", "Almost done"];
  var step = FILL_MS / LINES.length, timers = [];

  /* wait */
  var line = $("line");
  requestAnimationFrame(function () { $("fill").classList.add("go"); });
  LINES.forEach(function (text, i) {
    timers.push(setTimeout(function () {
      line.classList.remove("on");
      timers.push(setTimeout(function () { line.textContent = text; line.classList.add("on"); }, i ? 200 : 0));
    }, i * step));
  });
  timers.push(setTimeout(function () {
    var b = $("see"); b.hidden = false;
    requestAnimationFrame(function () { b.classList.add("on"); b.focus({ preventScroll: true }); });
  }, FILL_MS));
  window.addEventListener("pagehide", function () { timers.forEach(clearTimeout); });

  $("see").addEventListener("click", function () {
    $("wait").hidden = true; $("joinCard").hidden = false;
    $("phone").focus({ preventScroll: true });
  });

  /* join */
  var phone = $("phone");
  function digits() { return phone.value.replace(/[\s\-()]/g, ""); }
  function check() {
    var ok = /^\d{10}$/.test(digits());
    $("phoneErr").textContent = ok ? "" : "Please enter a 10-digit mobile number.";
    if (ok) phone.removeAttribute("aria-invalid"); else phone.setAttribute("aria-invalid", "true");
    return ok;
  }
  phone.addEventListener("input", function () { if (phone.getAttribute("aria-invalid")) check(); });
  $("join").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!check()) { phone.focus(); return; }
    try { localStorage.setItem("dhirise.community.v1", JSON.stringify({ phone: digits(), at: new Date().toISOString() })); } catch (err) {}
    location.href = "result.html";
  });
})();
