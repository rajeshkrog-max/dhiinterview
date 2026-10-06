# Lead and feedback sheet setup (5 steps)

Every student who submits their mobile number on the "Unlock my full report" screen becomes one row in the **Leads** tab.
Every feedback note sent from the report becomes one row in the **Feedback** tab. Both go to the same sheet and the same script.

1. **Make the sheet.** Open https://sheets.new and name it, for example, "Dhi leads".
2. **Add the script.** In the sheet choose **Extensions → Apps Script**. Delete what is there, paste the whole of `tools/lead-sheet.gs`, and click **Save**.
3. **Deploy it.** Click **Deploy → New deployment**, pick the type **Web app**, set *Execute as* to **Me** and *Who has access* to **Anyone**, then click **Deploy** and allow the permissions Google asks for.
4. **Copy the link.** Copy the **Web app URL** (it ends in `/exec`). Open `js/funnel-config.js` and paste it between the quotes of **both** `leadEndpoint` and `feedbackEndpoint`. Paste your WhatsApp group invite link into `whatsappInvite` too.
5. **Test it.** Finish the check once, enter a number and tap Submit. A **Leads** tab appears with your row. On the report, rate it and tap Submit; a **Feedback** tab appears with that row.

Notes
- If an endpoint is empty, that data stays only in the student's browser (`dhirise.lead.v1`, `dhirise.reportFeedback.v1`), with no error.
- Already deployed the older script? Paste the new one, then **Deploy → Manage deployments → Edit → New version**. The URL stays the same.
- The sheet holds students' phone numbers and comments. Share it only with people who need it.
