// The browser bridge (spec 0002). Exposes `window.DhiSession` to the classic page scripts, and is the page guard.
//
// What it owns:
//  - who is here: `loading` → `signedOut` | `needsProfile` | `ready` (never redirects while still `loading`)
//  - the page guard: hides a protected page until the state is known, sends a definite `signedOut` or
//    `needsProfile` visitor to landing, then lets the page's own scripts run
//  - the local copy of the check (dhirise.session.v1) and the per question queue of unsent answers
//  - sign in, sign out ("Not you"), creating the profile, finishing, the one time import of old answers
//
// Page scripts are written as <script type="text/dhi-deferred" src="...">; this file starts them, in order,
// once the guard has let the page through. Sign in itself goes through the site's own /api/auth/* address.
import { ConvexClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { CONSENT_TEXTS, CONSENT_VERSION, LEAD_CONSENT_VERSION, consentHash } from "../../convex/consentText";
import { MIN_NOTE_CHARS, isGenuine } from "../../convex/feedbackRules";
import { authClient, createConvexClient } from "./auth-client";
import {
  OLD_CHECK_KEY,
  OWNER_KEY,
  REF_KEY,
  SESSION_KEY,
  readJSON,
  readString,
  remove,
  syncKey,
  wipeStudentData,
  writeJSON,
} from "./local";

type Mode = "protected" | "landing" | "public";
type StudentClass = "Class 8" | "Class 9" | "Class 10" | "Class 11" | "Class 12" | "College";
type MeAnswer =
  | { state: "signedOut" }
  | { state: "needsProfile"; googleName: string }
  | {
      state: "ready";
      student: { name: string; age: number; class: StudentClass };
      check: {
        seed: string;
        startedAt: number;
        completedAt: number | null;
        reportSeenAt: number | null;
        leadSavedAt: number | null;
        feedbackSavedAt: number | null;
        answers: Record<string, string>;
      };
    };

// `unknown` = signed in as far as we can tell, but the server could not be reached (offline).
export type SessionState = "loading" | "signedOut" | "needsProfile" | "ready" | "unknown";

type Cached = {
  v: 1;
  owner: string;
  profile: { name: string; age: number; class: StudentClass };
  seed: string;
  startedAt: string;
  completedAt: string | null;
  reportSeenAt: string | null;
  leadSavedAt: string | null;
  feedbackSavedAt: string | null;
  answers: Record<string, string>;
};
type QueueEntry = { optionId: string; answeredAt: number; synced: boolean };
type Queue = Record<string, QueueEntry>;
export type SyncStatus = "saving" | "saved" | "offline" | "signin" | "dropped";

const LANDING = "landing.html";
const TOTAL = 18;
const html = document.documentElement;
const mode = (html.dataset.dhiGuard as Mode | undefined) ?? "public";

let state: SessionState = "loading";
let googleName = "";
let authUserId: string | null = readString(OWNER_KEY);
let client: ConvexClient | null = null;
let clientReady: Promise<ConvexClient | null> | null = null;
let verified: Promise<SessionState> | null = null;
let paused = false;
let flushing: Promise<void> | null = null;
let failures = 0;
let retryTimer = 0;
const listeners = new Set<(s: SyncStatus, detail?: number) => void>();

// ---------- small helpers ----------

const codeOf = (e: unknown): string | null => {
  if (e instanceof ConvexError) {
    const data = e.data as { code?: unknown } | null;
    if (data && typeof data.code === "string") return data.code;
  }
  return null;
};

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });

const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
const emit = (s: SyncStatus, detail?: number) => listeners.forEach((fn) => fn(s, detail));
const readCache = (): Cached | null => {
  const c = readJSON<Cached>(SESSION_KEY);
  return c && c.v === 1 && c.profile && c.answers && c.seed ? c : null;
};
const readQueue = (id: string | null): Queue => (id ? (readJSON<Queue>(syncKey(id)) ?? {}) : {});
const writeQueue = (id: string, q: Queue) => (Object.keys(q).length ? writeJSON(syncKey(id), q) : remove(syncKey(id)));
const unsent = (q: Queue) => Object.entries(q).filter(([, e]) => !e.synced);

