/* Dhirise · funnel settings: EXAMPLE. Copy the values you need into js/funnel-config.js (the file the pages load).
   Keep real links out of the public repo if you don't want them public; empty values are simply skipped.
   whatsappInvite:   the WhatsApp group invite link for Dhi early access.
   shareUrl:         the public link printed small on the Founding Card (e.g. https://dhirise.com); empty shows nothing.
   profilePicture:   the student's saved Google profile picture (or their initials) shows on their screens (spec 0011). It is on unless
                     this is exactly false. The server has its own switch, PROFILE_PICTURE_ENABLED (on unless "false").
   publicShare:      the private report link (spec 0010). OFF unless this is exactly true: no notice, no link and no Stop sharing line appear, and
                     the share buttons send the picture and the landing address. Leave it off in production until the owner has approved the
                     notice words and a lawyer has checked public sharing for under 18s. The server needs SHARE_LINK_SECRET set too. */
window.DHI_FUNNEL = {
  whatsappInvite: "https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXXXX",
  shareUrl: "https://dhirise.com",
  profilePicture: true,
  publicShare: false
};
