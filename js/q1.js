/* Dhirise · question 1 config. The screen itself is js/question.js; leaves are js/leaves.js.
   Saves only to sessionStorage (dhirise.q1); never writes the old test store. */
dhiriseQuestion({
  n: 1,
  tips: {
    1: "Your mind is already running. On the Dhirise dashboard you book a fixed morning study room, with others, phone kept out, so the rush has a place to sit.",
    2: "You wake hungry. The Dhirise dashboard asks you to log breakfast before it opens the hard set. No empty plate, no hard paper.",
    3: "The start is heavy. The Dhirise dashboard gives you one tick first: stand up. The study room opens after that tick.",
    4: "The morning changes. The Dhirise dashboard asks how the morning feels, then sets a short sit or the hard chapter."
  },
  load: function () { var v = JSON.parse(sessionStorage.getItem("dhirise.q1")); return v && v.choice; },
  save: function (choice) { sessionStorage.setItem("dhirise.q1", JSON.stringify({ q: 1, choice: choice, at: new Date().toISOString() })); },
  back: "landing.html",
  next: "question2.html"
});
