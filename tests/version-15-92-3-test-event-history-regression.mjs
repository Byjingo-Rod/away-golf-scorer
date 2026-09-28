import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.92\.6/);
assert.match(sw, /away-golf-v15-92-6/);
assert.match(app, /function isTestEvent/);
assert.match(app, /\^TEST\\b\/i/);
assert.match(app, /isTestEvent\(event\)/);
assert.match(app, /isTestEvent\(store\.event\)/);
assert.match(app, /function removeRecordedTestEventHistory/);
assert.match(app, /testHistoryExcludedAt/);
assert.match(app, /removeRecordedTestEventHistory\(\)/);

console.log("Version 15.92.3 TEST event history exclusion checks passed.");
