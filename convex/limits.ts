// The per student call limits (spec 0003, AC-11), kept by the rate limiter component: 10 calls an hour for each of
// the two save functions. The key is always the student id found from the session, never anything the request sends.
// A function that throws rolls the count back too, so leads.submit and feedback.submit return a result object for
// every expected refusal (the count then stays), and throw only for not_signed_in and no_profile.
import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import { TEAM_OPEN_PER_HOUR } from "./teamCore";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  submitLead: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  submitFeedback: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  // The report copy (spec 0006, AC-10): 10 copies a student may queue an hour (used only when a job is really queued),
  // and at most 1500 jobs started a day across everyone (used when a job starts, key "all").
  reportCopy: { kind: "token bucket", rate: 10, period: HOUR, capacity: 10 },
  reportCopyDay: { kind: "fixed window", rate: 1500, period: DAY },
  // The team link to the saved report (spec 0008, AC-6): one team member opens at most 200 PDFs in a fixed hour window.
  // Key = the signed in team email. Used only when a PDF is about to be served.
  teamOpen: { kind: "fixed window", rate: TEAM_OPEN_PER_HOUR, period: HOUR },
  // The profile picture (spec 0011, AC-6): one check for a student every 10 minutes (key = student id), and at most 5000 fetches a
  // day across everyone (key "all"). Weekly re-checks also take a token from the 4000 a day pool, so a first fetch is never crowded out.
  avatarCheck: { kind: "token bucket", rate: 1, period: 10 * MINUTE, capacity: 1 },
  // Both are written by every fetch that is scheduled, so a launch day burst would conflict on one document. 10 shards spread the
  // writes; each shard holds a tenth of the day's count, so the total stays the same.
  avatarDay: { kind: "fixed window", rate: 5000, period: DAY, shards: 10 },
  avatarRecheckDay: { kind: "fixed window", rate: 4000, period: DAY, shards: 10 },
  // The student's own Restore (spec 0011, AC-9) fetches again at once, so it cannot sit behind the 10 minute check above (a Remove
  // and a Restore right after a first fetch would find it empty). 3 an hour for each student stops a Remove/Restore loop from using up the day.
  avatarRestore: { kind: "token bucket", rate: 3, period: HOUR, capacity: 3 },
});
