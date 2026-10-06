/**
 * Dhirise · lead sheet. Paste into Extensions → Apps Script of a Google Sheet, then deploy as a Web app
 * (see tools/LEAD-SHEET-SETUP.md). Each POST from done.html appends one row to the "Leads" tab.
 * The page sends JSON as text/plain (no-cors), so it is read from e.postData.contents.
 */
var SHEET_NAME = "Leads";
var AREAS = ["routine", "emotions", "drive", "connection", "expression", "clarity", "purpose"];
var INDICES = ["studyReadiness", "emotionalBalance", "focusEnergy", "direction"];
var HEADER = ["receivedAt", "name", "age", "class", "phone", "wantsCommunity", "styleKey", "dhiStart"]
  .concat(INDICES).concat(AREAS).concat(["flags", "completedAt"]);

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var sheet = getSheet_();
    var indices = d.indices || {}, areas = d.areas || {}, flags = d.flags || {};
    var row = [
      new Date(), d.name || "", d.age || "", d["class"] || "", "'" + String(d.phone || ""),   /* ' keeps leading zeros */
      d.wantsCommunity === true ? "yes" : "no", d.styleKey || "", d.dhiStart != null ? d.dhiStart : ""
    ]
      .concat(INDICES.map(function (k) { return indices[k] != null ? indices[k] : ""; }))
      .concat(AREAS.map(function (k) { return areas[k] != null ? areas[k] : ""; }))
      .concat([Object.keys(flags).filter(function (k) { return flags[k] === true; }).join(", "), d.completedAt || ""]);
    sheet.appendRow(row);
    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/* the Leads tab, created with a header row the first time */
function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) { sheet.appendRow(HEADER); sheet.setFrozenRows(1); }
  return sheet;
}
