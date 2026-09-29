import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.93\.1/);
assert.match(sw, /away-golf-v15-93-1/);
assert.match(
  app,
  /TEE_MARKER_COLOURS = \[[\s\S]*?"Yellow",[\s\S]*?"Green",[\s\S]*?"Red"/,
  "Green must be available in course tee-colour dropdowns",
);
assert.match(
  app,
  /savedForDay\.length === 2[\s\S]*?savedForDay\.includes\("back"\)[\s\S]*?savedForDay\.includes\("front"\)[\s\S]*?return \[\.\.\.EVENT_TEES\]/,
  "saved Back + Front pairs must restore the missing Middle tee",
);
assert.match(
  app,
  /tees\.length === EVENT_TEES\.length \? "checked" : ""/,
  "the third-tee checkbox must be checked only when all three tees are displayed",
);
assert.match(app, /function saveEventGaToPlayerProfiles/);
assert.match(app, /p\.ga = \+ga/);
assert.match(app, /p\.gaCategory = eventGaCategory\(id, event\)/);
assert.match(
  app,
  /saveEventGaToPlayerProfiles\(allIds, W\.event\)/,
  "saving or calculating must retain the latest GA for the next event",
);
assert.match(app, /appVersion: "15\.93\.1"/);

console.log("Version 15.93.1 three-tee and Green marker checks passed.");
