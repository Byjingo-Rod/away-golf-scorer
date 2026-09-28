import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.92\.6/);
assert.match(sw, /away-golf-v15-92-6/);
assert.match(app, /function ensureTeeScorecards/);
assert.match(app, /function courseScorecard/);
assert.match(app, /function eventCourseScorecard/);
assert.match(app, /id="scorecardTeeSelect"/);
assert.match(app, /Scorecard — Active Tee/);
assert.match(app, /source\.par\?\.\[i\] \?\? ""/);
assert.match(app, /index: Array\(18\)\.fill\(""\)/);
assert.match(app, /metres: Array\(18\)\.fill\(""\)/);
assert.match(app, /eventCourseScorecard\(day\)/);
assert.match(app, /ntpSelectionSources/);
assert.match(css, /\.scorecardTeeHeading/);
assert.match(app, /copyScorecardFrom/);
assert.match(app, /copyScorecardButton/);
assert.match(app, /all 18 pars, indexes and hole lengths/);
assert.match(app, /cloneCourseCard\(\s*source,\s*activeCardTee/);

console.log("Version 15.92.1 tee-specific scorecard regression checks passed.");
