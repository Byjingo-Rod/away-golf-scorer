import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /By players hole-by-hole/, "Hole-by-hole scoring must be the primary choice");
assert.match(app, /From a score card separate to the App/, "Separate-card scoring must be available");
assert.match(app, /scoreEntryPlan === "separateCard"/, "Daily score-entry choices must open only for a separate card");
assert.match(app, /Selecting "Final-score entry" from the menu assumes you will enter scores from a caddie or paper-card\./, "Separate-card guidance must explain final-score entry");
assert.match(app, /These scores cannot calculate hole-by-hole events or countbacks\./, "Separate-card limitations must be clear");
assert.match(app, /name="strokeDailyResults"/, "Daily Stroke prizes must have an independent control");
assert.match(app, /name="strokeAggregateEnabled"/, "Overall Stroke prizes must have an independent control");
assert.match(app, /store\.event\.strokeDailyResults/, "Daily Stroke leaderboards must use the independent daily setting");
assert.match(app, /store\.event\.strokeAggregateEnabled/, "Aggregate Stroke leaderboards must use the independent overall setting");

console.log("Version 15.96.2 score-entry and combined Stroke prize checks passed");
