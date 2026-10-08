// Scheduled jobs. The daily clean up of abandoned sign in accounts (spec 0002, AC-10), and the copy of leads and
// feedback to the team's Google Sheet every 5 minutes (spec 0004): it only starts the Node job when some row is due.
// A daily check queues the rows whose content changed since they were last sent.
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.daily("purge abandoned sign in accounts", { hourUTC: 21, minuteUTC: 0 }, internal.purge.purgeAbandoned, {});
crons.interval("copy leads and feedback to the Sheet", { minutes: 5 }, internal.sheetSync.runIfDue, {});
crons.daily("queue Sheet rows whose content changed", { hourUTC: 20, minuteUTC: 30 }, internal.sheetSync.dailyCheck, { kind: "lead" });
export default crons;
