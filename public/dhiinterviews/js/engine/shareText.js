/* Dhirise · every word of the share row, the notice dialog, the Instagram dialog and the Stop sharing line (spec 0010).
   Hangs one global on window: DhiShareText. Needs nothing loaded first; js/share-flow.js and js/card.js read it.
   The words of the notice a student agrees to are NOT here: they are the consent text in convex/consentText.ts, so the page and the server
   hash the same lines. Draft words, plain and kind; the owner approves them (spec 0010, follow up). {name} style placeholders are filled by the caller. */
(function (root) {
  "use strict";
  root.DhiShareText = {
    /* the text posted with the picture; {style} is the style name, {link} the address */
    postReport: "I'm a {style}! Here is my DhiRise report: {link}",
    postCheck: "I'm a {style}! Take your DhiRise check: {link}",
    shareTitle: "My DhiRise card",

    /* the notice dialog (the notice lines themselves are the consent text) */
    noticeTitle: "Before you share",
    noticeShare: "Share",
    noticeNotNow: "Not now",
    noticeNeedTick: "Please tick the box to continue.",
    noticeFailed: "We could not make your link just now. Please try again in a moment.",

    /* after the link is made: the first tap was used up by the notice, so the student taps again */
    ready: "Your report link is ready. Tap {net} again to share.",
    readyAny: "Your report link is ready. Tap Share again to send it.",

    /* a failure to make the link never stops the picture from being shared (AC-9) */
    linkFailed: "We could not add your report link, so only your card was shared.",
    consentChanged: "The sharing notice has changed. Please reload this page and try again.",

    /* what the picture buttons say once the picture is saved or the link is copied */
    toastWa: "Image saved. Attach it in your WhatsApp chat.",
    toastIg: "Saved! Open Instagram → Story → choose this image.",
    toastFb: "Image saved. Add it to your Facebook post.",
    toastIgCopied: "Picture shared and your report link is copied. Paste it in your story or caption.",
    toastShared: "Shared. Your report link is copied too. If the app left it out, paste it with your picture.",
    toastSaved: "Image saved. Attach it in any chat or post.",
    toastTextCopied: "Copied. Paste it in any chat.",

    /* the Copy link button: the student's own private report link, to paste anywhere (a chat, a post, a bio) */
    copyLabel: "Copy link",
    copyAria: "Copy my report link",
    copyButton: "Copy my report link",
    toastLinkCopied: "Your report link is copied. Paste it in any chat or post.",
    toastAddressCopied: "The DhiRise address is copied. Paste it in any chat or post.",
    toastCopyFailed: "Could not copy. Please try again.",
    readyCopy: "Your report link is ready. Tap Copy link again to copy it.",
    linkFailedCopy: "We could not make your report link, so the DhiRise address was copied instead.",

    /* the Instagram dialog on a computer (AC-2) */
    igTitle: "Post to Instagram from your phone",
    igBody: "Instagram does not take a post from a web page on a computer. Scan this code with your phone camera to open your report there, then tap Share. Your phone may ask you to sign in first.",
    igNoQr: "Instagram does not take a post from a web page on a computer. Copy your report address, open it on your phone, then tap Share. Your phone may ask you to sign in first.",
    igCopy: "Copy my report address",
    igCopied: "Address copied",
    igCopyFailed: "Could not copy. Select the address and copy it by hand.",
    igClose: "Close",
    igQrLabel: "QR code that opens your report on your phone",

    /* the Stop sharing line under the share row (AC-5, AC-18); {date} is written like 12 January 2027 in India time */
    controlOn: "Your link is on until {date} (India time).",
    controlLastDay: "Your link ends today.",
    controlStop: "Stop sharing",
    controlSure: "Anyone who has the link will no longer see your report.",
    controlConfirm: "Stop sharing",
    controlKeep: "Keep sharing",
    controlOff: "Sharing is off. Tap a button to make a new link.",
    controlFailed: "We could not stop sharing just now. Please try again."
  };
})(window);
