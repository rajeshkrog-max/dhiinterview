/* Dhirise · every word the student report shows (report-student.html), in second person.
   Keys: areas by score.js area id; styles by styleKey (v/p/k, internal only); flags by score.js flag name.
   Slots filled by js/report-student.js: {name} {answer} {pct} {area} {block} {pace}.
   Arrays of two are variants: the report picks one per student (seeded), so two students rarely read the same page.
   House rules: warm, specific, no labels about ability, no medical words, no traditional-medicine terms. */
window.DhiReportText = {
  title: "{name}'s Mind & Study Profile",
  startLabel: "Dhi starting score",
  startLine: "This is where you start. In Dhi it grows with every tick, hour and module.",
  overviewTitle: "Overview",
  styleTitle: "Learning style",

  /* radar axis names, by area */
  axes: {
    routine: "Daily Routine", emotions: "Emotional Balance", drive: "Focus & Discipline", connection: "Friends & Support",
    expression: "Expression & Memory", clarity: "Clarity & Direction", purpose: "Dreams & Inner Peace"
  },
  bands: { "Strong": "Strong", "Growing": "Growing", "Next to grow": "Next to grow" },

  /* KPI tiles: name, and a band word per index */
  indices: {
    studyReadiness:   { name: "Study Readiness",   bands: { "Strong": "Ready to go", "Growing": "Getting there", "Next to grow": "Building up" } },
    emotionalBalance: { name: "Emotional Balance", bands: { "Strong": "Steady", "Growing": "Finding balance", "Next to grow": "Needs care" } },
    focusEnergy:      { name: "Focus Energy",      bands: { "Strong": "Sharp", "Growing": "Comes in waves", "Next to grow": "Recharging" } },
    direction:        { name: "Direction",         bands: { "Strong": "Clear", "Growing": "Forming", "Next to grow": "Wide open" } }
  },

  /* mind-state donut: the line follows the biggest slice; {pct} is its share */
  states: { calm: "Calm", restless: "Restless", low: "Low energy" },
  stateLine: {
    calm: ["{pct}% of your answers come from a calm, settled place. That is a good floor to build on.",
           "Mostly calm: {pct}% of your answers. Your mind has a quiet centre to come back to."],
    restless: ["{pct}% of your answers carry a restless edge. A lot is moving inside you right now.",
               "Your mind is running fast ({pct}% restless). Short breaks will help it land."],
    low: ["{pct}% of your answers sound tired. Rest is part of studying, not a break from it.",
          "Your energy has been running low ({pct}% of your answers). Small steps count double now."]
  },

  /* learning style */
  confidence: { clear: "Clear match", leaning: "Leaning", blended: "Blended" },
  peersLine: "{pct}% of students share your style",
  styles: {
    v: {
      name: "The Creative Explorer", peers: 36,
      headline: "Your mind moves fast and wide. You learn by connecting ideas nobody handed you.",
      learn: ["New ideas wake you up; repeating the same page puts you to sleep.",
              "You understand best when you can see it, draw it or tell it as a story.",
              "Short, lively bursts work better for you than one long sit."],
      bestTime: "Mid-morning, once your body has moved",
      session: "20–25 minutes, then a 5-minute stretch",
      revision: "Quick rounds on day 1, 3 and 7",
      notes: "Mind maps, colours and small drawings",
      exam: "Scan the paper, bank the easy marks, then return",
      natural: ["Languages, art and big-idea subjects", "Teach one idea a day to a friend. Your mind loves to explain."],
      care: ["Long memorising and step-by-step maths", "Turn a list into a story or a sketch before you learn it."]
    },
    p: {
      name: "The Focused Achiever", peers: 29,
      headline: "You like a clear target and the feeling of hitting it. Goals bring out your best.",
      learn: ["A clear goal for each session keeps you sharp.",
              "You learn fastest when you can test yourself straight away.",
              "Seeing your own progress is your favourite fuel."],
      bestTime: "Late morning, when your focus peaks",
      session: "40–45 minutes, then a real 10-minute break",
      revision: "One timed mock test each week",
      notes: "Short lists, key points and formulas",
      exam: "Plan your minutes first, then go section by section",
      natural: ["Maths, science and anything with a clear answer", "Set a target score for each practice set and chase it."],
      care: ["Slow reading and long written answers", "Give your reading a time limit too, not just your answers."]
    },
    k: {
      name: "The Steady Builder", peers: 35,
      headline: "You take your time, and what you build stays. Patience is your quiet strength.",
      learn: ["Once you truly understand something, you rarely lose it.",
              "Rhythm helps you: same time, same place, same first step.",
              "Writing it in your own words is how it sinks in."],
      bestTime: "Early morning, at the same time each day",
      session: "45–50 minutes of steady work",
      revision: "A little daily; each chapter twice a week",
      notes: "Neat notes in your own words",
      exam: "Read each question twice, then begin calmly",
      natural: ["Biology, history and subjects that reward deep memory", "Revise by writing a one-page summary from memory."],
      care: ["Fast, timed papers", "Do five timed questions a day. Speed grows with rhythm."]
    }
  },
  /* a blend: the two strongest styles, in the order v, p, k */
  blends: {
    vp: { name: "The Creative Achiever", headline: "Ideas come fast, and you want them to count. Imagination and drive live side by side in you." },
    vk: { name: "The Thoughtful Explorer", headline: "Curious and calm at once. You wander through ideas, then let them settle deep." },
    pk: { name: "The Steady Achiever", headline: "Driven and patient together. You set big goals and keep walking towards them." }
  },
  /* the class that feels heaviest (question 15) sets "Needs extra care"; tips follow the style */
  subjects: {
    memory:  { name: "Memory-heavy subjects", tips: { v: "Turn each list into a short story or a quick drawing.", p: "Make it a game: ten terms, timed, beat yesterday's score.", k: "Ten terms a day, written once, read again at night." } },
    writing: { name: "Long written answers", tips: { v: "Say your answer aloud first, then write what you said.", p: "Outline in three points, then write against the clock.", k: "One paragraph a day. Small and steady builds the habit." } },
    numbers: { name: "Timed maths and physics", tips: { v: "Five sums, then move. Short rounds keep you fresh.", p: "Time one section at a time and track your speed.", k: "Five timed questions daily. Speed grows with rhythm." } }
  },

  /* what's working / next to grow */
  workingTitle: "What's working",
  growTitle: "Next to grow",
  noticedLabel: "What we noticed",
  mattersLabel: "Why it matters for your marks",
  stepLabel: "Your first step",
  /* 7 areas × 3 bands: title, noticed (2 variants, with the student's own {answer}), matters, step */
  areas: {
    routine: {
      "Strong": { title: "Your day has a rhythm",
        noticed: ["You told us “{answer}” That steadiness gives your study a firm floor.", "“{answer}” Your days have a shape, and your mind works better inside it."],
        matters: "Regular sleep and meals keep memory and focus steady through exam season.",
        step: "Guard one fixed hour each day and give it to your hardest subject." },
      "Growing": { title: "Your rhythm is forming",
        noticed: ["You said “{answer}” Some days hold together, others slip a little.", "“{answer}” Part of your routine is already there. It just needs an anchor."],
        matters: "A steadier day means your energy turns up when the exam does.",
        step: "Pick one anchor, a wake-up time or a meal time, and keep it for seven days." },
      "Next to grow": { title: "Your days need an anchor",
        noticed: ["You said “{answer}” Your days pull you in different directions.", "“{answer}” Your body and your timetable are not in step yet."],
        matters: "Sleep, meals and wake-up time quietly decide how much you remember.",
        step: "Start with one thing: the same wake-up time, every day this week." }
    },
    emotions: {
      "Strong": { title: "You find your balance",
        noticed: ["You said “{answer}” You let feelings pass without letting them steer.", "“{answer}” When something goes wrong, you find your feet again."],
        matters: "A settled mind recalls more when the exam hall gets tense.",
        step: "Notice what keeps you steady: one line each night about your day." },
      "Growing": { title: "Your feelings are finding their footing",
        noticed: ["You said “{answer}” Some days feel lighter than others, and you notice it.", "“{answer}” Feelings move through you strongly, and you are learning their pattern."],
        matters: "When feelings settle sooner, study time stops leaking away.",
        step: "Name your mood in one word each evening. A pattern shows up within a week." },
      "Next to grow": { title: "Your heart is carrying a lot",
        noticed: ["You said “{answer}” That sounds heavy, and you have been holding it.", "“{answer}” Feelings have been staying with you for a while."],
        matters: "A heavy heart makes focus and memory harder, however hard you try.",
        step: "Tell one person you trust how this week has felt. Just one." }
    },
    drive: {
      "Strong": { title: "You know how to keep going",
        noticed: ["You said “{answer}” You stay with work until it is done.", "“{answer}” You have a way of turning effort into progress."],
        matters: "Steady effort across weeks is what lifts marks the most.",
        step: "Add one short revision round each week to protect what you have built." },
      "Growing": { title: "Your focus comes in good waves",
        noticed: ["You said “{answer}” You focus well when the conditions are right.", "“{answer}” Your drive is real. It just switches on and off."],
        matters: "Turning good days into regular days adds up fast before exams.",
        step: "Study at the same time for 25 minutes, four days this week." },
      "Next to grow": { title: "Your focus likes shorter laps",
        noticed: ["You said “{answer}” Long sessions run out of fuel for you.", "“{answer}” Staying with study is hard right now, and that is useful to know."],
        matters: "Short, regular sessions often beat long, tired ones on exam day.",
        step: "Try one 20-minute block with your phone in another room. Then stop." }
    },
    connection: {
      "Strong": { title: "People are part of your strength",
        noticed: ["You said “{answer}” You know how to be with others, and they feel it.", "“{answer}” You give something to every group you are part of."],
        matters: "Studying with others keeps motivation up on slow days.",
        step: "Start one weekly study session with a friend and keep it going." },
      "Growing": { title: "Your circle is there when you reach for it",
        noticed: ["You said “{answer}” You connect, sometimes, on your own terms.", "“{answer}” You have people, though you do not always lean on them."],
        matters: "Talking a topic through with someone helps it stick.",
        step: "Explain one topic to a friend this week, and ask them to explain one back." },
      "Next to grow": { title: "You carry a lot on your own",
        noticed: ["You said “{answer}” You tend to handle things by yourself.", "“{answer}” Going it alone has become a habit."],
        matters: "Students who share the load tire less before exams.",
        step: "Share one small thing about your week with someone you trust." }
    },
    expression: {
      "Strong": { title: "Your words come out clear",
        noticed: ["You said “{answer}” What you learn, you can say.", "“{answer}” You hold on to what you learn and can put it into words."],
        matters: "Clear answers earn marks, on paper and out loud.",
        step: "Write one past-paper answer a week and compare it with the model answer." },
      "Growing": { title: "Your answers are taking shape",
        noticed: ["You said “{answer}” You know more than you sometimes manage to show.", "“{answer}” Your memory and your words are close to lining up."],
        matters: "Marks go to what reaches the page, not just what is in your head.",
        step: "After each chapter, write three lines from memory. Check them the next day." },
      "Next to grow": { title: "What you know needs a way out",
        noticed: ["You said “{answer}” Getting your thoughts out can feel stuck.", "“{answer}” Learning goes in, but it does not always come back out easily."],
        matters: "Practising recall is often the quickest way to more marks.",
        step: "Say one answer out loud each day this week, alone, in your own words." }
    },
    clarity: {
      "Strong": { title: "You know where you are headed",
        noticed: ["You said “{answer}” Your direction is clear to you.", "“{answer}” You carry a picture of your path."],
        matters: "A clear goal makes the hard chapters feel worth it.",
        step: "Name the one subject that matters most for your goal and give it extra time." },
      "Growing": { title: "Your direction is forming",
        noticed: ["You said “{answer}” You are exploring, and that is a good place to be.", "“{answer}” A picture is forming, piece by piece."],
        matters: "Even a rough direction helps you decide where your study hours go.",
        step: "List three things you enjoy learning. Look for what they share." },
      "Next to grow": { title: "Your path is still open",
        noticed: ["You said “{answer}” The future feels unclear right now.", "“{answer}” You have not found your own answer yet, and that is allowed."],
        matters: "Knowing even a little about why you study makes starting easier.",
        step: "Spend 10 minutes writing what you would study if nobody was watching." }
    },
    purpose: {
      "Strong": { title: "You feel what you are working towards",
        noticed: ["You said “{answer}” Your dreams give your days meaning.", "“{answer}” You hold a picture of your future that pulls you forward."],
        matters: "Purpose keeps you going when motivation runs thin.",
        step: "Link this week's hardest chapter to that picture, in one line." },
      "Growing": { title: "Your dreams are taking shape",
        noticed: ["You said “{answer}” You have a sense of what matters to you.", "“{answer}” You can see where you would like to go."],
        matters: "A clear reason makes daily study feel lighter.",
        step: "Write one sentence about who you want to be in five years. Keep it on your desk." },
      "Next to grow": { title: "Something is weighing on you",
        noticed: ["You said “{answer}” Something is sitting heavy right now.", "“{answer}” It is hard to dream freely with that weight on you."],
        matters: "A lighter heart makes room for focus and memory.",
        step: "Write down the one thing that feels heaviest. Seeing it on paper helps." }
    }
  },

  /* gentle signals: max 2 shown, in this order */
  signalsTitle: "Gentle signals",
  flagOrder: ["lowMood", "keepsFeelingsInside", "selfDoubt", "heavyExpectations", "sleepStrain", "lowCareerClarity", "lowConsistency"],
  flags: {
    lowMood: ["Your energy has been low lately. Go gently with yourself this week.", "Some of your answers sound tired. That is worth noticing, kindly."],
    keepsFeelingsInside: ["You tend to keep feelings to yourself. Sharing even one thing can lighten it.", "You hold a lot inside. You do not have to carry all of it alone."],
    selfDoubt: ["A quiet doubt about being good enough showed up. Your finished work tells another story.", "You wonder if you are enough. Many students do, and the doubt is not the truth."],
    heavyExpectations: ["Other people's hopes feel heavy right now. Your own pace matters too.", "Expectations sit on your shoulders. It is okay to set some of them down."],
    sleepStrain: ["Sleep before big days does not come easily. A calm wind-down can help.", "Your nights before important days are uneasy. Sleep is part of studying too."],
    lowCareerClarity: ["Your path is still forming. That is normal, and there is time.", "You have not settled on a direction yet. Exploring is the right step for now."],
    lowConsistency: ["Some answers looked quick. A short chat with a Dhi mentor will sharpen this picture."]
  },

  /* study blueprint */
  blueprintTitle: "Study blueprint",
  blueprintLabels: { bestTime: "Best time", session: "Session length", revision: "Revision", notes: "Note style", exam: "Exam approach" },
  naturalLabel: "Comes naturally",
  careLabel: "Needs extra care",

  /* 21-day path: per area, 3 weeks × 3 small daily actions, each week carried by one Dhi room.
     {block} and {pace} follow the style. */
  pathTitle: "Your 21-day path",
  weekLabel: "Week {n}",
  dayLabel: "Day",
  block: { v: "20-minute", p: "40-minute", k: "45-minute" },
  pace: { v: "in short bursts", p: "with one clear target", k: "at the same time each day" },
  weekHow: {
    v: "Keep it light: short rounds, and switch spots when you get restless.",
    p: "Set a target each day and tick it the moment it is done.",
    k: "Same time, same place, every day. The rhythm does the work."
  },
  plan: {
    routine: [
      { room: "Habit Tracker", title: "Find your anchor", actions: ["Wake up at the same time", "Eat breakfast before you study", "Books closed 30 minutes before bed"] },
      { room: "Meal Tracker", title: "Fuel your day", actions: ["Log every plate you eat", "Keep lunch within the same hour", "One {block} study block at your best time"] },
      { room: "Habit Tracker", title: "Make it yours", actions: ["Keep your wake-up streak alive", "Write tomorrow's three tasks tonight", "One screen-free hour before sleep"] }
    ],
    emotions: [
      { room: "Mood Tracker", title: "Notice the weather inside", actions: ["Pick one colour for your mood", "Name one thing that went well", "Five slow breaths before you study"] },
      { room: "Mood Tracker", title: "Give feelings a place", actions: ["Write two lines about your day", "Move your body for 10 minutes", "Tell someone one thing you felt"] },
      { room: "Modules", title: "Build your calm", actions: ["Watch one short Mental health film", "Keep your colour streak going", "End the day with one kind line to yourself"] }
    ],
    drive: [
      { room: "Study hour", title: "Short laps", actions: ["One {block} focus block {pace}", "Phone in another room while you study", "Tick one finished task"] },
      { room: "Study hour", title: "Longer laps", actions: ["Two focus blocks with a break between", "Join one live Study hour", "Five minutes on yesterday's topic"] },
      { room: "DHI desk", title: "Test yourself", actions: ["One short practice paper", "Fix one mistake from it", "Set next week's three targets"] }
    ],
    connection: [
      { room: "Study hour", title: "Study side by side", actions: ["Join one live Study hour", "Message one classmate about a topic", "Thank someone who helped you"] },
      { room: "Blog", title: "Share what you know", actions: ["Explain one topic to a friend", "Read one post by another student", "Ask one question you have been holding"] },
      { room: "Study hour", title: "Keep your circle", actions: ["Plan a weekly session with a friend", "Write one short Blog post", "Check in on someone who seems quiet"] }
    ],
    expression: [
      { room: "DHI desk", title: "Say it out loud", actions: ["Explain one topic aloud in 2 minutes", "Write three lines from memory after class", "Ask DHI desk to clarify one doubt"] },
      { room: "DHI desk", title: "Write it your way", actions: ["Answer one past question in writing", "Turn one chapter into a mind map or story", "Read your answer aloud once"] },
      { room: "Modules", title: "Make it stick", actions: ["Watch one short Academic film", "Take a quick mock test on it", "Teach the topic to someone at home"] }
    ],
    clarity: [
      { room: "DHI desk", title: "Wonder out loud", actions: ["Write one thing you enjoyed learning today", "Talk one career idea through with DHI desk", "Notice which class makes time fly"] },
      { room: "Blog", title: "Look around", actions: ["Read about one path that interests you", "Ask one adult how they chose their work", "Write three things you are curious about"] },
      { room: "DHI desk", title: "Draw your map", actions: ["Pick one subject to give extra time", "Write one small goal for this term", "Talk that goal through with DHI desk"] }
    ],
    purpose: [
      { room: "Mood Tracker", title: "Lighten the load", actions: ["Write down what feels heaviest", "Do one thing just for you", "Pick a colour for your day"] },
      { room: "Modules", title: "Find your why", actions: ["Watch one short Self help film", "Write one line about your dream", "Link one chapter to that dream"] },
      { room: "Blog", title: "Say what matters", actions: ["Write a short post about what matters to you", "Celebrate one finished week", "Keep one dream note on your desk"] }
    ]
  },
  continuesLine: "Continues inside Dhi: Habit Tracker keeps your ticks, Study hour keeps you company, DHI desk explains what's stuck.",

  /* your Dhi rooms: area or flag → [room, line], with a second choice if that room is already listed */
  roomsTitle: "Your Dhi rooms",
  areaRooms: {
    routine:    [["Habit Tracker", "One wake-up tick a day and a streak that shows your rhythm growing."], ["Meal Tracker", "Log your Indian plate in seconds, so meals keep their time."]],
    emotions:   [["Mood Tracker", "One colour a day and a Dhi line, so you see your inner weather."], ["Counseling", "A private talk with a counsellor, never recorded, only if you want it."]],
    drive:      [["Study hour", "A live study room with other students, DND mode on, for short laps."], ["DHI desk", "A quick mock test or practice paper whenever you are ready."]],
    connection: [["Study hour", "Company while you study, without the noise of a feed."], ["Blog", "Write and share with other students, at your own pace."]],
    expression: [["DHI desk", "Practise answers aloud, in private, until the words come easily."], ["Modules", "Short Academic films that make a topic clear in minutes."]],
    clarity:    [["DHI desk", "Talk your options through, any time, with no one judging."], ["Blog", "Read what other students are exploring and write your own."]],
    purpose:    [["Modules", "Short Self help films for the days you need a reason."], ["Blog", "Write about where you are headed and what matters to you."]]
  },
  flagRooms: {
    lowMood:             [["Mood Tracker", "A colour a day; its help button can book a counsellor when you want one."], ["Counseling", "Private, never recorded, always your choice."]],
    keepsFeelingsInside: [["Counseling", "A private booking with a counsellor, never recorded, only if you want it."], ["Mood Tracker", "A quiet place to put a feeling, one colour a day."]],
    selfDoubt:           [["Progress", "Your finished work, week by week, where you can see it."], ["Habit Tracker", "Small daily ticks that show you keep showing up."]],
    heavyExpectations:   [["Counseling", "A private space to talk about the pressure, never recorded, always optional."], ["Progress", "Your own steps, measured against you, not anyone else."]],
    sleepStrain:         [["Habit Tracker", "A wind-down habit with a streak, so nights get calmer."], ["Mood Tracker", "See how your sleep and your mood move together."]],
    lowCareerClarity:    [["DHI desk", "Talk through what you enjoy, privately, as often as you like."], ["Blog", "Read how other students are finding their way."]],
    lowConsistency:      [["Study hour", "Slow down and study alongside others for a while."], ["Habit Tracker", "One small tick a day to build a steady rhythm."]]
  },
  styleRooms: {
    v: ["Study hour", "Short live sessions with others that keep your mind moving."],
    p: ["Exams", "Teacher papers, a hint slider for MCQs and remarks to aim at."],
    k: ["Habit Tracker", "A steady streak for a steady learner."]
  },

  /* top-of-report chip */
  warnChip: "For self-reflection only · Not a medical or psychological assessment. For concerns, talk to a professional.",

  /* food, sports & hobbies, careers: per style and per blend (vp, vk, pk); all soft, nothing strict */
  foodTitle: "Food that may suit your energy",
  foodGoodLabel: "May feel good at study time",
  foodHeavyLabel: "May feel heavy at study time",
  foodLine: "Notice how your body feels; it knows best.",
  food: {
    v:  { good: ["Warm khichdi with a little ghee", "Poha with peanuts", "A banana or a few soaked almonds", "A warm glass of milk in the evening"],
          heavy: ["Ice-cold drinks", "Dry packet snacks like chips", "Tea or coffee, cup after cup"] },
    p:  { good: ["Curd rice or a glass of buttermilk", "Cucumber and seasonal fruit", "Fresh coconut water", "Simple dal, rice and sabzi"],
          heavy: ["Very spicy, oily snacks", "Tea or coffee, cup after cup", "Fried food just before study"] },
    k:  { good: ["Light, warm upma or idli", "Moong dal chilla", "Seasonal fruit like guava or apple", "Warm water with ginger and lemon"],
          heavy: ["A big, heavy lunch just before study", "Sweets and mithai at study time", "Fried snacks like samosa"] },
    vp: { good: ["Warm dal and rice", "Curd rice", "A banana between study blocks", "Fresh coconut water"],
          heavy: ["Ice-cold drinks", "Very spicy fried snacks", "Tea or coffee, cup after cup"] },
    vk: { good: ["Warm khichdi", "Poha with peas", "Seasonal fruit", "Warm water with ginger"],
          heavy: ["Heavy fried snacks", "Ice-cold drinks", "Sweets at study time"] },
    pk: { good: ["Idli or dosa", "A glass of buttermilk", "Moong dal chilla", "Fresh seasonal fruit"],
          heavy: ["Oily, spicy snacks", "A big, heavy lunch just before study", "Sugary drinks"] }
  },

  sportsTitle: "Sports & hobbies you may enjoy",
  /* three from the style, then one from the student's strongest area */
  sports: {
    v:  [["Dance", "Music and movement give your energy somewhere to go."], ["Cycling", "Fresh air and new routes keep things lively."], ["Drawing or doodling", "Your ideas get a place to land."], ["Gentle stretching", "Settles a busy mind between study blocks."]],
    p:  [["Badminton", "Quick, competitive and done in half an hour."], ["Swimming", "Cools you down after an intense day."], ["Chess", "Strategy with a clear goal."], ["Football", "Team goals suit your drive."]],
    k:  [["Brisk morning walks", "Gets your energy moving early."], ["Football or kabaddi", "Lively games lift a steady body."], ["Gardening", "Slow work you can watch grow."], ["Learning an instrument", "Steady practice rewards your patience."]],
    vp: [["Badminton", "Fast and fun, with a score to chase."], ["Dance", "Movement for an energetic mind."], ["Cycling", "Freedom with somewhere to go."], ["Chess", "Ideas, with a goal."]],
    vk: [["Cycling", "Easy, open-air movement."], ["Drawing or painting", "Calm space for your ideas."], ["Morning walks", "A gentle start to the day."], ["Learning an instrument", "Curiosity, practised slowly."]],
    pk: [["Swimming", "Steady effort that also cools you down."], ["Football", "Team goals, played with stamina."], ["Gardening", "Patience you can see grow."], ["Chess", "Long games for a focused mind."]]
  },
  areaSports: {
    routine: ["Yoga at the same time each morning", "Fits the rhythm you already keep."],
    emotions: ["Journaling", "A quiet page for what you feel."],
    drive: ["Martial arts", "Discipline you can feel in your body."],
    connection: ["Team games like cricket or volleyball", "You bring out the best in a group."],
    expression: ["Debate or theatre", "A stage for your words."],
    clarity: ["A reading club", "Books that widen your map."],
    purpose: ["Volunteering", "Your time, given to something you care about."]
  },

  careersTitle: "Career paths you might explore",
  careersLine: "Explore, don't decide yet. Dhi's DHI desk can help you think it through.",
  /* three from the style, two from the strongest areas; never from a test of ability */
  careers: {
    v:  ["Design", "Writing and media", "Architecture", "Starting a business", "Film and animation"],
    p:  ["Engineering", "Law", "Business and management", "Research science", "Medicine"],
    k:  ["Healthcare and nursing", "Teaching", "Accounting and finance", "Environmental science", "Agriculture and food science"],
    vp: ["Product design", "Marketing", "Starting a business", "Architecture", "Journalism"],
    vk: ["Writing and media", "Teaching", "Design", "Environmental science", "Music and the arts"],
    pk: ["Engineering", "Medicine", "Accounting and finance", "Civil services", "Research science"]
  },
  areaCareers: {
    routine: "Operations and planning",
    emotions: "Psychology",
    drive: "Sports and fitness coaching",
    connection: "Social work",
    expression: "Journalism",
    clarity: "Data and analytics",
    purpose: "Public service"
  },

  /* feedback card */
  feedbackTitle: "Your feedback",
  feedbackAsk: "How well does this report fit you?",
  feedbackStar: "{n} of 5",
  feedbackPlaceholder: "What did this get right? What did it miss?",
  feedbackShare: "You may share my feedback anonymously",
  feedbackSubmit: "Submit",
  feedbackNeedStars: "Tap a star first.",
  feedbackTooShort: "A little more, please: at least {n} characters.",
  feedbackJunk: "Tell us in real words what fit and what didn't.",
  feedbackThanks: "Thank you.",

  /* join */
  joinTitle: "Dhi early access",
  joinLine: "A quiet WhatsApp group for students. Be first in when Dhi opens.",
  joinButton: "Join Dhi early access on WhatsApp",
  joinSoon: "WhatsApp early access opens soon",
  joinedLine: "You're in · +91 ••• ••• {last4}",
  openGroup: "Open the WhatsApp group",
  shareButton: "Share with a friend",
  shareText: "I just found my study style with DhiRise. Try it:",
  shareCopied: "Link copied",

  footer: "A study and wellbeing screening based on your answers. Not a medical or psychological diagnosis."
};
