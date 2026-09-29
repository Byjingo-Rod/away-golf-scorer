import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.93\.2/);
assert.match(sw, /away-golf-v15-93-2/);
assert.match(app, /function openPublishedGaHandicapUpdate/);
assert.match(app, /id="updateGaHandicaps"/);
assert.match(app, /Update GA Handicaps/);
assert.match(app, /GA Handicaps Locked — Scoring Started/);
assert.match(app, /firstDayScoreEntry\(index \+ 1\)/);
assert.match(app, /gaUpdateOnly: true/);
assert.match(app, /handicapUpdatePendingAt = new Date\(\)\.toISOString\(\)/);
assert.match(app, /delete store\.event\.finalUpdateCloudSentAt/);
assert.match(
  app,
  /Press Send All Set — Final Update to send them to the players' phones/,
);
assert.match(app, /appVersion: "15\.93\.2"/);

console.log("Version 15.93.2 last-minute GA update checks passed.");
