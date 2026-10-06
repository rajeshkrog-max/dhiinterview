/* Dhirise · the 18 questions: one source of truth for the screens and the scoring (js/engine/score.js).
   Wording is the current on-screen text. Option ids keep the original order ("q1o4" = the 4th written option);
   the screen shuffles positions per student, so ids, never positions, are stored.
   Each option: { id, text, style:{v,p,k}, state:"calm|restless|low", areas:{area: -2..+2}, peerSeed, tip:{mirror,room,line}, flags, oldTip }
   style is internal only (v = quick and creative, p = sharp and driven, k = steady and patient); never shown to a student.
   tip comes from the TIPS table below; oldTip is the earlier tip text, kept only as a fallback. */
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

  /* tip cards: [mirror (≤14 words), room, line (≤20 words)], by option id */
  var TIPS = {
    q1o1: ["Your mind wakes before your feet do. That is a lot of energy.", "Habit Tracker", "A Habit Tracker tick for one calm first task gives that early rush somewhere steady to land."],
    q1o2: ["You wake ready to go, and hunger arrives right on time.", "Habit Tracker", "Make breakfast one of your five habits; the daily tick keeps that sharp start fed."],
    q1o3: ["Some mornings the blanket wins. The start feels heavy, and that is real.", "Habit Tracker", "Habit Tracker asks for just one tick: feet on the floor. Streaks grow from small starts."],
    q1o4: ["Your mornings change day to day. You never know which one will arrive.", "Habit Tracker", "With a single wake-up tick, Habit Tracker shows the pattern. Misses stay visible, without any scolding."],

    q2o1: ["When you're deep in study, food slips away until your body notices.", "Meal Tracker", "Meal Tracker lets you log an Indian plate in seconds, so a skipped lunch shows up early."],
    q2o2: ["Hunger turns up your edge. You feel it before anyone else does.", "Meal Tracker", "Logging each plate in Meal Tracker helps you see which skipped meals come before the snappy hours."],
    q2o3: ["You can go long without food and hardly feel it.", "Meal Tracker", "Your plate log in Meal Tracker quietly shows the gaps your body is too busy to mention."],
    q2o4: ["You keep your meals on time, even on busy days. That is steady.", "Meal Tracker", "Meal Tracker keeps that rhythm visible, so you can hold on to it through exam weeks too."],

    q3o1: ["Ideas everywhere, books open everywhere. Your table shows a curious mind.", "Study hour", "Study hour is a live room with other students and DND mode, so one book gets your full attention."],
    q3o2: ["You like a plan you can see. Order helps you think.", "Habit Tracker", "Pin up to five daily habits in Habit Tracker; ticking them off helps the plan last past week one."],
    q3o3: ["Your table is cosy and lived-in. It has been that way a while.", "Habit Tracker", "Try one small habit, like clearing one thing each night. Habit Tracker counts the streak for you."],
    q3o4: ["Only what you need today. You keep things light and clear.", "Study hour", "Bring that clean focus into Study hour, where DND mode keeps the phone quiet while you work."],

    q4o1: ["A low mark makes your mind race ahead to what comes next.", "Progress", "Progress shows your steps over the weeks, so one result sits inside a longer story."],
    q4o2: ["It stings, and you feel it hot. You expected more, and you care.", "Exams", "In Exams, your teacher's remarks show where the marks slipped, so that heat has one clear place to go."],
    q4o3: ["The sadness stays quietly for days. That is heavy to carry alone.", "Progress", "Progress keeps every small step you have taken, so one mark never erases the work behind it."],
    q4o4: ["You pause, then look for the lesson. That takes quiet strength.", "Exams", "Teacher remarks in Exams point to the exact questions, so your lesson-finding has something real to work with."],

    q5o1: ["Your mood shifts like the wind. Hour to hour, it keeps moving.", "Mood Tracker", "Mood Tracker asks for one colour a day. Over weeks, even the windy days start to show a shape."],
    q5o2: ["Bright and intense. You feel things fully, and you run warm.", "Mood Tracker", "One colour a day in Mood Tracker, plus a short Dhi line, helps you notice the heat early."],
    q5o3: ["Heavy and slow, like clouds that won't move. Thank you for saying it.", "Mood Tracker", "Mood Tracker takes one colour a day. If grey lingers, its help button can book a private counsellor."],
    q5o4: ["Calm and open. Your inner weather feels clear these days.", "Mood Tracker", "Keep a colour a day in Mood Tracker; your clear days show you what helps keep them clear."],

    q6o1: ["Forty minutes in, your mind takes ten trips at once. A lively mind.", "Modules", "Modules are short films, so a tricky lesson comes in pieces your attention can hold."],
    q6o2: ["You don't just listen, you question. Your mind wants to push back.", "Modules", "Watch the Academic film in Modules, then test your own argument against it at your own pace."],
    q6o3: ["Long lectures pull you toward sleep. Your body is asking for a break.", "Modules", "Modules break lessons into short films, so you can learn in fresh bursts instead of one long sit."],
    q6o4: ["You stay with the lesson and the notes just flow. That is steady attention.", "Modules", "Short films in Modules let you go deeper into the topics you enjoy, beyond the class hour."],

    q7o1: ["You work in bursts, and the last week turns into a sprint.", "DHI desk", "DHI desk can make a short practice paper any day, so revision comes in small rounds, not one rush."],
    q7o2: ["Day one, a timetable. You like to see the whole road ahead.", "DHI desk", "Add a weekly mock test from DHI desk to that timetable to check each chapter as you go."],
    q7o3: ["You take time to start, then you keep going. Steady counts.", "DHI desk", "Once you're moving, a practice paper from DHI desk gives that steady pace a clear target each week."],
    q7o4: ["A little every day, with revision rounds. You plan for the long run.", "DHI desk", "DHI desk can turn each revision round into a quick mock test, so you see what has stuck."],

    q8o1: ["After twenty minutes, your body wants to move. That is how you're built.", "Study hour", "Join a short Study hour round, stretch, then come back. DND mode keeps the pause phone-free."],
    q8o2: ["One stubborn problem, and frustration builds. You hate leaving things unsolved.", "Study hour", "In Study hour, others work beside you live, so you can switch tasks for a while and return calmer."],
    q8o3: ["You can keep sitting, but the pages stop going in. You notice that.", "Study hour", "Study hour with DND mode on helps you keep shorter, fuller blocks instead of long, foggy ones."],
    q8o4: ["You rest before you run out. That is a wise rhythm.", "Study hour", "Study hour fits that rhythm: focus with others in DND mode, take your break, then rejoin."],

    q9o1: ["A hard problem lights you up, then something new catches your eye.", "DHI desk", "Ask DHI desk to clarify just the next step. One small step keeps the spark on this problem."],
    q9o2: ["A tough problem feels like a match you want to win.", "DHI desk", "When you're stuck, DHI desk can clarify the idea underneath, so the win comes from understanding, not guessing."],
    q9o3: ["A hard problem feels like a wall. Familiar ground feels safer.", "DHI desk", "DHI desk can explain it step by step, or draw it out, until the wall has a door."],
    q9o4: ["You break hard things into small steps. That is a real skill.", "DHI desk", "DHI desk can check each step with you, or turn the problem into a story when the steps run out."],

    q10o1: ["You bring the ideas and keep the conversation alive.", "Blog", "Write and share those ideas on Blog, where other students can read them after the talk ends."],
    q10o2: ["You step up and keep the group moving. People look to you.", "Study hour", "Start a Study hour with your group; studying live together keeps everyone on track, you included."],
    q10o3: ["You listen and keep the mood easy. People feel safe around you.", "Study hour", "Study hour lets you study live beside others, with the same easy calm you bring to any group."],
    q10o4: ["You notice who's stuck and help without any fuss.", "Blog", "On Blog you can write a clear explanation once and share it, so more students find your help."],

    q11o1: ["You share with many people for a moment, then you move forward.", "Mood Tracker", "A colour a day in Mood Tracker gives your feelings one steady place, not just quick moments."],
    q11o2: ["You carry it on your own. You've learned to be strong that way.", "Counseling", "If you ever want someone to talk to, Counseling is a private booking, never recorded, and always your choice."],
    q11o3: ["You go quiet and hold it inside. That is a lot to hold.", "Counseling", "Counseling lets you book a private session, never recorded, only when you feel ready. You never have to use it."],
    q11o4: ["You open up to one or two people you trust. A strong circle.", "Mood Tracker", "Mood Tracker adds one colour a day, so you notice low days early and reach your people sooner."],

    q12o1: ["You know it and want it out fast, so the words race ahead.", "DHI desk", "Practise answers aloud with DHI desk in talk mode and find your own pace before class."],
    q12o2: ["You answer with confidence, even before you're fully sure. You trust your voice.", "DHI desk", "Talk it through with DHI desk first; it can clarify the parts you're unsure of before you speak."],
    q12o3: ["Put on the spot, you freeze or keep it short. Many students feel that.", "DHI desk", "DHI desk lets you practise speaking aloud in private, one short answer at a time, with no one watching."],
    q12o4: ["You take a breath, then answer simply. Calm under the spotlight.", "DHI desk", "Use DHI desk's talk mode to practise longer answers, building on the calm you already have."],

    q13o1: ["You learn fast, and it slips away just as fast.", "DHI desk", "A quick mock test from DHI desk a few days later helps catch what is fading before it goes."],
    q13o2: ["One clear look and you've got it. You learn by seeing.", "Modules", "The short films in Modules give you that clear look, and you can replay them whenever you need."],
    q13o3: ["You take your time, and what you learn stays with you.", "Modules", "Modules let you watch a short film at your own pace, as many times as you like."],
    q13o4: ["Writing it in your own words makes it yours.", "DHI desk", "Put a topic in your own words with DHI desk's write mode, then let a mock test check it."],

    q14o1: ["So many paths interest you. Your answer keeps changing, and that is okay.", "DHI desk", "Talk each option through with DHI desk; saying it aloud shows you which one keeps coming back."],
    q14o2: ["You know where you're headed, and you're already walking.", "Blog", "Write about your goal on Blog. Putting it in words helps you share it and stay true to it."],
    q14o3: ["You're not sure yet, and family ideas feel easier to follow.", "DHI desk", "DHI desk is a private place to talk through what you like, before any big decision is made."],
    q14o4: ["A direction is slowly forming. You're exploring without rushing.", "Blog", "Blog lets you read what other students are exploring, and write about the paths you're curious about."],

    q15o1: ["Dates and terms pile up. Memory-heavy classes weigh on you.", "DHI desk", "DHI desk can turn a list of terms into a story, or a short practice paper you come back to."],
    q15o2: ["Long answers and essays feel heavy. There is so much to put down.", "DHI desk", "Try DHI desk's write mode to outline an answer first, then fill it in one part at a time."],
    q15o3: ["Timed problems and numbers feel heavy. The clock adds pressure.", "Exams", "Exams has an MCQ hint slider, so you can practise teacher papers with as much help as you need."],
    q15o4: ["It's less the subject, more the teacher. You notice how things are taught.", "Exams", "Exams keeps teacher papers and their remarks in one place, whatever the subject."],

    q16o1: ["The night before, your mind keeps working long after the lights go off.", "Habit Tracker", "Add a habit of closing the books an hour before bed. Habit Tracker shows the streak as the wind-down grows."],
    q16o2: ["Short, deep sleep, and you wake already planning. You're ready to go.", "Habit Tracker", "A night habit of writing tomorrow's list, ticked in Habit Tracker, lets mornings start with action, not planning."],
    q16o3: ["Your sleep runs long and heavy. Waking up feels like climbing out.", "Habit Tracker", "Habit Tracker can hold one fixed wake-up time as a daily tick, with your streak building each morning."],
    q16o4: ["You sleep on time, even before big days. That is a gift to yourself.", "Habit Tracker", "Keep sleep as one of your five habits. Its streak helps you protect it in exam week too."],

    q17o1: ["You see colour, travel and making things. A life you create yourself.", "Blog", "Blog is a place to write and share what you make, starting now, not ten years from now."],
    q17o2: ["You see yourself leading, respected for what you do.", "Modules", "Short Self help films in Modules can help you build the daily habits that leading is made of."],
    q17o3: ["You see a calm, secure life with family close. That matters.", "Modules", "Modules has short Self help films for building the steady habits a secure life rests on."],
    q17o4: ["You want your work to genuinely help people. That is a big heart.", "Blog", "Write on Blog about the people you want to help. Sharing it can turn a wish into a plan."],

    q18o1: ["Everyone's hopes sit on your shoulders. That weight is real.", "Counseling", "If it gets heavy, Counseling offers a private talk with a counsellor, never recorded, booked only if you want."],
    q18o2: ["A quiet fear that you're not enough. Many students carry it too.", "Progress", "Progress shows what you have already done, week by week, so the fear has something real to meet."],
    q18o3: ["Phone, people, noise. Everything pulls at your attention.", "Progress", "Progress shows the work you finished on quieter days, so you can see what helps you focus."],
    q18o4: ["Nothing heavy right now. You're at peace with your own pace.", "Mood Tracker", "A colour a day in Mood Tracker keeps a record of these calm days to look back on."]
  };

  /* ids, tips, and a 0 for every listed area an option leaves out */
  var byN = {}, byId = {};
  LIST.forEach(function (q) {
    q.options.forEach(function (o, i) {
      o.id = "q" + q.n + "o" + (i + 1);
      var t = TIPS[o.id];
      if (t) o.tip = { mirror: t[0], room: t[1], line: t[2] };
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
