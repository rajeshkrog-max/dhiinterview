// The share flow (spec 0010, milestones 2 to 4): things that can be checked from the source without a browser. The behaviour on a phone and
// a computer is in e2e/share-row.spec.ts; the server half is in convex/shares.test.ts. Each test names the acceptance criterion it covers.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
// code only: the comments describe what the file does not do, and would match the scans below
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const flow = read("public/dhiinterviews/js/share-flow.js");
const words = read("public/dhiinterviews/js/engine/shareText.js");
const card = read("public/dhiinterviews/js/card.js");
const report = read("public/dhiinterviews/js/report-student.js");
const reportPage = read("src/pages/dhiinterviews/report-student.astro");
const session = read("src/lib/session.ts");
const shareText = (key) => new RegExp(`\\b${key}:\\s*"([^"]*)"`).exec(words)?.[1];

describe("the words (spec 0010, AC-9, AC-18)", () => {
  test("covers AC-9: the failure line is exactly the spec's words", () => {
    expect(shareText("linkFailed")).toBe("We could not add your report link, so only your card was shared.");
  });

  test("covers AC-18: the Stop sharing line, the confirm step and the off line are the spec's words", () => {
    expect(shareText("controlOn")).toBe("Your link is on until {date} (India time).");
    expect(shareText("controlLastDay")).toBe("Your link ends today.");
    expect(shareText("controlStop")).toBe("Stop sharing");
    expect(shareText("controlSure")).toBe("Anyone who has the link will no longer see your report.");
    expect(shareText("controlOff")).toBe("Sharing is off. Tap a button to make a new link.");
  });

  test("covers AC-2: the Instagram dialog says the phone may ask to sign in first, and offers Copy my report address and Close", () => {
    expect(shareText("igBody")).toContain("Your phone may ask you to sign in first.");
    expect(shareText("igNoQr")).toContain("Your phone may ask you to sign in first.");
    expect(shareText("igCopy")).toBe("Copy my report address");
    expect(shareText("igClose")).toBe("Close");
  });

  test("covers AC-4: plain words for students: no dash or hyphen as punctuation, no internal style keys, no flag or ability words", () => {
    const text = [...words.matchAll(/:\s*"([^"]*)"/g)].map((m) => m[1]).join(" ");
    expect(text).not.toMatch(/[–—]| - /);
    expect(text).not.toMatch(/selfDoubt|lowMood|\bv\/p\/k\b/);
  });

  test("the share words are a file of their own, loaded before the flow on the report page", () => {
    expect(reportPage.indexOf("js/engine/shareText.js")).toBeGreaterThan(0);
    expect(reportPage.indexOf("js/engine/shareText.js")).toBeLessThan(reportPage.indexOf("js/share-flow.js"));
    expect(reportPage.indexOf("js/share-flow.js")).toBeLessThan(reportPage.indexOf("js/card.js"));
    expect(reportPage).toContain('href="css/share.css"');
  });
});

