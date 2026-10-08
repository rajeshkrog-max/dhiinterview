// What this device remembers (spec 0002). Every key starts with "dhirise." and ends with a version.
// The server is the truth; these are a fast local copy so the quiz never waits for the network.
//
//   dhirise.session.v1        the cached summary of the signed in student's check (read by js/engine/store.js)
//   dhirise.owner.v1          the Better Auth user id whose data this device holds
//   dhirise.sync.v1.<id>      answers not yet confirmed by the server, one entry per question
//   dhirise.check.v1          the OLD stub's check (before sign in existed); only read for the one time import
//   dhirise.ref.v1            a referral code from ?ref=, kept across the Google trip
//   dhirise.music.*           the music setting, which survives everything

export const SESSION_KEY = "dhirise.session.v1";
export const OWNER_KEY = "dhirise.owner.v1";
export const OLD_CHECK_KEY = "dhirise.check.v1";
export const REF_KEY = "dhirise.ref.v1";
export const syncKey = (authUserId: string) => `dhirise.sync.v1.${authUserId}`;

export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the page still works from memory */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// Clears every "dhirise." key except the music setting and a referral code waiting for the Google trip
// (a referral code is not about any student). Used when a different account signs in and on "Not you".
export function wipeStudentData(): void {
  for (const store of [safe(() => localStorage), safe(() => sessionStorage)]) {
    if (!store) continue;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith("dhirise.") && !k.startsWith("dhirise.music") && k !== REF_KEY) keys.push(k);
    }
    for (const k of keys) {
      try {
        store.removeItem(k);
      } catch {
        /* ignore */
      }
    }
  }
}

function safe<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}
