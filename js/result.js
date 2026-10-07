/* Dhirise · result. Eight slides built from the original scoring (DHIcore.build in js/app.js) and the
   original answer lines (js/reportContent.js), in the student's own voice.
   Answers: sessionStorage "dhirise.answers" ({ "2": {q, choice}, … }); question 1 may sit in "dhirise.q1".
   Adapter: choice 1–4 → the old option index 0–3. If js/config.js has aiKey, the same facts are sent to Claude
   to word the eight slides (facts unchanged); otherwise reportContent.js is used directly. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var C = window.DHIcore, D = window.DHI, RC = window.DHI_REPORT, CFG = window.DHI_CONFIG || {};

  /* ---------- adapter: saved choices → old answer array ---------- */
  var chosen = {};
  try { var a = JSON.parse(sessionStorage.getItem("dhirise.answers")) || {}; Object.keys(a).forEach(function (k) { if (a[k] && a[k].choice) chosen[+k] = +a[k].choice; }); } catch (e) {}
  try { var q1 = JSON.parse(sessionStorage.getItem("dhirise.q1")); if (q1 && q1.choice && !chosen[1]) chosen[1] = +q1.choice; } catch (e) {}
  /* a shared link can carry the 18 choices: result.html#a=212322232123222321 */
  var linked = (location.hash.match(/[#&]a=([1-4]{18})\b/) || [])[1];
  if (linked) linked.split("").forEach(function (d, i) { if (!chosen[i + 1]) chosen[i + 1] = +d; });
  var ans = [];
  for (var q = 1; q <= 18; q++) ans.push(chosen[q] >= 1 && chosen[q] <= 4 ? chosen[q] - 1 : null);

  if (!C || !RC || ans.some(function (x) { return x == null; })) {
    $("slides").innerHTML = '<div class="empty"><p>Finish the check first.</p><a class="gold" href="question.html" style="max-width:320px;text-align:center;text-decoration:none;line-height:24px">Go to question 1</a></div>';
    $("next").hidden = true; $("count").textContent = "";
    return;
  }

  var gate = null; try { gate = JSON.parse(localStorage.getItem("dhirise.gate.v1")); } catch (e) {}
  var community = null; try { community = JSON.parse(localStorage.getItem("dhirise.community.v1")); } catch (e) {}
  var rep = C.build(ans, { name: gate && gate.name || "", cls: gate && gate.class || "" }, null);   /* the original score */
  var first = gate && gate.name ? rep.first : "";

  /* ---------- student voice: the report lines are written about the student; turn them toward "you" ---------- */
  var IRREG = { is: "are", has: "have", does: "do", "doesn't": "don't", "isn't": "aren't", was: "were" };
  var SKIP = /^(sometimes|usually|often|naturally|quietly|already|barely|still|also|really|always|never|rarely|almost|just|only)$/i;
  function unS(w) {
    var l = w.toLowerCase();
    if (IRREG[l]) return IRREG[l];
    if (/(ss|sh|ch|x|z|o)es$/.test(l)) return w.slice(0, -2);
    if (/[^aeiou]ies$/.test(l)) return w.slice(0, -3) + "y";
    if (/s$/.test(l) && !/ss$/.test(l)) return w.slice(0, -1);
    return w;
  }
  function toYou(str) {
    var s = String(str)
      .replace(/\{Name\}'s/g, "your").replace(/\{Their\}/g, "Your").replace(/\{their\}/g, "your")
      .replace(/\{themselves\}|\{themself\}/g, "yourself").replace(/\{them\}/g, "you")
      .replace(/\{They're\}|\{they're\}/g, "you're").replace(/\{They\}|\{they\}|\{Name\}/g, "\u0001")
      .replace(/\{s\}|\{es\}/g, "").replace(/\{is\}|\{are\}/g, "are").replace(/\{has\}/g, "have").replace(/\{does\}/g, "do")
      .replace(/\{doesn't\}/g, "don't").replace(/\{isn't\}/g, "aren't").replace(/\{was\}/g, "were");
    s = s.replace(/\u0001((?:\s+[\w'’-]+)+?)(?=[.,;:!?]|$)/g, function (m, rest) {
      var w = rest.trim().split(/\s+/), i = 0;
      while (i < w.length && SKIP.test(w[i])) i++;
      if (i < w.length && !/^(can|may|will|would|should|must|might|could|did|described|shared)$/.test(w[i])) w[i] = unS(w[i]);
      return "\u0001 " + w.join(" ");
    });
    s = s.replace(/\u0001/g, "you");
    return s.replace(/(^|[.!?]\s+)(you|your)\b/g, function (m, p, w) { return p + w.charAt(0).toUpperCase() + w.slice(1); });
  }
  /* answer lines whose second clause the converter cannot conjugate safely: exact student-voice versions */
  var OBS_YOU = {
    "2.0": "When absorbed in study, you sometimes forget to eat and then feel shaky or spaced out.",
    "2.2": "You can go a long time without food and often don't notice hunger.",
    "6.3": "You usually stay with a long lecture and take notes without much effort.",
    "7.0": "Left to yourself, you study in bursts with gaps, then tend to rush in the final week.",
    "7.2": "You start slowly, but keep a steady pace once going.",
    "8.0": "You get restless after about twenty minutes of study and need to move.",
    "8.2": "You can sit for long stretches, but notice that less goes in over time.",
    "9.2": "Unfamiliar, difficult problems can feel like a wall to you, and you prefer what is familiar.",
    "10.0": "In groups, you bring fresh ideas and keep the conversation going.",
    "10.1": "In groups, you naturally take charge and keep everyone on track.",
    "10.2": "In groups, you listen, support others and keep the mood easy.",
    "11.0": "On low days, you share briefly with many people and then move on.",
    "12.3": "When called on in class, you take a breath and answer simply.",
    "13.0": "You pick things up quickly, but find they can fade just as quickly.",
    "14.3": "A sense of direction is forming for you, and you are exploring calmly.",
    "16.1": "Before an important day, you sleep briefly but deeply and wake with a to-do list.",
    "16.2": "Before an important day, you sleep long and heavily and find waking hard.",
    "18.3": "You say nothing feels heavy right now and you're at peace with your own pace."
  };
  function obs(qn) { var i = ans[qn - 1]; return OBS_YOU[qn + "." + i] || toYou(RC.OBS[qn - 1][i]); }

  /* ---------- facts from the original score ---------- */
  var k1 = rep.R.order[0], S1 = RC.STYLES[k1];
  var blend = rep.R.mixKey ? RC.BLENDS[rep.R.mixKey] : null;
  var styleName = blend ? blend.name : S1.name;
  var styleLine = blend ? blend.parts.map(function (k) { return RC.STYLES[k].short; }).join(" + ") + ". " + toYou(blend.blend[0]) : S1.tagline + ". " + toYou(S1.summary[0]);
  var IDX = { v: 0, p: 1, k: 2 };                               /* old option index that leans to each style */
  var styleQs = [];
  for (q = 1; q <= 18 && styleQs.length < 3; q++) if (ans[q - 1] === IDX[k1]) styleQs.push(q);
  [1, 13, 8, 16, 2].forEach(function (n) { if (styleQs.length < 3 && styleQs.indexOf(n) < 0) styleQs.push(n); });

  var low = rep.low, sec = RC.SECTIONS[low.i];
  var lvl = low.v < 0.5 ? "support" : low.v < 0.75 ? "growing" : "strong";
  var lowQs = D.Q.map(function (row, qi) { return row[0] === low.i ? qi + 1 : 0; }).filter(Boolean);
  var pulled = lowQs.slice().sort(function (x, y) { return D.Q[x - 1][2][ans[x - 1]][3] - D.Q[y - 1][2][ans[y - 1]][3]; })[0];

  var tag = D.Q[D.SUBJECT_Q][2][ans[D.SUBJECT_Q]][5];
  var subj = RC.SUBJ[tag] || null;
  /* that style's care tip for this subject; if the style has none for it, the subject's own tip */
  var care = S1.subjects.care.filter(function (c) { return c.tag === tag; })[0] || subj ||
    { tip: "Still, " + S1.subjects.care[0].n.toLowerCase() + " need care: " + S1.subjects.care[0].tip.charAt(0).toLowerCase() + S1.subjects.care[0].tip.slice(1) };

  var PAPER = [
    "The day a paper comes back, look at one missed question that evening, fix it, and leave the rest for tomorrow.",
    "The day a paper comes back, put that heat into one wrong answer: redo it once, then close the paper.",
    "The day a paper comes back, keep the evening light and tell one person how it felt before you open the book again.",
    "The day a paper comes back, write the lesson you found as the first line in your notes for the next paper."
  ];
  var plan = RC.PLAN21.sections[low.i].child.map(toYou), helps = S1.helps;
  var moves = [
    plan[0] + ". Set it as a daily tick on your Dhirise dashboard.",
    plan[1] + ". Your Dhirise dashboard reminds you each evening until it holds.",
    "For " + S1.short.toLowerCase() + " minds like yours: " + helps[1].charAt(0).toLowerCase() + helps[1].slice(1) + ". Plan your study hour around it on the Dhirise dashboard."
  ];

  var FACTS = {
    name: first, style: styleName, styleLine: styleLine,
    studyHour: { time: toYou(S1.study.time), session: toYou(S1.study.session) },
    answerLines: styleQs.map(obs),
    lowestArea: { title: sec.title, level: RC.LEVELS[lvl], means: toYou(sec.means[lvl][0]), pulledDownBy: obs(pulled) },
    subject: { name: subj ? subj.n : "No single class feels heavy", line: obs(15), tip: toYou(care.tip) },
    resultDay: { line: obs(4), action: PAPER[ans[3]] },
    moves: moves,
    onList: !!(community && community.phone)
  };

  /* ---------- slides (reportContent wording) ---------- */
  var DISCLAIMER = '<p class="note">For study screening only. Not a medical check. For a health concern, see a doctor.</p>';
  var P = function (t, cls) { return "<p" + (cls ? ' class="' + cls + '"' : "") + ">" + esc(t) + "</p>"; };
  var UL = function (arr) { return '<ul class="said">' + arr.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>"; };

  function localSlides() {
    var f = FACTS;
    return [
      { kicker: "Your style", title: (f.name ? f.name + ", you are " : "You are ") + f.style, html: P(f.styleLine, "lead") },
      { kicker: "How you study", title: "What your answers showed", html: UL(f.answerLines) +
          P("Your best study hour: " + f.studyHour.time) + P("Your best session: " + f.studyHour.session) },
      { kicker: "Your lowest area", title: f.lowestArea.title + " · " + f.lowestArea.level, html: P(f.lowestArea.means, "lead") + UL([f.lowestArea.pulledDownBy]) },
      { kicker: "Your heavy subject", title: f.subject.name, html: UL([f.subject.line]) + P(f.subject.tip, "lead") },
      { kicker: "When a result comes back", title: "The day a paper comes back", html: UL([f.resultDay.line]) + P(f.resultDay.action, "lead") },
      { kicker: "Three moves", title: "Start with these three", html: '<ol class="moves">' + f.moves.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ol>" },
      { kicker: "Free student pilot", title: "The free student pilot", html: P("The pilot is free and only for students. It starts with your lowest area, " + f.lowestArea.title.toLowerCase() + ", and the study hour that suits " + f.style + ".", "lead") },
      { kicker: "Your view", title: "Did we read you right?", html: P("Your answers point to " + f.style + ", with " + f.lowestArea.title.toLowerCase() + " as the area to grow first. Tell us if that sounds like you.") }
    ];
  }

  /* slide 2's disclaimer and the slide 7 and 8 controls are always ours, whoever wrote the words */
  function extras(i) {
    if (i === 1) return DISCLAIMER;
    if (i === 6) return (FACTS.onList
        ? P("You are on the list. Your pilot place will reach you on +91 ••• ••• " + String(community.phone).replace(/\D/g, "").slice(-4) + ".")
        : P("You are not on the list yet.") + '<p><a href="done.html">Join the list</a></p>') +
      '<button type="button" class="gold" id="share">Share the pilot with a friend</button><p class="saved" id="shared" hidden>Link copied.</p>';
    if (i === 7) return '<div class="rate" role="radiogroup" aria-label="How well this fits you" id="rate">' +
        '<button type="button" role="radio" aria-checked="false" data-v="yes">Yes, this is me</button>' +
        '<button type="button" role="radio" aria-checked="false" data-v="partly">Partly</button>' +
        '<button type="button" role="radio" aria-checked="false" data-v="no">Not really</button></div>' +
        '<label for="fbNote" class="kicker" style="display:block">What did we miss?</label>' +
        '<textarea id="fbNote" maxlength="600"></textarea>' +
        '<p class="err" id="fbErr" aria-live="polite" hidden>Choose one of the three answers above.</p>' +
        '<button type="button" class="gold" id="fbSave">Send feedback</button>' +
        '<p class="saved" id="fbDone" hidden>Thank you. Your feedback is saved.</p>' + DISCLAIMER;
    return "";
  }

  function render(slides) {
    $("slides").innerHTML = slides.map(function (s, i) {
      return '<section class="slide" aria-roledescription="slide" aria-label="' + (i + 1) + ' of 8">' +
        '<p class="kicker">' + esc(s.kicker) + "</p><h2>" + esc(s.title) + "</h2>" + s.html + extras(i) + "</section>";
    }).join("");
    wire();
  }

  /* ---------- optional: Claude words the slides from the same facts ---------- */
  function aiSlides() {
    var schema = { type: "object", additionalProperties: false, required: ["slides"], properties: { slides: { type: "array", items: {
      type: "object", additionalProperties: false, required: ["kicker", "title", "lines"],
      properties: { kicker: { type: "string" }, title: { type: "string" }, lines: { type: "array", items: { type: "string" } } } } } } };
    var prompt = "You write a short study result for a school student, in second person, warm and plain. " +
      "Use only these facts; do not change, add or drop any fact, number or quoted answer line. No parents, no medical claims, no Sanskrit, no chakra names, no WhatsApp. " +
      "Return exactly 8 slides in this order: 1 name and style, 2 three answer lines and the study hour, 3 lowest area with its meaning and the answer that pulled it down, " +
      "4 heavy subject and its tip, 5 the result-day answer line and what to do that day, 6 exactly three moves, each naming the Dhirise dashboard, " +
      "7 the free student pilot (only for students), 8 ask if this sounds like them. Each slide: kicker (2-4 words), title (under 10 words), 1-4 lines.\n\nFACTS:\n" + JSON.stringify(FACTS);
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CFG.aiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-opus-5", max_tokens: 16000, fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: schema } },
        messages: [{ role: "user", content: prompt }]
      })
    }).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }).then(function (msg) {
      if (msg.stop_reason === "refusal" || msg.stop_reason === "max_tokens") throw new Error(msg.stop_reason);
      var text = (msg.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
      var out = JSON.parse(text).slides;
      if (!Array.isArray(out) || out.length !== 8) throw new Error("shape");
      return out.map(function (s) { return { kicker: s.kicker, title: s.title, html: UL(s.lines) }; });
    });
  }

  /* ---------- swipe, Next, share, feedback ---------- */
  var box = $("slides"), next = $("next"), cur = 0;
  function setCount() {
    cur = Math.round(box.scrollLeft / Math.max(1, box.clientWidth));
    $("count").textContent = (cur + 1) + " / 8";
    next.hidden = cur >= 7;
  }
  box.addEventListener("scroll", function () { requestAnimationFrame(setCount); }, { passive: true });
  window.addEventListener("resize", setCount);
  function go(i) { box.scrollTo({ left: Math.max(0, Math.min(7, i)) * box.clientWidth }); }
  next.addEventListener("click", function () { go(cur + 1); });
  box.addEventListener("keydown", function (e) {
    if (/^(TEXTAREA|INPUT|BUTTON)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
  });

  function wire() {
    setCount();
    var share = $("share");
    if (share) share.addEventListener("click", function () {
      var url = new URL("landing.html", location.href).href;
      var data = { title: "Dhirise student pilot", text: "A free study check and pilot for students.", url: url };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { $("shared").hidden = false; }, function () {});
    });
    var rating = null;
    Array.prototype.forEach.call(document.querySelectorAll("#rate button"), function (b, i, all) {
      b.addEventListener("click", function () {
        rating = b.dataset.v;
        Array.prototype.forEach.call(all, function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
        $("fbErr").hidden = true;
      });
    });
    var save = $("fbSave");
    if (save) save.addEventListener("click", function () {
      if (!rating) { $("fbErr").hidden = false; return; }
      try { localStorage.setItem("dhirise.feedback.v1", JSON.stringify({ rating: rating, note: $("fbNote").value.trim(), style: styleName, lowest: sec.title, at: new Date().toISOString() })); } catch (e) {}
      save.hidden = true; $("fbDone").hidden = false;
    });
  }

  render(localSlides());
  if (CFG.aiKey) aiSlides().then(render).catch(function () { /* keep the reportContent wording */ });
})();
