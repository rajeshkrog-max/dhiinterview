/* Dhirise · Parent Report content.
   Plain educational and wellbeing language only: this text is read by parents.
   Tokens: {Name} {They} {they} {them} {their} {Their} {themselves} {they're} {They're}
           {s} (verb ending after they: "learn{s}") {is}/{are} {has} {does} {doesn't} {isn't} {was}
   Arrays of strings are variants: one is picked per student so no two reports read the same. */
window.DHI_REPORT = (function () {
"use strict";

/* ---------- learning styles ---------- */
const STYLES = {
 v: {
  name: "The Creative Explorer", short: "Creative Explorer", accent: "#4f86c6",
  tagline: "Imaginative, curious and quick to learn",
  summary: [
   "{Name} is a Creative Explorer: an imaginative, curious learner who picks up new ideas quickly and loves connecting them in original ways.",
   "{Name} learns like a Creative Explorer, quick to grasp new ideas, full of imagination and always curious about what comes next.",
   "At heart, {Name} is a Creative Explorer, a bright and inventive mind that lights up when something is new and interesting."],
  thinking: [
   "{Name} thinks quickly and often in pictures, linking ideas across subjects. New topics spark real excitement, and {their} best work often comes from an unexpected angle.",
   "{Name}'s mind moves fast. {They} make{s} connections other students miss and enjoy{s} ideas that let {them} imagine and create."],
  habits: [
   "Study tends to happen in bursts of energy rather than a fixed rhythm. Several things may be open at once, and what is learned quickly can fade without regular revision.",
   "{Name} works best in short, lively bursts. Long sittings and repetitive revision are harder, so knowledge needs a little routine to settle in."],
  pressure: [
   "Under pressure, {Name}'s mind can race with “what ifs”, and sleep may become light. A calm routine and a clear, written plan help {them} feel settled.",
   "Before tests, {Name} may feel anxious and scattered. Simple structure, regular meals and early nights make a noticeable difference."],
  motivation: [
   "{Name} is motivated by novelty, creativity and the freedom to explore. Variety and encouragement keep {them} engaged far better than pressure.",
   "Interest is {Name}'s engine. When a topic feels fresh or creative, effort follows naturally."],
  helps: ["A predictable daily routine", "Short, focused study sprints with movement breaks", "Mind maps, colours and visual notes", "Regular, spaced revision", "Warm, regular meals and early nights"],
  drains: ["Irregular sleep and skipped meals", "Long, unbroken study sessions", "Juggling too many tasks at once", "Phone notifications while studying", "Last-minute rushing before exams"],
  strengths: [
   { t: "Quick to learn", d: "Grasps new ideas fast, often on the first explanation." },
   { t: "Creative thinker", d: "Makes original connections between topics." },
   { t: "Curious and open", d: "Genuinely enjoys discovering new subjects." },
   { t: "Expressive", d: "Explains and writes with colour and energy." }],
  growing: [{ t: "A steady routine and regular revision", d: "So that quick learning turns into lasting knowledge." }],
  study: {
   time: "Late morning and early evening, when {their} mind is clear but not racing. Heavy study late at night is best avoided.",
   session: "Short sprints: about 25 minutes of focus followed by 5 minutes of movement.",
   revision: "Spaced revision: the same day, after 3 days and after a week, with flashcards for facts that tend to slip.",
   notes: "Colourful mind maps and diagrams, one page per topic, all kept in a single notebook.",
   exam: "A simple written plan started about six weeks early; only revision in the final week, and a proper night's sleep before the exam." },
  subjects: {
   strong: [
    { n: "Languages & literature", tip: "Reading aloud and discussing ideas bring out {their} expressive side." },
    { n: "Creative writing", tip: "Let ideas flow first, then shape and edit them." },
    { n: "Art, design & media", tip: "An idea journal, fed a little every day, works beautifully." },
    { n: "Debate & discussion", tip: "Practise structuring points as one, two, three." }],
   care: [
    { n: "Memory-heavy chapters", tag: "mem", tip: "Turn lists into stories or flashcards and revise in spaced rounds." },
    { n: "Long theory chapters", tip: "Split into sub-headings and finish one per study sprint." },
    { n: "Long revision cycles", tip: "A simple tick-chart makes progress visible and motivating." }] }
 },
 p: {
  name: "The Focused Achiever", short: "Focused Achiever", accent: "#d9822b",
  tagline: "Sharp, goal-driven and logical",
  summary: [
   "{Name} is a Focused Achiever: sharp, logical and driven, at {their} best with a clear goal and a worthwhile challenge.",
   "{Name} learns like a Focused Achiever, quick to understand, organised in approach and motivated to do well.",
   "{Name} is a natural Focused Achiever, a clear thinker who sets high standards and works hard to meet them."],
  thinking: [
   "{Name} thinks logically and likes to know why things work. {They} enjoy{s} solving problems and quickly see{s} the heart of a concept.",
   "{Name} has a sharp, analytical mind. Give {them} a clear question and {they} will work methodically towards the answer."],
  habits: [
   "{Name} likes plans, timetables and visible progress. {They} can work with great intensity, sometimes pushing too hard for too long.",
   "Organised and determined, {Name} often studies with a plan. The watch-out is perfectionism: polishing one thing while the rest waits."],
  pressure: [
   "Under pressure, {Name} may become self-critical or frustrated, especially when results don't match the effort. Rest and perspective keep {their} drive healthy.",
   "When things don't go to plan, {Name} can be hard on {themselves}. Reassurance that effort matters as much as marks helps a great deal."],
  motivation: [
   "{Name} is motivated by goals, challenge and measurable progress. Recognising effort, not only results, keeps {them} balanced.",
   "Targets and challenges energise {Name}. Competing with {their} own last score works far better than comparison with others."],
  helps: ["Clear goals and a visible progress chart", "Challenging problems once the basics are secure", "Cooling breaks: water, a short walk, no screens", "Regular meals, as hunger affects mood quickly", "One full evening off each week"],
  drains: ["Comparison with classmates", "Unclear expectations", "Skipped meals", "Perfectionism on a single task", "Intense study late at night"],
  strengths: [
   { t: "Sharp understanding", d: "Gets to the core of a concept quickly." },
   { t: "Goal-driven", d: "Plans a clear path towards a target." },
   { t: "Natural leader", d: "Helps groups get organised and moving." },
   { t: "Logical problem-solver", d: "Enjoys breaking down tough problems." }],
  growing: [{ t: "Balance and patience", d: "So that drive doesn't tip into burnout or self-criticism." }],
  study: {
   time: "Early morning for the hardest topics, the afternoon for lighter work and calm revision in the evening.",
   session: "Focused blocks of 45–50 minutes, each followed by a 10-minute cool-down break.",
   revision: "Practice tests and self-quizzing, with scores tracked on a chart to show real progress.",
   notes: "Structured, numbered notes with summary boxes, plus a one-page key-point sheet for each chapter.",
   exam: "A timetable from day one with buffer days built in, a timed mock paper each week and protected sleep in the final week." },
  subjects: {
   strong: [
    { n: "Mathematics", tip: "Harder problem sets keep {them} engaged once the basics are solid." },
    { n: "Physics & chemistry", tip: "Focusing on why each formula works deepens understanding." },
    { n: "Logic & reasoning", tip: "Timed practice against {their} own record works well." },
    { n: "Structured problem-solving", tip: "Writing out solution steps builds reusable methods." }],
   care: [
    { n: "Slow literature reading", tag: "lang", tip: "Reading with a question in mind keeps {their} attention engaged." },
    { n: "Group projects that need patience", tip: "Agreeing roles early lets others own their part." },
    { n: "Repetitive rote work", tip: "A target and a timer turn it into a manageable challenge." }] }
 },
 k: {
  name: "The Steady Builder", short: "Steady Builder", accent: "#3f9e72",
  tagline: "Calm, patient, with a deep memory",
  summary: [
   "{Name} is a Steady Builder: calm, patient and dependable, with a memory that holds on to what {they} learn{s}.",
   "{Name} learns like a Steady Builder, thorough and unhurried, and once something is learned, it stays for good.",
   "{Name} is a Steady Builder at heart, a kind, consistent learner whose progress is quiet but lasting."],
  thinking: [
   "{Name} thinks carefully and thoroughly. {They} prefer{s} to understand things step by step, and {their} long-term memory is a genuine strength.",
   "{Name} is a deep, steady thinker who likes to take {their} time and get things right."],
  habits: [
   "{Name} can sit and study for long stretches, but getting started is often the hardest part. Familiar topics feel safer than new or difficult ones.",
   "Once {Name} gets going, {they} keep{s} a reliable pace. A gentle push at the start and small deadlines help a lot."],
  pressure: [
   "Under pressure, {Name} usually stays outwardly calm, but may withdraw or keep worries inside. Gentle check-ins help {them} open up.",
   "{Name} rarely panics, but may quietly carry stress. A warm, unhurried conversation often brings it out."],
  motivation: [
   "{Name} is motivated by encouragement, belonging and steady progress. A study partner and small deadlines provide helpful momentum.",
   "Kind encouragement and a sense of being part of a group bring out {Name}'s best effort."],
  helps: ["An early start and morning daylight", "A little movement before studying", "Small deadlines and a study partner", "Explaining topics aloud from memory", "Light, early dinners"],
  drains: ["Late nights and oversleeping", "Heavy meals before study", "Long passive screen time", "Staying only in the comfort zone", "Sudden last-minute changes"],
  strengths: [
   { t: "Deep memory", d: "What is learned properly stays for a long time." },
   { t: "Patient and consistent", d: "Can keep a steady pace for weeks." },
   { t: "Calm under pressure", d: "Doesn't panic easily, and steadies others." },
   { t: "Kind team player", d: "Listens, supports and keeps groups positive." }],
  growing: [{ t: "Momentum and a gentle push", d: "To start sooner and try new kinds of challenges." }],
  study: {
   time: "Early morning, when {their} mind is lightest; studying right after a big meal is best avoided.",
   session: "Sessions of 40–60 minutes, starting with a little movement and ending with a quick recall test.",
   revision: "Active recall: putting the notes away and explaining topics aloud, or teaching them to someone.",
   notes: "Neat, detailed notes, with key points rewritten from memory and then checked against the chapter.",
   exam: "An early start with small weekly deadlines, a study partner who keeps pace and daily speed drills for timed sections." },
  subjects: {
   strong: [
    { n: "Biology", tip: "Diagrams and {their} strong memory make this a natural fit." },
    { n: "History & social studies", tip: "Timelines and stories suit {their} memory beautifully." },
    { n: "Languages, over the long run", tip: "Steady daily practice beats cramming for {them}." },
    { n: "Practical and lab work", tip: "{Their} patience and thoroughness are a real advantage." }],
   care: [
    { n: "Timed speed problems", tag: "num", tip: "Short daily timed drills build speed steadily." },
    { n: "Fast-paced maths", tip: "Mastering one method fully before adding speed works best." },
    { n: "Last-minute changes", tip: "A small buffer in the plan keeps surprises from unsettling {them}." }] }
 }
};

/* blends: when two styles score close together (or all three) */
const BLENDS = {
 vp: { name: "The Inventive Achiever", parts: ["v", "p"],
  blend: ["{Name} combines a Creative Explorer's imagination with a Focused Achiever's drive. Ideas come quickly and {they} want{s} to act on them, so rest and routine matter extra to keep that energy from burning out.",
          "{Name} blends creativity with ambition: an inventive mind that also likes to win. Steady routines help both sides shine."] },
 pk: { name: "The Determined Builder", parts: ["p", "k"],
  blend: ["{Name} combines a Focused Achiever's ambition with a Steady Builder's stamina, able to set big goals and keep going until they are reached. The watch-out is quietly taking on too much.",
          "{Name} brings together sharp focus and patient consistency, a powerful mix for long-term goals when balanced with rest."] },
 vk: { name: "The Gentle Creator", parts: ["v", "k"],
  blend: ["{Name} combines a Creative Explorer's imagination with a Steady Builder's calm, both creative and kind. Energy can swing between busy bursts and slower phases, so a warm routine helps {them} find a steady middle gear.",
          "{Name} is both imaginative and grounded. A regular rhythm and a little movement help {them} turn ideas into steady progress."] },
 vpk: { name: "The Versatile All-Rounder", parts: ["v", "p", "k"],
  blend: ["{Name} draws on creativity, focus and steadiness fairly evenly. That flexibility is a real gift; the key is noticing which side shows up under stress and supporting it.",
          "{Name} is a well-rounded learner who can be imaginative, determined and patient as the situation needs."] }
};

/* ---------- present state of mind ---------- */
const MIND = {
 s: { name: "Calm & Clear", accent: "#c9a227",
  text: ["{Name}'s mind seems calm and clear at present. {They} can think clearly and handle pressure better than {they} may realise.",
         "Right now {Name} comes across as settled and clear-headed, a wonderful foundation for learning."],
  care: "Protect this with regular sleep, a steady routine and sensible screen time." },
 r: { name: "Energetic & Restless", accent: "#d9603b",
  text: ["{Name} has plenty of energy and drive right now, with a mind that is often on the move. It's wonderful fuel; the work is to point it in one direction at a time, so it becomes focus rather than restlessness.",
         "At the moment {Name} is full of energy, sometimes more than {they} can easily channel. A calmer rhythm will turn that energy into focus."],
  care: "Short focused sessions, fewer distractions and a calm evening routine help most." },
 t: { name: "Quiet & Low on Energy", accent: "#6f68c9",
  text: ["{Name} seems a little low on energy and quieter than usual at the moment. This is a phase, not who {they} {are}, and it usually lifts well with the right support.",
         "Right now {Name} appears somewhat tired and withdrawn. With small wins, gentle routine and someone to talk to, this tends to improve noticeably within weeks."],
  care: "Morning daylight, movement, small achievable goals and a trusted person to talk to make the biggest difference." }
};
const MIND_NOTE = "A student's state of mind is not fixed. Unlike learning style, which stays fairly stable, it changes with sleep, food, friendships, screens and habits, so this picture can improve with the right support.";

/* ---------- the seven areas ---------- */
const LEVELS = { strong: "Strong", growing: "Growing", support: "Needs support" };
const SECTIONS = [
 { title: "Foundation & Daily Routine", accent: "#d96b6b",
  intro: "Sleep, meals and the rhythm of the day: the base everything else rests on.",
  strongLine: "A steady daily routine", growLine: "Building a steadier daily routine",
  means: {
   strong: ["{Name} has a steady daily rhythm. Regular sleep and meals give {them} a stable base, which makes focus and mood far easier to manage.",
            "{Name}'s routine is a real asset. A predictable day frees {their} energy for learning."],
   growing: ["{Name} has some routine in place, but it bends easily. A couple of fixed anchors, such as a set bedtime, would make study and mood noticeably steadier.",
             "The basics of a routine are there for {Name}; they just need a little more consistency to fully support {their} learning."],
   support: ["{Name}'s daily rhythm feels unsettled at the moment. When sleep, meals and the shape of the day keep shifting, even a capable student finds it hard to concentrate. The good news is that routine is one of the quickest things to improve.",
             "Right now {Name}'s days lack a steady rhythm, and that makes everything else harder than it needs to be. Small, consistent anchors can change this within weeks."] },
  help: {
   strong: ["Keep protecting the routine during exams and holidays.", "Praise the consistency you see; it is a real life skill.", "Involve {Name} in planning family schedules so {they} own {their} rhythm."],
   growing: ["Agree on one fixed bedtime and wake-up time, including weekends.", "Keep mealtimes regular, especially breakfast.", "Create a simple wind-down: screens off 30 minutes before bed."],
   support: ["Start with just one anchor: the same wake-up time every day.", "Make mornings easy with a set breakfast and a calm start.", "Notice and praise small wins in routine rather than what slipped."] } },

 { title: "Emotional Wellbeing", accent: "#e39456",
  intro: "How feelings are handled: mood, setbacks and bouncing back.",
  strongLine: "Bouncing back well from setbacks", growLine: "Naming and sharing feelings",
  means: {
   strong: ["{Name} handles feelings in a healthy way and bounces back from setbacks without getting stuck. This emotional resilience will serve {them} well in the exam years.",
            "{Name} shows a lovely emotional balance: {they} feel{s} things fully, then move{s} forward."],
   growing: ["{Name} manages feelings reasonably well, though some moods linger longer than they need to. A little support in naming and sharing feelings can make a real difference.",
             "{Name}'s emotional balance is developing. With a safe space to talk, {they} will learn to let difficult moods pass more easily."],
   support: ["{Name}'s feelings seem to be weighing on {them} more than usual at the moment. This is very common at this age, and with warmth and a safe space to talk, it usually eases well.",
             "Right now {Name} may be holding on to difficult feelings. Patient listening at home, and the right support, can lighten this considerably."] },
  help: {
   strong: ["Keep conversations open, even when things are going well.", "Share your own ways of handling disappointment.", "Celebrate effort and recovery, not only results."],
   growing: ["Ask open questions such as “What was the best and hardest part of today?”", "After a setback, listen first; advice can come later.", "Encourage one hobby done purely for joy."],
   support: ["Set aside a regular, relaxed time to talk, without phones or advice.", "Avoid comparisons with siblings or classmates.", "If low moods last for several weeks, consider speaking with a qualified professional."] } },

 { title: "Focus, Drive & Self-Discipline", accent: "#d4a62a",
  intro: "Willpower and follow-through: starting, sticking with it and finishing.",
  strongLine: "Drive and follow-through", growLine: "Starting and sustaining effort",
  means: {
   strong: ["{Name} shows real drive and follow-through. When {they} decide{s} something matters, {they} put{s} in the work. The key now is balance, so drive doesn't tip into exhaustion.",
            "{Name} has strong self-discipline. With good rest built in, this will carry {them} a long way."],
   growing: ["{Name} has willpower, but it comes and goes. Small, visible daily wins will help turn effort into a dependable habit.",
             "{Name}'s focus is developing. Clear, bite-sized goals will make {their} effort far more consistent."],
   support: ["Starting and sustaining effort is hard for {Name} right now. This is a skill, not a fixed trait; it grows quickly with small, achievable goals and steady encouragement.",
             "{Name} finds it difficult to get going and keep going at present. Tiny daily goals and warm encouragement are the fastest way to rebuild momentum."] },
  help: {
   strong: ["Help {Name} plan rest as seriously as study.", "Encourage pacing, especially before exams.", "Recognise the process, not only the results."],
   growing: ["Help break big tasks into three small daily steps.", "Use a visible chart or calendar to track study streaks.", "Suggest starting with the hardest task for just 15 minutes."],
   support: ["Agree on tiny, doable daily goals instead of long study hours.", "Sit nearby for the first ten minutes of study to help {them} start.", "Praise starting, not just finishing."] } },

 { title: "Relationships & Social Confidence", accent: "#4fa77c",
  intro: "Friends, family and asking for help: how connected and supported {Name} feels.",
  strongLine: "Warm, supportive relationships", growLine: "Leaning on others and asking for help",
  means: {
   strong: ["{Name} connects warmly with others and is someone people feel safe around. This social confidence is a quiet superpower in classrooms and, later, at work.",
            "{Name} builds good relationships naturally. Friends and teachers are a real source of support for {them}."],
   growing: ["{Name} has good people around {them}, but may not always lean on them when things get hard. Learning to ask for help is a strength worth building.",
             "{Name} relates well to others, and could benefit from sharing a little more when things feel difficult."],
   support: ["{Name} may be carrying things alone at the moment. Gently helping {them} let one or two trusted people in can make a big difference to both mood and learning.",
             "Right now {Name} seems to keep a lot to {themselves}. A few safe, trusted connections will help {them} feel supported."] },
  help: {
   strong: ["Encourage {Name} to keep investing in good friendships.", "Offer chances to guide or help younger children.", "Model asking for help yourself."],
   growing: ["Show that asking for help is a sign of strength.", "Encourage one study session a week with a friend.", "Make home a place where any topic can be raised calmly."],
   support: ["Check in gently and regularly, without pressure to talk.", "Help {Name} identify one trusted adult outside the family.", "Encourage group activities that match {their} interests."] } },

 { title: "Communication, Expression & Memory", accent: "#4a92cf",
  intro: "Speaking up, explaining clearly and recalling what has been learned.",
  strongLine: "Clear expression and good recall", growLine: "Speaking up and recalling under pressure",
  means: {
   strong: ["{Name} expresses {themselves} clearly and recalls well. Explaining topics to others will deepen {their} learning even further.",
            "{Name} communicates with confidence and remembers well, a strong combination for exams and interviews alike."],
   growing: ["{Name} can express {themselves} well, but pressure sometimes rushes or freezes the words. Regular low-pressure practice builds this quickly.",
             "{Name}'s expression and recall are developing nicely; practising aloud in a relaxed setting will make them dependable under pressure."],
   support: ["Speaking up and recalling under pressure feel hard for {Name} at the moment. In a safe, encouraging setting, these skills grow surprisingly fast.",
             "{Name} may find it difficult to put thoughts into words when put on the spot. Gentle, regular practice will build real confidence."] },
  help: {
   strong: ["Ask {Name} to teach you something {they} learned today.", "Encourage debates, presentations or recitations.", "Let {them} lead a conversation at family gatherings."],
   growing: ["Ask {Name} to explain one topic aloud for two minutes each day.", "Give {them} time to answer without finishing {their} sentences.", "Practise short answers before tests in a relaxed way."],
   support: ["Praise effort whenever {Name} speaks up, whatever the answer.", "Use recall games: put the notes away and talk it through together.", "Avoid putting {them} on the spot in front of others."] } },

 { title: "Clarity & Career Direction", accent: "#6f67cf",
  intro: "Focus, decisions and a sense of where {they're} heading.",
  strongLine: "Clarity about future direction", growLine: "Exploring interests and direction",
  means: {
   strong: ["{Name} has good clarity about {their} direction. Our role is to keep checking that the goal truly feels like {their} own, and to keep the path open.",
            "{Name} knows where {they} want{s} to go, and that clarity gives {their} studies real purpose."],
   growing: ["A direction is beginning to form for {Name}. A little structured exploration will sharpen it into a confident choice.",
             "{Name} has some ideas about the future. Exploring them calmly will help {them} choose with confidence."],
   support: ["Direction feels unclear for {Name} right now, and that is completely normal at this age. The next step is calm exploration, not pressure to decide.",
             "{Name} isn't sure yet about the future, which is perfectly natural. Starting from {their} interests is the best way forward."] },
  help: {
   strong: ["Support {Name}'s plan while keeping alternatives open.", "Connect {them} with people working in that field.", "Encourage {them} to talk about why this goal matters."],
   growing: ["Explore careers together through videos, visits and conversations.", "Notice which subjects make time fly for {Name}.", "Avoid steering too firmly; ask what {they} enjoy{s}."],
   support: ["Reassure {Name} that it is fine not to know yet.", "Start with interests, not careers: what does {Name} love doing?", "Consider a structured career-discovery session."] } },

 { title: "Dreams, Aspirations & Sense of Purpose", accent: "#a875cf",
  intro: "Hopes for the future, inner calm and feeling at ease with {their} own pace.",
  strongLine: "A sense of purpose and inner calm", growLine: "Easing pressure and self-doubt",
  means: {
   strong: ["{Name} feels at peace with {their} path and carries a real sense of purpose. That steadiness is precious, and worth protecting.",
            "{Name} has hopeful dreams and a calm sense of {their} own pace, a lovely foundation for the years ahead."],
   growing: ["{Name} has dreams and a sense of purpose, though worry or pressure sometimes clouds them.",
             "{Name}'s hopes for the future are taking shape; easing everyday pressure will let them grow with confidence."],
   support: ["Something seems to be weighing on {Name}'s heart, perhaps expectations, self-doubt or distractions. Naming it gently together is the first step to lightening it.",
             "{Name} is carrying some pressure at the moment. Reassurance, patience and a calm space to talk will help {them} reconnect with {their} own hopes."] },
  help: {
   strong: ["Talk about {Name}'s dreams with genuine curiosity.", "Protect unhurried time for rest and reflection.", "Share stories of people who followed their own path."],
   growing: ["Ask what success means to {Name}, in {their} own words.", "Keep expectations clear, kind and realistic.", "Help {Name} notice and celebrate progress."],
   support: ["Make it clear that your love isn't tied to marks.", "Gently ask what feels heavy, and listen without trying to fix it.", "Reduce comparisons and pressure during this phase."] } }
];

/* ---------- what each answer tells us (same order as the 18 questions) ---------- */
const OBS = [
 ["On a free morning, {Name} tends to wake early and restless, with {their} mind already racing ahead.",
  "{Name} wakes at a regular hour on {their} own, hungry and ready to get going.",
  "On holidays, {Name} finds it hard to get out of bed; mornings start slowly.",
  "{Name} naturally rises with the daylight, feeling calm and fresh."],
 ["When absorbed in study, {Name} sometimes forgets to eat and then feels shaky or spaced out.",
  "Hunger affects {Name}'s mood quickly; a missed meal can make {them} irritable.",
  "{Name} can go a long time without food and often doesn't notice hunger.",
  "{Name} keeps fairly regular mealtimes, which is a real asset."],
 ["{Name}'s study table usually has several subjects and ideas open at once.",
  "{Name} likes an organised desk, with work sorted by priority and a plan in view.",
  "{Name}'s study space is comfortable but cluttered, and rarely changes.",
  "{Name} keeps a simple, clean study space with only what is needed for the day."],
 ["When a result disappoints, {Name}'s first reaction is worry about what comes next.",
  "A disappointing result can make {Name} angry, at {themselves} or at the unfairness of it.",
  "After a disappointing result, {Name} can carry a quiet sadness for several days.",
  "When results disappoint, {Name} pauses and looks for the lesson, a mature response."],
 ["{Name} described {their} recent mood as changeable, like a windy day.",
  "{Name} described {their} recent mood as bright and intense, like a hot afternoon.",
  "{Name} described {their} recent mood as heavy and slow, like monsoon clouds.",
  "{Name} described {their} mood as calm and open, like a clear morning sky."],
 ["In longer classes, {Name}'s attention tends to wander through many other thoughts.",
  "In class, {Name} engages actively, often questioning what is being taught.",
  "In long lectures, {Name} can feel drowsy and drift.",
  "{Name} usually stays with a long lecture and takes notes without much effort."],
 ["Left to {themselves}, {Name} studies in bursts with gaps, then tends to rush in the final week.",
  "{Name} likes to plan from day one and track every chapter.",
  "{Name} starts slowly, but keeps a steady pace once going.",
  "{Name} prefers a little study every day, with planned revision rounds."],
 ["{Name} gets restless after about twenty minutes of study and needs to move.",
  "A stubborn problem can frustrate {Name} and drain {their} energy.",
  "{Name} can sit for long stretches, but notices that less goes in over time.",
  "{Name} takes short breaks before tiring, a healthy study habit."],
 ["A difficult problem excites {Name} at first, but {they} may move on before finishing it.",
  "{Name} sees a tough problem as a challenge to beat.",
  "Unfamiliar, difficult problems can feel like a wall to {Name}, who prefers what is familiar.",
  "{Name} breaks difficult problems into small steps, a real strength."],
 ["In groups, {Name} brings fresh ideas and keeps the conversation going.",
  "In groups, {Name} naturally takes charge and keeps everyone on track.",
  "In groups, {Name} listens, supports others and keeps the mood easy.",
  "In groups, {Name} quietly helps whoever is stuck."],
 ["On low days, {Name} shares briefly with many people and then moves on.",
  "On low days, {Name} prefers to handle things alone, without telling anyone.",
  "On low days, {Name} tends to go quiet and keep feelings inside.",
  "On low days, {Name} turns to one or two trusted people."],
 ["When suddenly asked a question in class, {Name} speaks fast and can lose the thread.",
  "When called on in class, {Name} answers confidently, even when not fully sure.",
  "When suddenly asked a question in class, {Name} may freeze or keep the answer very short.",
  "When called on in class, {Name} takes a breath and answers simply."],
 ["{Name} picks things up quickly, but finds they can fade just as quickly.",
  "{Name} often needs to see something only once, if it is explained clearly.",
  "{Name} learns slowly at first, but once something is learned, it stays.",
  "Writing ideas in {their} own words helps {Name} remember."],
 ["{Name}'s career ideas are many and still change every few months.",
  "{Name} already feels certain about {their} future direction.",
  "{Name} feels unsure about the future and may go along with what the family suggests.",
  "A sense of direction is forming for {Name}, who is exploring calmly."],
 ["Memory-heavy subjects, such as history dates and biology terms, feel heaviest for {Name}.",
  "Writing-heavy subjects, such as essays and literature, feel heaviest for {Name}.",
  "Speed and number-based subjects, such as maths and timed problems, feel heaviest for {Name}.",
  "No particular subject feels heavy for {Name}; it depends more on the teacher."],
 ["Before an important day, {Name}'s sleep is light and broken, with the mind still working.",
  "Before an important day, {Name} sleeps briefly but deeply and wakes with a to-do list.",
  "Before an important day, {Name} sleeps long and heavily and finds waking hard.",
  "{Name} sleeps steadily and on time, even before important days."],
 ["Picturing the future, {Name} imagines travel, creativity and a colourful life.",
  "Picturing the future, {Name} sees {themselves} at the top, respected and leading.",
  "Picturing the future, {Name} sees a settled, secure life with family close by.",
  "Picturing the future, {Name} sees {themselves} doing work that genuinely helps people."],
 ["The weight of others' expectations sits heavily on {Name} at the moment.",
  "{Name} shared a quiet worry about not being good enough, something we would like to gently help with.",
  "Distractions such as the phone, people and noise are {Name}'s biggest struggle right now.",
  "{Name} says nothing feels heavy right now and {they're} at peace with {their} own pace."]
];

/* subjects flagged by "which class feels heaviest" */
const SUBJ = {
 mem: { n: "Memory-heavy subjects (history dates, biology terms)", tip: "Spaced flashcards and turning facts into stories work far better than long rereading." },
 lang: { n: "Writing-heavy subjects (essays, literature)", tip: "Planning each answer in three bullet points before writing builds structure and confidence." },
 num: { n: "Speed and number-based subjects (maths, physics)", tip: "Ten minutes of timed practice daily: method first, then speed." }
};


const COVER_LINE = "A confidential screening report prepared for the family of {Name}.";
const ABOUT = "This is a non-clinical screening report based on a structured conversation and self-reported responses. It is not a medical, psychological or clinical diagnosis and should not be used as one. It is intended to help parents, students and mentors understand the student's current patterns and concerns so we can choose a better, more supportive approach. If you have concerns about your child's health or emotional wellbeing, please consult a qualified professional.";

/* ---------- welcome letter (right after the cover) ---------- */
const LETTER = [
 "Thank you for choosing Dhirise and for trusting us with something truly precious: your child's growth.",
 "By choosing a 360-degree approach to {Name}'s wellbeing, you have taken a wise and caring step. Marks tell only one part of a child's story. How {Name} thinks, feels, learns, connects with others and dreams matters just as much, and you have chosen to understand all of it.",
 "This decision helps {Name} understand {themself} better, and helps you understand {them} more deeply. That understanding is the foundation for a brighter future: one where {Name} grows with confidence, stays steady through challenges, and moves forward with clarity and purpose.",
 "The pages that follow share what we observed during our conversation with {Name}: {their} natural strengths, the areas that are still growing, and a simple 21-day plan for {Name} and for you to walk together.",
 "You have made the right choice for your child. We are glad to be part of this journey."
];

/* ---------- 21-day action plan: one action per week from each source ----------
   child / parent: [days 1-7, days 8-14, days 15-21]; after: the change to look for */
const PLAN21 = {
 styles: {
  v: { child: ["Same bedtime every night, and one task on a sticky note for each study sprint", "Study in 25-minute sprints with a 5-minute movement break", "Revise today's topic for ten minutes before bed"],
       parent: ["Keep evenings calm and predictable, with a fixed dinner time", "Help keep the study desk to one subject at a time", "Look at the tick sheet together at the weekend, with encouragement"],
       after: "Better recall of what was learned the week before, and less last-minute rushing." },
  p: { child: ["Write three targets each morning and tick them off at night", "Take a 10-minute cool-down break after every study block", "Compete with your own last score, using a progress chart"],
       parent: ["Praise effort and method out loud, not only marks", "Protect one evening this week with no study at all", "When frustration rises, suggest a short walk before talking it through"],
       after: "Steady effort without burning out, and kinder self-talk after a setback." },
  k: { child: ["Wake early and get some morning daylight before studying", "Use the five-minute rule to start the hardest task first", "Twenty minutes of brisk movement every day"],
       parent: ["Help {Name} start study at a fixed time, staying nearby for the first few minutes", "Enjoy a daily walk or a game of sport together", "Gently encourage one new kind of question or activity each week"],
       after: "Quicker starts, more energy in the evenings and more willingness to try new things." }
 },
 sections: [
  { child: ["Wake up at the same time every day, including the weekend", "Add a fixed bedtime and keep the phone outside the room at night", "Plan tomorrow in three short lines before sleeping"],
    parent: ["Agree the wake-up time together and keep breakfast at a regular time", "Start a family screens-off time 30 minutes before bed, and join in", "Name one day this week that went smoothly because of the routine"],
    after: "Steadier mornings, fewer rushed starts and more even energy through the day." },
  { child: ["Each night write three lines: one good thing, one hard thing, one thank-you", "Do one thing purely for fun every day, with no goal attached", "When a mood stays, name it out loud to someone you trust"],
    parent: ["Ask one open question each evening, such as \u201cWhat was the best and hardest part of today?\u201d, and simply listen", "After a disappointment, listen first; save advice for later", "Share a small setback of your own and how you handled it"],
    after: "Moods that pass more quickly, and more ease in sharing how the day felt." },
  { child: ["Write three tiny tasks each morning and finish them", "Start the hardest task first, for just 15 minutes", "Keep a 7-day study streak on a calendar, one tick a day"],
    parent: ["Help break homework into three small steps each evening", "Sit nearby for the first ten minutes of study, then step away", "Celebrate the streak at the end of the week, however small"],
    after: "Starting work with less resistance, and staying with it for longer stretches." },
  { child: ["Talk to or message one person you care about each day", "Ask one person for help with something this week", "Thank someone specifically each day"],
    parent: ["Have one relaxed family moment daily, such as a meal without phones", "Help arrange one study or activity meet-up with a friend", "Let {Name} see you ask for help, and talk about how it felt"],
    after: "More openness, more ease with friends and a readiness to ask for help." },
  { child: ["Explain one topic aloud for two minutes every day", "Ask or answer one question in class each day", "Record a one-minute voice summary of each chapter"],
    parent: ["Be the \u201cstudent\u201d for two minutes while {Name} teaches you a topic", "Give {them} time to finish answers without stepping in", "Praise one thing that was explained clearly this week"],
    after: "Clearer, calmer answers when asked, and better recall of what was studied." },
  { child: ["List five things you love learning about", "Watch or read about one career linked to that list", "Talk to one adult who works in a field you are curious about"],
    parent: ["Ask about interests at dinner, without any career pressure", "Notice which subjects make time fly for {Name}, and say so", "Arrange one conversation with someone in a field {Name} is curious about"],
    after: "A few clearer interests, and more relaxed conversations about the future." },
  { child: ["Take two quiet minutes of slow breathing every morning", "Write down why you are studying, in your own words", "Each night, note one moment you felt calm or proud"],
    parent: ["Tell {Name} one thing you value about {them} that isn't about marks", "Keep expectations clear, kind and realistic, and share them calmly", "Have one unhurried conversation about {their} hopes"],
    after: "Less pressure in {their} voice, and more of {Name}'s own reasons for working hard." }
 ]
};
const AFTER_CLOSE = "On day 21, sit down together with the tick sheet. Celebrate what worked, keep the habits that helped, and choose what to try for the next three weeks.";

/* daily tick-boxes, chosen from the child's own answers (first three that apply) */
const CHECKS = [
 { t: "Woke up on time", when: (a, low) => [0, 2].includes(a[0]) || [0, 2].includes(a[15]) || low.includes(0) },
 { t: "Focused study block", when: () => true },
 { t: "No-phone hour", when: a => a[17] === 2 || a[5] === 0 || a[2] === 0 },
 { t: "Three-line journal", when: (a, low) => [1, 2].includes(a[10]) || a[3] === 2 || a[4] === 2 || low.includes(1) },
 { t: "Ten minutes of movement", when: (a, low, style, mind) => style === "k" || mind === "t" || a[7] === 0 },
 { t: "Explained one topic aloud", when: (a, low) => a[11] === 2 || low.includes(4) },
 { t: "Regular meals", when: a => [0, 1, 2].includes(a[1]) },
 { t: "Wind-down before bed", when: () => true }
];

/* ---------- pronouns ---------- */
const PRONOUNS = {
 they: { they: "they", them: "them", their: "their", themselves: "themselves", themself: "themself", plural: true, label: "They / them" },
 she:  { they: "she", them: "her", their: "her", themselves: "herself", themself: "herself", plural: false, label: "She / her" },
 he:   { they: "he", them: "him", their: "his", themselves: "himself", themself: "himself", plural: false, label: "He / him" }
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function personalise(str, name, pronoun) {
  const p = PRONOUNS[pronoun] || PRONOUNS.they, pl = p.plural;
  const map = {
    Name: name, they: p.they, They: cap(p.they), them: p.them, their: p.their, Their: cap(p.their), themselves: p.themselves, themself: p.themself,
    "they're": pl ? "they're" : p.they + "'s", "They're": pl ? "They're" : cap(p.they) + "'s",
    s: pl ? "" : "s", is: pl ? "are" : "is", are: pl ? "are" : "is", has: pl ? "have" : "has", does: pl ? "do" : "does",
    "doesn't": pl ? "don't" : "doesn't", "isn't": pl ? "aren't" : "isn't", was: pl ? "were" : "was"
  };
  return String(str).replace(/\{([A-Za-z']+)\}/g, (m, k) => (k in map ? map[k] : m));
}

return { STYLES, BLENDS, MIND, MIND_NOTE, LEVELS, SECTIONS, OBS, SUBJ, COVER_LINE, ABOUT, PRONOUNS, personalise, LETTER, PLAN21, CHECKS, AFTER_CLOSE };
})();
