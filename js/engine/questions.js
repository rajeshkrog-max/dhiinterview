/* Dhirise · the 18 questions: one source of truth for the screens and the scoring (js/engine/score.js).
   Wording is the current on-screen text. Option ids keep the original order ("q1o4" = the 4th written option);
   the screen shuffles positions per student, so ids, never positions, are stored.
   Each option: { id, text, style:{v,p,k}, state:"calm|restless|low", areas:{area: -2..+2}, peerSeed, tip:{mirror,room,line}, flags, oldTip }
   style is internal only (v = quick and creative, p = sharp and driven, k = steady and patient); never shown to a student.
   tip is filled in Part 3; until then the screen shows oldTip (the tip text the screens had before). */
(function (root) {
  "use strict";
  var AREAS = ["routine", "emotions", "drive", "connection", "expression", "clarity", "purpose"];

  /* O(text, [v,p,k], state, {areas}, peerSeed, oldTip, [flags], subject) */
  function O(text, s, state, areas, peerSeed, oldTip, flags, subject) {
    return { text: text, style: { v: s[0], p: s[1], k: s[2] }, state: state, areas: areas || {}, peerSeed: peerSeed,
      tip: { mirror: "", room: "", line: "" }, flags: flags || [], subject: subject || null, oldTip: oldTip };
  }

  var LIST = [
    { n: 1, areas: ["routine"], text: "A holiday morning. No alarm. What does your body do on its own?", options: [
      O("I wake early. My mind is already running.", [2, 0, 0], "restless", { routine: 1 }, 24,
        "Your mind is already running. On the Dhirise dashboard you book a fixed morning study room, with others, phone kept out, so the rush has a place to sit."),
      O("I wake hungry and ready. A delay makes me sharp.", [0, 2, 0], "calm", { routine: 1 }, 22,
        "You wake hungry. The Dhirise dashboard asks you to log breakfast before it opens the hard set. No empty plate, no hard paper."),
      O("I stay under the blanket. The start is slow and heavy.", [0, 0, 2], "low", { routine: -1 }, 29,
        "The start is heavy. The Dhirise dashboard gives you one tick first: stand up. The study room opens after that tick."),
      O("It changes. Some mornings I am up, some I cannot move.", [2, 0, 1], "restless", { routine: -1 }, 25,
        "The morning changes. The Dhirise dashboard asks how the morning feels, then sets a short sit or the hard chapter.")] },

    { n: 2, areas: ["routine"], text: "Deep in study. A meal gets skipped. What happens next?", options: [
      O("I forget to eat, then feel shaky or far away.", [2, 0, 0], "restless", { routine: -2 }, 27,
        "You forget, then shake. The Dhirise dashboard puts the meal next to the chapter. Skip it and the study room shows the gap before you shake."),
      O("I get sharp. Hunger makes me snappy.", [0, 2, 0], "restless", { routine: -1 }, 26,
        "Hunger makes you sharp. The Dhirise dashboard marks a missed plate on the week. The practice paper waits until lunch is logged."),
      O("I barely notice. I can go a long time without food.", [0, 0, 2], "calm", { routine: -1 }, 21,
        "You barely notice. The Dhirise dashboard still asks at the meal hour. That gap is why the evening work falls."),
      O("It almost never happens. I eat at the same time.", [0, 0, 1], "calm", { routine: 2 }, 26,
        "You eat on time. The Dhirise dashboard keeps that hour as a tick. Exam week cannot delete it.")] },

    { n: 3, areas: ["routine", "drive"], text: "Picture your study table right now. It looks like…", options: [
      O("Several open books and ideas scattered everywhere.", [2, 0, 0], "restless", { routine: -1, drive: 0 }, 31,
        "Books everywhere. The Dhirise dashboard opens one set in the study room. The other books stay outside it."),
      O("Sorted by priority, with a plan pinned up.", [0, 2, 0], "calm", { routine: 2, drive: 1 }, 18,
        "A plan is pinned. The Dhirise dashboard holds three ticks, not a second exam. You see only today’s set."),
      O("Comfortable but cluttered. It rarely changes.", [0, 0, 2], "low", { routine: -1, drive: -1 }, 28,
        "The clutter never moves. The Dhirise dashboard asks for one thing off the desk each night. Your desk, not a feed."),
      O("Simple and clean. Only what I need today.", [0, 0, 1], "calm", { routine: 2, drive: 0 }, 23,
        "Only today’s books. The Dhirise dashboard plays the next lesson after today is shut.")] },

    { n: 4, areas: ["emotions"], text: "A result comes back lower than you hoped. The first wave inside you is…", options: [
      O("Worry. What will happen now?", [2, 0, 0], "restless", { emotions: -1 }, 34,
        "Worry about what happens next. The Dhirise dashboard holds the mark. Tomorrow you open one missed question, not the whole future."),
      O("Anger, at myself or at the unfairness.", [0, 2, 0], "restless", { emotions: -1 }, 22,
        "Anger at yourself or the paper. The Dhirise dashboard sends that heat into the one remark your teacher left. Then it closes."),
      O("A quiet sadness that stays for days.", [0, 0, 2], "low", { emotions: -2 }, 19,
        "A sadness that stays. The Dhirise dashboard takes the colour of the day. If it stays, you can book a counselor from the same screen. No new target that week.", ["lowMood"]),
      O("A pause, then: what can I learn from this?", [0, 1, 0], "calm", { emotions: 2 }, 25,
        "You look for the lesson. The Dhirise dashboard writes that lesson as the first line of the next paper.")] },

    { n: 5, areas: ["emotions"], text: "Which weather feels most like your inner mood these days?", options: [
      O("A windy day, changing every hour.", [2, 0, 0], "restless", { emotions: -1 }, 30,
        "The mood changes every hour. The Dhirise dashboard shortens the study room on a day like that. Not a six-hour block."),
      O("A hot afternoon, bright and intense.", [0, 2, 0], "restless", { emotions: 0 }, 21,
        "Bright and intense. The Dhirise dashboard puts the hardest paper in the morning, and locks a stop before you burn out."),
      O("Monsoon clouds, heavy and slow.", [0, 0, 2], "low", { emotions: -2 }, 22,
        "Heavy and slow. The Dhirise dashboard starts you with five minutes up, then a short lesson. The cloud is not a weak score.", ["lowMood"]),
      O("A clear morning sky, calm and open.", [1, 0, 0], "calm", { emotions: 2 }, 27,
        "Calm and open. The Dhirise dashboard puts first the chapter you have been avoiding.")] },

    { n: 6, areas: ["expression", "clarity"], text: "Forty minutes into a lecture, your mind is usually…", options: [
      O("Wandering through ten other thoughts.", [2, 0, 0], "restless", { expression: -1, clarity: -1 }, 36,
        "Ten other thoughts. In the Dhirise dashboard study room you drop one line every ten minutes. The others can see you stayed."),
      O("Arguing with the teacher in my head.", [0, 2, 0], "restless", { expression: 1, clarity: 0 }, 14,
        "You argue inside. The Dhirise dashboard turns that into one question you send after class. Not a comment thread."),
      O("Drifting toward sleep.", [0, 0, 2], "low", { expression: -1, clarity: -1 }, 29,
        "You drift to sleep. The Dhirise dashboard moves that subject to the first study room, not the last period."),
      O("Still with it, taking notes without effort.", [0, 1, 0], "calm", { expression: 2, clarity: 1 }, 21,
        "You stay and write. The Dhirise dashboard lets you post that note in your own words, the same evening, with no pile-on.")] },

    { n: 7, areas: ["drive"], text: "The exam is 30 days away. Left to yourself, you would…", options: [
      O("Study in bursts with gaps, then rush in the last week.", [2, 0, 0], "restless", { drive: -1 }, 38,
        "Bursts, then a last-week rush. The Dhirise dashboard cuts the month into four Sunday ticks. The rush does not count as a plan."),
      O("Make a timetable on day one and track every chapter.", [0, 2, 0], "calm", { drive: 2 }, 19,
        "Timetable on day one. The Dhirise dashboard tracks the chapters, and keeps one rest day empty."),
      O("Start slowly, but keep a steady pace once going.", [0, 0, 2], "calm", { drive: 0 }, 24,
        "Slow, then steady. The Dhirise dashboard opens the study room at one fixed time, with others who also start slow."),
      O("Do a little daily, with planned revision rounds.", [0, 0, 1], "calm", { drive: 2 }, 19,
        "A little daily, with revision. The Dhirise dashboard brings the same chapter back on day one, day three, and day seven.")] },

    { n: 8, areas: ["drive"], text: "In a long study session, what makes you lose steam?", options: [
      O("Restlessness. After 20 minutes I need to move.", [2, 0, 0], "restless", { drive: -1 }, 33,
        "You need to move after twenty minutes. The Dhirise dashboard sets the study room to twenty minutes, then a stand tick. The move counts."),
      O("A problem that will not give in. Frustration builds.", [0, 2, 0], "restless", { drive: 0 }, 24,
        "One problem will not give. The Dhirise dashboard parks it. It returns tomorrow. No one watches you grind."),
      O("I can keep sitting, but less goes in.", [0, 0, 2], "low", { drive: -1 }, 27,
        "You sit, and less goes in. The Dhirise dashboard ends the room when the page goes blank. More time is not more study."),
      O("I take short breaks before I tire.", [1, 0, 0], "calm", { drive: 2 }, 16,
        "You break before you tire. The Dhirise dashboard keeps that break as a tick. The next paper opens only after it.")] },

    { n: 9, areas: ["drive", "clarity"], text: "A difficult logic problem sits in front of you. It feels like…", options: [
      O("Exciting at first, then I jump to something else.", [2, 0, 0], "restless", { drive: -1, clarity: 0 }, 27,
        "Exciting, then you jump. The Dhirise dashboard asks for the first step only. You can ask it to explain. The rest waits."),
      O("A challenge I must beat.", [0, 2, 0], "calm", { drive: 2, clarity: 1 }, 25,
        "A challenge you must beat. The Dhirise dashboard gives you one practice of that sum. It will not serve it again tonight."),
      O("A wall. I would rather do something familiar.", [0, 0, 2], "low", { drive: -2, clarity: -1 }, 24,
        "It feels like a wall. The Dhirise dashboard puts one easy question first, then one line of the hard one, and a short lesson if you want it."),
      O("A puzzle I can break into small steps.", [0, 0, 1], "calm", { drive: 1, clarity: 1 }, 24,
        "You cut it into steps. The Dhirise dashboard saves those steps as a card. Other days copy that card.")] },

    { n: 10, areas: ["connection"], text: "In a group study, you are usually the one who…", options: [
      O("Brings new ideas and keeps the talk going.", [2, 0, 0], "calm", { connection: 1 }, 26,
        "You keep the talk going. The Dhirise dashboard saves the last five minutes of the study room for writing what was decided."),
      O("Takes charge and keeps everyone on track.", [0, 2, 0], "calm", { connection: 0 }, 18,
        "You take charge. The Dhirise dashboard asks you to hand the list to someone else in the room."),
      O("Listens, supports, and keeps the mood easy.", [0, 0, 2], "calm", { connection: 2 }, 31,
        "You keep the mood easy. The Dhirise dashboard asks you to say one thing you understood before you leave."),
      O("Quietly helps whoever is stuck.", [0, 0, 1], "calm", { connection: 1 }, 25,
        "You help the one who is stuck. The Dhirise dashboard lets you explain once, then opens your own set.")] },

    { n: 11, areas: ["emotions", "connection"], text: "On a low day, where do you take your feelings?", options: [
      O("To many people, briefly. Then I move on.", [2, 0, 0], "restless", { emotions: 0, connection: 0 }, 17,
        "You tell many people, briefly. The Dhirise dashboard asks for one person who heard all of it."),
      O("Nowhere. I handle it myself.", [0, 2, 0], "restless", { emotions: -1, connection: -1 }, 29,
        "You handle it yourself. The Dhirise dashboard leaves a counselor booking on the screen. You do not have to use it.", ["keepsFeelingsInside"]),
      O("I go quiet and keep it inside.", [0, 0, 2], "low", { emotions: -2, connection: -2 }, 31,
        "You keep it inside. The Dhirise dashboard does not turn this into a study tip. From the same screen you can book a counselor. The talk is not saved as a recording.", ["keepsFeelingsInside"]),
      O("To one or two people I trust.", [0, 0, 1], "calm", { emotions: 2, connection: 2 }, 23,
        "You tell one or two you trust. The Dhirise dashboard can let them into your study room. They are part of the plan.")] },

    { n: 12, areas: ["expression", "connection"], text: "The teacher suddenly asks you a question. You…", options: [
      O("Speak fast and sometimes lose the thread.", [2, 0, 0], "restless", { expression: -1, connection: 0 }, 26,
        "You speak fast and lose it. The Dhirise dashboard has you practice one sentence in the study room, phone out. Speed is not the mark."),
      O("Answer confidently, even if not fully sure.", [0, 2, 0], "calm", { expression: 1, connection: 0 }, 21,
        "You answer sure, even when you are not. The Dhirise dashboard asks you to mark only the part you can defend."),
      O("Freeze, or keep it very short.", [0, 0, 2], "low", { expression: -2, connection: -1 }, 32,
        "You freeze. The Dhirise dashboard gives you the first line as a night lesson, said aloud."),
      O("Take a breath and answer simply.", [1, 0, 0], "calm", { expression: 2, connection: 1 }, 21,
        "You breathe and answer simply. The Dhirise dashboard keeps that simple line as the model.")] },

    { n: 13, areas: ["expression"], text: "How does learning stay with you?", options: [
      O("I pick it up fast, and it fades fast.", [2, 0, 0], "restless", { expression: -1 }, 35,
        "Fast in, fast out. The Dhirise dashboard brings the same page back tonight and on day three. Once is not learned."),
      O("Seeing it once, clearly, is enough.", [0, 2, 0], "calm", { expression: 0 }, 15,
        "One clear look. The Dhirise dashboard opens tomorrow’s room with that page closed. If it is gone, the look was not enough."),
      O("Slow to learn, but once it is in, it stays.", [0, 0, 2], "calm", { expression: 1 }, 28,
        "Slow, then it stays. The Dhirise dashboard lets you finish the first lesson. The second read is the one that counts."),
      O("Writing it in my own words makes it stay.", [0, 1, 0], "calm", { expression: 2 }, 22,
        "It stays in your own words. The Dhirise dashboard ends each hour with a line in your words, not a stranger’s comments.")] },

    { n: 14, areas: ["clarity", "purpose"], text: "Someone asks, “What do you want to become?” Inside, you feel…", options: [
      O("Many answers. It changes every few months.", [2, 0, 0], "restless", { clarity: -1, purpose: 0 }, 33,
        "The answer keeps changing. The Dhirise dashboard does not lock a career. It locks the subject you can stand for a year.", ["lowCareerClarity"]),
      O("Certain. I have decided and I am going for it.", [0, 2, 0], "calm", { clarity: 2, purpose: 1 }, 20,
        "You have decided. The Dhirise dashboard points this month’s papers at that door, plus one other set."),
      O("Unsure. I may go with what family suggests.", [0, 0, 2], "low", { clarity: -2, purpose: -1 }, 25,
        "You may follow family. The Dhirise dashboard keeps a private line for what you would choose if the table were empty.", ["lowCareerClarity", "heavyExpectations"]),
      O("A direction is forming. I am exploring calmly.", [1, 0, 0], "calm", { clarity: 1, purpose: 1 }, 22,
        "A direction is forming. The Dhirise dashboard holds one hour a week for that. It is not another mock.")] },

    { n: 15, areas: [], profileOnly: true, text: "Which kind of class leaves you feeling heaviest?", options: [
      O("Memory-heavy: history dates, biology terms.", [0, 0, 0], "calm", {}, 27,
        "Dates and terms. The Dhirise dashboard gives you ten a day. A chapter of dates is not one study room.", [], "memory"),
      O("Writing-heavy: essays, literature, long answers.", [0, 0, 0], "calm", {}, 22,
        "Long answers. The Dhirise dashboard asks for the outline first. The essay opens after the bones.", [], "writing"),
      O("Speed and numbers: maths, physics, timed problems.", [0, 0, 0], "calm", {}, 34,
        "Timed numbers. The Dhirise dashboard times five questions, not the whole paper.", [], "numbers"),
      O("None in particular. It depends on the teacher.", [0, 0, 0], "calm", {}, 17,
        "It depends on the teacher. The Dhirise dashboard looks at the paper, not the period. The heavy page still gets the hour.", [], "mixed")] },

    { n: 16, areas: ["routine"], text: "The night before an important day, your sleep is…", options: [
      O("Light and broken. The mind keeps working.", [2, 0, 0], "restless", { routine: -1 }, 38,
        "Light and broken. The Dhirise dashboard closes the book one hour before lights. The night is not a study room.", ["sleepStrain"]),
      O("Short but deep. I wake with a to-do list.", [0, 2, 0], "calm", { routine: 0 }, 20,
        "Short, then a list. The Dhirise dashboard has you write the list at night. The morning room is not for planning."),
      O("Long and heavy. Waking is hard.", [0, 0, 2], "low", { routine: -1 }, 21,
        "Long and heavy. The Dhirise dashboard sets the alarm habit, phone across the room. The paper does not slide to the afternoon.", ["sleepStrain"]),
      O("Steady. I sleep on time.", [0, 0, 1], "calm", { routine: 2 }, 21,
        "You sleep on time. The Dhirise dashboard locks that hour in exam week. It is the mark you do not spend.")] },

    { n: 17, areas: ["purpose"], text: "Close your eyes and picture yourself ten years from now. You see…", options: [
      O("Travelling, creating, a life full of colour.", [2, 0, 0], "calm", { purpose: 1 }, 29,
        "Travel and making. The Dhirise dashboard keeps one making hour on the week. The exam list cannot eat it."),
      O("At the top, respected and leading.", [0, 2, 0], "calm", { purpose: 1 }, 26,
        "At the top, leading. The Dhirise dashboard trains the work under the title. The title is not a screen."),
      O("Settled and secure, family close by.", [0, 0, 2], "calm", { purpose: 1 }, 24,
        "Settled, family close. The Dhirise dashboard still keeps the study room yours."),
      O("Doing work that genuinely helps people.", [0, 0, 1], "calm", { purpose: 2 }, 21,
        "Work that helps. The Dhirise dashboard ties one chapter to that. The help is later. The page is now.")] },

    { n: 18, areas: ["emotions", "purpose"], text: "What sits heaviest on your heart right now?", options: [
      O("The weight of everyone’s expectations.", [0, 2, 0], "restless", { emotions: -1, purpose: -1 }, 34,
        "Everyone’s expectations. The Dhirise dashboard asks whose. One name. The plan follows your page.", ["heavyExpectations"]),
      O("A fear that I am not good enough.", [1, 0, 1], "low", { emotions: -2, purpose: 0 }, 27,
        "Not good enough. The Dhirise dashboard shows last week’s finished set before the new one.", ["selfDoubt"]),
      O("Distractions: the phone, people, noise.", [2, 0, 0], "restless", { emotions: 0, purpose: -1 }, 26,
        "Phone, people, noise. The Dhirise dashboard study room keeps the phone out. It is not a social feed."),
      O("Nothing heavy. I am at peace with my pace.", [0, 0, 1], "calm", { emotions: 2, purpose: 1 }, 13,
        "Nothing heavy. The Dhirise dashboard does not add a target to a day that is already holding.")] }
  ];

  /* ids, and a 0 for every listed area an option leaves out */
  var byN = {}, byId = {};
  LIST.forEach(function (q) {
    q.options.forEach(function (o, i) {
      o.id = "q" + q.n + "o" + (i + 1);
      q.areas.forEach(function (a) { if (typeof o.areas[a] !== "number") o.areas[a] = 0; });
      byId[o.id] = o;
    });
    byN[q.n] = q;
  });

  root.DhiQuestions = {
    AREAS: AREAS,
    /* words a student may see */
    AREA_NAMES: { routine: "Daily routine", emotions: "Feelings", drive: "Study drive", connection: "Connection",
      expression: "Speaking and recall", clarity: "Clarity", purpose: "Purpose" },
    STYLE_NAMES: { v: "Quick and creative", p: "Sharp and driven", k: "Steady and patient" },
    TOTAL: LIST.length,
    list: LIST,
    byN: byN,
    option: function (id) { return byId[id] || null; },
    question: function (n) { return byN[n] || null; },
    /* the text a tip card shows: the Part 3 tip once filled, else the old line */
    tipText: function (o) {
      var t = o.tip || {};
      return [t.mirror, t.room, t.line].filter(Boolean).join(" ") || o.oldTip || "";
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
