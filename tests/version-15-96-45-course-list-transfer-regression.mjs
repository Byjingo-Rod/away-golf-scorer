import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /format:\s*"Away Golf Course List"/);
assert.match(app, /transferVersion:\s*1/);
assert.match(app, /id="exportCourseList">Download Course List/);
assert.match(app, /id="importCourseList"/);
assert.match(app, /Replace Course List from File/);
assert.match(app, /id="undoCourseListImport"/);

const transferStart = app.indexOf("function courseListTransferPayload");
const transferEnd = app.indexOf("function queueMasterCourse", transferStart);
assert.ok(transferStart > 0 && transferEnd > transferStart);
const transfer = app.slice(transferStart, transferEnd);

assert.match(transfer, /store\.courses\s*=\s*imported\.courses/);
assert.match(transfer, /store\.courseCountries\s*=/);
assert.match(transfer, /store\.courseRegions\s*=/);
assert.match(transfer, /store\.courseLibrary\s*=/);
assert.match(transfer, /store\.courseFavourites\s*=/);
assert.doesNotMatch(transfer, /store\.players\s*=/);
assert.doesNotMatch(transfer, /store\.event\s*=/);
assert.doesNotMatch(transfer, /store\.eventWorkspace\s*=/);
assert.doesNotMatch(transfer, /store\.score/);
assert.match(transfer, /pending:\s*\{\},\s*conflicts:\s*\{\},\s*countriesPending:\s*\[\]/);
assert.match(transfer, /PRE_COURSE_LIST_IMPORT_KEY/);

assert.match(html, /Version 15\.96\.52/);
assert.match(sw, /away-golf-v15-96-52/);

console.log("15.96.45 course-list transfer regression passed");
