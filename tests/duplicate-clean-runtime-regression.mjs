import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /function resetDuplicatedEventRuntime\(event\)/);
assert.match(app, /event\.scoring = \{ day1: \{\}, day2: \{\} \};/);
assert.match(app, /event\.roundFinalised = \{ day1: \{\}, day2: \{\} \};/);
assert.match(app, /event\.prizesAwarded = \{\};/);
assert.match(app, /delete event\.finalResults;/);
assert.match(app, /delete event\.scoringOpenedEarly;/);
assert.match(app, /delete event\.playerStartingHoleNotice;/);
assert.match(app, /delete event\.finalUpdateAt;/);
assert.match(app, /delete event\.previewPublishedAt;/);
assert.match(app, /resetDuplicatedEventRuntime\(event\);/);

console.log("Clean duplicate runtime regression checks passed.");
