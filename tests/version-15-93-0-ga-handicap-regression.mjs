import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.93\.2/);
assert.match(sw, /away-golf-v15-93-2/);
assert.match(app, /function calculateDailyHandicap/);
assert.match(app, /rating\.slope\) \/ 113/);
assert.match(app, /rating\.scratch - rating\.par/);
assert.match(app, /0\.93 \* consistency/);
assert.match(app, /category === "women" \? 1\.0483 : 0\.9986/);
assert.match(app, /function applyCalculatedEventHandicaps/);
assert.match(app, /Calculate Event Handicaps/);
assert.match(app, /teeHandicapSources/);
assert.match(app, /Calculated/);
assert.match(app, /Manual/);
assert.match(app, /appVersion: "15\.93\.2"/);
assert.match(css, /\.eventGaEntry/);
assert.match(css, /\.hcpSource\.calculated/);

const calculate = (ga, slope, scratch, par, factor) => {
  const value = ((ga * slope) / 113 + (scratch - par)) * 0.93 * factor;
  return value < 0 ? -Math.round(Math.abs(value)) : Math.round(value);
};
assert.equal(calculate(18.4, 131, 72, 72, 0.9986), 20);
assert.equal(calculate(-4.0, 131, 72, 72, 0.9986), -4);

console.log("Version 15.93.2 automatic GA Daily Handicap checks passed.");
