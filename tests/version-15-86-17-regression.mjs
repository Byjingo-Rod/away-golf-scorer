import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(
  app,
  /function enabledEventTeesForCategory\(event = store\.event, day = 1, category = "men"\)[\s\S]*?enabledTeesByDayCategory/,
  "enabled tees must be read separately for each day/course",
);
assert.match(
  app,
  /W\.event\.enabledTeesByDayCategory\[key\]\[activeCategory\]=selected/,
  "the third-tee switch must update only the handicap page currently open",
);
assert.match(
  app,
  /function recordCompletedEventHistory\(event = store\.event\)[\s\S]*?event\.historyRecordedAt/,
  "completed event history must have duplicate protection",
);
assert.match(
  app,
  /Object\.assign\(store\.event,accepted\);[\s\S]*?recordCompletedEventHistory\(store\.event(?:,[^)]*)?\)/,
  "confirming final results must record the event history",
);
assert.match(
  app,
  /function backfillCompletedEventHistory\(\)[\s\S]*?recordCompletedEventHistory\(event\)/,
  "previously completed events must be backfilled after upgrading",
);
assert.match(
  app,
  /hasPlayedScore[\s\S]*?scoreEntered\(entry\?\.official\?\.gross\)/,
  "a played event must be backfilled even if its final prize confirmation was not pressed",
);

console.log("Version 15.86.17 regression checks passed.");
