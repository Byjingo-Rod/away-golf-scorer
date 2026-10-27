import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const ready = app.match(/function yellowBallResultsReady[\s\S]*?\n  }/)?.[0] || "";
assert.match(ready, /officialCardProgress\(day, id\)\.complete/);
assert.match(ready, /verificationIssueHoles\(day, id\)\.length === 0/);
assert.doesNotMatch(app, /yellowBallViewerGroupIndex/);
assert.match(
  app,
  /Yellow Ball standings remain hidden until every scorecard for the day is complete and agreed/,
);

const ntp = app.match(/if \(\$\("#yesNtp"\)\)[\s\S]*?if \(\$\("#undoNtp"\)\)/)?.[0] || "";
const ntpCheck = app.match(/function ntpScoreSupportsClaim[\s\S]*?\n  }/)?.[0] || "";
assert.match(ntpCheck, /Number\(gross\) === Number\(putts\) \+ 1/);
assert.match(ntp, /ntpScoreSupportsClaim\(day, rec\)/);
assert.match(ntp, /NTP cannot be recorded/);
assert.match(app, /!n\?\.confirmedAt \|\| !ntpScoreSupportsClaim/);

assert.match(index, /Version 15\.96\.54/);
assert.match(worker, /away-golf-v15-96-54/);

console.log("15.96.54 Yellow Ball reveal and NTP validation regression passed");
