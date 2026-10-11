// The consent text, once. Convex checks a student's consent against this copy, and the pages draw the text
// from the same lines (landing.astro and done.astro), so the two can never drift apart.
// Never edit a version's text in place: a change of wording is a new version, because a consent row points
// at the exact text the student agreed to. Wording owner: scope row 18 (spec 0002 and 0003, follow up).
// Every version belongs to one kind (spec 0003, AC-14): the landing text works only for creating a profile,
// and the phone text works only for a lead, so the two cannot be swapped.

export type ConsentKind = "landing" | "lead" | "share" | "challenge";

// v1 is frozen: consent rows already saved point at its exact text. Never edit it.
export const CONSENT_VERSION_V1 = "v1";

export const CONSENT_LINES_V1: readonly string[] = [
  "DhiRise collects your name, age, class, and the Google account you use to continue. We use these to create your study profile, save your check, and send you the result.",
  "If you are under 18, a parent or guardian must be with you and must agree. Do not continue alone.",
  "Your answers are used only to prepare your study picture and to improve this check. We do not sell your data.",
  "You may withdraw this consent, correct your details, or request erasure by writing to the address below. Withdrawal does not affect a result already prepared. Grievance contact: privacy@dhirise.com",
  "By tapping I agree, you confirm that you have read this notice, and that a parent or guardian has agreed if you are under 18.",
];

// v2 is frozen: consent rows already saved point at its exact text. Never edit it. It is v1 plus one line that names Cloudflare
// Browser Run, which draws the saved PDF copy of the report (scope row 25, spec 0006).
export const CONSENT_VERSION_V2 = "v2";

export const CONSENT_LINES_V2: readonly string[] = [
  ...CONSENT_LINES_V1.slice(0, 3),
  "To save a PDF copy of your report, DhiRise uses Cloudflare Browser Run. It opens our own report page on Cloudflare's servers and prints it to a PDF, so your report data passes through Cloudflare for that. We keep the PDF so you can download it.",
  ...CONSENT_LINES_V1.slice(3),
];

// v3 is frozen: consent rows already saved point at its exact text. Never edit it. It is v2 plus one line that says named members of the
// DhiRise team can open a report, and that each open is recorded (scope row 23, spec 0008). The owner approved these exact words.
export const CONSENT_VERSION_V3 = "v3";

export const CONSENT_LINES_V3: readonly string[] = [
  ...CONSENT_LINES_V2.slice(0, 4),
  "Named members of the DhiRise team can open your report to help you. Each time one does, we record who opened it and when.",
  ...CONSENT_LINES_V2.slice(4),
];

// v4 (scope row 30, spec 0011): v3 plus one line that names the saved Google profile picture and where it shows. DRAFT WORDS: the owner has
// not approved them yet (a launch blocker in spec 0011, follow up). In the asked mode (`PICTURE_CONSENT_REQUIRED` set), students who agreed under v1 to
// v3 are asked once, in a notice, before any picture is fetched or shown; in the default mode nobody is asked (the privacy page tells them).
export const CONSENT_VERSION = "v4";

export const CONSENT_LINES: readonly string[] = [
  ...CONSENT_LINES_V3.slice(0, 4),
  "DhiRise also saves the small profile picture from your Google account, and shows it next to your name on your screens, on your report, on the leaderboard and on any report link you share. You can remove it at any time.",
  ...CONSENT_LINES_V3.slice(4),
];

// The versions whose text names the saved profile picture (spec 0011, AC-1 and AC-15). A student has agreed to the picture when their
// newest landing consent is one of these. Version strings are never compared by order. A later version that still names the picture is
// added here; a test fails if a later version drops the picture line.
export const PICTURE_CONSENT_VERSIONS: readonly string[] = [CONSENT_VERSION];
export const PICTURE_LINE_MARK = "saves the small profile picture from your Google account";

// The phone step on done.html. The wording is a placeholder until the privacy page owner signs it off (spec 0003, follow up).
export const LEAD_CONSENT_VERSION = "lead-v1";

