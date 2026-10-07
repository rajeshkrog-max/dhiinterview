/* DhiRise · Founding Circle Challenge settings. Read by js/api.js and the challenge screens.
   endsAt is IST (+05:30). prize.image falls back to prize.imageFallback (a gold gift-box SVG) until the real photo is added. */
window.DHI_CHALLENGE = {
  name: "DhiRise Founding Circle Challenge",
  endsAt: "2026-10-30T23:59:00+05:30",
  prize: {
    title: "Gift hamper worth ₹2,999",
    items: ["Shoes", "Headphones", "Apparel"],
    image: "assets/challenge/prize.png",
    imageFallback: "assets/challenge/prize.svg"
  },
  minFeedbackChars: 30,
  leaderboardSize: 50,
  milestones: [1, 5, 10, 25],
  maxInviteShows: 2
};