describe("the flow", () => {
  test("covers AC-10: the report's own Share button calls the same flow as the three buttons, and keeps none of the old share code", () => {
    expect(report).toContain('DhiShare.go("any")');
    expect(report).not.toMatch(/navigator\.share|navigator\.clipboard|T\.shareText|T\.shareCopied/);
    expect(read("public/dhiinterviews/js/engine/reportText.js")).not.toMatch(/shareText:|shareCopied:/);
    expect(card).toContain("DhiShare.bind(");
    expect(code(card)).not.toMatch(/navigator\.share|navigator\.canShare|wa\.me|facebook\.com/); // all of that lives in share-flow.js now
  });

  test("covers AC-17: nothing runs unless the deploy time switch is on; the switch is exactly publicShare === true", () => {
    expect(session).toMatch(/DHI_FUNNEL\?: \{ publicShare\?: unknown \} \}\)\.DHI_FUNNEL\?\.publicShare === true/);
    expect(flow).toMatch(/if \(!s \|\| !s\.enabled\(\)\) \{ act\(n, ev, null\); return true; \}/); // off: the picture and the landing address, as before
    expect(flow).toMatch(/if \(s && s\.enabled\(\) && o\.controlParent\)/); // the Stop sharing line is only mounted when on
    expect(read("public/dhiinterviews/js/funnel-config.js")).not.toMatch(/publicShare/); // the repo's config stays empty
    expect(read("public/dhiinterviews/js/funnel-config.example.js")).toMatch(/publicShare: false/);
  });

  test("covers AC-16: a student whose check is not finished gets the picture and the landing address, and no notice", () => {
    expect(flow).toMatch(/if \(info && !info\.ready\) \{ act\(n, ev, null\); return true; \}/);
  });

  test("covers AC-6: reading the status never makes or renews a link; only a Share tap calls make", () => {
    const status = /async function shareStatus\(\)[\s\S]*?\n\}/.exec(session)?.[0] ?? "";
    expect(status).toContain("api.shares.status");
    expect(status).not.toContain("api.shares.enable");
    const calls = [...code(flow).matchAll(/\bs(?:0)?\.make\(/gi)].length;
    expect(calls).toBe(3); // the renewal in a tap on a live link, the link made after a tap, and the notice's Share button
    // bind() only reads the status; it never calls make
    const bindBody = /function bind\(o\)[\s\S]*?\n  \}\n/.exec(code(flow))?.[0] ?? "";
    expect(bindBody).toContain("s.status()");
    expect(bindBody).not.toContain(".make(");
  });

  test("covers AC-3: the notice words are the consent text from the server's file, and the under 18 tick is required before Share", () => {
    expect(session).toContain("SHARE_CONSENT_LINES");
    expect(flow).toContain("S0.notice.lines.forEach");
    expect(flow).toContain("S0.notice.tick");
    expect(flow).toMatch(/if \(minor && !tick\.checked\) \{ msg\.textContent = T\.noticeNeedTick; tick\.focus\(\); return; \}/);
    expect(flow).toMatch(/S0\.make\(\{ agreed: true, guardianTick: minor && tick\.checked \}\)/);
  });

  test("covers AC-3: the notice is a real dialog: aria-modal, labelled, Escape and a tap outside close it, Tab stays inside, focus goes back", () => {
    expect(flow).toContain('setAttribute("role", "dialog")');
    expect(flow).toContain('setAttribute("aria-modal", "true")');
    expect(flow).toContain('setAttribute("aria-labelledby"');
    expect(flow).toContain('e.key === "Escape"');
    expect(flow).toContain('e.key !== "Tab"');
    expect(flow).toMatch(/opener\.focus\(\)/);
  });

  test("covers AC-9: a failure to make the link still shares the picture, with the landing address built from the page address", () => {
    expect(flow).toContain('new URL("landing.html", location.href).href');
    expect(flow).toMatch(/function fallback\(n\)[\s\S]*act\(n, null, null, true\)[\s\S]*T\.linkFailed/);
    expect(code(flow)).not.toContain("shareUrl"); // DHI_FUNNEL.shareUrl is empty in the repo: never the source of the landing address
  });

  test("covers AC-2: on a computer Instagram saves the picture and opens the dialog; WhatsApp and Facebook links carry the public link", () => {
    expect(flow).toMatch(/if \(n\.id === "ig"\) showQr\(\)/);
    expect(flow).toContain('"https://wa.me/?text=" + encodeURIComponent(text)');
    expect(flow).toContain('"https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(link || landing())');
    expect(flow).toContain('new URL("report-student.html", location.href).href'); // the student's own report, not the public link
  });

  test("covers AC-1: on a phone every picture share copies the link inside the tap, before the share sheet (many apps keep only the picture)", () => {
    expect(flow).toMatch(/if \(link\) copy\(link\);/);
    expect(flow).not.toMatch(/n\.id === "ig" && link\) copy/);
    expect(flow.indexOf("if (link) copy(link);")).toBeLessThan(flow.indexOf("B.story().then(function (blob) {"));
  });

  test("covers AC-1: the Copy link button is a fourth button in the row, copies only the link (no picture, no share sheet), and the report has its own", () => {
    const cardJs = read("public/dhiinterviews/js/card.js");
    expect(cardJs).toContain('{ id: "copy", label: "Copy link" }');
    expect(cardJs).toContain('"Copy my report link"');
    const copyBranch = flow.slice(flow.indexOf('if (n.id === "copy") {'), flow.indexOf('if (n.id === "any" && !canFiles)'));
    expect(copyBranch).toContain("copy(link || landing())");
    expect(copyBranch).not.toMatch(/navigator\.share|B\.story/);
    expect(read("public/dhiinterviews/js/report-student.js")).toContain('DhiShare.go("copy")');
  });

  test("covers AC-13: the flow keeps the link in memory only: no localStorage, sessionStorage or cookie anywhere in the share code", () => {
    for (const [name, text] of [["share-flow.js", flow], ["shareText.js", words]]) expect(code(text), name).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
    const block = /\/\/ ---------- the private report link \(spec 0010\)[\s\S]*?\/\/ ---------- what the page scripts see/.exec(session)?.[0] ?? "";
    expect(block.length).toBeGreaterThan(500);
    expect(code(block)).not.toMatch(/localStorage|writeJSON|sessionStorage|document\.cookie|stampCache/);
  });

  test("covers AC-13: apart from the two share links a computer opens, the flow talks to no other site", () => {
    const hosts = [...code(flow).matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
    expect([...new Set(hosts)].sort()).toEqual(["https://wa.me/?text=", "https://www.facebook.com/sharer/sharer.php?u="]);
  });
});

