/* Dhirise · questions 3–18. One array; questions.html?q=N renders entry N with the shared screen (js/question.js).
   Each entry: [question, [[option, tip] × 4]]. The image is assets/interview bg/Q{N}.png.
   Answers are saved as { q, choice } (choice 1–4) under sessionStorage "dhirise.answers", keyed by question number. */
window.DHIRISE_QUESTIONS = {
 3: ["Picture your study table right now. It looks like…", [
  ["Several open books and ideas scattered everywhere.", "Books everywhere. The Dhirise dashboard opens one set in the study room. The other books stay outside it."],
  ["Sorted by priority, with a plan pinned up.", "A plan is pinned. The Dhirise dashboard holds three ticks, not a second exam. You see only today’s set."],
  ["Comfortable but cluttered. It rarely changes.", "The clutter never moves. The Dhirise dashboard asks for one thing off the desk each night. Your desk, not a feed."],
  ["Simple and clean. Only what I need today.", "Only today’s books. The Dhirise dashboard plays the next lesson after today is shut."]]],
 4: ["A result comes back lower than you hoped. The first wave inside you is…", [
  ["Worry. What will happen now?", "Worry about what happens next. The Dhirise dashboard holds the mark. Tomorrow you open one missed question, not the whole future."],
  ["Anger, at myself or at the unfairness.", "Anger at yourself or the paper. The Dhirise dashboard sends that heat into the one remark your teacher left. Then it closes."],
  ["A quiet sadness that stays for days.", "A sadness that stays. The Dhirise dashboard takes the colour of the day. If it stays, you can book a counselor from the same screen. No new target that week."],
  ["A pause, then: what can I learn from this?", "You look for the lesson. The Dhirise dashboard writes that lesson as the first line of the next paper."]]],
 5: ["Which weather feels most like your inner mood these days?", [
  ["A windy day, changing every hour.", "The mood changes every hour. The Dhirise dashboard shortens the study room on a day like that. Not a six-hour block."],
  ["A hot afternoon, bright and intense.", "Bright and intense. The Dhirise dashboard puts the hardest paper in the morning, and locks a stop before you burn out."],
  ["Monsoon clouds, heavy and slow.", "Heavy and slow. The Dhirise dashboard starts you with five minutes up, then a short lesson. The cloud is not a weak score."],
  ["A clear morning sky, calm and open.", "Calm and open. The Dhirise dashboard puts first the chapter you have been avoiding."]]],
 6: ["Forty minutes into a lecture, your mind is usually…", [
  ["Wandering through ten other thoughts.", "Ten other thoughts. In the Dhirise dashboard study room you drop one line every ten minutes. The others can see you stayed."],
  ["Arguing with the teacher in my head.", "You argue inside. The Dhirise dashboard turns that into one question you send after class. Not a comment thread."],
  ["Drifting toward sleep.", "You drift to sleep. The Dhirise dashboard moves that subject to the first study room, not the last period."],
  ["Still with it, taking notes without effort.", "You stay and write. The Dhirise dashboard lets you post that note in your own words, the same evening, with no pile-on."]]],
 7: ["The exam is 30 days away. Left to yourself, you would…", [
  ["Study in bursts with gaps, then rush in the last week.", "Bursts, then a last-week rush. The Dhirise dashboard cuts the month into four Sunday ticks. The rush does not count as a plan."],
  ["Make a timetable on day one and track every chapter.", "Timetable on day one. The Dhirise dashboard tracks the chapters, and keeps one rest day empty."],
  ["Start slowly, but keep a steady pace once going.", "Slow, then steady. The Dhirise dashboard opens the study room at one fixed time, with others who also start slow."],
  ["Do a little daily, with planned revision rounds.", "A little daily, with revision. The Dhirise dashboard brings the same chapter back on day one, day three, and day seven."]]],
 8: ["In a long study session, what makes you lose steam?", [
  ["Restlessness. After 20 minutes I need to move.", "You need to move after twenty minutes. The Dhirise dashboard sets the study room to twenty minutes, then a stand tick. The move counts."],
  ["A problem that will not give in. Frustration builds.", "One problem will not give. The Dhirise dashboard parks it. It returns tomorrow. No one watches you grind."],
  ["I can keep sitting, but less goes in.", "You sit, and less goes in. The Dhirise dashboard ends the room when the page goes blank. More time is not more study."],
  ["I take short breaks before I tire.", "You break before you tire. The Dhirise dashboard keeps that break as a tick. The next paper opens only after it."]]],
 9: ["A difficult logic problem sits in front of you. It feels like…", [
  ["Exciting at first, then I jump to something else.", "Exciting, then you jump. The Dhirise dashboard asks for the first step only. You can ask it to explain. The rest waits."],
  ["A challenge I must beat.", "A challenge you must beat. The Dhirise dashboard gives you one practice of that sum. It will not serve it again tonight."],
  ["A wall. I would rather do something familiar.", "It feels like a wall. The Dhirise dashboard puts one easy question first, then one line of the hard one, and a short lesson if you want it."],
  ["A puzzle I can break into small steps.", "You cut it into steps. The Dhirise dashboard saves those steps as a card. Other days copy that card."]]],
 10: ["In a group study, you are usually the one who…", [
  ["Brings new ideas and keeps the talk going.", "You keep the talk going. The Dhirise dashboard saves the last five minutes of the study room for writing what was decided."],
  ["Takes charge and keeps everyone on track.", "You take charge. The Dhirise dashboard asks you to hand the list to someone else in the room."],
  ["Listens, supports, and keeps the mood easy.", "You keep the mood easy. The Dhirise dashboard asks you to say one thing you understood before you leave."],
  ["Quietly helps whoever is stuck.", "You help the one who is stuck. The Dhirise dashboard lets you explain once, then opens your own set."]]],
 11: ["On a low day, where do you take your feelings?", [
  ["To many people, briefly. Then I move on.", "You tell many people, briefly. The Dhirise dashboard asks for one person who heard all of it."],
  ["Nowhere. I handle it myself.", "You handle it yourself. The Dhirise dashboard leaves a counselor booking on the screen. You do not have to use it."],
  ["I go quiet and keep it inside.", "You keep it inside. The Dhirise dashboard does not turn this into a study tip. From the same screen you can book a counselor. The talk is not saved as a recording."],
  ["To one or two people I trust.", "You tell one or two you trust. The Dhirise dashboard can let them into your study room. They are part of the plan."]]],
 12: ["The teacher suddenly asks you a question. You…", [
  ["Speak fast and sometimes lose the thread.", "You speak fast and lose it. The Dhirise dashboard has you practice one sentence in the study room, phone out. Speed is not the mark."],
  ["Answer confidently, even if not fully sure.", "You answer sure, even when you are not. The Dhirise dashboard asks you to mark only the part you can defend."],
  ["Freeze, or keep it very short.", "You freeze. The Dhirise dashboard gives you the first line as a night lesson, said aloud."],
  ["Take a breath and answer simply.", "You breathe and answer simply. The Dhirise dashboard keeps that simple line as the model."]]],
 13: ["How does learning stay with you?", [
  ["I pick it up fast, and it fades fast.", "Fast in, fast out. The Dhirise dashboard brings the same page back tonight and on day three. Once is not learned."],
  ["Seeing it once, clearly, is enough.", "One clear look. The Dhirise dashboard opens tomorrow’s room with that page closed. If it is gone, the look was not enough."],
  ["Slow to learn, but once it is in, it stays.", "Slow, then it stays. The Dhirise dashboard lets you finish the first lesson. The second read is the one that counts."],
  ["Writing it in my own words makes it stay.", "It stays in your own words. The Dhirise dashboard ends each hour with a line in your words, not a stranger’s comments."]]],
 14: ["Someone asks, “What do you want to become?” Inside, you feel…", [
  ["Many answers. It changes every few months.", "The answer keeps changing. The Dhirise dashboard does not lock a career. It locks the subject you can stand for a year."],
  ["Certain. I have decided and I am going for it.", "You have decided. The Dhirise dashboard points this month’s papers at that door, plus one other set."],
  ["Unsure. I may go with what family suggests.", "You may follow family. The Dhirise dashboard keeps a private line for what you would choose if the table were empty."],
  ["A direction is forming. I am exploring calmly.", "A direction is forming. The Dhirise dashboard holds one hour a week for that. It is not another mock."]]],
 15: ["Which kind of class leaves you feeling heaviest?", [
  ["Memory-heavy: history dates, biology terms.", "Dates and terms. The Dhirise dashboard gives you ten a day. A chapter of dates is not one study room."],
  ["Writing-heavy: essays, literature, long answers.", "Long answers. The Dhirise dashboard asks for the outline first. The essay opens after the bones."],
  ["Speed and numbers: maths, physics, timed problems.", "Timed numbers. The Dhirise dashboard times five questions, not the whole paper."],
  ["None in particular. It depends on the teacher.", "It depends on the teacher. The Dhirise dashboard looks at the paper, not the period. The heavy page still gets the hour."]]],
 16: ["The night before an important day, your sleep is…", [
  ["Light and broken. The mind keeps working.", "Light and broken. The Dhirise dashboard closes the book one hour before lights. The night is not a study room."],
  ["Short but deep. I wake with a to-do list.", "Short, then a list. The Dhirise dashboard has you write the list at night. The morning room is not for planning."],
  ["Long and heavy. Waking is hard.", "Long and heavy. The Dhirise dashboard sets the alarm habit, phone across the room. The paper does not slide to the afternoon."],
  ["Steady. I sleep on time.", "You sleep on time. The Dhirise dashboard locks that hour in exam week. It is the mark you do not spend."]]],
 17: ["Close your eyes and picture yourself ten years from now. You see…", [
  ["Travelling, creating, a life full of colour.", "Travel and making. The Dhirise dashboard keeps one making hour on the week. The exam list cannot eat it."],
  ["At the top, respected and leading.", "At the top, leading. The Dhirise dashboard trains the work under the title. The title is not a screen."],
  ["Settled and secure, family close by.", "Settled, family close. The Dhirise dashboard still keeps the study room yours."],
  ["Doing work that genuinely helps people.", "Work that helps. The Dhirise dashboard ties one chapter to that. The help is later. The page is now."]]],
 18: ["What sits heaviest on your heart right now?", [
  ["The weight of everyone’s expectations.", "Everyone’s expectations. The Dhirise dashboard asks whose. One name. The plan follows your page."],
  ["A fear that I am not good enough.", "Not good enough. The Dhirise dashboard shows last week’s finished set before the new one."],
  ["Distractions: the phone, people, noise.", "Phone, people, noise. The Dhirise dashboard study room keeps the phone out. It is not a social feed."],
  ["Nothing heavy. I am at peace with my pace.", "Nothing heavy. The Dhirise dashboard does not add a target to a day that is already holding."]]]
};

