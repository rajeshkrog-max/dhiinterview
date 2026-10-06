/* Dhirise · Manas Darpan — all text and content lives in this file.
   Loaded as a plain script (no modules) so the app runs from file:// and localhost alike. */
window.DHI = (function () {
"use strict";

const BRAND = {
  name: "Dhirise",
  product: "Manas Darpan",
  productSkt: "मनस् दर्पण",
  tagline: "Your mentor for mind, habits and learning",
  disclaimer: "A reflective tool inspired by Ayurvedic ideas, not a medical or psychological diagnosis."
};

const WELCOME = {
  eyebrow: "Dhirise Mind Mirror",
  title: "Let’s see how your mind likes to learn",
  body: "Welcome to Dhirise. In the next few minutes you’ll answer 18 small questions about everyday student life. There are no right or wrong answers, and nothing here is a test. Pick what feels most like you, not what sounds best. At the end you’ll get a warm, simple picture of your nature, your mind today and a study rhythm that suits you.",
  button: "Begin"
};

const CLASSES = ["Class 8", "Class 9", "Class 10", "Class 11", "Class 12", "College · 1st year", "College · 2nd year", "College · 3rd year", "College · 4th year", "Graduate", "Other"];
const STREAMS = ["Science (PCM)", "Science (PCB)", "Science (PCMB)", "Commerce", "Arts / Humanities", "Vocational", "Not decided yet", "Other"];

/* ---------- the seven chakras ----------
   line: one-line meaning for the intro slide · band: what their score means · plan: one habit per week of the 21-day plan */
const CH = [
 { n: "Muladhara", d: "मूलाधार", en: "Root", m: "Roots & routine", hex: "#e5483e", petals: 4, bija: "लं",
   line: "your roots, routine and stability",
   about: "Feeling safe, steady and grounded: sleep, food and a daily routine you can count on.",
   band: {
     low: "Your routine and sense of stability need some care right now. When sleep, meals or the day’s rhythm feel shaky, studying feels harder than it should. That’s fixable, one anchor at a time.",
     mid: "You have some routine in place, but it bends easily. One or two fixed anchors would make everything else feel easier.",
     high: "You’re well grounded. Your routine gives you a steady base to build everything else on." },
   practice: { t: "One fixed anchor", d: "Pick just one: the same wake time, bedtime or breakfast time. Keep it for 21 days, even on Sundays." },
   follow: ["What time did you sleep and wake up yesterday? Is that a usual day?", "Walk me through a normal school day, from morning to night.", "What usually throws your routine off?"],
   plan: ["Wake up at the same time every day this week", "Add a fixed bedtime, 8 hours before your wake-up", "Plan tomorrow in three lines before sleeping"] },

 { n: "Svadhisthana", d: "स्वाधिष्ठान", en: "Sacral", m: "Feelings & flow", hex: "#f08a3c", petals: 6, bija: "वं",
   line: "your feelings, mood and flow",
   about: "How your feelings move: mood, enjoyment, and bouncing back after a setback.",
   band: {
     low: "Your feelings may be getting stuck or swinging a lot lately. That’s very human. Giving them a safe outlet makes a big difference.",
     mid: "You handle feelings fairly well, though some moods stay longer than they need to.",
     high: "You let feelings flow and bounce back well. That emotional resilience is a real strength." },
   practice: { t: "Five-minute feelings journal", d: "Each night write one thing that felt good, one that felt heavy, and one thing you’re grateful for." },
   follow: ["When a result disappoints you, what do you do in the first hour?", "What do you do just for fun, with no goal attached?", "How long does a bad mood usually stay with you?"],
   plan: ["Write three lines in a feelings journal every night", "Do one thing purely for fun every day", "When a mood stays, name it out loud to someone"] },

 { n: "Manipura", d: "मणिपूर", en: "Solar plexus", m: "Willpower & effort", hex: "#f2c94c", petals: 10, bija: "रं",
   line: "your willpower, effort and confidence",
   about: "Your inner fire: willpower, self-discipline, and the confidence to start and finish.",
   band: {
     low: "Starting and sticking with effort feels tough right now. Willpower is a skill, not a personality. It grows with small, visible wins.",
     mid: "You have willpower, but it comes and goes. A few small daily wins will make it steadier.",
     high: "You have strong drive and follow-through. Remember to rest too, so the fire doesn’t burn out." },
   practice: { t: "Tiny-win list", d: "Each morning write three small, doable tasks and tick them off. Every tick builds willpower." },
   follow: ["What usually breaks your study streak?", "Tell me about something you worked hard for and finished.", "When you sit down to study, how long before you feel like stopping?"],
   plan: ["Write and finish three tiny tasks each day", "Start the hardest task first, for just 15 minutes", "Keep a 7-day study streak on a calendar"] },

 { n: "Anahata", d: "अनाहत", en: "Heart", m: "Heart & people", hex: "#4fb67a", petals: 12, bija: "यं",
   line: "your heart, friendships and support",
   about: "Connection with people: friends and family, asking for help and giving it.",
   band: {
     low: "You may be carrying things alone at the moment. Letting even one trusted person in can make the load much lighter.",
     mid: "You have people around you, though you may not always lean on them when things get hard.",
     high: "You connect warmly and support others. People feel safe with you." },
   practice: { t: "One honest conversation", d: "Once a week, tell one trusted person how you’re really doing, not just “fine”." },
   follow: ["Who do you talk to on a bad day?", "Is there someone you’d feel comfortable asking for help with studies?", "How do your friends describe you?"],
   plan: ["Message or talk to one person you care about each day", "Ask one person for help with something this week", "Thank someone specifically each day"] },

 { n: "Vishuddha", d: "विशुद्ध", en: "Throat", m: "Voice & memory", hex: "#3fa2e2", petals: 16, bija: "हं",
   line: "your voice, expression and memory",
   about: "Expressing yourself: speaking up, explaining clearly and recalling what you’ve learned.",
   band: {
     low: "Speaking up or recalling under pressure feels hard right now. Practising in safe places builds this surprisingly fast.",
     mid: "You can express yourself, but pressure sometimes freezes or rushes your words.",
     high: "You express yourself clearly and recall well. Explaining things to others will deepen your learning even more." },
   practice: { t: "Explain it aloud", d: "After each topic, explain it aloud for two minutes, as if teaching a younger student." },
   follow: ["Can you explain one topic you studied this week, as if to a friend?", "How do you feel when you have to speak in front of the class?", "What helps you remember things best?"],
   plan: ["Explain one topic aloud for two minutes every day", "Ask or answer one question in class each day", "Record a one-minute voice summary of each chapter"] },

 { n: "Ajna", d: "आज्ञा", en: "Third eye", m: "Clarity & direction", hex: "#7466e0", petals: 2, bija: "ॐ",
   line: "your clarity, focus and direction",
   about: "Seeing clearly: focus, decisions and a sense of where you’re heading.",
   band: {
     low: "Direction feels unclear right now, and that’s completely normal at your age. The next step is exploring calmly, not deciding everything today.",
     mid: "Some direction is forming. A little structured exploring will make it sharper.",
     high: "You have good clarity about where you’re going. Keep checking that the goal truly feels like yours." },
   practice: { t: "Curiosity list", d: "Write five things you enjoy learning about. Each week, spend 30 minutes exploring one career linked to them." },
   follow: ["What career ideas do you have, and where did those ideas come from?", "If nobody else’s opinion mattered, what would you study?", "Which class makes time pass quickly for you?"],
   plan: ["List five things you love learning about", "Explore one career linked to that list: a video, an article or a person", "Talk to one person who works in a field you’re curious about"] },

 { n: "Sahasrara", d: "सहस्रार", en: "Crown", m: "Dreams & purpose", hex: "#b673e2", petals: 20, bija: "ॐ",
   line: "your dreams, purpose and inner peace",
   about: "Meaning and inner peace: why you’re learning, and feeling okay with your own pace.",
   band: {
     low: "Something feels heavy on your heart right now: expectations, doubt or distractions. Naming it is the first step to making it lighter.",
     mid: "You have dreams, though worry or pressure sometimes clouds them.",
     high: "You feel at peace with your path and have a sense of purpose. That steadiness is precious." },
   practice: { t: "Two quiet minutes", d: "Sit quietly for two minutes each morning. Breathe slowly and ask: what matters to me today?" },
   follow: ["What does a good life look like to you, in your own words?", "What feels heaviest right now, and what would make it lighter?", "When do you feel most like yourself?"],
   plan: ["Two quiet minutes of slow breathing every morning", "Write down why you are studying, in your own words", "Each night, note one moment you felt at peace"] }
];

/* ---------- the 18 questions ----------
   [chakra index, question, options]
   option: [text, dosha weights, guna, balance 0-3, indicative seed %, subject tag] */
const Q = [
 [0, "A holiday morning with no alarm. What does your body do on its own?", [
  ["Wakes early and restless. The mind is already running.", "v2", "r", 1, 31],
  ["Wakes at a fixed hour, hungry and ready to start.", "p2", "r", 2, 24],
  ["Stays under the blanket. A slow, heavy start.", "k2", "t", 1, 33],
  ["Rises with the light, calm and fresh.", "k1p1", "s", 3, 12]]],
 [0, "You’re deep into studying and a meal gets skipped. What happens next?", [
  ["I forget to eat, then feel shaky or spaced out.", "v2", "r", 1, 29],
  ["I get irritable. Hunger makes me snappy.", "p2", "r", 1, 34],
  ["I barely notice. I can go long without food.", "k2", "t", 2, 17],
  ["It rarely happens. I eat at regular times.", "k1", "s", 3, 20]]],
 [0, "Picture your study table right now. It looks like…", [
  ["Several open books and ideas scattered everywhere.", "v2", "r", 1, 36],
  ["Sorted by priority, with a plan pinned up.", "p2", "r", 2, 18],
  ["Comfortable but cluttered. It rarely changes.", "k2", "t", 1, 30],
  ["Simple and clean. Only what I need today.", "p1k1", "s", 3, 16]]],
 [1, "A result comes back lower than you hoped. The first wave inside you is…", [
  ["Worry. What will happen now?", "v2", "r", 1, 38],
  ["Anger, at myself or at the unfairness.", "p2", "r", 1, 22],
  ["A quiet sadness that stays for days.", "k2", "t", 0, 27],
  ["A pause, then: what can I learn from this?", "p1", "s", 3, 13]]],
 [1, "Which weather feels most like your inner mood these days?", [
  ["A windy day, changing every hour.", "v2", "r", 1, 32],
  ["A hot afternoon, bright and intense.", "p2", "r", 2, 21],
  ["Monsoon clouds, heavy and slow.", "k2", "t", 1, 29],
  ["A clear morning sky, calm and open.", "v1k1", "s", 3, 18]]],
 [1, "Forty minutes into a lecture, your mind is usually…", [
  ["Wandering through ten other thoughts.", "v2", "r", 1, 41],
  ["Arguing with the teacher in my head.", "p2", "r", 2, 14],
  ["Drifting toward sleep.", "k2", "t", 1, 30],
  ["Still with it, taking notes without effort.", "p1", "s", 3, 15]]],
 [2, "The exam is 30 days away. Left to yourself, you would…", [
  ["Study in bursts with gaps, then rush in the last week.", "v2", "r", 1, 44],
  ["Make a timetable on day one and track every chapter.", "p2", "r", 2, 19],
  ["Start slowly, but keep a steady pace once going.", "k2", "t", 2, 22],
  ["Do a little daily, with planned revision rounds.", "p1k1", "s", 3, 15]]],
 [2, "In a long study session, what makes you lose steam?", [
  ["Restlessness. After 20 minutes I need to move.", "v2", "r", 1, 39],
  ["A problem that won’t give in. Frustration builds.", "p2", "r", 1, 25],
  ["I can keep sitting, but less goes in.", "k2", "t", 1, 24],
  ["I take short breaks before I tire.", "k1", "s", 3, 12]]],
 [2, "A difficult logic problem sits in front of you. It feels like…", [
  ["Exciting at first, then I jump to something else.", "v2", "r", 1, 30],
  ["A challenge I must beat.", "p2", "r", 2, 27],
  ["A wall. I’d rather do something familiar.", "k2", "t", 0, 28],
  ["A puzzle I can break into small steps.", "p1v1", "s", 3, 15]]],
 [3, "In a group study, you’re usually the one who…", [
  ["Brings new ideas and keeps the talk going.", "v2", "r", 2, 28],
  ["Takes charge and keeps everyone on track.", "p2", "r", 2, 22],
  ["Listens, supports, and keeps the mood easy.", "k2", "s", 2, 33],
  ["Quietly helps whoever is stuck.", "k1", "s", 3, 17]]],
 [3, "On a low day, where do you take your feelings?", [
  ["To many people, briefly. Then I move on.", "v2", "r", 1, 21],
  ["Nowhere. I handle it myself.", "p2", "r", 1, 31],
  ["I go quiet and keep it inside.", "k2", "t", 0, 34],
  ["To one or two people I trust.", "k1", "s", 3, 14]]],
 [4, "The teacher suddenly asks you a question in class. You…", [
  ["Speak fast and sometimes lose the thread.", "v2", "r", 1, 30],
  ["Answer confidently, even if not fully sure.", "p2", "r", 2, 20],
  ["Freeze, or keep it very short.", "k2", "t", 0, 37],
  ["Take a breath and answer simply.", "p1", "s", 3, 13]]],
 [4, "How does learning stay with you?", [
  ["I pick it up fast, and it fades fast.", "v2", "r", 1, 40],
  ["Seeing it once, clearly, is enough.", "p2", "r", 2, 18],
  ["Slow to learn, but once it’s in, it stays.", "k2", "s", 2, 29],
  ["Writing it in my own words makes it stay.", "p1k1", "s", 3, 13]]],
 [5, "Someone asks, “What do you want to become?” Inside, you feel…", [
  ["Many answers. It changes every few months.", "v2", "r", 1, 37],
  ["Certain. I’ve decided and I’m going for it.", "p2", "r", 3, 17],
  ["Unsure. I may go with what family suggests.", "k2", "t", 0, 29],
  ["A direction is forming. I’m exploring calmly.", "k1", "s", 2, 17]]],
 [5, "Which kind of class leaves you feeling heaviest?", [
  ["Memory-heavy: history dates, biology terms.", "v1", "r", 1, 33, "mem"],
  ["Writing-heavy: essays, literature, long answers.", "p1", "r", 1, 22, "lang"],
  ["Speed and numbers: maths, physics, timed problems.", "k1", "t", 1, 36, "num"],
  ["None in particular. It depends on the teacher.", "", "s", 3, 9, "none"]]],
 [5, "The night before an important day, your sleep is…", [
  ["Light and broken. The mind keeps working.", "v2", "r", 1, 42],
  ["Short but deep. I wake with a to-do list.", "p2", "r", 2, 19],
  ["Long and heavy. Waking is hard.", "k2", "t", 1, 24],
  ["Steady. I sleep on time.", "k1", "s", 3, 15]]],
 [6, "Close your eyes and picture yourself ten years from now. You see…", [
  ["Travelling, creating, a life full of colour.", "v2", "r", 2, 26],
  ["At the top, respected and leading.", "p2", "r", 2, 31],
  ["Settled and secure, family close by.", "k2", "s", 2, 27],
  ["Doing work that genuinely helps people.", "k1p1", "s", 3, 16]]],
 [6, "What sits heaviest on your heart right now?", [
  ["The weight of everyone’s expectations.", "p1", "r", 1, 34],
  ["A fear that I’m not good enough.", "v1", "t", 0, 28],
  ["Distractions: the phone, people, noise.", "v1", "r", 1, 29],
  ["Nothing heavy. I’m at peace with my pace.", "k1", "s", 3, 9]]]
];
const SUBJECT_Q = 14;   // "Which kind of class leaves you feeling heaviest?"

/* ---------- the three doshas ---------- */
const DOSHA = {
 v: {
  n: "Vata", d: "वात", el: "Air + Space", hex: "#7fb8e6",
  qualities: ["Light", "Quick", "Changeable", "Creative", "Cool & dry"],
  meaning: "The energy of movement. It moves breath and thought, and in the mind it shows up as speed, imagination and curiosity.",
  lead: "Quick, creative, full of ideas",
  mine: "Your mind moves like the wind. You catch ideas fast, connect things others miss and get excited by anything new. The same speed means attention can scatter, and what you learn quickly can slip away just as quickly, unless you give it a steady rhythm. With routine, your speed becomes a superpower.",
  strengths: [
   { t: "Quick learner", d: "You often grasp a new idea the first time it’s explained, sometimes before the teacher has finished." },
   { t: "Creative thinker", d: "You see unusual links between topics, which makes your answers and projects stand out." },
   { t: "Curious and open", d: "New subjects excite you. Curiosity is the fuel of every great learner." },
   { t: "Expressive", d: "You can explain, write and speak with colour and energy." },
   { t: "Adaptable", d: "When plans change, you adjust faster than most people around you." }],
  struggles: [
   { t: "Scattered focus", d: "Your mind can jump between five things in ten minutes. That isn’t laziness. It’s a lot of energy without a channel.", fix: "Study in 25-minute sprints with one task written on a sticky note in front of you." },
   { t: "Learning that fades", d: "What comes in fast can leave fast if it isn’t revisited.", fix: "Revise the same day, after 3 days and after a week. Three short touches beat one long read." },
   { t: "Worry and overthinking", d: "Before tests the mind may race with “what ifs”.", fix: "Write every worry down for five minutes, then close the notebook. Breathe in for 4, out for 6." },
   { t: "Irregular routine", d: "Sleep, meals and study times may shift every day.", fix: "Fix just one anchor first: the same bedtime every night." }],
  study: {
   times: "Late morning (9 am–12 pm) and early evening (4–6 pm), when your mind is clear but not racing. Avoid heavy study after 10 pm, when your thoughts get busiest.",
   session: "Short sprints: 25 minutes of study, then 5 minutes of movement. Do three or four sprints, then take a longer break.",
   revision: "Spaced revision: same day, day 3, day 7 and day 21. Flashcards for facts that tend to slip.",
   notes: "Colourful mind maps and diagrams, one page per topic. Keep everything in one notebook so nothing scatters.",
   exam: "Start six weeks early with a simple written plan. In the last week only revise, with no new chapters, and sleep on time the night before." },
  subjects: {
   strong: [
    { n: "Languages & literature", tip: "Read aloud and discuss. Your expressive side shines here." },
    { n: "Creative writing", tip: "Write freely first, then shape it. Don’t edit while the ideas are flowing." },
    { n: "Art, design & media", tip: "Keep a sketchbook or idea journal and feed it a little every day." },
    { n: "Debate & idea-led discussion", tip: "Join discussions and practise structuring your points as 1, 2, 3." }],
   care: [
    { n: "Memory-heavy chapters", tag: "mem", tip: "Turn lists into stories, rhymes or flashcards and revise them in spaced rounds." },
    { n: "Long theory chapters", tip: "Split each chapter into sub-headings and finish one per sprint." },
    { n: "Long revision cycles", tip: "Use a tick-chart so you can see progress and stay motivated." }] },
  daily: {
   wake: "Around 6:30–7 am, at the same time every day, even on Sundays.",
   sleep: "Lights out by 10:30 pm. A warm drink and no screens for the last 30 minutes.",
   meals: "Warm, cooked meals at fixed times. Don’t skip breakfast: a hungry Vata mind gets anxious.",
   move: "Gentle, grounding movement such as walking, yoga or swimming, 20–30 minutes a day.",
   screen: "Phone away while studying, and in another room at night. Notifications feed the wind." },
  plan: [
   ["Same bedtime every night, weekends included", "One task on a sticky note before each study sprint"],
   ["25-minute study sprints with 5-minute movement breaks", "Ten minutes of revising today’s topic before bed"],
   ["A weekly mind map of everything you learned", "Phone in another room for your two main study hours"]]
 },
 p: {
  n: "Pitta", d: "पित्त", el: "Fire + Water", hex: "#f08a3c",
  qualities: ["Sharp", "Intense", "Focused", "Warm", "Goal-driven"],
  meaning: "The energy of transformation, like digestion turning food into energy. In the mind it shows up as sharp understanding, ambition and the drive to get things right.",
  lead: "Sharp, focused, driven to win",
  mine: "Your mind burns bright like a flame. You understand quickly, love a clear goal and enjoy a good challenge. When it’s balanced you lead and achieve. When it overheats it can turn into self-criticism, comparison or frustration when results don’t match the effort. Cool, steady habits keep the fire useful.",
  strengths: [
   { t: "Sharp understanding", d: "You get to the heart of a concept quickly and like knowing why it works." },
   { t: "Goal-driven", d: "Give you a clear target and you’ll plan your way to it." },
   { t: "Natural leader", d: "In a group, you help everyone get organised and moving." },
   { t: "Disciplined", d: "Once you decide something matters, you put in the work." },
   { t: "Logical problem-solver", d: "You enjoy breaking down tough problems and beating them." }],
  struggles: [
   { t: "Perfectionism", d: "You may keep polishing one thing while the rest waits.", fix: "Decide your “good enough” line before you start, then move on when you reach it." },
   { t: "Comparison", d: "Other people’s marks can feel like a scoreboard.", fix: "Compete only with your last score. Keep a personal progress chart." },
   { t: "Burnout", d: "You can push hard for weeks and then crash.", fix: "Keep one full evening a week free of study, and take cooling breaks: water, a short walk, no screens." },
   { t: "Frustration", d: "A problem that won’t give in can make you angry with yourself.", fix: "Step away for ten minutes. Come back and explain the problem aloud from the start." }],
  study: {
   times: "Early morning (6–9 am) for your hardest topics. Use the hot afternoon slump for lighter work, and the evening for calm revision.",
   session: "Focused blocks of 45–50 minutes with a 10-minute cool-down break.",
   revision: "Practice tests and self-quizzing. Track your scores on a chart to see real progress.",
   notes: "Structured, numbered notes with headings and summary boxes, plus a one-page formula or key-point sheet per chapter.",
   exam: "Make a timetable on day one, but leave buffer days. Do a timed mock paper every week and protect your sleep in the last week." },
  subjects: {
   strong: [
    { n: "Mathematics", tip: "Challenge yourself with harder problem sets once the basics are solid." },
    { n: "Physics & chemistry", tip: "Focus on why each formula works, not just how to use it." },
    { n: "Logic & reasoning", tip: "Time yourself and try to beat your own record, not others’." },
    { n: "Structured problem-solving", tip: "Write the steps of each solution so you can reuse the method." }],
   care: [
    { n: "Slow literature reading", tag: "lang", tip: "Read with a question in mind: what is the writer trying to make me feel?" },
    { n: "Group projects that need patience", tip: "Agree on roles early, then let others own their part." },
    { n: "Repetitive rote work", tip: "Turn it into a game: set a target and a timer." }] },
  daily: {
   wake: "Around 6 am. Your mind is sharpest in the cool morning hours.",
   sleep: "By 10:30 pm. Avoid intense study or arguments late at night.",
   meals: "Never skip meals, because a hungry Pitta gets irritable. Fresh food, not too spicy or fried, and plenty of water.",
   move: "Moderate exercise like cycling, swimming or a team sport, played for fun and not only to win.",
   screen: "Avoid comparison-heavy scrolling, and finish screens an hour before bed." },
  plan: [
   ["Write three targets each morning and tick them off at night", "A 10-minute cooling break after every study block"],
   ["Compete with your own last score using a progress chart", "One evening this week with no study at all"],
   ["Help a classmate with a topic you’re strong in", "Each night, write one thing you did well"]]
 },
 k: {
  n: "Kapha", d: "कफ", el: "Earth + Water", hex: "#55b98a",
  qualities: ["Steady", "Calm", "Patient", "Loyal", "Strong memory"],
  meaning: "The energy of structure and stability, the earth that holds everything together. In the mind it shows up as calm, patience, kindness and a memory that holds on.",
  lead: "Steady, patient, deep memory",
  mine: "Your mind is like the earth: calm, steady and loyal. You may start slowly, but once something is learned it stays for good, and people feel safe around you. The thing to watch is momentum. Comfort zones and “I’ll start tomorrow” can quietly steal time, so a little energy and movement go a long way.",
  strengths: [
   { t: "Deep memory", d: "What you learn properly stays with you for a long time." },
   { t: "Patience and consistency", d: "You can keep a steady pace for weeks, which is how big goals are reached." },
   { t: "Calm under pressure", d: "You don’t panic easily, and your calm helps others too." },
   { t: "Kind team player", d: "You listen, support and keep the mood easy in any group." },
   { t: "Thorough", d: "You do work carefully and completely, without cutting corners." }],
  struggles: [
   { t: "Slow starts", d: "Getting going can be the hardest part of the day.", fix: "Use the five-minute rule: promise yourself just five minutes. You’ll usually keep going." },
   { t: "Comfort zone", d: "Familiar topics feel safer than new or difficult ones.", fix: "Do one unfamiliar type of question every day, before the familiar ones." },
   { t: "Low energy or sleepiness", d: "Long sitting, heavy meals or late sleep can make your mind foggy.", fix: "Study at a desk, not in bed, and move for five minutes before you sit down." },
   { t: "Holding things inside", d: "You may look calm while carrying worries quietly.", fix: "Share one feeling a week with someone you trust." }],
  study: {
   times: "Early morning (6–10 am), when your mind is lightest. Avoid studying right after a big meal.",
   session: "40–60 minute sessions suit you. Start each with a little movement and end with a quick recall test.",
   revision: "Active recall: close the book and explain it aloud, or teach it to someone.",
   notes: "Neat, detailed notes. Rewrite key points from memory, then check them against the book.",
   exam: "Start early and set small weekly deadlines. Study with a partner who keeps pace, and practise speed drills for timed sections." },
  subjects: {
   strong: [
    { n: "Biology", tip: "Use diagrams and your strong memory, and teach a chapter to a friend." },
    { n: "History & social studies", tip: "Build timelines and stories. Your memory loves a good narrative." },
    { n: "Languages for the long run", tip: "Steady daily practice suits you better than cramming." },
    { n: "Careful practical and lab work", tip: "Your patience and thoroughness are an advantage. Trust them." }],
   care: [
    { n: "Timed speed problems", tag: "num", tip: "Practise short timed drills every day. Speed is trained, not born." },
    { n: "Fast-paced maths", tip: "Master one method fully before moving on, then add speed." },
    { n: "Last-minute changes", tip: "Keep a small buffer in your plan so surprises don’t throw you off." }] },
  daily: {
   wake: "Before 6:30 am. Sleeping late makes Kapha feel heavier.",
   sleep: "By 10:30 pm. 7–8 hours is enough, and more can leave you foggy.",
   meals: "A light breakfast, a main meal at lunch and a light, early dinner. Go easy on heavy, sweet or fried food.",
   move: "Brisk, energising movement every day, like running, dance, sports or skipping. Get a little sweaty.",
   screen: "Watch out for long passive scrolling or binge-watching. Set a timer." },
  plan: [
   ["Wake at the same early time and step into morning light", "Use the five-minute rule to start your hardest task first"],
   ["Twenty minutes of brisk movement every day", "Teach one topic aloud to someone, or to the mirror"],
   ["Try one new type of question or activity every day", "Share how your week went with one trusted person"]]
 }
};

/* ---------- mixed types (top two within 8 points, or all three close) ---------- */
const MIX = {
 vp: { n: "Vata-Pitta",
  mix: "You have Vata’s creativity and speed together with Pitta’s focus and drive. Ideas come quickly and you want to act on them. In balance you’re an inventive achiever. Under stress you may race and push at the same time, so rest and routine matter even more for you.",
  studyNote: "Let Pitta’s planning hold Vata’s ideas: a simple weekly plan made of short, focused sprints.",
  dailyNote: "Vata and Pitta both burn energy fast, so regular meals and sleep are non-negotiable for you." },
 pk: { n: "Pitta-Kapha",
  mix: "You combine Pitta’s sharpness and ambition with Kapha’s steadiness and stamina. You can set big goals and keep going until you reach them. Watch for stubbornness, and for quietly taking on too much.",
  studyNote: "Kapha’s patience plus Pitta’s targets: longer focused sessions with clear goals suit you well.",
  dailyNote: "Keep up energising movement every day so Kapha’s heaviness doesn’t slow Pitta’s fire." },
 vk: { n: "Vata-Kapha",
  mix: "You carry Vata’s imagination and Kapha’s calm, so you can be both creative and kind, dreamy and steady. The challenge is energy: switching between busy bursts and slow phases. A warm routine and regular movement help you find a steady middle gear.",
  studyNote: "Start with a little movement to wake up, then short sprints. Revise often so learning sticks.",
  dailyNote: "Warm meals, morning light and a fixed wake-up time keep both sides of you steady." },
 vpk: { n: "Balanced (Tridosha)",
  mix: "Your answers spread fairly evenly across all three. That usually means flexibility: you can draw on Vata’s creativity, Pitta’s focus and Kapha’s steadiness. Notice which one shows up when you’re stressed. That’s the one to look after.",
  studyNote: "Mix it up: plan like Pitta, start with Kapha’s steady pace and keep Vata’s curiosity alive with variety.",
  dailyNote: "Regular sleep and meals keep all three in balance. Notice which one rises under pressure." }
};
/* indicative share of each type, used until enough real sessions exist (blended like the question seeds) */
const TYPE_SEED = { v: 22, p: 18, k: 20, vp: 13, pk: 11, vk: 12, vpk: 4 };

/* ---------- the three gunas (Manas) ---------- */
const GUNA = {
 s: { n: "Sattva", d: "सत्त्व", m: "Clarity & calm", hex: "#f2dc9b",
  meaning: "The clear, calm, light quality of the mind. When it’s high you feel balanced, focused and kind, and learning happens without strain.",
  today: "Your mind has a calm centre today. You can think clearly and handle pressure better than you might realise. Protect it with good sleep, a routine and fewer screens, and it will carry you far." },
 r: { n: "Rajas", d: "रजस्", m: "Energy & restlessness", hex: "#e5483e",
  meaning: "The moving, active quality: drive, ambition and desire, and also restlessness, hurry and stress when there’s too much of it.",
  today: "Your mind has plenty of energy and movement right now. That’s great fuel. The work now is to point it in one direction at a time, so it turns into focus instead of restlessness." },
 t: { n: "Tamas", d: "तमस्", m: "Heaviness & rest", hex: "#7466e0",
  meaning: "The heavy, slow quality. It gives rest and stability, but too much of it feels like low energy, confusion, putting things off or feeling stuck.",
  today: "Your mind feels a little heavy right now. That isn’t who you are. It’s a phase. Small wins, morning light, movement and talking to someone you trust can lift it surprisingly fast." }
};
const GUNA_CHANGE = "Your Prakriti, your natural body–mind nature, stays mostly the same through life. Your Manas, the state of your mind, changes with sleep, food, people, screens and habits. So today’s picture isn’t fixed. You can shift it.";
const SATTVA_LIFTS = ["Regular sleep and wake times", "Morning sunlight and fresh air", "Fresh, simple home food", "Less scrolling, more real conversations", "A few minutes of slow breathing"];

/* ---------- subjects flagged by the subject question ---------- */
const SUBJ = {
 mem: { n: "Memory-heavy subjects (history dates, biology terms)", tip: "Use spaced flashcards and turn facts into stories. Little and often beats long and late." },
 lang: { n: "Writing-heavy subjects (essays, literature)", tip: "Plan each answer in three bullet points before writing. Structure first, words second." },
 num: { n: "Speed and numbers (maths, physics)", tip: "Ten minutes of timed practice daily. Master the method first, then add speed." }
};

/* ---------- report slides (titles shown to the student) ---------- */
const SLIDES = [
 { key: "prakriti", t: "Your Prakriti" },
 { key: "strengths", t: "Your strengths as a learner" },
 { key: "struggles", t: "Where you may struggle" },
 { key: "manas", t: "Your mind today" },
 { key: "chakra", t: "Your chakra balance" },
 { key: "study", t: "Your ideal study pattern" },
 { key: "subjects", t: "Your subjects" },
 { key: "daily", t: "Your daily rhythm" },
 { key: "plan", t: "Your 21-day Dhirise plan" },
 { key: "summary", t: "Your summary" }
];

/* ---------- interviewer-only content ---------- */
/* flags: rule lives in app.js; {strength} is filled with their top strength */
const FLAGS = {
 feelings: { t: "Keeps feelings inside", why: "On a low day they go quiet and keep it inside.",
  say: "“A lot of strong students carry things quietly. If something ever feels heavy, you don’t have to hold it alone. Who’s one person you could tell?”" },
 career: { t: "Low career clarity", why: "Unsure about the future; may go with what family suggests.",
  say: "“Not knowing yet is completely normal. Let’s first find out what you enjoy. The career ideas grow from there.”" },
 tamas: { t: "High Tamas (heaviness)", why: "A third or more of answers pointed to Tamas.",
  say: "“It sounds like energy has been low lately. Before we talk about study plans, how have your sleep and mood been?”" },
 expect: { t: "Heavy expectations", why: "The weight of everyone’s expectations sits heaviest on them.",
  say: "“Expectations can feel like a bag full of stones. Whose expectations feel heaviest? And what do you want for yourself?”" },
 fear: { t: "Fear of not being good enough", why: "A fear of not being good enough sits heaviest on them.",
  say: "“Today your answers showed real strengths, and ‘{strength}’ is one of them. That fear doesn’t get to decide who you are.”" }
};
/* talking points per report slide, same order as SLIDES. Placeholders: {name} {type} {share} {low} {high} {guna} */
const TALK = [
 ["Prakriti is a natural setting, neither good nor bad. Ask: “Does this sound like you? What fits, what doesn’t?”", "Point out that {share}% of students share the {type} type. They’re not alone.", "Keep it light. This is a mirror, not a label."],
 ["Ask them to pick the strength that feels most true and share a real example.", "Name one strength you noticed yourself during the conversation."],
 ["Frame these as habits, not flaws. Everyone has a few.", "Ask which one they’d most like to work on first, and agree on that fix."],
 ["Stress that Manas changes with habits. Today is a snapshot.", "Their mind is mostly {guna} today. If Tamas is high, gently ask about sleep, mood and energy before study plans."],
 ["Start with the strongest centre ({high}) before the one that needs care ({low}).", "Use a follow-up question from the {low} list below."],
 ["Ask what their study routine looks like now and compare it with this.", "Agree on one change to try this week, such as session length or timing."],
 ["Check whether the subjects match their own experience.", "“Extra care” means a different approach, not weakness. Avoid labelling."],
 ["Ask about sleep and screen time honestly, without judgement.", "Keep it to general wellness. Suggest a doctor for any health concern."],
 ["Ask them to commit to Week 1 only. Small is the point.", "Offer a check-in after 7 days to see how it went."],
 ["Use “Copy summary” to send a note to the student or parent.", "Use “Save report as PDF” for your records, then start the next student from the host menu."]
];

return { BRAND, WELCOME, CLASSES, STREAMS, CH, Q, SUBJECT_Q, DOSHA, MIX, TYPE_SEED, GUNA, GUNA_CHANGE, SATTVA_LIFTS, SUBJ, SLIDES, FLAGS, TALK };
})();