export const LEAD_CONSENT_LINES: readonly string[] = [
  "DhiRise will use your mobile number to message you about your result and about the Dhi app. If the WhatsApp box is ticked, we will also add this number to the Dhi early access group on WhatsApp.",
  "If you are under 18, a parent or guardian must agree to this.",
  "We do not sell your number. You may withdraw this consent, correct your number, or request erasure by writing to privacy@dhirise.com.",
  "By tapping Submit, you confirm that you have read this notice, and that a parent or guardian has agreed if you are under 18.",
];

// The notice before a student's first private report link (spec 0010, AC-3). The owner approved these words in chat on 2026-10-11
// ("I approve things as of now"); a change to a word is a new version. The same lines are drawn in the notice and hashed by the server. The kind `share` works only for a link:
// the landing and phone texts cannot stand in for it. A student under 18 also ticks SHARE_GUARDIAN_TICK, which is kept as `guardianPresent`.
export const SHARE_CONSENT_VERSION = "share-v1";

export const SHARE_CONSENT_LINES: readonly string[] = [
  "When you share, DhiRise makes a private link to your report. Anyone who has the link can read your whole report and see your first name and your profile picture, and they can copy the link to others.",
  "They cannot see your age, class, email, phone number or your private notes.",
  "You can turn the link off at any time with Stop sharing, and it ends by itself after 90 days.",
];

export const SHARE_GUARDIAN_TICK = "I have checked with a parent or guardian.";

// The rules a student agrees to when joining the Founding Circle Challenge (spec 0017, AC-3). DRAFT WORDS: the owner has not approved them yet
// (spec 0015, follow up), so do not turn CHALLENGE_LIVE on in production before they do. A change of wording after the first use is a new
// version, because a consent row points at the exact text. The kind `challenge` works only for joining. A student under 18 also ticks
// CHALLENGE_PARENT_TICK, which is kept as `guardianPresent`. The prize amount is not written here, so it cannot drift from src/lib/prize.ts.
export const CHALLENGE_CONSENT_VERSION = "challenge-v1";

export const CHALLENGE_CONSENT_LINES: readonly string[] = [
  "The Founding Circle Challenge is a contest. The student whose friends complete the DhiRise check the most times by 11:59 pm India time on 30 October 2026 wins one gift hamper. The prize cannot be swapped for cash.",
  "A friend counts only when they are new to DhiRise, sign in with your code, finish all 18 questions, see their report and leave a real note about it. The DhiRise team checks the top 10 by hand before a winner is announced.",
  "Other students can see your first name, the first letter of your last name, your class and your style on the leaderboard. You can choose to show as Anonymous instead, and you can leave the challenge at any time.",
  "If you are under 18, a parent or guardian must agree before you join.",
];

export const CHALLENGE_RULES_TICK = "I agree to the rules.";
export const CHALLENGE_PARENT_TICK = "My parent or guardian agrees.";

// Every known version, by version string. Add a new key for new wording; keep the old ones.
export const CONSENT_TEXTS: Readonly<Record<string, string>> = {
  [CONSENT_VERSION_V1]: CONSENT_LINES_V1.join("\n\n"),
  [CONSENT_VERSION_V2]: CONSENT_LINES_V2.join("\n\n"),
  [CONSENT_VERSION_V3]: CONSENT_LINES_V3.join("\n\n"),
  [CONSENT_VERSION]: CONSENT_LINES.join("\n\n"),
  [LEAD_CONSENT_VERSION]: LEAD_CONSENT_LINES.join("\n\n"),
  [SHARE_CONSENT_VERSION]: SHARE_CONSENT_LINES.join("\n\n"),
  [CHALLENGE_CONSENT_VERSION]: CHALLENGE_CONSENT_LINES.join("\n\n"),
};

// The kind each version belongs to.
export const CONSENT_KINDS: Readonly<Record<string, ConsentKind>> = {
  [CONSENT_VERSION_V1]: "landing",
  [CONSENT_VERSION_V2]: "landing",
  [CONSENT_VERSION_V3]: "landing",
  [CONSENT_VERSION]: "landing",
  [LEAD_CONSENT_VERSION]: "lead",
  [SHARE_CONSENT_VERSION]: "share",
  [CHALLENGE_CONSENT_VERSION]: "challenge",
};

// SHA 256 of the text with line endings turned into \n, as lowercase hex. Same code in the page and on the server.
export async function consentHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text.replace(/\r\n?/g, "\n"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
