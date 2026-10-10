// The browser side of the team link to the saved report (spec 0008). Used by team.html (the list) and team-report.html (the
// viewer); the page says which one it is with <body data-page="list|report">. What it owns:
//  - sign in with Google (and, on dev only, the fake test sign in), coming back to the same page and, on the viewer, the same
//    report code. The return address is a fixed page path plus `s` only when it looks like a code, never a free address.
//  - calling /api/team/list and /api/team/report with the signed in token, and a kind message for signed out, not on the
//    list, not ready, too many opens, a server error and offline
//  - the list (50 at a time, Load more, the reference code box) and the viewer (the PDF inside the page, Download, Sign out)
// It does not use session.ts: that file is the student page guard and sends anyone without a student profile away.
// Names and classes come from students, so they are put on the page with textContent only, never as HTML, and every id put in
// a link goes through encodeURIComponent. Nothing here stores anything on the device.
// The student's picture (spec 0011, AC-4) is drawn by js/avatar.js (DhiAvatar, a same site script the pages load): each list row has a
// 28px circle, and the viewer a 40px one above the PDF. The server sends a path or null; only a same origin /api/avatar/ path is ever
// drawn, which the strict policy of these pages already allows (img-src 'self', AC-13). Without a picture the circle shows the initial.
import { authClient } from "./auth-client";

const LIST_PAGE = "/dhiinterviews/team.html";
const REPORT_PAGE = "/dhiinterviews/team-report.html";
const CODE = /^[A-Za-z0-9]{1,64}$/; // what a reference code looks like; anything else is not kept in the return address
const PDF_MAGIC = "%PDF-";
const PDF_VIEW = "#view=FitH&navpanes=0"; // how the embedded PDF opens: fit to width, no thumbnail sidebar

type Row = { studentId: string; name: string; class: string; madeAt: number; avatar: string | null };
type Who = { kind: "token"; token: string } | { kind: "signedOut" } | { kind: "offline" };
type Reply = { kind: "res"; res: Response } | { kind: "signedOut" } | { kind: "offline" };

type Circle = (opts: { url: string | null; name: string; size: 28 | 40 | 64; lazy?: boolean }) => HTMLElement;
const circle = (url: string | null, name: string, size: 28 | 40, lazy = false): HTMLElement | null =>
  (window as unknown as { DhiAvatar?: { make: Circle } }).DhiAvatar?.make({ url, name, size, lazy }) ?? null;

const page = document.body.dataset.page === "report" ? "report" : "list";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const params = new URLSearchParams(location.search);
const code = params.get("s") ?? "";

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

// ---------- what is on screen ----------

function say(text: string | null, opts: { bad?: boolean; retry?: () => void } = {}): void {
  const box = $("msg");
  if (!box) return;
  box.hidden = text === null;
  box.className = "tt-msg" + (opts.bad ? " bad" : "");
  box.textContent = text ?? "";
  if (opts.retry) {
    const again = opts.retry;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tt-btn";
    b.textContent = "Try again";
    b.style.marginLeft = "12px";
    b.addEventListener("click", () => again());
    box.append(b);
  }
}

function show(id: string, on: boolean): void {
  const el = $(id);
  if (el) el.hidden = !on;
}

function showSignIn(message?: string): void {
  show("signOut", false);
  show("listBox", false);
  show("viewerBox", false);
  show("backBox", false);
  show("signInBox", true);
  say(message ?? null, { bad: Boolean(message) });
}

// ---------- sign in and out ----------

// Where Google sends the person back to: this page, plus the report code on the viewer when it looks like a code.
function backTo(extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  if (page === "report" && CODE.test(code)) q.set("s", code);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const text = q.toString();
  return (page === "report" ? REPORT_PAGE : LIST_PAGE) + (text ? "?" + text : "");
}

async function signInWithGoogle(): Promise<void> {
  try {
    await authClient.signIn.social({ provider: "google", callbackURL: backTo(), errorCallbackURL: backTo({ signin: "error" }) });
  } catch {
    say("We could not start the Google sign in. Please check your connection and try again.", { bad: true });
  }
}

// Fake sign in for automated tests. The server refuses it unless TEST_SIGNIN_ENABLED is set (dev and preview only).
async function testSignIn(email: string): Promise<{ ok: boolean; message?: string }> {
  const password = "test-pass-12345";
  const first = await authClient.signIn.email({ email, password });
  if (first.error) {
    const second = await authClient.signUp.email({ email, password, name: "Test Team" });
    if (second.error) return { ok: false, message: second.error.message || String(second.error.status) };
  }
  return { ok: true };
}

