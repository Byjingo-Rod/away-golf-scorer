import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.93\.1/);
assert.match(sw, /away-golf-v15-93-1/);
assert.match(app, /function installFederalRidgeHistoryBaseline/);
assert.match(app, /federal-ridge-2026-v1/);
assert.match(app, /const ridgeGroups/);
assert.match(app, /federalDay1Groups/);
assert.match(app, /federalDay2Groups/);
assert.match(app, /store\.pairHistory = \{\}/);
assert.match(app, /store\.partnerHistory = \{\}/);
assert.match(app, /event\.historyRecordedAt = installedAt/);
assert.match(app, /event\.testHistoryExcludedAt = installedAt/);
assert.match(app, /installFederalRidgeHistoryBaseline\(\)/);

console.log("Version 15.92.5 clean history baseline checks passed.");
