// The shared site frame's constants (spec 0009). One place for what every frame page (404, privacy, terms, the two team pages)
// shows in its header and footer, so a change is one edit.
//  - HOME_PATH: where the logo and the 404 button go. The `.html` form is the one the dev server and every existing page use;
//    Cloudflare Pages answers it with one 308 to the clean address. It is the funnel's landing page, never `/`, so it keeps working
//    when the root address is handed to another product.
//  - FOOTER_LINKS: the footer's links, absolute addresses (a 404 can be served at any depth). Row 21 adds About here.
//  - PRIVACY_CONTACT: read from the consent text, so the footer, the privacy page and the notice a student agrees to cannot differ.
import { CONSENT_LINES } from "../../convex/consentText";

export const HOME_PATH = "/dhiinterviews/landing.html";

export const FOOTER_LINKS: readonly { label: string; href: string }[] = [
  { label: "Privacy", href: "/dhiinterviews/privacy.html" },
  { label: "Terms", href: "/dhiinterviews/terms.html" },
];

export const PRIVACY_CONTACT: string = /([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(CONSENT_LINES.join(" "))?.[1] ?? "privacy@dhirise.com";