/* render questions.html?q=N into the shared screen */
(function () {
  "use strict";
  var KEY = "dhirise.answers";
  var n = parseInt(new URLSearchParams(location.search).get("q"), 10);
  var item = window.DHIRISE_QUESTIONS[n];
  if (!item) { location.replace("question.html"); return; }
  var $ = function (id) { return document.getElementById(id); };
  function all() { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(choice) { var a = all(); a[n] = { q: n, choice: choice }; sessionStorage.setItem(KEY, JSON.stringify(a)); }

  document.title = "Dhirise · " + n + " / 18";
  $("qscreen").style.backgroundImage = 'url("assets/interview%20bg/Q' + n + '.png")';
  $("step").textContent = n + " / 18";
  $("track").style.setProperty("--n", n);
  $("track").setAttribute("aria-valuenow", n);
  $("track").setAttribute("aria-label", "Question " + n + " of 18");
  $("qText").textContent = item[0];
  if (n === 18) $("next").textContent = "Finish";   /* the last question: Finish, not Next */
  var tips = {};
  Array.prototype.forEach.call(document.querySelectorAll("#options button"), function (b, i) {
    b.textContent = item[1][i][0]; tips[i + 1] = item[1][i][1];
  });

  dhiriseQuestion({
    n: n,
    tips: tips,
    load: function () { var v = all()[n]; return v && v.choice; },
    save: save,
    back: n === 3 ? "question2.html" : "questions.html?q=" + (n - 1),
    next: n === 18 ? "done.html" : "questions.html?q=" + (n + 1)   /* Next opens only after the tip has gone */
  });
})();
