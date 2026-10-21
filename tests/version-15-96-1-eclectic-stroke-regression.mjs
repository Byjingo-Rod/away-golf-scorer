import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(app, /function eclecticCourseGroups\(/, "Repeated-course Eclectic groups must be detected");
assert.match(app, /selectedEclecticGroups\(store\.event\)\.forEach/, "Every selected repeated course must receive its own leaderboard");
assert.match(app, /Eclectic — \$\{group\.courseName\} · Days/, "Eclectic result must name its course and playing days");
assert.match(app, /name="strokeCountingMode" value="daily"/, "Stroke must support separate daily results");
assert.match(app, /name="strokeCountingMode" value="aggregate"/, "Stroke must support all selected rounds");
assert.match(app, /name="strokeCountingMode" value="bestAggregate"/, "Stroke must support best y-1 of y rounds");
assert.match(app, /strokeAggregateGross/, "Gross aggregate Stroke leaderboard must exist");
assert.match(app, /strokeAggregateNet/, "Net aggregate Stroke leaderboard must exist");
assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/, "Stroke choices must use three columns on wider screens");
assert.match(css, /@media\(max-width:760px\).*?\.strokeSetupBox\{grid-template-columns:1fr\}/, "Stroke choices must stack on phones");

console.log("Version 15.96.1 repeated-course Eclectic and Stroke aggregation checks passed");
