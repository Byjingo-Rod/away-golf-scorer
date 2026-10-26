import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /function isTestEventName\(event\)\s*\{\s*return \/\^TEST\\b\/i\.test/);
assert.match(app, /isTestEventName\(\{name:row\.name\|\|""\}\)/);
assert.match(app, /isTestEventName\(store\.event\)/);
assert.match(html, /Version 15\.96\.30/);
assert.match(sw, /away-golf-v15-96-30/);

console.log("15.96.29 TEST-event storage helper regression passed");
