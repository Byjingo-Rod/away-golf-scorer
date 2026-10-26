import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const safeCloud = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /Choosing Open Event is an explicit instruction to trust the published/);
assert.match(app, /AwayCloud\.safeReconcileAcknowledged\?\.\(/);
assert.match(app, /"event",\s*payload,\s*bundle\.event\.revision/s);
assert.match(app, /finalUpdateCloudSentAt:\s*store\.event\?\.finalUpdateCloudSentAt/s);
assert.match(app, /if \(store\.event\.locked\)\s*store\.event\.finalUpdateCloudSentAt/s);
assert.match(app, /finalUpdateCloudSentAt=store\.event\.finalUpdateCloudSentAt/);
assert.match(app, /delete event\.joinCode/);
assert.match(app, /verifiedFinalReceipt/);
assert.match(safeCloud, /pendingCards/);
assert.match(safeCloud, /pendingPlans/);
assert.match(safeCloud, /base:safeData\(kind,data\)/);
assert.match(safeCloud, /delete data\.event\.joinCode/);
assert.match(app, /Daily handicaps must follow the saved tee for each player's category/);
assert.match(app, /event\.dayFields\?\.\[key\]/);
assert.match(app, /event\.gaCategories\?\.\[String\(id\)\] === "women"/);
assert.match(safeCloud, /delete course\.womenTeeData\.versions/);
assert.match(html, /Version 15\.96\.38/);
assert.match(sw, /away-golf-v15-96-38/);

console.log("15.96.38 read-only plan and category handicap regression passed");
