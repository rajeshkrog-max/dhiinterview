/* Dhirise · the words of the "Who you are" story (who.html). Built only from the student's answers and score().
   Soft language only: "you may", "it seems", "often", "many people like you". No labels, nothing negative stated as fact.
   Style keys: v, p, k, or a blend vp / vk / pk (internal only). Answer lines are keyed by option id, so each story follows the answers.
   {name} is the student's first name. */
window.DhiStoryText = {
  stepLabel: "{i} / {n}",
  back: "Back",
  next: "Next",
  finish: "See my full report",
  fromLabel: "From your answers",

  /* 1. how you think: style + Q13 + Q9 */
  think: {
    titles: {
      v: "A mind that loves to explore", p: "A mind that likes a clear aim", k: "A mind that builds to last",
      vp: "A mind full of ideas, with somewhere to go", vk: "A curious mind that likes to go deep", pk: "A focused mind with a patient heart"
    },
    style: {
      v: "It seems your thoughts often jump from one idea to the next, finding links others may miss.",
      p: "You may think best with a goal in front of you, cutting straight to what matters.",
      k: "It seems you often think things through slowly, and once you understand, it stays.",
      vp: "Your thoughts may race ahead, and you often want them to land somewhere useful.",
      vk: "You may wander through ideas with curiosity, then quietly settle on what feels true.",
      pk: "It seems you like to aim clearly, and to get there one steady step at a time."
    },
    note: "how learning stays with you, and how a hard question feels"
  },

  /* 2. how you feel things: Q4 + Q5 + Q12; the title follows the biggest mind-state slice */
  feel: {
    titles: { calm: "You feel things, and find your way back", restless: "You feel things quickly and fully", low: "You feel things deeply" },
    note: "a disappointing result, your moods, and being asked in class"
  },

  /* 3. who you let in: Q10 + Q11; the title follows Q11 */
  letIn: {
    titles: { q11o1: "You share easily, then move on", q11o2: "You trust yourself first", q11o3: "You let people in slowly", q11o4: "You keep a small, trusted circle" },
    note: "group study and low days"
  },

  /* 4. what drives you: Q7 + Q8 + Q14 */
  drive: {
    titles: {
      v: "You are driven by what is new", p: "You are driven by the goal", k: "You are driven by steady progress",
      vp: "You are driven by ideas that go somewhere", vk: "You are driven by curiosity, at your own pace", pk: "You are driven by goals you reach step by step"
    },
    note: "the month before an exam, long study sessions and your future"
  },

  /* 5. what you dream of: Q17 + Q18; the title follows Q17 */
  dream: {
    titles: { q17o1: "You dream in colour", q17o2: "You dream of leading", q17o3: "You dream of a settled, happy home", q17o4: "You dream of helping others" },
    note: "ten years from now, and what feels heavy today"
  },

  /* 6. closing: one style line (two variants), then the student's strongest area */
  closing: {
    title: "Putting it together",
    style: {
      v: ["{name}, it seems you are an explorer at heart: curious, quick and full of ideas.", "{name}, many people like you light up when there is something new to discover."],
      p: ["{name}, it seems you are someone who sets a target and goes for it.", "{name}, many people like you grow fastest with a clear goal ahead."],
      k: ["{name}, it seems you are a builder: patient, steady and quietly strong.", "{name}, many people like you go far simply by never stopping."],
      vp: ["{name}, it seems you mix fresh ideas with a real wish to finish what you start."],
      vk: ["{name}, it seems you are both curious and calm, a rare and gentle mix."],
      pk: ["{name}, it seems you set big goals and have the patience to reach them."]
    },
    area: "Your {area} already seems to be a strength. Your full report shows how to build on it.",
    areaWords: { routine: "daily rhythm", emotions: "emotional balance", drive: "focus", connection: "way with people",
      expression: "way with words", clarity: "sense of direction", purpose: "sense of purpose" },
    last: "Everything here came from you. Next, your full report.",
    note: "all 18 of your answers"
  },

  /* one soft line per answer */
  answers: {
    q13o1: "Learning may come to you quickly, and a second look often helps it stay.",
    q13o2: "One clear look is often enough for you. Many people like you learn by seeing.",
    q13o3: "You may take a little longer, and what you learn tends to stay for good.",
    q13o4: "Putting things in your own words seems to be how ideas become yours.",

    q9o1: "A hard question may spark you at first, and a fresh one can pull you away.",
    q9o2: "Hard questions may feel like a challenge you quietly enjoy.",
    q9o3: "When something feels too hard, you may prefer familiar ground, and that is very human.",
    q9o4: "You often break big things into small steps, which is a quiet strength.",

    q4o1: "When a result disappoints, your mind may run ahead to what comes next. Worry often means you care.",
    q4o2: "A low mark may sting hot at first. That heat often comes from caring a lot.",
    q4o3: "Disappointment may stay with you quietly for a while. Gentle words often help you more than harsh ones.",
    q4o4: "When things go wrong, you seem to pause and look for the lesson.",

    q5o1: "Your moods may shift like the weather, which often means you notice a lot.",
    q5o2: "You may feel things intensely, like a warm afternoon that stays warm.",
    q5o3: "Some days may feel heavy and slow, and it seems you carry that quietly.",
    q5o4: "These days, your inner weather seems clear and open.",

    q12o1: "Put on the spot, your words may rush out ahead of you.",
    q12o2: "You may answer with confidence, even before you are fully sure.",
    q12o3: "Being put on the spot may make you go quiet. Kind, patient people often bring out your best.",
    q12o4: "You seem able to take a breath and answer simply, even with eyes on you.",

    q10o1: "In a group, you may be the one who brings ideas and keeps the talk alive.",
    q10o2: "In a group, others may look to you to keep things on track.",
    q10o3: "In a group, you seem to be the calm one who puts others at ease.",
    q10o4: "You often notice who is stuck and help without making a fuss.",

    q11o1: "On low days you may reach out to many people briefly, then keep moving.",
    q11o2: "On low days you may prefer to handle things yourself. Many people like you open up once trust is earned.",
    q11o3: "On low days you may go quiet. When you open up, it tends to be with someone who has been patient with you.",
    q11o4: "On low days you seem to turn to one or two people you trust. That circle may matter a lot to you.",

    q7o1: "You may work in bursts of energy, often finding a new gear when time is short.",
    q7o2: "A plan from day one seems to give you calm and control.",
    q7o3: "You may start slowly, then keep a pace others find hard to match.",
    q7o4: "A little every day seems to suit you, with time to look back and revise.",

    q8o1: "Your body may ask to move often; movement seems to help you think.",
    q8o2: "A stubborn question may stay with you until you have cracked it.",
    q8o3: "Long sessions may run low on steam for you, even when you keep sitting.",
    q8o4: "You seem to know when to rest, before you tire.",

    q14o1: "Your picture of the future may change often, and many people like you find their path by trying things.",
    q14o2: "You seem to have a clear picture of where you are headed.",
    q14o3: "You may not be sure yet, and family ideas may feel easier to follow for now.",
    q14o4: "A direction seems to be forming, and you are exploring it calmly.",

    q17o1: "You may picture a life of travel, making things and new places.",
    q17o2: "You may picture yourself respected, leading something that matters.",
    q17o3: "You may picture a calm, secure life with family close by.",
    q17o4: "You may picture work that genuinely helps people.",

    q18o1: "Right now, other people's hopes may sit heavy on you. Your own dream deserves room too.",
    q18o2: "A quiet doubt may visit sometimes. Many people like you carry it, and it is often not the truth.",
    q18o3: "Noise and distraction may pull at you, and protecting your quiet time may help your dream grow.",
    q18o4: "Right now, you seem at peace with your own pace, which is a good place to dream from."
  }
};