// ---------- the Convex client (created only when someone is signed in) ----------

function getClient(): Promise<ConvexClient | null> {
  if (clientReady) return clientReady;
  clientReady = new Promise<ConvexClient | null>((resolve) => {
    let settled = false;
    const c = createConvexClient((isAuthenticated) => {
      if (settled) return;
      settled = true;
      client = c;
      resolve(isAuthenticated ? c : null);
    });
    setTimeout(() => {
      if (settled) return;
      settled = true;
      client = c;
      resolve(null);
    }, 8000);
  });
  clientReady.then((c) => {
    if (!c) clientReady = null; // try again next time
  });
  return clientReady;
}

// ---------- who is here ----------

function applyMe(me: MeAnswer, uid: string): void {
  if (me.state === "ready") {
    const queue = readQueue(uid);
    const finished = me.check.completedAt !== null;
    const answers: Record<string, string> = { ...me.check.answers };
    for (const [q, e] of Object.entries(queue)) {
      if (e.synced || finished) delete queue[q]; // the server's value is the truth for anything already sent
      else answers["q" + q] = e.optionId; // an unsent local answer beats the server's value for that question
    }
    writeQueue(uid, queue);
    const cache: Cached = {
      v: 1,
      owner: uid,
      profile: me.student,
      seed: me.check.seed,
      startedAt: iso(me.check.startedAt) as string,
      completedAt: iso(me.check.completedAt),
      reportSeenAt: iso(me.check.reportSeenAt),
      leadSavedAt: iso(me.check.leadSavedAt),
      feedbackSavedAt: iso(me.check.feedbackSavedAt),
      answers,
    };
    writeJSON(SESSION_KEY, cache);
    state = "ready";
  } else if (me.state === "needsProfile") {
    googleName = me.googleName;
    remove(SESSION_KEY);
    state = "needsProfile";
  }
}

// Asks the session, then the server. Resolves to the final state; never throws.
function verify(): Promise<SessionState> {
  if (verified) return verified;
  verified = (async (): Promise<SessionState> => {
    let session: { user: { id: string } } | null;
    try {
      const res = await withTimeout(authClient.getSession(), 8000);
      if (res.error && (!res.error.status || res.error.status >= 500)) return (state = "unknown");
      session = (res.data as { user: { id: string } } | null) ?? null;
    } catch {
      return (state = "unknown");
    }
    if (!session) return (state = "signedOut");

    const uid = session.user.id;
    const previous = readString(OWNER_KEY);
    if (previous && previous !== uid) wipeStudentData(); // a different account never sees the last student's data
    try {
      localStorage.setItem(OWNER_KEY, uid);
    } catch {
      /* ignore */
    }
    authUserId = uid;

    const c = await getClient();
    if (!c) return (state = "unknown"); // a session exists but the server did not accept it (yet): never a redirect
    try {
      const me = (await withTimeout(c.query(api.students.me, {}), 10000)) as MeAnswer;
      if (me.state === "signedOut") return (state = "unknown");
      applyMe(me, uid);
      scheduleFlush(0);
      return state;
    } catch {
      return (state = "unknown");
    }
  })();
  return verified;
}

function resetVerification(): void {
  verified = null;
  state = "loading";
}

// ---------- the offline queue (rules: spec 0002, Feature design) ----------

function scheduleFlush(ms: number): void {
  clearTimeout(retryTimer);
  retryTimer = window.setTimeout(() => void flush(), ms);
}

function queueAnswer(n: number, optionId: string): void {
  if (!authUserId) return;
  const q = readQueue(authUserId);
  q[String(n)] = { optionId, answeredAt: Date.now(), synced: false };
  writeQueue(authUserId, q);
  emit("saving", unsent(q).length);
  scheduleFlush(0);
}

