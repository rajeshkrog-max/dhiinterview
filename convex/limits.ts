// The per student call limits (spec 0003, AC-11), kept by the rate limiter component: 10 calls an hour for each of
// the two save functions. The key is always the student id found from the session, never anything the request sends.
// A function that throws rolls the count back too, so leads.submit and feedback.submit return a result object for
// every expected refusal (the count then stays), and throw only for not_signed_in and no_profile.
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  submitLead: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  submitFeedback: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
});
