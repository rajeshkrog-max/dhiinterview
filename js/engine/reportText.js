/* Dhirise · every word the student report shows (report-student.html). Short placeholders; Part 4B writes the final text.
   Keys: areas by score.js area id, styles by styleKey (v/p/k, internal), flags by score.js flag name.
   {name} and {area} are filled in by js/report-student.js. Never: weak, average, bright; no chakra/Ayurveda words. */
window.DhiReportText = {
  title: "{name}'s Mind & Study Profile",
  startLine: "This is where you start. In Dhi it grows with every tick, hour and module.",
  startLabel: "Dhi starting score",

  overviewTitle: "Overview",
  styleTitle: "Learning style",

  /* radar axis names, by area */
  axes: {
    routine: "Daily Routine", emotions: "Emotional Balance", drive: "Focus & Discipline", connection: "Friends & Support",
    expression: "Expression & Memory", clarity: "Clarity & Direction", purpose: "Dreams & Inner Peace"
  },
  bands: { "Strong": "Strong", "Growing": "Growing", "Next to grow": "Next to grow" },

  indices: {
    studyReadiness: "Study Readiness",
    emotionalBalance: "Emotional Balance",
    focusEnergy: "Focus Energy",
    direction: "Direction"
  },

  /* mind-state donut */
  states: { calm: "Calm", restless: "Restless", low: "Low energy" },
  stateLine: {
    calm: "Most of your answers come from a calm, settled place.",
    restless: "Your mind moves fast. A lot is happening inside right now.",
    low: "Some answers show low energy lately. Rest is part of the plan."
  },

  /* learning style */
  confidence: { clear: "Clear", leaning: "Leaning", blended: "Blended" },
  peersLine: "{pct}% of students share your style",
  styles: {
    v: { name: "Quick and creative", peers: 36, lines: ["Ideas come fast and from many sides.", "You learn best in short, lively bursts.", "Variety keeps you going."] },
    p: { name: "Sharp and driven", peers: 29, lines: ["You like goals and a clear target.", "You learn best when you can test yourself.", "Progress keeps you going."] },
    k: { name: "Steady and patient", peers: 35, lines: ["You take your time and it stays.", "You learn best with rhythm and repetition.", "Calm routine keeps you going."] }
  },
  blendLabel: "A blend: {a} and {b}",

  /* what's working / next to grow */
  workingTitle: "What's working",
  growTitle: "Next to grow",
  youSaid: "You said",
  noticedLabel: "What we noticed",
  mattersLabel: "Why it matters for your marks",
  areas: {
    routine:    { noticed: "Your days don't always follow a rhythm.", matters: "A steady day leaves more energy for study." },
    emotions:   { noticed: "Feelings can stay with you for a while.", matters: "A settled mind remembers more in exams." },
    drive:      { noticed: "Long study blocks are hard to hold.", matters: "Short, regular sessions add up before exams." },
    connection: { noticed: "You often handle things on your own.", matters: "Studying with others keeps you going on slow days." },
    expression: { noticed: "Getting answers out can feel hard.", matters: "Clear answers earn marks in written and oral papers." },
    clarity:    { noticed: "Your direction is still forming.", matters: "Knowing why you study makes the hard chapters lighter." },
    purpose:    { noticed: "Some things feel heavy right now.", matters: "A lighter heart makes room for focus." }
  },

  /* gentle signals (max 2 shown) */
  signalsTitle: "Gentle signals",
  flagOrder: ["lowMood", "keepsFeelingsInside", "selfDoubt", "heavyExpectations", "sleepStrain", "lowCareerClarity", "lowConsistency"],
  flags: {
    lowMood: "Your energy has felt low lately. Be kind to yourself this week.",
    keepsFeelingsInside: "You often keep feelings inside. Sharing one thing can help.",
    selfDoubt: "A quiet doubt shows up. Your finished work says otherwise.",
    heavyExpectations: "Other people's hopes feel heavy. Your own pace matters too.",
    sleepStrain: "Sleep before big days is uneasy. A wind-down can help.",
    lowCareerClarity: "Your path is still forming. That is normal at this stage.",
    lowConsistency: "Some answers came quickly. A slower retake may show more."
  },

  /* study blueprint, by style */
  blueprintTitle: "Study blueprint",
  blueprintLabels: { bestTime: "Best time", session: "Session length", revision: "Revision", notes: "Note style", exam: "Exam approach" },
  naturalLabel: "Comes naturally",
  careLabel: "Needs extra care",
  blueprint: {
    v: { bestTime: "Morning, after a short walk", session: "25 minutes, then move", revision: "Day 1, 3 and 7", notes: "Colour, mind maps, drawings", exam: "Easy questions first, then the rest",
         natural: ["New ideas", "Link topics to things you love."], care: ["Finishing", "Close one chapter before you open the next."] },
    p: { bestTime: "Late morning, when you're sharp", session: "45 minutes, then a real break", revision: "Weekly mock test", notes: "Short lists and key points", exam: "Plan your time, then attack",
         natural: ["Focus", "Set one clear target per session."], care: ["Rest", "Stop before you burn out."] },
    k: { bestTime: "Early morning, same time daily", session: "50 minutes, steady", revision: "Little and often", notes: "Your own words, written out", exam: "Read twice, then start calmly",
         natural: ["Memory", "Trust what you learned slowly."], care: ["Starting", "Begin with a five-minute task."] }
  },

  /* 21-day path */
  pathTitle: "Your 21-day path",
  week1Title: "Week 1 · Start small",
  dayLabel: "Day",
  actions: {
    routine: "Wake at the same time",
    emotions: "Pick one word for your mood",
    drive: "One 25-minute focus block",
    connection: "Study with one friend",
    expression: "Explain one topic aloud",
    clarity: "Write one line about a goal",
    purpose: "Note one thing that went well"
  },
  styleAction: { v: "Clear your desk for 2 minutes", p: "Take a real break after study", k: "Start with a 5-minute task" },
  week2: { title: "Week 2 · Grow your {area}", detail: "Longer blocks, a weekly check and a friend to study with." },
  week3: { title: "Week 3 · Make {area} yours", detail: "Your own routine, a mock test and a look back at three weeks." },
  continuesLine: "Continues inside Dhi: Habit Tracker keeps your ticks, Study hour keeps you company, DHI desk explains what's stuck.",

  /* your Dhi rooms: area → [room, line], with a second choice if the room is already used */
  roomsTitle: "Your Dhi rooms",
  areaRooms: {
    routine:    [["Habit Tracker", "A daily tick and a streak for your routine."], ["Meal Tracker", "Log your plate so meals keep their time."]],
    emotions:   [["Mood Tracker", "One colour a day to notice how you feel."], ["Counseling", "A private talk, only if you want one."]],
    drive:      [["Study hour", "Study live with others, DND mode on."], ["DHI desk", "A quick practice paper when you're ready."]],
    connection: [["Study hour", "Company while you study, without the noise."], ["Blog", "Write and share with other students."]],
    expression: [["DHI desk", "Practise answers aloud, in private."], ["Modules", "Short films that make topics clear."]],
    clarity:    [["DHI desk", "Talk your options through, any time."], ["Blog", "Read what other students are exploring."]],
    purpose:    [["Modules", "Short Self help films for your goals."], ["Blog", "Write about where you're headed."]]
  },
  flagRooms: {
    lowMood:             [["Mood Tracker", "A colour a day; the help button is there if you need it."], ["Counseling", "A private talk, only if you want one."]],
    keepsFeelingsInside: [["Counseling", "Private, never recorded, always your choice."], ["Mood Tracker", "A quiet place to note how you feel."]],
    selfDoubt:           [["Progress", "See what you've already done, week by week."], ["Habit Tracker", "Small ticks that show you keep going."]],
    heavyExpectations:   [["Counseling", "Private, never recorded, always your choice."], ["Progress", "Your own steps, at your own pace."]],
    sleepStrain:         [["Habit Tracker", "A wind-down habit with a streak."], ["Mood Tracker", "Notice how sleep changes your days."]],
    lowCareerClarity:    [["DHI desk", "Talk through what you like, in private."], ["Blog", "Read what other students are exploring."]],
    lowConsistency:      [["Study hour", "Slow down and study with others."], ["Habit Tracker", "One small tick a day."]]
  },
  styleRooms: { v: ["Study hour", "Short live sessions that keep you moving."], p: ["Exams", "Teacher papers and remarks to aim at."], k: ["Habit Tracker", "A steady streak for a steady learner."] },

  /* join */
  joinTitle: "Dhi early access",
  joinLine: "A quiet WhatsApp group for students. Be first in when Dhi opens.",
  joinButton: "Join Dhi early access on WhatsApp",
  joinSoon: "WhatsApp early access opens soon",
  joinedLine: "You're in · ••••{last4}",
  openGroup: "Open the WhatsApp group",
  shareButton: "Share with a friend",
  shareText: "I just found my study style with Dhirise. Try it:",
  shareCopied: "Link copied",

  footer: "A study and wellbeing screening based on your answers. Not a medical or psychological diagnosis."
};