async function signOut(): Promise<void> {
  try {
    const res = await withTimeout(authClient.signOut(), 8000);
    if (res.error) throw new Error("sign out refused");
  } catch {
    say("We could not sign you out. Please check your connection and try again.", { bad: true });
    return;
  }
  location.reload();
}

// ---------- calling the routes ----------

async function whoIsHere(): Promise<Who> {
  try {
    const session = await withTimeout(authClient.getSession(), 8000);
    if (session.error && (!session.error.status || session.error.status >= 500)) return { kind: "offline" };
    if (!session.data) return { kind: "signedOut" };
    const { data } = await withTimeout(authClient.convex.token({ fetchOptions: { throw: false } }), 8000);
    return data?.token ? { kind: "token", token: data.token } : { kind: "offline" };
  } catch {
    return { kind: "offline" };
  }
}

async function request(path: string): Promise<Reply> {
  const who = await whoIsHere();
  if (who.kind !== "token") return who;
  try {
    const res = await withTimeout(fetch(path, { headers: { authorization: "Bearer " + who.token }, cache: "no-store", credentials: "omit" }), 30000);
    return { kind: "res", res };
  } catch {
    return { kind: "offline" };
  }
}

// Says what went wrong in kind words. True when it handled the reply (so the caller stops), false for an answer it did not
// expect to be a problem (a good one, or a 404 the caller words itself).
async function problem(reply: Reply, retry: () => void, notFound?: string): Promise<boolean> {
  if (reply.kind === "offline") {
    show("signOut", true);
    say("We could not reach DhiRise. Please check your connection and try again.", { bad: true, retry });
    return true;
  }
  if (reply.kind === "signedOut") {
    showSignIn();
    return true;
  }
  const { status } = reply.res;
  if (status === 401) {
    showSignIn("Your sign in has ended. Please sign in again.");
    return true;
  }
  show("signOut", true);
  if (status === 403) {
    show("listBox", false);
    show("viewerBox", false);
    say("This Google account is not on the DhiRise team list. Please sign out and use a different account.", { bad: true });
    return true;
  }
  if (status === 404 && notFound) {
    show("viewerBox", false);
    show("backBox", page === "report");
    say(notFound, { bad: false });
    return true;
  }
  if (status === 429) {
    let words = "You have opened the most reports allowed in one hour. Please try again a little later.";
    try {
      const body = (await reply.res.json()) as { message?: unknown };
      if (typeof body.message === "string") words = body.message;
    } catch {
      /* keep the plain words */
    }
    show("viewerBox", false);
    show("backBox", page === "report");
    say(words, { bad: true });
    return true;
  }
  if (!reply.res.ok) {
    say(status === 400 ? "That request was not valid. Please reload the page." : "Something went wrong on our side. Please try again in a little while.", { bad: true, retry });
    return true;
  }
  return false;
}

// ---------- the list ----------

const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

function parseRows(body: unknown): { rows: Row[]; next: string | null } | null {
  const b = body as { rows?: unknown; next?: unknown } | null;
  if (!b || !Array.isArray(b.rows) || (b.next !== null && typeof b.next !== "string")) return null;
  const rows: Row[] = [];
  for (const r of b.rows as Record<string, unknown>[]) {
    if (r && typeof r.studentId === "string" && typeof r.name === "string" && typeof r.class === "string" && typeof r.madeAt === "number") {
      rows.push({ studentId: r.studentId, name: r.name, class: r.class, madeAt: r.madeAt, avatar: typeof r.avatar === "string" ? r.avatar : null });
    }
  }
  return { rows, next: b.next as string | null };
}

function rowElement(r: Row): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "tt-row";
  const who = document.createElement("div");
  who.className = "tt-who";
  const name = document.createElement("span");
  name.className = "tt-name";
  name.textContent = r.name;
  const meta = document.createElement("span");
  meta.className = "tt-meta";
  meta.textContent = `${r.class} · ${when.format(new Date(r.madeAt))}`;
  who.append(name, meta);
  const lead = document.createElement("div");
  lead.className = "tt-lead";
  const face = circle(r.avatar, r.name, 28, true);
  if (face) lead.append(face);
  lead.append(who);
  const open = document.createElement("a");
  open.className = "tt-btn main";
  open.href = "team-report.html?s=" + encodeURIComponent(r.studentId);
  open.target = "_blank";
  open.rel = "noopener";
  open.textContent = "Open";
  open.setAttribute("aria-label", "Open the saved report of " + r.name);
  li.append(lead, open);
  return li;
}

