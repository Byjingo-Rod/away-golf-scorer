import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /name="strokeDailyResults"/, "Daily Stroke prizes must have an independent control");
assert.match(app, /name="strokeAggregateEnabled"/, "Overall Stroke prizes must have an independent control");
assert.match(app, /store\.event\.strokeDailyResults/, "Daily Stroke leaderboards must use the independent daily setting");
assert.match(app, /store\.event\.strokeAggregateEnabled/, "Aggregate Stroke leaderboards must use the independent overall setting");

console.log("Version 15.96.2 score-entry and combined Stroke prize checks passed");