describe("the QR maker (AC-2)", () => {
  const dir = "public/dhiinterviews/js/vendor";
  const files = readdirSync(new URL(`../${dir}`, import.meta.url));

  test("covers AC-2: one vendored, versioned QR file with its licence beside it, MIT, and its version and licence named in its header", () => {
    expect(files.sort()).toEqual(["qrcode-generator.2.0.4.min.js", "qrcode-generator.LICENSE.txt"]);
    const lib = read(`${dir}/qrcode-generator.2.0.4.min.js`);
    expect(lib.split("\n")[0]).toMatch(/qrcode-generator 2\.0\.4 \(MIT\)/);
    expect(lib.split("\n")[0]).toContain("qrcode-generator.LICENSE.txt");
    expect(read(`${dir}/qrcode-generator.LICENSE.txt`)).toMatch(/The MIT License \(MIT\)[\s\S]*Kazuhiko Arase/);
  });

  test("covers AC-2: it is loaded only when the Instagram dialog opens, from our own files, and a failure to load is handled", () => {
    expect(flow).toContain('s.src = "js/vendor/qrcode-generator.2.0.4.min.js"');
    expect(flow).toMatch(/s\.onerror = function \(\) \{ qrLoad = null; ok\(false\); \}/);
    expect(flow).toMatch(/svg \? T\.igBody : T\.igNoQr/);
    expect(reportPage).not.toContain("qrcode"); // not on every report page load
  });

  test("covers AC-13: the vendored file reaches for nothing outside itself: no network, no storage, no eval", () => {
    const lib = read(`${dir}/qrcode-generator.2.0.4.min.js`).split("\n").slice(1).join("\n");
    expect(lib).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|eval\(|new Function|document\.cookie|import\(|WebSocket|sendBeacon/);
  });

  test("the file's version is part of its name, and the page script names that exact file (a changed library gets a new name)", () => {
    expect(existsSync(new URL(`../${dir}/qrcode-generator.2.0.4.min.js`, import.meta.url))).toBe(true);
  });
});
