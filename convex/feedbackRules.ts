// The note rules, once (spec 0003, AC-9). Pure code with no imports: Convex checks every feedback note with it, and the
// report page uses the same module through DhiSession.isGenuine, so the page and the server cannot disagree.

export const MIN_NOTE_CHARS = 30;
export const MAX_NOTE_CHARS = 1000;
export const MIN_DISTINCT_LETTERS = 5;
export const MAX_REPEAT = 5; // this many of the same character in a row is a junk note

export function trimNote(raw: string): string {
  return raw.trim();
}

// Letters counted: a to z and Devanagari (the same set as the earlier mock in js/api.js).
function distinctLetters(text: string): number {
  const letters = text.toLowerCase().replace(/[^a-zऀ-ॿ]/g, "");
  return new Set(letters).size;
}

// True when the note is long enough, has enough different letters and no long run of one character.
// A note outside the length range is refused by the server before this is asked; here it is simply not genuine.
export function isGenuine(text: string): boolean {
  const t = trimNote(text);
  if (t.length < MIN_NOTE_CHARS || t.length > MAX_NOTE_CHARS) return false;
  if (distinctLetters(t) < MIN_DISTINCT_LETTERS) return false;
  return !new RegExp(`([\\s\\S])\\1{${MAX_REPEAT - 1}}`).test(t);
}

export function validRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}
