/**
 * Dhirise · lead and feedback sheet. Paste into Extensions → Apps Script of a Google Sheet, then deploy as a Web app
 * (see tools/LEAD-SHEET-SETUP.md). One web app takes both:
 *   - leads from done.html            → the "Leads" tab
 *   - report feedback ({type:"feedback"}) from report-student.html → the "Feedback" tab
 * The pages send JSON as text/plain (no-cors), so it is read from e.postData.contents.
 */
var AREAS = ["routine", "emotions", "drive", "connection", "expression", "clarity", "purpose"];
var INDICES = ["studyReadiness", "emotionalBalance", "focusEnergy", "direction"];
var LEAD_HEADER = ["receivedAt", "name", "age", "class", "phone", "wantsCommunity", "styleKey", "dhiStart"]
  .concat(INDICES).concat(AREAS).concat(["flags", "completedAt"]);
var FEEDBACK_HEADER = ["receivedAt", "rating", "text", "canShare", "styleKey", "completedAt", "phone"];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.type === "feedback") appendFeedback_(d); else appendLead_(d);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function appendLead_(d) {
  var indices = d.indices || {}, areas = d.areas || {}, flags = d.flags || {};
  var row = [
    new Date(), safe_(d.name), d.age || "", safe_(d["class"]), "'" + String(d.phone || ""),   /* ' keeps leading zeros */
    d.wantsCommunity === true ? "yes" : "no", safe_(d.styleKey), d.dhiStart != null ? d.dhiStart : ""
  ]
    .concat(INDICES.map(function (k) { return indices[k] != null ? indices[k] : ""; }))
    .concat(AREAS.map(function (k) { return areas[k] != null ? areas[k] : ""; }))
    .concat([Object.keys(flags).filter(function (k) { return flags[k] === true; }).join(", "), d.completedAt || ""]);
  getSheet_("Leads", LEAD_HEADER).appendRow(row);
}

function appendFeedback_(d) {
  var rating = Math.max(0, Math.min(5, Number(d.rating) || 0));
  getSheet_("Feedback", FEEDBACK_HEADER).appendRow([
    new Date(), rating, safe_(String(d.text || "").slice(0, 1000)), d.canShare === true ? "yes" : "no",
    safe_(d.styleKey), d.completedAt || "", d.phone ? "'" + String(d.phone) : ""
  ]);
}

/* text a student typed never runs as a formula */
function safe_(v) {
  var s = v == null ? "" : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* a tab, created with a header row the first time */
function getSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0) { sheet.appendRow(header); sheet.setFrozenRows(1); }
  return sheet;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
