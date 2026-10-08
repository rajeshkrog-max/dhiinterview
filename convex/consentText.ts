// The consent text, once. Convex checks a student's consent against this copy, and the pages draw the text
// from the same lines (landing.astro and done.astro), so the two can never drift apart.
// Never edit a version's text in place: a change of wording is a new version, because a consent row points
// at the exact text the student agreed to. Wording owner: scope row 18 (spec 0002 and 0003, follow up).
// Every version belongs to one kind (spec 0003, AC-14): the landing text works only for creating a profile,
// and the phone text works only for a lead, so the two cannot be swapped.

export type ConsentKind = "landing" | "lead";

export const CONSENT_VERSION = "v1";

export const CONSENT_LINES: readonly string[] = [
  "DhiRise collects your name, age, class, and the Google account you use to continue. We use these to create your study profile, save your check, and send you the result.",
  "If you are under 18, a parent or guardian must be with you and must agree. Do not continue alone.",
  "Your answers are used only to prepare your study picture and to improve this check. We do not sell your data.",
  "You may withdraw this consent, correct your details, or request erasure by writing to the address below. Withdrawal does not affect a result already prepared. Grievance contact: privacy@dhirise.com",
  "By tapping I agree, you confirm that you have read this notice, and that a parent or guardian has agreed if you are under 18.",
];

// The phone step on done.html. The wording is a placeholder until the privacy page owner signs it off (spec 0003, follow up).
export const LEAD_CONSENT_VERSION = "lead-v1";

export const LEAD_CONSENT_LINES: readonly string[] = [
  "DhiRise will use your mobile number to message you about your result and about the Dhi app. If the WhatsApp box is ticked, we will also add this number to the Dhi early access group on WhatsApp.",
  "If you are under 18, a parent or guardian must agree to this.",
  "We do not sell your number. You may withdraw this consent, correct your number, or request erasure by writing to privacy@dhirise.com.",
  "By tapping Submit, you confirm that you have read this notice, and that a parent or guardian has agreed if you are under 18.",
];

// Every known version, by version string. Add a new key for new wording; keep the old ones.
export const CONSENT_TEXTS: Readonly<Record<string, string>> = {
  [CONSENT_VERSION]: CONSENT_LINES.join("\n\n"),
  [LEAD_CONSENT_VERSION]: LEAD_CONSENT_LINES.join("\n\n"),
};

// The kind each version belongs to.
export const CONSENT_KINDS: Readonly<Record<string, ConsentKind>> = {
  [CONSENT_VERSION]: "landing",
  [LEAD_CONSENT_VERSION]: "lead",
};

// SHA 256 of the text with line endings turned into \n, as lowercase hex. Same code in the page and on the server.
export async function consentHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text.replace(/\r\n?/g, "\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
