import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(
  app,
  /holeByHole: "On course by players and confirmed by Markers hole-by-hole"/,
);
assert.match(app, /fullCardPlayer: "Strokes\/hole entered by Player"/);
assert.match(
  app,
  /Scoring to be completed using the App while playing/,
);
assert.match(app, /function renderFullCardPlayerEntry\(selected, day\)/);
assert.match(app, /fullCardEnteredByPlayer: true/);
assert.match(app, /field\.every\(\(id\) => roundFinalisedFor\(day, id\)\)/);
assert.match(styles, /\.fullCardPlayerEntry/);

console.log("15.96.7 score-entry method regression checks passed");
