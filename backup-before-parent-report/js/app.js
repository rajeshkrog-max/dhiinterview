/* Dhirise · Manas Darpan — state, rendering and scoring.
   The core (scoring, report builder, charts, storage) is shared with the interviewer panel through window.DHIcore.
   The student-screen UI below it only boots when the page has #app. Plain script: works from file:// and localhost. */
(function () {
"use strict";
const DATA = window.DHI;
const { BRAND, CH, Q, SUBJECT_Q, DOSHA, MIX, TYPE_SEED, GUNA, SUBJ, FLAGS, SLIDES } = DATA;

/* =========================================================== core */

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseD = s => { const o = { v: 0, p: 0, k: 0 }; (s.match(/[vpk]\d/g) || []).forEach(x => o[x[0]] += +x[1]); return o; };
const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* "raj das" → "Raj Das"; keeps deliberate mixed case like "McKenzie" */
function capName(s) {
  return String(s || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean).map(w =>
    (w === w.toLowerCase() || w === w.toUpperCase())
      ? w.toLowerCase().replace(/(^|[-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
      : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(" ");
}
const firstName = n => String(n || "").split(" ")[0];
const fmtDate = d => { try { return new Date(d || Date.now()).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return ""; } };

/* ---------- local storage: per-question counts + completed sessions ---------- */
const KEY = "dhirise.manasDarpan.v2", OLD_KEY = "manasDarpan.v1", LIVE_KEY = "dhirise.live", CHANNEL = "dhirise-live";
const blankCounts = () => Q.map(q => q[2].map(() => 0));
function loadStore() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.counts) && Array.isArray(s.sessions)) return s; } catch (e) {}
  const s = { counts: blankCounts(), sessions: [] };
  try { const o = JSON.parse(localStorage.getItem(OLD_KEY)); if (o && o.counts && o.counts.length === Q.length) s.counts = o.counts; } catch (e) {}
  return s;
}
function saveStore(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

/* "% of students": indicative seeds (worth ~40 students) blended with real local answers */
function pcts(store, qi, pick, alreadyCounted) {
  const base = Q[qi][2].map((o, i) => o[4] * 0.4 + ((store.counts[qi] || [])[i] || 0) + (i === pick && !alreadyCounted ? 1 : 0));
  const t = base.reduce((a, b) => a + b, 0);
  const r = base.map(b => Math.round(b / t * 100));
  r[r.indexOf(Math.max(...r))] += 100 - r.reduce((a, b) => a + b, 0);
  return r;
}
function typeShare(store, key) {
  const seedN = 40; let n = 0, mine = 0;
  (store.sessions || []).forEach(s => { if (s.results && s.results.typeKey) { n++; if (s.results.typeKey === key) mine++; } });
  return Math.round(((TYPE_SEED[key] || 0) / 100 * seedN + mine) / (seedN + n) * 100);
}

/* ---------- scoring ---------- */
function pct3(o, keys) {
  const t = keys.reduce((a, k) => a + o[k], 0);
  const r = {}; keys.forEach(k => r[k] = t ? Math.round(o[k] / t * 100) : 0);
  if (t) { const top = keys.slice().sort((a, b) => o[b] - o[a])[0]; r[top] += 100 - keys.reduce((a, k) => a + r[k], 0); }
  return r;
}
function score(ans) {
  const d = { v: 0, p: 0, k: 0 }, g = { s: 0, r: 0, t: 0 }, cb = CH.map(() => ({ s: 0, n: 0 }));
  let answered = 0;
  ans.forEach((a, qi) => {
    if (a == null) return;
    answered++;
    const o = Q[qi][2][a], w = parseD(o[1]);
    for (const k in w) d[k] += w[k];
    g[o[2]]++; cb[Q[qi][0]].s += o[3]; cb[Q[qi][0]].n++;
  });
  const dp = pct3(d, ["v", "p", "k"]), gp = pct3(g, ["s", "r", "t"]);
  const order = ["v", "p", "k"].sort((a, b) => dp[b] - dp[a] || d[b] - d[a]);
  const tri = answered > 0 && dp[order[0]] - dp[order[2]] <= 8;
  const dual = !tri && dp[order[0]] - dp[order[1]] <= 8;
  const mixKey = tri ? "vpk" : dual ? ["v", "p", "k"].filter(k => k === order[0] || k === order[1]).join("") : null;
  const gOrder = ["s", "r", "t"].sort((a, b) => gp[b] - gp[a]);
  return { d, dp, g, gp, order, gOrder, mixKey, typeKey: mixKey || order[0], answered,
           chak: cb.map(x => x.n ? x.s / (x.n * 3) : 0), chakN: cb.map(x => x.n) };
}

/* ---------- the full report, used by every view (slides, summary, panel, copy, CSV) ---------- */
function build(ans, meta, store) {
  meta = meta || {};
  const R = score(ans);
  const P = DOSHA[R.order[0]], P2 = DOSHA[R.order[1]], M = R.mixKey ? MIX[R.mixKey] : null;
  const typeName = M ? M.n : P.n;
  const strengths = M ? [...P.strengths.slice(0, 3), ...P2.strengths.slice(0, 2)] : P.strengths.slice();
  const struggles = M ? [...P.struggles.slice(0, 3), P2.struggles[0]] : P.struggles.slice();

  /* subjects: keep the original logic of Q15 (heaviest class) + the dosha */
  const subjA = ans[SUBJECT_Q], tag = subjA != null ? Q[SUBJECT_Q][2][subjA][5] : null;
  const strongSubj = M ? [...P.subjects.strong.slice(0, 2), ...P2.subjects.strong.slice(0, 2)] : P.subjects.strong.slice();
  const care = [...(SUBJ[tag] ? [SUBJ[tag]] : []), ...P.subjects.care.filter(c => !(SUBJ[tag] && c.tag === tag))].slice(0, 4);

  const chakras = CH.map((c, i) => {
    const v = R.chak[i], band = v < 0.5 ? "low" : v < 0.75 ? "mid" : "high";
    return Object.assign({}, c, { i, v, pct: Math.round(v * 100), band, bandLabel: { low: "Needs care", mid: "Growing", high: "Strong" }[band], text: c.band[band] });
  });
  const asked = chakras.filter(c => R.chakN[c.i] > 0);   // mid-session, rank only chakras already asked
  const sorted = (asked.length ? asked : chakras).slice().sort((a, b) => a.v - b.v);
  const low = sorted[0], high = sorted[sorted.length - 1];
  const weeks = [0, 1, 2].map(w => [...P.plan[w].map(t => ({ t, src: P.n })), { t: low.plan[w], src: low.n }]);

  const flags = [];
  const flag = k => flags.push(Object.assign({ key: k }, FLAGS[k], { say: FLAGS[k].say.replace("{strength}", strengths[0].t) }));
  if (ans[10] === 2) flag("feelings");
  if (ans[13] === 2) flag("career");
  if (R.g.t >= 6) flag("tamas");
  if (ans[17] === 0) flag("expect");
  if (ans[17] === 1) flag("fear");

  const name = capName(meta.name) || "Student";
  return {
    R, ans, name, first: firstName(name), cls: meta.cls || "", stream: meta.stream || "", date: meta.date || new Date().toISOString(),
    P, P2, M, typeName, typeKey: R.typeKey, mixText: M ? M.mix : P.mine,
    share: store ? typeShare(store, R.typeKey) : null,
    strengths, struggles, study: P.study, studyNote: M ? M.studyNote : "",
    daily: P.daily, dailyNote: M ? M.dailyNote : "",
    strongSubj, care, chakras, low, high, weeks, flags,
    focus: [struggles[0].t, struggles[1].t, `${low.n}: ${low.m.toLowerCase()}`],
    guna: GUNA[R.gOrder[0]], gKey: R.gOrder[0],
    answered: R.answered, complete: R.answered === Q.length
  };
}

/* ---------- visuals (inline SVG, theme-aware via CSS variables) ---------- */
function donutSVG(dp, label, sub) {
  const r = 62, C = 2 * Math.PI * r; let off = 0;
  const arcs = ["v", "p", "k"].map(k => {
    const len = dp[k] / 100 * C;
    const s = len > 0 ? `<circle cx="85" cy="85" r="${r}" fill="none" stroke="${DOSHA[k].hex}" stroke-width="22" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 85 85)"/>` : "";
    off += len; return s;
  }).join("");
  const fs = label.length > 9 ? 15 : label.length > 6 ? 19 : 22;
  return `<svg viewBox="0 0 170 170" role="img" aria-label="Prakriti: Vata ${dp.v}%, Pitta ${dp.p}%, Kapha ${dp.k}%">
    <circle cx="85" cy="85" r="${r}" fill="none" style="stroke:var(--night-2)" stroke-width="22"/><g class="donut-g">${arcs}</g>
    <text x="85" y="${sub ? 84 : 92}" text-anchor="middle" font-size="${fs}" style="font-family:var(--f-display);fill:var(--ink)">${esc(label)}</text>
    ${sub ? `<text x="85" y="105" text-anchor="middle" font-size="13" style="font-family:var(--f-body);fill:var(--muted)">${esc(sub)}</text>` : ""}</svg>`;
}
function radarSVG(vals) {
  const cx = 200, cy = 175, R = 118, N = 7, pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const rings = [.25, .5, .75, 1].map(f => `<polygon points="${CH.map((_, i) => pt(i, R * f).join(",")).join(" ")}" fill="none" style="stroke:var(--line)" stroke-width="1"/>`).join("");
  const spokes = CH.map((_, i) => { const [x, y] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" style="stroke:var(--line)"/>`; }).join("");
  const v = vals.map(x => Math.max(.1, x));
  const poly = `<polygon class="rpoly" points="${v.map((x, i) => pt(i, R * x).join(",")).join(" ")}" style="fill:var(--gold);fill-opacity:.2;stroke:var(--gold)" stroke-width="2.5"/>`;
  const dots = v.map((x, i) => { const [a, b] = pt(i, R * x); return `<circle cx="${a}" cy="${b}" r="7" fill="${CH[i].hex}" style="stroke:var(--night)" stroke-width="2"/>`; }).join("");
  const labels = CH.map((c, i) => {
    const [x, y] = pt(i, R + 30), anc = Math.abs(x - cx) < 10 ? "middle" : x > cx ? "start" : "end";
    return `<text x="${x}" y="${y - 6}" text-anchor="${anc}" font-size="15" style="font-family:var(--f-body);fill:var(--muted)">${c.n}</text>
            <text x="${x}" y="${y + 12}" text-anchor="${anc}" font-size="15" font-weight="700" fill="${c.hex}">${Math.round(vals[i] * 100)}%</text>`;
  }).join("");
  return `<svg viewBox="-55 0 510 360" role="img" aria-label="Chakra balance: ${CH.map((c, i) => `${c.n} ${Math.round(vals[i] * 100)}%`).join(", ")}">${rings}${spokes}${poly}${dots}${labels}</svg>`;
}
function gunaBars(gp) {
  return `<div class="bars">${["s", "r", "t"].map(k => `<div class="bar" style="--c:${GUNA[k].hex}"><span>${GUNA[k].n}<small>${GUNA[k].m}</small></span><span class="tr"><i style="width:${gp[k]}%;--w:${gp[k]}%"></i></span><b class="tn">${gp[k]}%</b></div>`).join("")}</div>`;
}
function mandalaSVG(cls) {
  const petals = CH.map((c, i) => `<g transform="rotate(${i / 7 * 360} 100 100)"><ellipse cx="100" cy="44" rx="16" ry="34" fill="${c.hex}" opacity=".85"/></g>`).join("");
  const beads = Array.from({ length: 28 }, (_, i) => `<circle cx="${(100 + 92 * Math.cos(i / 28 * 6.283)).toFixed(1)}" cy="${(100 + 92 * Math.sin(i / 28 * 6.283)).toFixed(1)}" r="1.6" style="fill:var(--gold)"/>`).join("");
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><g class="${cls || ""}">${petals}<circle cx="100" cy="100" r="88" fill="none" style="stroke:var(--line)"/>${beads}</g>
    <circle cx="100" cy="100" r="34" style="fill:var(--night);stroke:var(--gold)" stroke-width="1.5"/><text x="100" y="112" text-anchor="middle" font-size="34" style="font-family:var(--f-skt);fill:var(--gold)">ॐ</text></svg>`;
}
function chakraSymbol(c) {
  const n = c.petals, rot0 = n === 2 ? 90 : 0;
  const rx = n === 2 ? 24 : n > 12 ? 8 : n > 6 ? 10.5 : 15, ry = n === 2 ? 22 : 26;
  const petals = Array.from({ length: n }, (_, i) => `<ellipse cx="100" cy="${n === 2 ? 34 : 40}" rx="${rx}" ry="${ry}" transform="rotate(${rot0 + i * 360 / n} 100 100)"/>`).join("");
  return `<svg viewBox="0 0 200 200" aria-hidden="true">
    <g class="petals" fill="${c.hex}" fill-opacity=".28" stroke="${c.hex}" stroke-width="1.6">${petals}</g>
    <circle cx="100" cy="100" r="50" style="fill:var(--night)" stroke="${c.hex}" stroke-width="2.5"/>
    <g class="core"><circle cx="100" cy="100" r="42" fill="${c.hex}" fill-opacity=".16"/>
    <text x="100" y="114" text-anchor="middle" font-size="40" fill="${c.hex}" style="font-family:var(--f-skt)">${c.bija}</text></g></svg>`;
}

/* ---------- summary: A4 sheet, copyable text, CSV ---------- */
function brandHTML() {
  return `<div class="brand"><img src="assets/dhirise-logo.svg" alt=""><div class="wm"><b>${BRAND.name}</b><small>${BRAND.product} · <span class="skt">${BRAND.productSkt}</span></small></div></div>`;
}
function metaLine(rep) { return [fmtDate(rep.date), rep.cls, rep.stream].filter(Boolean).map(esc).join(" · "); }
function summarySheetHTML(rep) {
  const dp = rep.R.dp;
  return `<div class="sheet">
    <div class="sheet-head">
      <div class="who"><p class="eyebrow">Mind Mirror · Summary</p><h2>${esc(rep.name)}</h2><p>${metaLine(rep)}</p></div>
      ${brandHTML()}
    </div>
    <div class="grid">
      <div class="card" style="--c:${rep.P.hex}"><h3>Prakriti · natural constitution</h3>
        <div class="mini">${donutSVG(dp, rep.M ? rep.typeName.split(" ")[0] : rep.P.n, `${dp[rep.R.order[0]]}%`)}
        <div><p class="lead">${rep.typeName}</p><p>Vata ${dp.v}% · Pitta ${dp.p}% · Kapha ${dp.k}%</p><p>${rep.P.lead}</p></div></div></div>
      <div class="card"><h3>Manas · state of mind today</h3>${gunaBars(rep.R.gp)}
        <p>Mostly <b>${rep.guna.n}</b>: ${rep.guna.m.toLowerCase()}. Strongest centre: <b>${rep.high.n}</b> · needs care: <b>${rep.low.n}</b>.</p></div>
      <div class="card"><h3>Top 3 strengths</h3><ol>${rep.strengths.slice(0, 3).map(s => `<li><b>${s.t}</b>: ${s.d}</li>`).join("")}</ol></div>
      <div class="card"><h3>Top 3 focus areas</h3><ol>${rep.struggles.slice(0, 2).map(s => `<li><b>${s.t}</b>: ${s.fix}</li>`).join("")}
        <li><b>${rep.low.n} (${rep.low.m.toLowerCase()})</b>: ${rep.low.practice.d}</li></ol></div>
      <div class="card wide"><h3>Your 21-day Dhirise starter plan</h3><div class="weeks">
        ${rep.weeks.map((w, i) => `<div><b>Week ${i + 1}</b><ul>${w.map(h => `<li>${h.t}</li>`).join("")}</ul></div>`).join("")}</div></div>
    </div>
    <p class="disclaimer">${BRAND.disclaimer}</p>
    <div class="sheet-foot"><span><b>${BRAND.name}</b> · ${BRAND.tagline}</span><span>${esc(rep.name)} · ${fmtDate(rep.date)}</span></div>
  </div>`;
}
function summaryText(rep) {
  const dp = rep.R.dp, gp = rep.R.gp;
  return [
    `${BRAND.name} · ${BRAND.product} (Mind Mirror)`,
    [rep.name, rep.cls, rep.stream, fmtDate(rep.date)].filter(Boolean).join(" · "),
    "",
    `Prakriti: ${rep.typeName} (Vata ${dp.v}%, Pitta ${dp.p}%, Kapha ${dp.k}%)`,
    `Manas today: mostly ${rep.guna.n} (Sattva ${gp.s}%, Rajas ${gp.r}%, Tamas ${gp.t}%)`,
    `Chakras: strongest ${rep.high.n} (${rep.high.m.toLowerCase()}), needs care ${rep.low.n} (${rep.low.m.toLowerCase()})`,
    "",
    "Top strengths:",
    ...rep.strengths.slice(0, 3).map(s => `• ${s.t}`),
    "",
    "Focus areas:",
    ...rep.focus.map(s => `• ${s}`),
    "",
    "21-day starter plan:",
    ...rep.weeks.map((w, i) => `Week ${i + 1}: ${w.map(h => h.t).join("; ")}`),
    "",
    `Study: ${rep.study.session}`,
    "",
    BRAND.disclaimer,
    `${BRAND.name} · ${BRAND.tagline}`
  ].join("\n");
}
function csvCell(v) {
  v = String(v == null ? "" : v);
  if (/^[=+\-@]/.test(v)) v = "'" + v;           // keep spreadsheets from running it as a formula
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
function sessionsCSV(store) {
  const head = ["Date", "Name", "Class/Year", "Stream", "Prakriti", "Vata %", "Pitta %", "Kapha %", "Manas", "Sattva %", "Rajas %", "Tamas %",
    ...CH.map(c => `${c.n} %`), "Strongest chakra", "Needs care", "Flags", ...Q.map((q, i) => `Q${i + 1}`)];
  const rows = (store.sessions || []).map(s => {
    const r = s.results || {}, dp = r.dp || {}, gp = r.gp || {};
    return [fmtDate(s.date), s.name, s.cls, s.stream, r.typeName, dp.v, dp.p, dp.k, r.guna, gp.s, gp.r, gp.t,
      ...(r.chak || []), r.high, r.low, (r.flags || []).join("; "),
      ...Q.map((q, i) => s.ans && s.ans[i] != null ? `${s.ans[i] + 1}. ${q[2][s.ans[i]][0]}` : "")];
  });
  return "﻿" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
}

window.DHIcore = { esc, capName, firstName, fmtDate, reduced, loadStore, saveStore, pcts, typeShare, score, build, parseD,
  donutSVG, radarSVG, gunaBars, mandalaSVG, chakraSymbol, brandHTML, summarySheetHTML, summaryText, sessionsCSV, LIVE_KEY, CHANNEL };

/* =========================================================== student screen */

if (!document.getElementById("app")) return;

const $ = s => document.querySelector(s);
const stage = $("#stage"), menu = $("#hostmenu");
let store = loadStore();
let S = fresh();
function fresh() { return { phase: "welcome", name: "", cls: "", stream: "", date: null, i: 0, ans: Array(Q.length).fill(null), slide: 0, sid: null, savedAns: null, back: false }; }
const meta = () => ({ name: S.name, cls: S.cls, stream: S.stream, date: S.date });
const firstOfChakra = i => i === 0 || Q[i - 1][0] !== Q[i][0];

/* ---------- rail ---------- */
function rail() {
  const r = $("#rail"), show = S.phase === "q" || S.phase === "chakra";
  r.hidden = !show;
  if (!show) return;
  $("#segs").innerHTML = Q.map((q, i) => `<div class="seg ${S.ans[i] != null ? "done" : ""} ${i === S.i && S.phase === "q" ? "now" : ""}" style="--c:${CH[q[0]].hex}"><i></i></div>`).join("");
  const c = CH[Q[S.i][0]];
  $("#chLabel").innerHTML = `<span class="dot" style="--c:${c.hex}"></span><b>${c.n}</b> · ${c.m}`;
  $("#count").textContent = `${S.i + 1} / ${Q.length}`;
}

/* ---------- welcome ---------- */
function renderWelcome() {
  const W = DATA.WELCOME;
  const opt = (list, v) => `<option value="">Select</option>` + list.map(x => `<option ${x === v ? "selected" : ""}>${esc(x)}</option>`).join("");
  stage.innerHTML = `<section class="slide welcome ${S.back ? "back" : ""}">
    <div>
      <p class="eyebrow">${W.eyebrow}</p>
      <h1>${W.title}</h1>
      <p class="lede">${W.body}</p>
      <div class="fields">
        <div class="field full"><label for="nm">Name</label><input id="nm" autocomplete="off" spellcheck="false" placeholder="Enter your name" value="${esc(S.name)}"></div>
        <div class="field"><label for="cls">Class / Year <em>(optional)</em></label><select id="cls">${opt(DATA.CLASSES, S.cls)}</select></div>
        <div class="field"><label for="str">Stream <em>(optional)</em></label><select id="str">${opt(DATA.STREAMS, S.stream)}</select></div>
      </div>
      <button class="cta" id="go" type="button" ${S.name.trim() ? "" : "disabled"}>${W.button}</button>
    </div>
    <div class="mandala">${mandalaSVG("spin")}</div></section>`;
  const nm = $("#nm"), goBtn = $("#go");
  nm.focus();
  nm.addEventListener("input", () => { S.name = nm.value; goBtn.disabled = !nm.value.trim(); sync(); });
  nm.addEventListener("blur", () => { if (nm.value.trim()) { S.name = capName(nm.value); nm.value = S.name; sync(); } });
  nm.addEventListener("keydown", e => { if (e.key === "Enter") begin(); });
  $("#cls").onchange = e => { S.cls = e.target.value; sync(); };
  $("#str").onchange = e => { S.stream = e.target.value; sync(); };
  goBtn.onclick = begin;
}
function begin() {
  if (!S.name.trim()) { $("#nm").focus(); return; }
  S.name = capName(S.name);
  S.date = S.date || new Date().toISOString();
  S.i = 0; S.phase = "chakra"; go(1);
}

/* ---------- chakra intro ---------- */
function renderChakra() {
  const ci = Q[S.i][0], c = CH[ci];
  stage.innerHTML = `<section class="slide chintro ${S.back ? "back" : ""}" style="--c:${c.hex}" id="chs">
    <div class="inner">
      <div class="chsym">${chakraSymbol(c)}</div>
      <span class="step">Chakra ${ci + 1} of 7 · ${c.en}</span>
      <p class="deva">${c.d}</p>
      <h2><span>${c.n}</span>: ${c.line}</h2>
      <p>${c.about}</p>
      <button class="cta" id="cont" type="button">Continue</button>
    </div></section>`;
  $("#chs").onclick = () => { S.phase = "q"; go(1); };
}

/* ---------- question ---------- */
function counted(qi, pick) { return !!(S.savedAns && S.savedAns[qi] === pick); }
function renderQ() {
  const [ci, text, opts] = Q[S.i], c = CH[ci], pick = S.ans[S.i], rev = pick != null;
  const p = rev ? pcts(store, S.i, pick, counted(S.i, pick)) : null;
  stage.innerHTML = `<section class="slide ${S.back ? "back" : ""}" style="--c:${c.hex}">
    <div class="qhead">
      <span class="badge"><span class="dot"></span><span class="skt">${c.d}</span> ${c.m}</span>
      <h2 class="qtext">${esc(text)}</h2>
    </div>
    <div class="opts ${rev ? "revealed" : ""}" role="radiogroup" aria-label="Answers">
      ${opts.map((o, i) => `<button type="button" role="radio" aria-checked="${pick === i}" class="opt ${pick === i ? "sel" : ""}" data-i="${i}">
        <span class="k">${i + 1}</span><span class="t">${esc(o[0])}</span>
        <span class="pc" aria-label="${rev ? p[i] : 0}% of students"><span class="pbar"><i style="width:${rev ? p[i] : 0}%"></i></span><b class="pnum tn">${rev ? p[i] : 0}%</b></span></button>`).join("")}
    </div>
    <div class="together ${rev ? "" : "idle"}" id="tog">${rev ? togetherHTML(p[pick]) : "Choose the answer closest to you, even if none is perfect."}</div>
    <div class="nav">
      <button class="ghost" id="back" type="button">Back</button>
      <button class="cta" id="next" type="button" ${rev ? "" : "disabled"}>${S.i === Q.length - 1 ? "See my reflection" : "Next"}</button>
    </div></section>`;
  stage.querySelectorAll(".opt").forEach(b => b.onclick = () => choose(+b.dataset.i));
  $("#back").onclick = back; $("#next").onclick = next;
}
function togetherHTML(n) {
  const msg = n >= 25 ? `of students chose this too. <strong>You’re not alone.</strong> Many students feel exactly this way.`
    : n >= 15 ? `of students chose this too. <strong>You’re in good company.</strong>`
    : `of students chose this. <strong>A rarer path</strong>, and part of what makes you you.`;
  return `<span class="big tn" id="togN">${n}%</span><span>${msg}</span>`;
}
function countUp(el, to, ms, suffix) {
  suffix = suffix || "";
  const from = parseInt(el.textContent, 10) || 0;
  if (!ms || reduced()) { el.textContent = to + suffix; return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))) + suffix; if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function choose(i) {
  if (S.phase !== "q") return;
  S.ans[S.i] = i;
  const p = pcts(store, S.i, i, counted(S.i, i));
  stage.querySelector(".opts").classList.add("revealed");
  stage.querySelectorAll(".opt").forEach((b, j) => {
    b.classList.toggle("sel", j === i); b.setAttribute("aria-checked", j === i);
    b.querySelector(".pc").setAttribute("aria-label", `${p[j]}% of students`);
    const bar = b.querySelector(".pbar i");
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = p[j] + "%"; }));
    countUp(b.querySelector(".pnum"), p[j], 900, "%");
  });
  const tog = $("#tog"); tog.classList.remove("idle"); tog.innerHTML = togetherHTML(p[i]);
  const tn = $("#togN"); if (!reduced()) tn.textContent = "0%";
  countUp(tn, p[i], 900, "%");
  $("#next").disabled = false;
  rail(); sync();
}
function next() {
  if (S.phase !== "q" || S.ans[S.i] == null) return;
  if (S.i === Q.length - 1) { S.phase = "reading"; go(1); return; }
  S.i++; S.phase = firstOfChakra(S.i) ? "chakra" : "q"; go(1);
}
function back() {
  if (S.phase === "q") {
    if (firstOfChakra(S.i)) S.phase = "chakra"; else S.i--;
  } else if (S.phase === "chakra") {
    if (S.i === 0) S.phase = "welcome"; else { S.i--; S.phase = "q"; }
  }
  go(-1);
}

/* ---------- reading + saving the session ---------- */
function saveSession() {
  if (S.savedAns) S.savedAns.forEach((a, qi) => { if (a != null && store.counts[qi][a] > 0) store.counts[qi][a]--; });
  S.ans.forEach((a, qi) => { store.counts[qi][a] = (store.counts[qi][a] || 0) + 1; });
  S.savedAns = S.ans.slice();
  const rep = build(S.ans, meta(), null);
  const rec = { id: S.sid || "s" + Date.now().toString(36), date: S.date, name: rep.name, cls: S.cls, stream: S.stream, ans: S.ans.slice(),
    results: { typeKey: rep.typeKey, typeName: rep.typeName, dp: rep.R.dp, gp: rep.R.gp, guna: rep.guna.n,
      chak: rep.chakras.map(c => c.pct), high: rep.high.n, low: rep.low.n, flags: rep.flags.map(f => f.t) } };
  const at = store.sessions.findIndex(s => s.id === rec.id);
  if (at >= 0) store.sessions[at] = rec; else store.sessions.push(rec);
  S.sid = rec.id;
  saveStore(store);
}
function renderReading() {
  stage.innerHTML = `<section class="slide reading"><div><div class="mandala">${mandalaSVG("spin")}</div><h2>Reading your pattern…</h2><p>Bringing your eighteen answers together</p></div></section>`;
  const sp = stage.querySelector(".spin"); if (sp) sp.style.animationDuration = "3s";
  if (!S.savedAns || S.savedAns.join() !== S.ans.join()) saveSession();
  setTimeout(() => { if (S.phase === "reading") { S.phase = "report"; S.slide = 0; go(1); } }, reduced() ? 300 : 1900);
}

/* ---------- report slides ---------- */
const ICON = { times: "☀", session: "⏱", revision: "↻", notes: "✎", exam: "◎", wake: "☀", sleep: "☾", meals: "◍", move: "⤴", screen: "▭" };
const STUDY_LABEL = { times: "Best times of day", session: "Session length", revision: "Revision method", notes: "Note-taking style", exam: "Exam preparation" };
const DAILY_LABEL = { wake: "Wake up", sleep: "Sleep", meals: "Meals", move: "Movement", screen: "Screen time" };

const SLIDE_FN = {
  prakriti: r => ({
    h: `${esc(r.first)}, your nature leans ${r.typeName}`,
    sub: "Prakriti is the nature you were born with: a mix of three energies, called doshas, that shapes how your body and mind like to work. Everyone has all three, in different amounts.",
    body: `<div class="grid">
      <div class="card accent" style="--c:${r.P.hex}"><h3>Your Prakriti</h3>
        <div class="donutwrap">${donutSVG(r.R.dp, r.M ? r.typeName.split(" ")[0] : r.P.n, r.M ? "mixed type" : `${r.R.dp[r.R.order[0]]}%`)}
          <div class="legend">${["v", "p", "k"].map(k => `<div class="lg" style="--c:${DOSHA[k].hex}"><i></i><span>${DOSHA[k].n}<small>${DOSHA[k].el}</small></span><b class="tn">${r.R.dp[k]}%</b></div>`).join("")}</div></div>
        <p class="lead">${r.P.lead}</p>
        <p style="color:var(--ink)">${r.mixText}</p>
        <div class="share"><span class="big tn">${r.share}%</span><span>of students who took this share your type, <b>${r.typeName}</b>.</span></div></div>
      <div class="card"><h3>What the three doshas mean</h3>
        ${["v", "p", "k"].map(k => { const d = DOSHA[k]; return `<div class="dosha-mini" style="--c:${d.hex}"><div class="nm"><b>${d.n}</b><span class="skt">${d.d}</span><em>${d.el}</em></div><p>${d.meaning}</p><div class="chips">${d.qualities.map(q => `<span class="chip">${q}</span>`).join("")}</div></div>`; }).join("")}</div>
    </div>` }),

  strengths: r => ({
    h: "Your strengths as a learner",
    sub: `These come from your ${r.typeName} nature. They’re already in you. The work is to use them on purpose.`,
    body: `<div class="grid auto">${r.strengths.map((s, i) => `<div class="card" style="--c:${(i < 3 || !r.M ? r.P : r.P2).hex}"><div class="cardtop"><span class="num">${i + 1}</span><h4>${s.t}</h4></div><p>${s.d}</p></div>`).join("")}</div>` }),

  struggles: r => ({
    h: "Where you may struggle",
    sub: "Every nature has a few habits to watch. These aren’t flaws or labels, just places where one small change goes a long way.",
    body: `<div class="grid">${r.struggles.map((s, i) => `<div class="card"><div class="cardtop"><span class="num">${i + 1}</span><h4>${s.t}</h4></div><p>${s.d}</p><div class="fix"><b>Try this:</b> ${s.fix}</div></div>`).join("")}</div>` }),

  manas: r => ({
    h: `Today your mind is mostly ${r.guna.n}`,
    sub: "Manas is the state of your mind. Ayurveda describes it with three qualities, called gunas. Everyone has all three, and the balance shifts from day to day.",
    body: `<div class="grid">
      <div class="card accent" style="--c:${r.guna.hex}"><h3>Your balance today</h3>${gunaBars(r.R.gp)}<p style="color:var(--ink)">${r.guna.today}</p></div>
      <div class="card"><h3>What each guna means</h3>
        ${["s", "r", "t"].map(k => `<div class="dosha-mini" style="--c:${GUNA[k].hex}"><div class="nm"><b>${GUNA[k].n}</b><span class="skt">${GUNA[k].d}</span><em>${GUNA[k].m}</em></div><p>${GUNA[k].meaning}</p></div>`).join("")}</div>
      <div class="callout wide"><span class="ic">↻</span><div><b>Your mind can change.</b> ${DATA.GUNA_CHANGE}
        <div class="chips" style="margin-top:12px">${DATA.SATTVA_LIFTS.map(x => `<span class="chip" style="--c:${GUNA.s.hex}">${x}</span>`).join("")}</div></div></div>
    </div>` }),

  chakra: r => ({
    h: "Your seven centres",
    sub: "Chakras are a way of looking at seven areas of life, from daily routine to purpose. Your answers show where you feel strong and where a little care will help.",
    body: `<div class="chakra-top">
        <div class="card radar">${radarSVG(r.R.chak)}</div>
        <div class="grid" style="grid-template-columns:1fr">
          <div class="card accent" style="--c:${r.high.hex}"><h3>Strongest centre</h3><h4 style="color:${r.high.hex}">${r.high.n} · ${r.high.m}</h4><p>${r.high.text}</p></div>
          <div class="card accent" style="--c:${r.low.hex}"><h3>Needs the most care</h3><h4 style="color:${r.low.hex}">${r.low.n} · ${r.low.m}</h4><p>${r.low.text}</p><div class="fix"><b>Try this:</b> ${r.low.practice.d}</div></div>
        </div>
      </div>
      <div class="grid auto">${r.chakras.map(c => `<div class="card ckcard" style="--c:${c.hex}">
        <div class="cardtop"><div class="nm"><b>${c.n}</b><small>${c.en} · ${c.m}</small></div><div class="sc tn">${c.pct}%<small>${c.bandLabel}</small></div></div>
        <div class="meter"><i style="width:${c.pct}%"></i></div>
        <p>${c.text}</p><div class="fix"><b>${c.practice.t}:</b> ${c.practice.d}</div></div>`).join("")}</div>` }),

  study: r => ({
    h: "Your ideal study pattern",
    sub: `A rhythm built for a ${r.typeName} mind. Try it for two weeks and adjust what doesn’t fit.`,
    body: `<div class="grid g3">${Object.keys(STUDY_LABEL).map(k => `<div class="card tile" style="--c:${r.P.hex}"><span class="ic">${ICON[k]}</span><h3>${STUDY_LABEL[k]}</h3><p>${r.study[k]}</p></div>`).join("")}
      ${r.studyNote ? `<div class="card tile accent" style="--c:${r.P2.hex}"><span class="ic">✦</span><h3>For your mix</h3><p>${r.studyNote}</p></div>` : ""}</div>` }),

  subjects: r => ({
    h: "Your subjects",
    sub: "Where your nature gives you a head start, and where a different approach will help.",
    body: `<div class="grid">
      <div class="card subj" style="--c:var(--c4)"><h3>Natural strengths</h3><ul>${r.strongSubj.map(s => `<li><b>${s.n}</b><span>${s.tip}</span></li>`).join("")}</ul></div>
      <div class="card subj" style="--c:var(--c2)"><h3>Needs extra care</h3><ul>${r.care.map(s => `<li><b>${s.n}</b><span>${s.tip}</span></li>`).join("")}</ul></div>
      <div class="callout wide"><span class="ic">✦</span><div><b>“Extra care” doesn’t mean weak.</b> It means these subjects respond best to a different approach. Many toppers struggled with exactly these at first.</div></div>
    </div>` }),

  daily: r => ({
    h: "Your daily rhythm",
    sub: `Dinacharya, a steady daily routine, is one of the simplest ways to calm and sharpen the mind. Here’s a rhythm that suits a ${r.typeName} nature.`,
    body: `<div class="grid g3">${Object.keys(DAILY_LABEL).map(k => `<div class="card tile" style="--c:${r.P.hex}"><span class="ic">${ICON[k]}</span><h3>${DAILY_LABEL[k]}</h3><p>${r.daily[k]}</p></div>`).join("")}
      ${r.dailyNote ? `<div class="card tile accent" style="--c:${r.P2.hex}"><span class="ic">✦</span><h3>For your mix</h3><p>${r.dailyNote}</p></div>` : ""}</div>
      <p class="disclaimer">General wellness ideas, not medical advice. For any health concern, talk to a doctor.</p>` }),

  plan: r => ({
    h: "Your 21-day Dhirise starter plan",
    sub: `Three small habits a week, built around your ${r.P.n} nature and your ${r.low.n} centre (${r.low.m.toLowerCase()}). Small is the point: tick them off each day.`,
    body: `<div class="grid g3">${r.weeks.map((w, i) => `<div class="card week accent" style="--c:${[CH[r.low.i].hex, r.P.hex, "var(--gold)"][i]}">
      <h4><small>Week ${i + 1} · days ${i * 7 + 1}–${i * 7 + 7}</small>${["Start small", "Build the rhythm", "Make it yours"][i]}</h4>
      <ul class="habits">${w.map(h => `<li><span>${h.t}<small>for your ${h.src}</small></span></li>`).join("")}</ul></div>`).join("")}</div>` }),

  summary: r => ({ h: "", sub: "", body: summarySheetHTML(r) + `<p class="disclaimer" style="text-align:center">Thank you, ${esc(r.first)}. Keep this page as your starting point.</p>` })
};

function renderReport() {
  const r = build(S.ans, meta(), store), k = S.slide, def = SLIDES[k], out = SLIDE_FN[def.key](r);
  const pips = SLIDES.map((_, i) => `<i class="${i <= k ? "on" : ""}"></i>`).join("");
  stage.innerHTML = `<section class="slide ${S.back ? "back" : ""}">
    <div class="rhead"><p class="eyebrow"><span>${def.t} · ${k + 1} of ${SLIDES.length}</span><span class="pips" aria-hidden="true">${pips}</span></p>
      ${out.h ? `<h2>${out.h}</h2>` : ""}${out.sub ? `<p>${out.sub}</p>` : ""}</div>
    ${out.body}
    <div class="rnav">
      <button class="ghost" id="rb" type="button">Back</button>
      <span class="foot"><b>${BRAND.name}</b> · ${BRAND.tagline}</span>
      ${k < SLIDES.length - 1 ? `<button class="cta" id="rn" type="button">Next</button>` : `<span></span>`}
    </div></section>`;
  $("#rb").onclick = reportBack;
  const rn = $("#rn"); if (rn) rn.onclick = reportNext;
  $("#printSheet").innerHTML = summarySheetHTML(r);
}
function reportNext() { if (S.slide < SLIDES.length - 1) { S.slide++; go(1); } }
function reportBack() {
  if (S.slide > 0) { S.slide--; go(-1); }
  else { S.phase = "q"; S.i = Q.length - 1; go(-1); }
}

/* ---------- router ---------- */
function go(dir) {
  S.back = dir < 0;
  if (S.phase !== "report") $("#printSheet").innerHTML = "";
  ({ welcome: renderWelcome, chakra: renderChakra, q: renderQ, reading: renderReading, report: renderReport })[S.phase]();
  rail(); sync();
  window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
}

/* ---------- live sync to the interviewer panel ---------- */
let panelWin = null, lastT = 0, bc = null;
try { bc = new BroadcastChannel(CHANNEL); } catch (e) {}
function snapshot() {
  lastT = Math.max(Date.now(), lastT + 1);
  return { type: "dhi-state", t: lastT, S: { phase: S.phase, name: S.name, cls: S.cls, stream: S.stream, date: S.date, i: S.i, ans: S.ans.slice(), slide: S.slide } };
}
function sync() {
  const m = snapshot();
  try { if (panelWin && !panelWin.closed) panelWin.postMessage(m, "*"); } catch (e) {}
  try { if (bc) bc.postMessage(m); } catch (e) {}
  try { localStorage.setItem(LIVE_KEY, JSON.stringify(m)); } catch (e) {}
}
window.addEventListener("message", e => {
  if (!e.data || e.data.type !== "dhi-hello" || !e.source) return;
  if (!panelWin || panelWin.closed || e.source === panelWin) { panelWin = e.source; sync(); }
});
function openPanel() {
  closeMenu();
  try { if (panelWin && !panelWin.closed) { panelWin.focus(); sync(); return; } } catch (e) {}
  panelWin = window.open("panel.html", "dhirise-panel", "popup=yes,width=1240,height=900");
  if (!panelWin) toast("Pop-up blocked. Allow pop-ups for this page, then press I again.");
}

/* ---------- host menu ---------- */
let menuReturn = null;
function openMenu() {
  menuReturn = document.activeElement;
  $("#hmCount").textContent = `${store.sessions.length} saved`;
  menu.hidden = false;
  menu.querySelector("button.item").focus();
}
function closeMenu() {
  if (menu.hidden) return;
  menu.hidden = true;
  if (menuReturn && document.contains(menuReturn)) menuReturn.focus();
}
function toggleFS() {
  try { const d = document; if (d.fullscreenElement) d.exitFullscreen(); else d.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
}
function newStudent() {
  const inProgress = S.phase !== "welcome" || S.name.trim();
  if (inProgress && S.phase !== "report" && !confirm("Start a new student? The current answers will be cleared.")) return;
  S = fresh(); go(1);
}
function downloadCSV() {
  store = loadStore();
  if (!store.sessions.length) { toast("No completed sessions yet."); return; }
  const blob = new Blob([sessionsCSV(store)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `dhirise-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Exported ${store.sessions.length} session${store.sessions.length === 1 ? "" : "s"}.`);
}
function resetCounts() {
  if (!confirm("Reset the answer counts used for the “% of students” figures? The figures go back to the indicative starting values.")) return;
  store.counts = blankCounts();
  S.savedAns = null;
  if (store.sessions.length && confirm(`Also delete the ${store.sessions.length} saved session${store.sessions.length === 1 ? "" : "s"}? Export the CSV first if you need them.`)) {
    store.sessions = []; S.sid = null;
  }
  saveStore(store);
  $("#hmCount").textContent = `${store.sessions.length} saved`;
  toast("Counts reset.");
}
menu.addEventListener("click", e => {
  if (e.target === menu) { closeMenu(); return; }
  const b = e.target.closest("button[data-act]"); if (!b) return;
  ({ panel: openPanel, fullscreen: () => { closeMenu(); toggleFS(); }, new: () => { closeMenu(); newStudent(); },
     csv: downloadCSV, reset: resetCounts, close: closeMenu })[b.dataset.act]();
});
$("#gear").onclick = () => menu.hidden ? openMenu() : closeMenu();

let toastTimer = null;
function toast(msg) {
  let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 3000);
}

/* ---------- keyboard: works everywhere, shown only inside the host menu ---------- */
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key, k = key.length === 1 ? key.toLowerCase() : key;
  if (!menu.hidden) {
    if (key === "Escape" || k === "h") { e.preventDefault(); closeMenu(); }
    else if (k === "i") { e.preventDefault(); openPanel(); }
    else if (k === "f") { e.preventDefault(); closeMenu(); toggleFS(); }
    return;
  }
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (k === "h") { e.preventDefault(); openMenu(); return; }
  if (k === "i") { e.preventDefault(); openPanel(); return; }
  if (k === "f") { e.preventDefault(); toggleFS(); return; }
  const fwd = key === "ArrowRight" || key === "Enter", bwd = key === "ArrowLeft";
  if (S.phase === "q") {
    if (/^[1-4]$/.test(key)) choose(+key - 1);
    else if (fwd) { e.preventDefault(); next(); }
    else if (bwd) back();
  } else if (S.phase === "chakra") {
    if (fwd || key === " ") { e.preventDefault(); S.phase = "q"; go(1); }
    else if (bwd) back();
  } else if (S.phase === "report") {
    if (fwd) { e.preventDefault(); reportNext(); }
    else if (bwd) reportBack();
  } else if (S.phase === "welcome" && key === "Enter") begin();
});

go(1);
})();
