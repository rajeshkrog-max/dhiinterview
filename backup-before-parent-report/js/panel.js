/* Dhirise · Interviewer panel — a private window that mirrors the student screen.
   Receives state by postMessage (from the window that opened it), BroadcastChannel and localStorage events,
   so it keeps working on file:// and on localhost. */
(function () {
"use strict";
const C = window.DHIcore, DATA = window.DHI;
const { CH, Q, DOSHA, GUNA, SLIDES, TALK, FLAGS } = DATA;
const { esc } = C;
const $ = s => document.querySelector(s);

let state = null, lastT = 0, lastMsgAt = 0, rep = null;

/* ---------- receiving ---------- */
function accept(m) {
  if (!m || m.type !== "dhi-state" || !m.S || !Array.isArray(m.S.ans) || m.S.ans.length !== Q.length) return;
  if (m.t <= lastT) return;
  lastT = m.t; lastMsgAt = Date.now(); state = m.S;
  render(); status();
}
window.addEventListener("message", e => { if (e.source && e.source === window.opener) accept(e.data); });
try { new BroadcastChannel(C.CHANNEL).onmessage = e => accept(e.data); } catch (e) {}
window.addEventListener("storage", e => { if (e.key === C.LIVE_KEY && e.newValue) { try { accept(JSON.parse(e.newValue)); } catch (err) {} } });

function hello() { try { if (window.opener && !window.opener.closed) window.opener.postMessage({ type: "dhi-hello" }, "*"); } catch (e) {} }
function openerAlive() { try { return !!(window.opener && !window.opener.closed); } catch (e) { return false; } }
function status() {
  const el = $("#live"), on = openerAlive() || Date.now() - lastMsgAt < 15000;
  el.classList.toggle("on", !!state && on);
  el.querySelector("span").textContent = !state ? "Waiting for main screen" : on ? "Live" : "Main window closed";
}
setInterval(() => { status(); if (Date.now() - lastMsgAt > 5000) hello(); }, 2500);

/* ---------- helpers ---------- */
const DN = { v: "Vata", p: "Pitta", k: "Kapha" };
function pointsTo(o) {
  const w = C.parseD(o[1]);
  const d = ["v", "p", "k"].filter(k => w[k]).map(k => `<span class="tag" style="--c:${DOSHA[k].hex}">${DN[k]} +${w[k]}</span>`).join("") || `<span class="tag">No dosha</span>`;
  return { d, g: `<span class="tag" style="--c:${GUNA[o[2]].hex}">${GUNA[o[2]].n}</span>`, bal: o[3] };
}
function fill(s) {
  return s.replace(/\{name\}/g, esc(rep.first)).replace(/\{type\}/g, rep.typeName).replace(/\{share\}/g, rep.share)
    .replace(/\{low\}/g, rep.low.n).replace(/\{high\}/g, rep.high.n).replace(/\{guna\}/g, rep.guna.n);
}

/* ---------- render ---------- */
function render() {
  if (!state) {
    $("#now").innerHTML = `<h3>Now</h3><p class="none">Open the student screen and press <b>I</b> (or use the host menu) to connect.</p>`;
    ["#flags", "#snap", "#talk", "#answers", "#follow"].forEach(s => $(s).innerHTML = "");
    return;
  }
  const S = state;
  rep = C.build(S.ans, { name: S.name, cls: S.cls, stream: S.stream, date: S.date }, C.loadStore());
  const curChakra = (S.phase === "q" || S.phase === "chakra") ? Q[S.i][0] : -1;

  $("#who").innerHTML = S.name.trim()
    ? `<b>${esc(C.capName(S.name))}</b><span>${[S.cls, S.stream, C.fmtDate(S.date || Date.now())].filter(Boolean).map(esc).join(" · ")}</span>`
    : `<b class="none">No student yet</b>`;

  /* now */
  let now = "";
  if (S.phase === "welcome") now = `<h3>Now · Welcome screen</h3><p class="muted">The student is entering their details.</p>`;
  else if (S.phase === "chakra") {
    const c = CH[Q[S.i][0]];
    now = `<h3>Now · Chakra intro <span>${Q[S.i][0] + 1} of 7</span></h3><p class="q" style="color:${c.hex}">${c.n}: ${c.line}</p><p class="muted">${c.about}</p><p class="muted">Next: question ${S.i + 1}.</p>`;
  } else if (S.phase === "q") {
    const [ci, text, opts] = Q[S.i], c = CH[ci], a = S.ans[S.i];
    let ans = `<p class="none">Waiting for an answer…</p>`;
    if (a != null) { const pt = pointsTo(opts[a]); ans = `<div class="ans" style="--c:${c.hex}"><b>${a + 1}.</b> ${esc(opts[a][0])}</div><div class="tags">${pt.d}${pt.g}<span class="tag">Balance ${pt.bal}/3</span></div>`; }
    now = `<h3>Now · Question ${S.i + 1} of ${Q.length} <span style="color:${c.hex}">${c.n}</span></h3><p class="q">${esc(text)}</p>${ans}`;
  } else if (S.phase === "reading") now = `<h3>Now</h3><p class="q">Reading the pattern…</p><p class="muted">The report opens in a moment.</p>`;
  else if (S.phase === "report") {
    const k = S.slide;
    now = `<h3>Now · Report slide ${k + 1} of ${SLIDES.length}</h3><p class="q">${SLIDES[k].t}</p><ul style="margin:0;padding-left:18px">${TALK[k].map(t => `<li>${fill(t)}</li>`).join("")}</ul>`;
  }
  $("#now").innerHTML = now;

  /* flags */
  $("#flags").innerHTML = `<h3>Flags <span>${rep.flags.length}</span></h3>` + (rep.flags.length
    ? rep.flags.map(f => `<div class="flag"><b>${f.t}</b><small>${f.why}</small><q>${f.say}</q></div>`).join("")
    : `<p class="none">No flags${rep.complete ? "" : " so far"}. Watch for: ${Object.values(FLAGS).map(f => f.t.toLowerCase()).join(", ")}.</p>`);

  /* snapshot */
  const dp = rep.R.dp, gp = rep.R.gp;
  $("#snap").innerHTML = `<h3>Results <span>${rep.answered}/${Q.length} answered${rep.complete ? "" : " · provisional"}</span></h3>` + (rep.answered
    ? `<div class="snap">
        <div><small>Prakriti</small><b>${rep.typeName}</b><span>Vata ${dp.v}% · Pitta ${dp.p}% · Kapha ${dp.k}%</span></div>
        <div><small>Manas</small><b>Mostly ${rep.guna.n}</b><span>Sattva ${gp.s}% · Rajas ${gp.r}% · Tamas ${gp.t}%</span></div>
        <div><small>Strongest centre</small><b style="color:${rep.high.hex}">${rep.high.n}</b><span>${rep.high.pct}% · ${rep.high.m}</span></div>
        <div><small>Needs care</small><b style="color:${rep.low.hex}">${rep.low.n}</b><span>${rep.low.pct}% · ${rep.low.m}</span></div>
        <div><small>Type share</small><b>${rep.share}%</b><span>of students are ${rep.typeName}</span></div>
        <div><small>Chakras</small><span>${rep.chakras.map(c => `<span style="color:${c.hex}">${c.n.slice(0, 4)}</span> ${rep.R.chakN[c.i] ? c.pct + "%" : "–"}`).join(" · ")}</span></div>
      </div>`
    : `<p class="none">Results appear as answers come in.</p>`);

  /* talking points per slide */
  const curSlide = S.phase === "report" ? S.slide : -1;
  $("#talk").innerHTML = `<h3>Talking points per report slide</h3>` + SLIDES.map((s, i) =>
    `<div class="talk ${i === curSlide ? "cur" : ""}"><b>${i + 1}. ${s.t}</b><ul>${TALK[i].map(t => `<li>${fill(t)}</li>`).join("")}</ul></div>`).join("");

  /* answers table */
  $("#answers").innerHTML = `<h3>All answers <span>${rep.answered}/${Q.length}</span></h3>
    <table class="atab"><thead><tr><th>#</th><th>Question · answer</th><th>Dosha</th><th>Guna</th><th>Bal.</th></tr></thead><tbody>
    ${Q.map(([ci, text, opts], i) => {
      const a = S.ans[i], c = CH[ci], cur = S.phase === "q" && S.i === i;
      if (a == null) return `<tr class="${cur ? "cur" : ""}"><td class="qn" style="color:${c.hex}">${i + 1}</td><td><span class="qq">${esc(text)}</span><span class="none">—</span></td><td></td><td></td><td></td></tr>`;
      const pt = pointsTo(opts[a]);
      return `<tr class="${cur ? "cur" : ""}"><td class="qn" style="color:${c.hex}">${i + 1}</td><td><span class="qq">${esc(text)}</span>${a + 1}. ${esc(opts[a][0])}</td><td><div class="tags">${pt.d}</div></td><td>${pt.g}</td><td class="tn">${pt.bal}/3</td></tr>`;
    }).join("")}</tbody></table>`;

  /* follow-ups per chakra */
  $("#follow").innerHTML = `<h3>Follow-up questions per chakra</h3>` + rep.chakras.map(c => {
    const asked = rep.R.chakN[c.i] > 0;
    const tag = !asked ? "" : c === rep.low ? "Needs care" : c === rep.high ? "Strongest" : `${c.pct}%`;
    return `<div class="fu ${c.i === curChakra || (asked && c === rep.low) ? "hi" : ""}" style="--c:${c.hex}"><b>${c.n} · ${c.m}<em>${tag}${c.i === curChakra ? " · now" : ""}</em></b><ul>${c.follow.map(f => `<li>${f}</li>`).join("")}</ul></div>`;
  }).join("");

  $("#printSheet").innerHTML = C.summarySheetHTML(rep);
}

/* ---------- actions ---------- */
function ready() {
  if (!state || !rep || !rep.answered) { alert("No answers yet. Run the assessment on the student screen first."); return false; }
  return rep.complete || confirm(`Only ${rep.answered} of ${Q.length} questions are answered, so results are provisional. Continue?`);
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
  const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
  ta.remove(); return ok;
}
$("#copyBtn").onclick = async () => {
  if (!ready()) return;
  const b = $("#copyBtn"), ok = await copyText(C.summaryText(rep));
  b.textContent = ok ? "Copied ✓" : "Copy failed"; setTimeout(() => b.textContent = "Copy summary", 2000);
};
$("#pdfBtn").onclick = () => {
  if (!ready()) return;
  $("#printSheet").innerHTML = C.summarySheetHTML(rep);
  const t = document.title; document.title = `Dhirise Mind Mirror - ${rep.name} - ${new Date(rep.date).toISOString().slice(0, 10)}`;
  window.print();
  document.title = t;
};

/* ---------- start ---------- */
try { accept(JSON.parse(localStorage.getItem(C.LIVE_KEY))); } catch (e) {}
render(); hello(); status();
})();
