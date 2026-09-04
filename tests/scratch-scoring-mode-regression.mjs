import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /name="scratchScoringMode" value="stroke"/);
assert.match(app, /name="scratchScoringMode" value="maxDoubleBogey"/);
assert.match(
  app,
  /String\(gross \?\? ""\)\.toUpperCase\(\) === "P"[\s\S]*maximumDoubleBogey \? \+\(card\?\.par\?\.\[i\] \|\| 0\) \+ 2 : null/,
  "A pickup must score par plus two only in Maximum Double Bogey mode.",
);
assert.match(
  app,
  /Math\.min\(\+gross, \+\(card\?\.par\?\.\[i\] \|\| 0\) \+ 2\)/,
  "Numeric Scratch scores must also be capped at par plus two in Maximum Double Bogey mode.",
);
assert.match(app, /A PICK-UP \(P\) records a score of 2 over par/i);

console.log("Scratch scoring-mode regression checks passed.");
