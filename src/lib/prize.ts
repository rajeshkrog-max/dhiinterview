// The prize wording the built (Astro) pages print. The browser screens read the same amount from
// DHI_CHALLENGE.prize.amount in public/dhiinterviews/js/challenge-config.js; tests/prize.test.js
// fails if the two ever differ. Change both together.
export const PRIZE_AMOUNT = "up to ₹5,000";
export const PRIZE_TITLE = `Gift hamper worth ${PRIZE_AMOUNT}`;
