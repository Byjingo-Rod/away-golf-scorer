import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const safe = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /delete event\.finalUpdateCloudSentAt/);
assert.match(app, /must not create a perpetual "waiting to upload"/);
assert.match(safe, /function safeData\(kind,value\)/);
assert.match(safe, /delete data\.event\.finalUpdateCloudSentAt/);
assert.match(safe, /s\.pending=safeData\(kind,s\.pending\)/);
assert.match(html, /Version 15\.96\.34/);
assert.match(sw, /away-golf-v15-96-34/);

console.log("15.96.34 final-update receipt storage regression passed");