// Sends what is waiting. One call at a time. Never throws.
function flush(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      await runFlush();
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

async function runFlush(): Promise<void> {
  if (!authUserId || paused) return;
  const id = authUserId;
  if (unsent(readQueue(id)).length === 0) return;
  if (navigator.onLine === false) return emit("offline", unsent(readQueue(id)).length);

  if (state === "loading") await verify();
  if (state === "signedOut" || state === "needsProfile") {
    paused = true; // no session: wait for the student to sign in again
    return emit("signin");
  }
  const c = await getClient();
  if (!c) return retryLater();

  let batch = unsent(readQueue(id));
  while (batch.length) {
    const sent = batch.map(([q, e]) => ({ q: Number(q), optionId: e.optionId, answeredAt: e.answeredAt }));
    try {
      await withTimeout(c.mutation(api.checks.saveAnswers, { answers: sent }), 10000);
      markSynced(id, sent);
      failures = 0;
    } catch (e) {
      const code = codeOf(e);
      if (code === "not_signed_in" || code === "no_profile") {
        paused = true; // wait for the student to sign in again
        return emit("signin");
      }
      if (code === "check_completed") {
        dropEntries(id, sent.map((s) => s.q));
        return emit("dropped", sent.length);
      }
      if (code === "invalid_input") {
        // A batch is all or nothing: send each answer alone, drop the ones the server refuses.
        for (const one of sent) {
          try {
            await withTimeout(c.mutation(api.checks.saveAnswers, { answers: [one] }), 10000);
            markSynced(id, [one]);
          } catch (err) {
            if (codeOf(err) === null) return retryLater();
            dropEntries(id, [one.q]);
            emit("dropped", 1);
          }
        }
      } else {
        return retryLater(); // no network, timeout or an unexpected server error: try again with a growing pause
      }
    }
    batch = unsent(readQueue(id));
  }
  emit("saved", 0);
}

function retryLater(): void {
  failures += 1;
  const q = readQueue(authUserId);
  emit(navigator.onLine === false ? "offline" : "saving", unsent(q).length);
  scheduleFlush(Math.min(60000, 1000 * 2 ** Math.min(failures, 6)));
}

function markSynced(id: string, sent: { q: number; optionId: string; answeredAt: number }[]): void {
  const q = readQueue(id);
  for (const s of sent) {
    const e = q[String(s.q)];
    if (e && e.answeredAt === s.answeredAt && e.optionId === s.optionId) e.synced = true; // changed again meanwhile → still unsent
  }
  writeQueue(id, q);
}

function dropEntries(id: string, qs: number[]): void {
  const q = readQueue(id);
  for (const n of qs) delete q[String(n)];
  writeQueue(id, q);
}

window.addEventListener("online", () => {
  paused = false;
  scheduleFlush(0);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") scheduleFlush(0);
});

// ---------- public actions ----------

function pendingCount(): number {
  return unsent(readQueue(authUserId)).length;
}

// Waits for the queue to empty. True when everything is on the server.
async function drain(ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  paused = false;
  while (pendingCount() > 0 && Date.now() < end) {
    await flush();
    if (pendingCount() > 0) await new Promise((r) => setTimeout(r, 400));
  }
  return pendingCount() === 0;
}

async function finish(): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!(await drain(8000))) return { ok: false, code: navigator.onLine === false ? "offline" : "unsent" };
  const c = await getClient();
  if (!c) return { ok: false, code: "offline" };
  try {
    const res = await withTimeout(c.mutation(api.checks.complete, {}), 10000);
    const cache = readCache();
    if (cache) writeJSON(SESSION_KEY, { ...cache, completedAt: iso(res.completedAt) });
    return { ok: true };
  } catch (e) {
    return { ok: false, code: codeOf(e) ?? "offline" };
  }
}

async function markReportSeen(): Promise<void> {
  const cache = readCache();
  if (!cache || !cache.completedAt || cache.reportSeenAt) return;
  const c = await getClient();
  if (!c) return;
  try {
    const res = await withTimeout(c.mutation(api.checks.markReportSeen, {}), 10000);
    const now = readCache();
    if (now) writeJSON(SESSION_KEY, { ...now, reportSeenAt: iso(res.reportSeenAt) });
  } catch {
    /* it is only a resume hint; the next visit tries again */
  }
}

