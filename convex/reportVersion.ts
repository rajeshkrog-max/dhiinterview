// The report version the server asks for (spec 0006). It must always equal `VERSION` in
// public/dhiinterviews/js/engine/reportText.js, which is a `window` script and cannot be imported here;
// `reportCopy.test.ts` reads that file and fails if the two differ. Bump both together, by hand, whenever the
// report's words, layout or print styles change: a newer number makes the server draw the copy again.
export const REPORT_VERSION = 1;
