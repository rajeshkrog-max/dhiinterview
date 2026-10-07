/* Dhirise · funnel settings: EXAMPLE. Copy the values you need into js/funnel-config.js (the file the pages load).
   Keep real links out of the public repo if you don't want them public; empty values are simply skipped.
   whatsappInvite:   the WhatsApp group invite link for Dhi early access.
   leadEndpoint:     the Google Apps Script web app URL from tools/LEAD-SHEET-SETUP.md (or your own API), receives the lead POST.
   feedbackEndpoint: where report feedback goes; usually the same web app URL (it writes to a "Feedback" tab).
   shareUrl:         the public link printed small on the Founding Card (e.g. https://dhirise.com); empty shows nothing. */
window.DHI_FUNNEL = {
  whatsappInvite: "https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXXXX",
  leadEndpoint: "https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec",
  feedbackEndpoint: "https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXXXXXX/exec",
  shareUrl: "https://dhirise.com"
};
