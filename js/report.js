/* Dhirise · Parent Report: builds the parent-facing A4 report from a saved session and exports it to PDF.
   Uses the shared scoring core (window.DHIcore) but only plain-language text from js/reportContent.js. */
(function () {
"use strict";
const C = window.DHIcore, D = window.DHI, RC = window.DHI_REPORT, CFG = window.DHI_CONFIG || {};
const { esc } = C;
const $ = s => document.querySelector(s);
const LOGO_SRC = "assets/dhirise-logo.png", LOGO_FALLBACK = "assets/dhirise-logo.jpeg";
const logoImg = cls => `<img class="logo ${cls || ""}" src="${LOGO_SRC}" alt="Dhirise" onerror="this.onerror=null;this.src='${LOGO_FALLBACK}'">`;

/* ---------- load the session (saved list first, then the link's own copy) ---------- */
function loadSession() {
  const sid = new URLSearchParams(location.search).get("sid");
  let fromLink = null;
  try { const m = location.hash.match(/[#&]d=([^&]+)/); if (m) fromLink = JSON.parse(decodeURIComponent(m[1])); } catch (e) {}
  const saved = sid ? C.loadStore().sessions.find(x => x.id === sid) : null;
  /* the saved record wins; the link only fills fields it lacks (e.g. pronoun on sessions saved before that field existed) */
  const s = saved ? Object.assign({}, fromLink || {}, saved, { pronoun: saved.pronoun || (fromLink && fromLink.pronoun) || "they" }) : fromLink;
  if (!s || !Array.isArray(s.ans) || s.ans.length !== D.Q.length || s.ans.some(a => a == null)) return null;
  return Object.assign({ pronoun: "they", cls: "", stream: "" }, s, { extra: Object.assign({}, s.extra || {}) });
}
function persist(s) {
  const store = C.loadStore();
  const at = store.sessions.findIndex(x => x.id === s.id);
  if (at >= 0) Object.assign(store.sessions[at], { pronoun: s.pronoun, cls: s.cls, stream: s.stream, extra: s.extra });
  else if (s.id) store.sessions.push(s);
  C.saveStore(store);
}

/* ---------- seeded variety: the same student always gets the same wording, different students differ ---------- */
function seedOf(str) { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(a) { return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
const firstSentence = s => (s.match(/^.*?[.!?](\s|$)/) || [s])[0].trim();

/* ---------- the parent-facing model ---------- */
function model(s) {
  const rep = C.build(s.ans, { name: s.name, cls: s.cls, stream: s.stream, date: s.date }, null);
  const first = rep.first, full = rep.name;
  const T = str => RC.personalise(str, first, s.pronoun);
  const rand = rng(seedOf(full + "|" + s.ans.join("") + "|" + (s.date || "")));
  const pick = a => Array.isArray(a) ? a[Math.floor(rand() * a.length)] : a;

  const [k1, k2] = rep.R.order, S1 = RC.STYLES[k1], S2 = RC.STYLES[k2];
  const blend = rep.R.mixKey ? RC.BLENDS[rep.R.mixKey] : null;
  const style = {
    name: blend ? blend.name : S1.name,
    sub: blend ? blend.parts.map(k => RC.STYLES[k].short).join(" + ") : S1.tagline,
    accent: S1.accent, initial: (blend ? blend.name : S1.name).replace(/^The /, "").charAt(0)
  };

  const sections = RC.SECTIONS.map((sec, i) => {
    const v = rep.R.chak[i], lvl = v < 0.5 ? "support" : v < 0.75 ? "growing" : "strong";
    const qs = D.Q.map((q, qi) => q[0] === i ? qi : -1).filter(qi => qi >= 0);
    return {
      i, v, lvl, title: sec.title, accent: sec.accent, qs,
      label: RC.LEVELS[lvl], dots: 1 + Math.round(v * 4), intro: T(sec.intro),
      strongLine: sec.strongLine, growLine: sec.growLine,
      observed: qs.map(qi => T(RC.OBS[qi][s.ans[qi]])),
      means: T(pick(sec.means[lvl])), help: sec.help[lvl].map(T)
    };
  });
  const byLow = sections.slice().sort((a, b) => a.v - b.v || a.i - b.i);
  const low = byLow.slice(0, 2), best = byLow[byLow.length - 1];

  const strengths = [S1.strengths[0], blend ? S2.strengths[0] : S1.strengths[1],
    { t: best.strongLine, d: `${best.title} is one of ${first}'s strongest areas right now.` }];
  const growing = [...low.map(x => ({ t: x.growLine, d: x.intro })), S1.growing[0]];

  const mind = RC.MIND[rep.gKey];
  const summary = [
    T(blend ? firstSentence(pick(blend.blend)) : pick(S1.summary)),
    T(firstSentence(pick(mind.text))),
    T(pick([`Among the seven areas we explored, {Name} is strongest in ${best.title.toLowerCase()}.`,
            `{Name}'s clearest strength today lies in ${best.title.toLowerCase()}.`,
            `One quality in {Name} especially stood out to us: ${lc(best.strongLine)}.`])),
    T(pick([`With gentle support around ${low[0].title.toLowerCase()}, we are confident {Name} will grow in confidence and consistency, and we would love to walk alongside {them}.`,
            `The next chapter is about ${lc(low[0].growLine)}, and with the right support at home, {Name} is very well placed to flourish.`]))
  ].join(" ");

  const learns = {
    thinking: T(pick(S1.thinking)), habits: T(pick(S1.habits)), pressure: T(pick(S1.pressure)), motivation: T(pick(S1.motivation)),
    blend: blend ? T(pick(blend.blend)) : "",
    helps: (blend ? [...S1.helps.slice(0, 3), ...S2.helps.slice(0, 2)] : S1.helps).map(T),
    drains: (blend ? [...S1.drains.slice(0, 3), ...S2.drains.slice(0, 2)] : S1.drains).map(T)
  };

  const subjA = s.ans[D.SUBJECT_Q], tag = D.Q[D.SUBJECT_Q][2][subjA][5];
  const strongSubj = (blend ? [...S1.subjects.strong.slice(0, 2), ...S2.subjects.strong.slice(0, 2)] : S1.subjects.strong)
    .map(x => ({ n: x.n, tip: T(x.tip) }));
  const careSubj = [...(RC.SUBJ[tag] ? [RC.SUBJ[tag]] : []), ...S1.subjects.care.filter(c => !(RC.SUBJ[tag] && c.tag === tag))]
    .slice(0, 4).map(x => ({ n: x.n, tip: T(x.tip) }));
  const study = Object.fromEntries(Object.entries(S1.study).map(([k, v]) => [k, T(v)]));

  /* 21-day plan: the two lowest growth areas plus the learning style, one action each per week */
  const sources = [...low.map(x => RC.PLAN21.sections[x.i]), RC.PLAN21.styles[k1]];
  const plan = [0, 1, 2].map(w => ({
    days: ["Days 1–7", "Days 8–14", "Days 15–21"][w], first: w * 7 + 1,
    theme: ["Start small", "Build the rhythm", "Make it yours"][w],
    child: sources.map(src => T(src.child[w])),
    parent: sources.map(src => T(src.parent[w]))
  }));
  /* why: in each focus area, the answer that pointed most clearly to a need */
  const why = low.map(x => { const qi = x.qs.slice().sort((a, b) => D.Q[a][2][s.ans[a]][3] - D.Q[b][2][s.ans[b]][3])[0]; return T(RC.OBS[qi][s.ans[qi]]); });
  const checks = RC.CHECKS.filter(c => c.when(s.ans, low.map(x => x.i), k1, rep.gKey)).slice(0, 3).map(c => c.t);
  const after = sources.map(src => T(src.after));

  return { s, rep, first, full, T, style, mind, sections, low, best, strengths, growing, summary, learns,
    strongSubj, careSubj, study, plan, why, checks, after };
}

/* ---------- rendering ---------- */
const meter = (n, acc) => `<span class="meter5" style="--acc:${acc}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span>`;
const lvlChip = x => `<span class="lvl ${x.lvl}">${x.label}</span>`;
const list = (arr, acc) => `<ul class="dots" style="--acc:${acc || "var(--gold)"}">${arr.map(x => `<li>${x}</li>`).join("")}</ul>`;
const fmtDate = d => C.fmtDate(d);

function render() {
  const m = model(S), s = S, x = s.extra, T = m.T, first = esc(m.first);
  const interviewer = x.interviewer || CFG.defaultInterviewer || "";
  const clsLine = [s.cls, s.stream].filter(Boolean).map(esc).join(" · ");
  const org = esc(CFG.orgName || "Dhirise");

  const cover = `<section class="pg cover">
    <div class="top">${logoImg()}</div>
    <div class="mid">
      <p class="eyebrow">Confidential</p>
      <h1>Student Insight Report</h1>
      <div class="rule"></div>
      <div class="name">${esc(m.full)}</div>
      <dl class="meta">
        ${clsLine ? `<dt>Class / Stream</dt><dd>${clsLine}</dd>` : ""}
        <dt>Session date</dt><dd>${fmtDate(s.date)}</dd>
        ${interviewer ? `<dt>Interviewer</dt><dd>${esc(interviewer)}</dd>` : ""}
        ${x.parent ? `<dt>Prepared for</dt><dd>${esc(x.parent)}</dd>` : ""}
      </dl>
      <p class="prepared">Prepared by ${org}</p>
    </div>
    <p class="conf">${esc(T(RC.COVER_LINE).replace(m.first, m.full))}</p>
  </section>`;

  const letter = `<section class="pg letter">
    <div class="ph"><p class="eyebrow">A letter to you</p><h2>${x.parent ? `Dear ${esc(x.parent)},` : `Dear Parents of ${first},`}</h2></div>
    ${RC.LETTER.map(t => `<p class="lp">${esc(T(t))}</p>`).join("")}
    <div class="sig"><p>With warm regards,</p>${interviewer ? `<b>${esc(interviewer)}</b>` : ""}<span>${org}</span>${logoImg("sig-logo")}</div>
  </section>`;

  const glance = `<section class="pg">
    <div class="ph"><p class="eyebrow">At a glance</p><h2>${first}, in a few words</h2></div>
    <p class="summary">${esc(m.summary)}</p>
    <div class="grid2">
      <div class="card tint"><h4>Learning style</h4>
        <div class="badge" style="--acc:${m.style.accent}"><span class="seal">${m.style.initial}</span><div><b>${m.style.name}</b><span>${m.style.sub}</span></div></div></div>
      <div class="card tint"><h4>Present state of mind</h4>
        <div class="badge" style="--acc:${m.mind.accent}"><span class="seal">◐</span><div><b>${m.mind.name}</b><span>${esc(T(m.mind.care))}</span></div></div></div>
    </div>
    <div class="grid2">
      <div class="card"><h4>Top 3 strengths</h4>${list(m.strengths.map(z => `<b>${esc(T(z.t))}</b>: ${esc(T(z.d))}`), "#3f9e72")}</div>
      <div class="card"><h4>Top 3 growing areas</h4>${list(m.growing.map(z => `<b>${esc(T(z.t))}</b>: ${esc(T(z.d))}`), "#6f67cf")}</div>
    </div>
    <div class="card"><h4>Seven areas at a glance</h4><div class="ovr">
      ${m.sections.map(z => `<div class="ovr-row" style="--acc:${z.accent}"><span class="lbl"><i></i>${z.title}</span>
        <span class="track"><i style="width:${Math.max(10, Math.round(z.v * 100))}%"></i></span>${lvlChip(z)}${meter(z.dots, z.accent)}</div>`).join("")}
    </div></div>
  </section>`;

  const learns = `<section class="pg">
    <div class="ph"><p class="eyebrow">Learning profile</p><h2>How ${first} learns</h2><p>${m.style.name} · ${m.style.sub}</p></div>
    ${m.learns.blend ? `<p class="lead">${esc(m.learns.blend)}</p>` : ""}
    <div class="grid2">
      <div class="card"><h3>Thinking style</h3><p>${esc(m.learns.thinking)}</p></div>
      <div class="card"><h3>Study habits</h3><p>${esc(m.learns.habits)}</p></div>
      <div class="card"><h3>Handling pressure</h3><p>${esc(m.learns.pressure)}</p></div>
      <div class="card"><h3>What motivates ${first}</h3><p>${esc(m.learns.motivation)}</p></div>
    </div>
    <div class="grid2">
      <div class="card tint"><h3>What helps ${first}</h3>${list(m.learns.helps.map(esc), "#3f9e72")}</div>
      <div class="card tint"><h3>What drains ${first}</h3>${list(m.learns.drains.map(esc), "#c0605a")}</div>
    </div>
    <div class="card"><h3>${first}'s present state of mind: ${m.mind.name}</h3><p>${esc(T(m.mind.text[0]))}</p><p style="color:var(--muted)">${esc(RC.MIND_NOTE)}</p></div>
  </section>`;

  const secs = `<section class="pg">
    <div class="ph"><p class="eyebrow">Seven areas</p><h2>${first} across seven areas of life</h2>
      <p>Each area shows a level (Strong, Growing or Needs support), what ${first}'s own answers showed us, what it means and how you can help at home.</p></div>
    ${m.sections.map(z => `<article class="sec" style="--acc:${z.accent}">
      <div class="sec-head"><div><div class="t"><span class="n">${z.i + 1}</span><h3>${z.title}</h3></div><p class="intro">${esc(z.intro)}</p></div>
        <div class="lv">${lvlChip(z)}${meter(z.dots, z.accent)}</div></div>
      <h4>What we observed</h4><p class="obs">${esc(z.observed.join(" "))}</p>
      <div class="cols"><div><h4>What it means</h4><p>${esc(z.means)}</p></div>
        <div><h4>How parents can help</h4>${list(z.help.map(esc), z.accent)}</div></div>
    </article>`).join("")}
  </section>`;

  const LBL = { time: "Best study time", session: "Session length", revision: "Revision method", notes: "Note-taking style", exam: "Exam approach" };
  const blueprint = `<section class="pg">
    <div class="ph"><p class="eyebrow">Study blueprint</p><h2>How ${first} studies best</h2><p>Built around ${first}'s learning style: ${m.style.name}.</p></div>
    <div class="grid2">${Object.keys(LBL).map(k => `<div class="card tile"><h4>${LBL[k]}</h4><p>${esc(m.study[k])}</p></div>`).join("")}
      <div class="card tile tint"><h4>A tip for home</h4><p>${esc(T("Ask {Name} to teach you one thing {they} studied today. Explaining it aloud is one of the best ways to make learning stick."))}</p></div></div>
    <div class="grid2">
      <div class="card"><h3>Subjects that come naturally</h3>${list(m.strongSubj.map(z => `<b>${esc(z.n)}</b>: ${esc(z.tip)}`), "#3f9e72")}</div>
      <div class="card"><h3>Subjects needing extra care</h3>${list(m.careSubj.map(z => `<b>${esc(z.n)}</b>: ${esc(z.tip)}`), "#d9822b")}
        <p style="color:var(--muted);font-size:12.5px">“Extra care” means a different approach, not a lack of ability.</p></div>
    </div>
  </section>`;

  const focus = `${m.low[0].title.toLowerCase()}, ${m.low[1].title.toLowerCase()} and ${first}'s learning style`;
  const ticks = (startDay, items) => `<table class="ticks"><thead><tr><th>Daily check</th>${[0, 1, 2, 3, 4, 5, 6].map(d => `<th>Day ${startDay + d}</th>`).join("")}</tr></thead>
    <tbody>${items.map(t => `<tr><td>${esc(t)}</td>${"<td><i></i></td>".repeat(7)}</tr>`).join("")}</tbody></table>`;
  const planChild = `<section class="pg">
    <div class="ph"><p class="eyebrow">21-day action plan</p><h2>For ${first}</h2>
      <p>Three small actions each week, focused on ${focus}. Tick each one off; small steps done daily make the biggest difference.</p></div>
    <div class="card tint why"><h4>Why these steps</h4><p>${esc(m.why.join(" "))}</p></div>
    ${m.plan.map(w => `<div class="card week"><h3><span>${w.days}</span>${w.theme}</h3>
      <ul class="todo">${w.child.map(t => `<li>${esc(t)}</li>`).join("")}</ul>${ticks(w.first, m.checks)}</div>`).join("")}
  </section>`;
  const planParent = `<section class="pg">
    <div class="ph"><p class="eyebrow">21-day action plan</p><h2>For parents</h2>
      <p>Warm, practical ways to walk alongside ${first} through the same three weeks.</p></div>
    ${m.plan.map(w => `<div class="card week"><h3><span>${w.days}</span>${w.theme}</h3>
      <ul class="todo">${w.parent.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`).join("")}
    <div class="card tint after"><h3>After 21 days</h3><p>What to look for:</p>${list(m.after.map(esc), "#3f9e72")}<p>${esc(T(RC.AFTER_CLOSE))}</p></div>
  </section>`;

  const note = x.note && x.note.trim() ? `<section class="pg">
    <div class="ph"><p class="eyebrow">A personal note</p><h2>Interviewer's note</h2></div>
    <div class="card tint"><p class="note">${esc(x.note.trim())}</p><p class="sign">${esc(interviewer || org)} · ${fmtDate(s.date)}</p></div>
  </section>` : "";

  const contact = [CFG.phone, CFG.email, CFG.website, CFG.address].filter(Boolean).map(esc);
  const about = `<section class="pg about">
    <div class="ph"><p class="eyebrow">Please read</p><h2>About this report</h2></div>
    <div class="card"><p>${esc(RC.ABOUT)}</p></div>
    <p class="conf-line">Confidential: prepared for the family of ${esc(m.full)}.</p>
    ${contact.length ? `<p class="contact-line">${org} · ${contact.join(" · ")}</p>` : ""}
  </section>`;

  $("#doc").innerHTML = cover + letter + glance + learns + secs + blueprint + planChild + planParent + note + about;
  document.title = `Student Insight Report · ${m.full}`;
  setPrintFooter(m.full);
  return m;
}

/* print fallback: Chrome page-margin boxes give the same footer as the PDF */
function setPrintFooter(name) {
  let st = document.getElementById("printFooter");
  if (!st) { st = document.createElement("style"); st.id = "printFooter"; document.head.appendChild(st); }
  const q = String(name).replace(/["\\]/g, "");
  st.textContent = `@page{@bottom-left{content:"Student Insight Report · ${q}";font:9pt "Mukta",sans-serif;color:#8c89a3}
    @bottom-right{content:"Page " counter(page) " of " counter(pages);font:9pt "Mukta",sans-serif;color:#8c89a3}}`;
}

/* ---------- PDF ---------- */
const safe = s => String(s || "Student").trim().replace(/\s+/g, "_").replace(/[^\p{L}\p{N}_-]/gu, "");
const isoDate = d => { const t = new Date(d || Date.now()); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
function waitImages(root) {
  return Promise.all([...root.querySelectorAll("img")].map(img => img.complete && img.naturalWidth ? 0 :
    new Promise(r => { img.addEventListener("load", r, { once: true }); img.addEventListener("error", r, { once: true }); setTimeout(r, 3000); })));
}
async function downloadPDF() {
  if (!window.html2pdf) { status("PDF library missing (js/vendor/html2pdf.bundle.min.js)."); return; }
  const btn = $("#pdfBtn"); btn.disabled = true; status("Preparing PDF…");
  const m = render(), doc = $("#doc");
  doc.classList.add("exporting");
  if (window.DHI_LOGO_DATA) doc.querySelectorAll("img.logo").forEach(i => { i.onerror = null; i.src = window.DHI_LOGO_DATA; });
  try {
    await document.fonts.ready; await waitImages(doc);
    /* A4 with 12mm sides, 12mm top, 16mm bottom (room for the footer): 186 × 269 mm of content */
    C.paginate(doc, C.pdfPageHeight(186, 269, 2), ".pg + .pg",
      ".card, .sec, .ovr-row, .summary, .lp, .sig, .conf-line, .contact-line", ".ph");
    const name = m.full, file = `Dhirise_Report_${safe(name)}_${isoDate(S.date)}.pdf`;
    await html2pdf().set({
      margin: [12, 12, 16, 12], filename: file,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    }).from(doc).toPdf().get("pdf").then(pdf => {
      const n = pdf.internal.getNumberOfPages(), W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
      for (let i = 1; i <= n; i++) {
        pdf.setPage(i);
        pdf.setDrawColor(231, 226, 215); pdf.setLineWidth(0.25); pdf.line(12, H - 11.5, W - 12, H - 11.5);
        if (window.DHI_LOGO_DATA) { try { pdf.addImage(window.DHI_LOGO_DATA, "PNG", 12, H - 9.6, 5, 5); } catch (e) {} }
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(120, 116, 146);
        pdf.text(`Student Insight Report \u00b7 ${name}`, 19, H - 6);
        pdf.text(`Page ${i} of ${n}`, W - 12, H - 6, { align: "right" });
      }
    }).save();
    status(`Saved ${file}`);
  } catch (e) {
    console.error(e); status("Could not create the PDF. Try Print instead.");
  } finally {
    doc.classList.remove("exporting"); btn.disabled = false; render();
  }
}
function status(t) { $("#tbStatus").textContent = t; }

/* ---------- toolbar ---------- */
let S = null;
function initToolbar() {
  const opts = (list, v) => `<option value="">—</option>` + list.map(x => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("");
  $("#fClass").innerHTML = opts(D.CLASSES, S.cls);
  $("#fStream").innerHTML = opts(D.STREAMS, S.stream);
  $("#fPronoun").value = S.pronoun || "they";
  $("#fInterviewer").value = S.extra.interviewer || CFG.defaultInterviewer || "";
  $("#fParent").value = S.extra.parent || "";
  $("#fNote").value = S.extra.note || "";
  let t = null;
  const update = () => {
    S.cls = $("#fClass").value; S.stream = $("#fStream").value; S.pronoun = $("#fPronoun").value;
    Object.assign(S.extra, { interviewer: $("#fInterviewer").value.trim(), parent: $("#fParent").value.trim(), note: $("#fNote").value });
    clearTimeout(t); t = setTimeout(() => { render(); persist(S); }, 250);
  };
  ["#fClass", "#fStream", "#fPronoun"].forEach(id => $(id).addEventListener("change", update));
  ["#fInterviewer", "#fParent", "#fNote"].forEach(id => $(id).addEventListener("input", update));
  $("#pdfBtn").onclick = downloadPDF;
  $("#printBtn").onclick = () => { render(); window.print(); };
  if (!CFG.phone && !CFG.email && !CFG.website) {
    const w = $("#tbWarn"); w.hidden = false; w.textContent = "No contact details yet: the small contact line on the last page is hidden. Add them in js/config.js.";
  }
}

S = loadSession();
if (!S) {
  $("#doc").innerHTML = `<p class="empty">No completed session found. Open a parent report from the end of a session, or from <b>Reports</b> in the host menu.</p>`;
  document.querySelectorAll("#toolbar input,#toolbar select,#toolbar textarea,#toolbar button").forEach(el => el.disabled = true);
} else {
  initToolbar(); render();
  if (new URLSearchParams(location.search).get("download") === "1") setTimeout(downloadPDF, 400);
}
window.DHIparent = { model: () => S && model(S), download: downloadPDF };
})();
