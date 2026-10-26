import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const safeCloud = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /finalPlanIsAuthoritative/);
assert.match(app, /store\.event\?\.finalUpdateCloudSentAt/);
assert.match(app, /!health\.pendingPlans/);
assert.match(app, /!health\.conflicts/);
assert.match(app, /store\.cloud\.restorePublished=true/);
assert.match(safeCloud, /if\(!equal\(stored,state\)\)state=stored/);
assert.match(safeCloud, /Background score polling can legitimately refresh this store/);
assert.match(html, /Version 15\.96\.40/);
assert.match(sw, /away-golf-v15-96-40/);

console.log("15.96.40 final-plan authority regression passed");