type ProfileForm = { name: string; age: number; class: string; guardianPresent: boolean; referralCode?: string };

async function createProfile(form: ProfileForm): Promise<{ ok: true } | { ok: false; code: string }> {
  const c = await getClient();
  if (!c) return { ok: false, code: "offline" };
  try {
    await withTimeout(
      c.mutation(api.students.createProfile, {
        name: form.name,
        age: form.age,
        class: form.class as StudentClass,
        guardianPresent: form.guardianPresent,
        consent: { version: CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[CONSENT_VERSION]) },
        ...(form.referralCode ? { referralCode: form.referralCode } : {}),
      }),
      15000,
    );
    remove(REF_KEY); // sent once, then cleared
    resetVerification();
    await verify();
    return state === "ready" ? { ok: true } : { ok: false, code: "offline" };
  } catch (e) {
    return { ok: false, code: codeOf(e) ?? "offline" };
  }
}

// ---------- the phone step and the report feedback (spec 0003) ----------

type SaveResult<T> = ({ ok: true } & T) | { ok: false; code: string };

// Writes one field of the cached check, so a gate on another page sees it at once. The next `me` replaces it with the server's value.
function stampCache(field: "leadSavedAt" | "feedbackSavedAt" | "reportSeenAt", at: number): void {
  const cache = readCache();
  if (cache) writeJSON(SESSION_KEY, { ...cache, [field]: iso(at) });
}

type LeadForm = { phone: string; wantsCommunity: boolean; guardianPresent: boolean };

// Saves the phone step. The thank you shows only after this says ok. A network failure is code "offline" and changes nothing.
async function submitLead(form: LeadForm): Promise<SaveResult<{ alreadySaved: boolean }>> {
  const c = await getClient();
  if (!c) return { ok: false, code: "offline" };
  try {
    const res = await withTimeout(
      c.mutation(api.leads.submit, {
        phone: form.phone,
        wantsCommunity: form.wantsCommunity,
        guardianPresent: form.guardianPresent,
        consent: { version: LEAD_CONSENT_VERSION, hash: await consentHash(CONSENT_TEXTS[LEAD_CONSENT_VERSION]) },
      }),
      15000,
    );
    if (!res.ok) return { ok: false, code: res.code };
    stampCache("leadSavedAt", Date.now());
    return { ok: true, alreadySaved: res.alreadySaved };
  } catch (e) {
    return { ok: false, code: codeOf(e) ?? "offline" };
  }
}

type FeedbackForm = { rating: number; text: string; canShare: boolean };

// Saves the report feedback. The server wants the report marked as seen first, so a failed earlier mark does not block this.
async function submitFeedback(form: FeedbackForm): Promise<SaveResult<{ alreadySaved: boolean; genuine: boolean }>> {
  const c = await getClient();
  if (!c) return { ok: false, code: "offline" };
  try {
    if (!readCache()?.reportSeenAt) {
      const seen = await withTimeout(c.mutation(api.checks.markReportSeen, {}), 10000);
      stampCache("reportSeenAt", seen.reportSeenAt);
    }
    const res = await withTimeout(c.mutation(api.feedback.submit, { rating: form.rating, text: form.text, canShare: form.canShare }), 15000);
    if (!res.ok) return { ok: false, code: res.code };
    stampCache("feedbackSavedAt", Date.now());
    return { ok: true, alreadySaved: res.alreadySaved, genuine: res.genuine };
  } catch (e) {
    return { ok: false, code: codeOf(e) ?? "offline" };
  }
}

const BLOCKED_UA = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|MicroMessenger|Twitter|LinkedInApp|Pinterest|TikTok|musical_ly|; wv\)/i;
function isBlockedBrowser(): boolean {
  const ua = navigator.userAgent;
  if (BLOCKED_UA.test(ua)) return true;
  return /iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/.test(ua); // an iOS web view
}