function startList(): void {
  let next: string | null = null;
  let finding = false;
  let ticket = 0; // an older answer that arrives late never overwrites a newer one
  const rows = $("rows") as HTMLUListElement;
  const more = $<HTMLButtonElement>("more") as HTMLButtonElement;

  async function load(append: boolean, ref: string | null): Promise<void> {
    const mine = ++ticket;
    more.disabled = true;
    const query = ref !== null ? "ref=" + encodeURIComponent(ref) : append && next ? "cursor=" + encodeURIComponent(next) : "";
    const reply = await request("/api/team/list" + (query ? "?" + query : ""));
    if (mine !== ticket) return;
    more.disabled = false;
    if (await problem(reply, () => void load(append, ref))) return;
    const parsed = parseRows(await (reply as { res: Response }).res.json().catch(() => null));
    if (!parsed) return say("Something went wrong on our side. Please try again in a little while.", { bad: true, retry: () => void load(append, ref) });
    show("signOut", true);
    show("signInBox", false);
    show("listBox", true);
    if (!append) rows.replaceChildren();
    for (const r of parsed.rows) rows.append(rowElement(r));
    next = parsed.next;
    more.hidden = next === null;
    show("showAll", finding);
    if (ref !== null) say(parsed.rows.length ? null : "No saved report found");
    else say(rows.children.length ? null : "No saved reports yet.");
  }

  $("find")?.addEventListener("submit", (e) => {
    e.preventDefault();
    finding = true;
    more.hidden = true;
    void load(false, ($<HTMLInputElement>("ref")?.value ?? "").trim());
  });
  $("showAll")?.addEventListener("click", () => {
    finding = false;
    const box = $<HTMLInputElement>("ref");
    if (box) box.value = "";
    void load(false, null);
  });
  more.addEventListener("click", () => void load(true, null));
  void load(false, null);
}

// ---------- the viewer ----------

function startViewer(): void {
  // Who the report is of: the same one-row answer the list gives for a code (it is not audited, only served PDFs are). It sits above
  // the PDF as a 40px circle, the name and the class. Nothing is shown if it cannot be had: the report itself does not wait for it.
  async function showWho(): Promise<void> {
    const reply = await request("/api/team/list?ref=" + encodeURIComponent(code));
    if (reply.kind !== "res" || !reply.res.ok) return;
    const r = parseRows(await reply.res.json().catch(() => null))?.rows[0];
    const bar = $("who");
    if (!r || !bar) return;
    const text = document.createElement("div");
    text.className = "tt-who";
    const name = document.createElement("span");
    name.className = "tt-name";
    name.textContent = r.name;
    const meta = document.createElement("span");
    meta.className = "tt-meta";
    meta.textContent = r.class;
    text.append(name, meta);
    const face = circle(r.avatar, r.name, 40);
    bar.replaceChildren(...(face ? [face, text] : [text]));
    bar.hidden = false;
  }

  async function open(): Promise<void> {
    say("Opening the saved report…");
    const reply = await request("/api/team/report?s=" + encodeURIComponent(code));
    if (await problem(reply, () => void open(), "This report copy is not ready.")) return;
    const res = (reply as { res: Response }).res;
    const bytes = await res.arrayBuffer().catch(() => null);
    if (!bytes || new TextDecoder().decode(bytes.slice(0, PDF_MAGIC.length)) !== PDF_MAGIC) {
      return say("This file could not be shown. Please try again in a little while.", { bad: true, retry: () => void open() });
    }
    const name = /filename="([A-Za-z0-9._-]{1,80})"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "DhiRise-report.pdf";
    const href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    // The viewer opens fit to the page width with its thumbnail sidebar closed, so the report gets the whole window.
    // (Chrome and Edge read these open parameters from the address; other browsers show their own default view.)
    ($("pdf") as HTMLIFrameElement).src = href + PDF_VIEW;
    const full = $<HTMLAnchorElement>("fullscreen");
    if (full) full.href = href + "#view=FitH"; // its own tab, in the browser's full PDF viewer
    $("download")?.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.style.display = "none";
      document.body.append(a);
      a.click();
      a.remove();
    });
    show("signOut", true);
    show("signInBox", false);
    show("backBox", false);
    show("viewerBox", true);
    say(null);
  }
  void showWho();
  void open();
}

// ---------- start ----------

$("signIn")?.addEventListener("click", () => void signInWithGoogle());
$("signOut")?.addEventListener("click", () => void signOut());

declare global {
  interface Window {
    DhiTeam: { testSignIn: typeof testSignIn };
  }
}
window.DhiTeam = { testSignIn };

if (params.get("signin") === "error") {
  showSignIn("Google did not let you in. Please try again, or use a different Google account.");
} else {
  void whoIsHere().then((who) => {
    if (who.kind === "signedOut") return showSignIn();
    if (page === "report") startViewer();
    else startList();
  });
}
