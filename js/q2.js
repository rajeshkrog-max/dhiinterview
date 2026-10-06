/* Dhirise · question 2 config. The screen itself is js/question.js; leaves are js/leaves.js.
   Saves { q: 2, choice, at } under dhirise.answers (keyed by question number); never writes the old test store. */
(function () {
  var KEY = "dhirise.answers";
  function all() { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  dhiriseQuestion({
    n: 2,
    tips: {
      1: "You forget, then shake. The Dhirise dashboard puts the meal next to the chapter. Skip it and the study room shows the gap before you shake.",
      2: "Hunger makes you sharp. The Dhirise dashboard marks a missed plate on the week. The practice paper waits until lunch is logged.",
      3: "You barely notice. The Dhirise dashboard still asks at the meal hour. That gap is why the evening work falls.",
      4: "You eat on time. The Dhirise dashboard keeps that hour as a tick. Exam week cannot delete it."
    },
    load: function () { var v = all()[2]; return v && v.choice; },
    save: function (choice) { var a = all(); a[2] = { q: 2, choice: choice, at: new Date().toISOString() }; sessionStorage.setItem(KEY, JSON.stringify(a)); },
    back: "question.html",
    next: "questions.html?q=3"
  });
})();
