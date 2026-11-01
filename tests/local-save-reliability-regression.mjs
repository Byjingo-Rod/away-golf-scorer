import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const safe = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");

const scoreEntryStart = app.indexOf("const setField = (id, val) =>");
const scoreEntryEnd = app.indexOf('$$(["[data-step]"])', scoreEntryStart);
const scoreEntry = app.slice(scoreEntryStart, scoreEntryEnd > scoreEntryStart ? scoreEntryEnd : scoreEntryStart + 4000);

assert.match(scoreEntry, /previousValue = rec\[section\]\[key\]/, "a score entry retains its prior value");
assert.match(scoreEntry, /if \(writeLocalStore\(\) === false\)/, "a score entry checks the durable save result");
assert.ok(
  scoreEntry.indexOf("writeLocalStore() === false") < scoreEntry.indexOf("queueCloudRound(day, selected)"),
  "a score is not queued online before its local save succeeds",
);
assert.match(scoreEntry, /rec\[section\]\[key\] = previousValue/, "a failed score write is rolled back in memory");
assert.match(app, /Score not saved — please try again\./, "the player receives a calm retry message");
assert.match(app, /window\.AwayGolfLocalSaveDiagnostics/, "organiser support can inspect local-save diagnostics");
assert.match(safe, /storageDiagnostics:\(\)=>copy\(storageFailureDetails\)/, "Safe Cloud exposes technical storage details separately");
assert.match(app, /const previous = \{[\s\S]*furthestPos:[\s\S]*if \(writeLocalStore\(\) === false\)[\s\S]*store\.event\.playerHolePos = previous\.pos/, "hole navigation is rolled back when persistence fails");

console.log("local save reliability regression checks passed");