async function signInWithGoogle(): Promise<void> {
  const here = location.pathname;
  await authClient.signIn.social({ provider: "google", callbackURL: `${here}?signin=1`, errorCallbackURL: `${here}?signin=error` });
}

// Fake sign in for automated tests. The server refuses it unless TEST_SIGNIN_ENABLED is set (dev and preview only).
async function testSignIn(email: string): Promise<{ ok: boolean; message?: string }> {
  const password = "test-pass-12345";
  const first = await authClient.signIn.email({ email, password });
  if (first.error) {
    const second = await authClient.signUp.email({ email, password, name: "Test Student" });
    if (second.error) return { ok: false, message: second.error.message || String(second.error.status) };
  }
  resetVerification();
  return { ok: true };
}

// True only when the server session is really over: the sign out call worked, or the server confirms there is
// no session any more. A network failure is NOT "already signed out": the cookie would stay valid for the next person.
async function endServerSession(): Promise<boolean> {
  try {
    const res = await withTimeout(authClient.signOut(), 8000);
    if (!res.error) return true;
  } catch {
    /* fall through to the check below */
  }
  try {
    const res = await withTimeout(authClient.getSession(), 5000);
    return !res.error && !res.data;
  } catch {
    return false;
  }
}

async function signOut(force: boolean): Promise<{ ok: true } | { ok: false; unsent: number } | { ok: false; offline: true }> {
  if (pendingCount() > 0) await drain(3000);
  const left = pendingCount();
  if (left > 0 && !force) return { ok: false, unsent: left };
  // End the session first. If that cannot be confirmed (offline), change nothing on this device and say so.
  if (!(await endServerSession())) return { ok: false, offline: true };
  client?.close();
  client = null;
  clientReady = null;
  wipeStudentData();
  authUserId = null;
  paused = false;
  resetVerification();
  state = "signedOut";
  verified = Promise.resolve("signedOut");
  return { ok: true };
}

// ---------- the one time import of answers the old stub kept in the browser (AC-11) ----------

