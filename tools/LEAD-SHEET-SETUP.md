# Lead sheet setup (5 steps)

Every student who submits their mobile number on the "Unlock my full report" screen becomes one row in a Google Sheet.

1. **Make the sheet.** Open https://sheets.new and name it, for example, "Dhi leads".
2. **Add the script.** In the sheet choose **Extensions → Apps Script**. Delete what is there, paste the whole of `tools/lead-sheet.gs`, and click **Save**.
3. **Deploy it.** Click **Deploy → New deployment**, pick the type **Web app**, set *Execute as* to **Me** and *Who has access* to **Anyone**, then click **Deploy** and allow the permissions Google asks for.
4. **Copy the link.** Copy the **Web app URL** (it ends in `/exec`). Open `js/funnel-config.js` and paste it between the quotes of `leadEndpoint`. Paste your WhatsApp group invite link into `whatsappInvite` too.
5. **Test it.** Finish the check once on your phone, enter a number and tap Submit. A tab called **Leads** appears in the sheet with a header row and your row under it.

Notes
- If `leadEndpoint` is empty, leads stay only in the student's browser (`dhirise.lead.v1`), with no error.
- After you edit the script, use **Deploy → Manage deployments → Edit → New version**, or the old code keeps running.
- The sheet holds students' phone numbers. Share it only with people who need it.
