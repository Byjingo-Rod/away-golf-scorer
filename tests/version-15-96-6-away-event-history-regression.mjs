import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.equal(
  (app.match(/AWAY GOLF EVENTS PLAYED/g) || []).length,
  2,
  "the automatic event history must appear in both profile views",
);
assert.ok(
  !app.includes("LAST PLAYED AWAY GOLF EVENT"),
  "the obsolete manual profile field must be removed",
);
assert.match(app, /function recordAwayGolfEventPlayed\(event\)/);
assert.match(app, /\/\^Away Golf\\b\/i\.test\(eventName\)/);
assert.match(app, /new Date\(date \+ "T12:00:00"\)\.toLocaleDateString\("en-AU"\)/);
assert.match(app, /courses: courses\.join\(" · "\)/);
assert.match(app, /const awayGolfHistoryChanged = recordAwayGolfEventPlayed\(event\)/);
assert.match(app, /return awayGolfHistoryChanged;/);
assert.match(index, /Version 15\.\d+\.\d+/);
assert.match(sw, /away-golf-v15-/);

console.log("15.96.6 Away Golf player event history regression checks passed");