function oldAnswers(): Record<string, string> | null {
  const old = readJSON<{ answers?: Record<string, unknown> }>(OLD_CHECK_KEY);
  if (!old || !old.answers || typeof old.answers !== "object") return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(old.answers)) {
    const m = /^q(\d{1,2})$/.exec(k);
    const q = m ? Number(m[1]) : NaN;
    // only well formed answers go to the server: the exact key q<q> and an option id q<q>o<1 to 4>, no padding
    if (m && k === `q${q}` && q >= 1 && q <= TOTAL && typeof v === "string" && new RegExp(`^q${q}o[1-4]$`).test(v)) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

async function importOld(): Promise<{ ok: boolean }> {
  const answers = oldAnswers();
  remove(OLD_CHECK_KEY); // yes or no, the old key goes and the question is never asked again
  if (!answers) return { ok: true };
  const c = await getClient();
  if (!c) return { ok: false };
  try {
    await withTimeout(c.mutation(api.checks.importLocal, { answers }), 10000);
    resetVerification();
    await verify();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ---------- the page guard ----------

function startPageScripts(): Promise<void> {
  const tags = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="text/dhi-deferred"]'));
  return tags.reduce(
    (chain, tag) =>
      chain.then(
        () =>
          new Promise<void>((resolve) => {
            const s = document.createElement("script");
            if (tag.src) {
              s.src = tag.src;
              s.onload = () => resolve();
              s.onerror = () => resolve();
            } else {
              s.textContent = tag.textContent;
            }
            tag.replaceWith(s);
            if (!tag.src) resolve();
          }),
      ),
    Promise.resolve(),
  );
}

function reveal(): void {
  html.classList.remove("dhi-pending");
  document.getElementById("dhiBoot")?.remove();
}

function showRetry(): void {
  const box = document.getElementById("dhiBoot");
  if (box) {
    box.hidden = false;
    box.innerHTML =
      '<p>We could not reach DhiRise. Please check your connection.</p><button type="button" id="dhiRetry">Try again</button>';
    document.getElementById("dhiRetry")?.addEventListener("click", () => location.reload());
  }
}

// The small "Saving / Saved" mark on the question pages.
function installSaveMark(): void {
  if (!document.getElementById("options")) return;
  const mark = document.createElement("div");
  mark.id = "dhiSaveMark";
  mark.setAttribute("role", "status");
  mark.setAttribute("aria-live", "polite");
  const style = document.createElement("style");
  style.textContent =
    "#dhiSaveMark{position:fixed;left:50%;bottom:calc(8px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:5;" +
    "font:500 12px/1.2 system-ui,sans-serif;color:rgba(255,255,255,.7);background:rgba(22,18,43,.55);padding:4px 10px;border-radius:999px;" +
    "pointer-events:none;opacity:0;transition:opacity .25s}#dhiSaveMark.on{opacity:1}";
  document.head.appendChild(style);
  document.body.appendChild(mark);
  let hide = 0;
  listeners.add((s, n) => {
    clearTimeout(hide);
    const text =
      s === "saving" ? "Saving…" : s === "saved" ? "Saved" : s === "offline" ? "Offline. Your answers are kept here." : s === "signin" ? "Please sign in again to save." : "";
    if (s === "dropped") {
      mark.textContent = n === 1 ? "One answer could not be saved." : "Some answers could not be saved.";
    } else {
      mark.textContent = text;
    }
    mark.classList.add("on");
    if (s === "saved" || s === "dropped") hide = window.setTimeout(() => mark.classList.remove("on"), 1600);
  });
}

async function runGuard(): Promise<void> {
  if (mode === "public") return;
  if (mode === "landing") {
    // landing paints itself once `ready()` answers (js/gate.js), then calls reveal()
    await startPageScripts();
    return;
  }

  const cache = readCache();
  // With a local copy, wait a moment for the server; if it is slow or offline, carry on from the copy (AC-16).
  const result = cache ? await Promise.race([verify(), new Promise<SessionState>((r) => setTimeout(() => r("ready"), 700))]) : await verify();

  if (result === "signedOut" || result === "needsProfile") {
    location.replace(LANDING);
    return;
  }
  if (result === "unknown" && !cache) {
    showRetry();
    return;
  }
  reveal();
  installSaveMark();
  await startPageScripts();
  // The server may disagree with what the copy said (a different account, or a session that ended).
  void verify().then((final) => {
    if (final === "signedOut" || final === "needsProfile") location.replace(LANDING);
    else if (final === "ready" && cache && cache.owner !== authUserId) location.reload();
  });
}

// "Not you" in another tab: leave this tab too.
window.addEventListener("storage", (e) => {
  if (e.key === OWNER_KEY && e.newValue === null && mode === "protected") location.replace(LANDING);
});

// ---------- what the page scripts see ----------

export const DhiSession = {
  mode,
  get state() {
    return state;
  },
  get googleName() {
    return googleName;
  },
  /** Resolves with the real state once the server has answered (or could not be reached). Never rejects. */
  ready: () => verify(),
  consent: { version: CONSENT_VERSION },
  isBlockedBrowser,
  signInWithGoogle,
  testSignIn,
  signOut,
  createProfile,
  queueAnswer,
  finish,
  markReportSeen,
  submitLead,
  submitFeedback,
  /** The same note rule the server uses (convex/feedbackRules.ts), so the page and the server cannot disagree. */
  isGenuine,
  minNoteChars: MIN_NOTE_CHARS,
  pendingCount,
  oldAnswers,
  importOld,
  dismissOld: () => remove(OLD_CHECK_KEY),
  onStatus: (fn: (s: SyncStatus, detail?: number) => void) => listeners.add(fn),
  hasCache: () => readCache() !== null,
  /** The cached student, for "Continue as" when the server cannot be reached. */
  cachedName: () => readCache()?.profile.name ?? null,
  reveal,
};

declare global {
  interface Window {
    DhiSession: typeof DhiSession;
  }
}
window.DhiSession = DhiSession;

void runGuard();
