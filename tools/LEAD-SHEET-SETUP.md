# Google Sheet copy: setup

Every lead and every feedback note is saved in Convex first. A few seconds later the app copies each one to your team's Google Sheet, one row each. Convex stays the source of truth, so a Sheet problem never loses a lead. The old Apps Script receiver is gone: this is the only way data reaches the Sheet.

You do this once for each place the app runs. Development and production each get their own Sheet and their own settings, so a development copy can never write to the production Sheet.

## Set it up

1. **Make a Google Cloud project and turn on the Sheets API.** In https://console.cloud.google.com make a project, open *APIs and services*, then *Library*, find **Google Sheets API** and click *Enable*.
2. **Make a service account.** This is a robot Google account for the app. In *IAM and admin*, open *Service accounts* and click *Create service account*. Open it, go to *Keys*, choose *Add key*, then *Create new key*, type **JSON**. A file downloads. That file is a secret: keep it out of the repo and out of chat. Note the `client_email` inside it.
3. **Make the Sheet.** Open https://sheets.new and name it, for example "Dhi leads (dev)". Make a second one for production. Click *Share*, add the service account's `client_email` as an **Editor**, and add only the named team members who need to see it. Do not turn on link sharing.
4. **Copy the Sheet id.** It is the long text in the Sheet's address, between `/d/` and `/edit`.
5. **Set the two settings on that deployment.** The Sheet id is short, so the command line works:
   `npx convex env set SHEET_ID <the sheet id>`
   For the key, open the deployment in the Convex dashboard, go to *Settings*, then *Environment variables*, and paste the whole text of the JSON file into `GOOGLE_SERVICE_ACCOUNT_KEY`. For production add `--prod` to the command and use the production deployment in the dashboard. The key is about 2.4 KB. If Convex refuses a value that size, tell the team.
6. **Test it.** Run `npx convex run sheetFlush:run`, then `npx convex run sheetAdmin:status`. Then finish a check on development, enter a number and tap Submit. Within a minute a row appears in the **Leads** tab. Rate the report and tap Submit, and a row appears in the **Feedback** tab. A **Sync status** tab shows the last copy time, rows waiting, rows failed and the last error.

The app makes the three tabs (**Leads**, **Feedback**, **Sync status**) with their header rows if they are missing.

## Rules for the team

- Do not rename or delete the three tabs. If a tab is ever lost, run `npx convex run sheetAdmin:refill` and the app builds it again.
- Columns A to X are written by the app. Do not type there, because the next update overwrites it. Your own columns start at **Y**. A line of your own with column A left empty is never touched or removed. You can sort, filter and delete rows freely: the app finds each row by its reference code in column A, never by row number.
- A row that `prune` removes takes your notes on that row with it. You can bring it back from the Sheet's version history (File, Version history). Use `dryRun` first.
- The Sheet holds names, phone numbers, emails and notes of students, many under 18. Share it only with the people who need it, and never save exports in the repo.
- Write down the day you made the service account key, and make a new one on a regular schedule. To rotate it, make a new key, update `GOOGLE_SERVICE_ACCOUNT_KEY`, then delete the old key in Google Cloud.

## Commands

Run these from the project root. They are internal, so nobody can call them from a browser. Add `--prod` to run on production.

| Command | What it does |
|---|---|
| `npx convex run sheetAdmin:status` | Shows if the copy is set up, rows waiting, rows failed, the last success and the last error. |
| `npx convex run sheetAdmin:retryFailed` | Puts every failed row back in the queue with fresh tries. |
| `npx convex run sheetAdmin:refill` | Sends every lead and feedback again. Safe at any time, rows are updated in place. |
| `npx convex run sheetAdmin:refill '{"dryRun":true}'` | Changes nothing. Reports on the **Sync status** tab (Last prune) how many rows a prune would remove. Run this first. |
| `npx convex run sheetAdmin:refill '{"prune":true}'` | Removes the rows that do not belong (a reference code in column A that is not a lead or feedback in the app), then sends everything again. Rows that belong are never moved or emptied, so your notes stay beside their students. It refuses a tab when the app holds no records of that kind (add `"force":true` to allow it), and it stops without deleting if someone changed the Sheet while it ran. |
| `npx convex run sheetAdmin:exportCsv '{"kind":"lead"}'` | Prints the leads as CSV text, a page of 100 at a time. Use `"feedback"` for the feedback. Pass the returned `cursor` back to get the next page. This is the fallback when the Sheet is unavailable. |

If the copy fails, the app tries again after 1, 2, 4 and 8 minutes and so on (up to 6 hours between tries), and after 10 failed tries the row shows as failed in the Convex dashboard (table `sheetSync`) and on the **Sync status** tab. After you fix the cause, run `sheetAdmin:retryFailed`.

If `SHEET_ID` or the key is not set, the app works as normal. Rows wait in the queue and `sheetAdmin:status` says "not set up".
