import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /if \(event\.locked && planned\.length\) return planned/);
assert.match(app, /const categoryIds = \(event\.confirmed\?\.length/);
assert.match(app, /const handicaps = event\.teeHandicaps\?\.\[key\]\?\.\[tee\] \|\| \{\}/);
assert.match(app, /if \(inferred\.length\) return inferred/);
assert.match(app, /if \(EVENT_TEES\.includes\(selected\)\) return \[selected\]/);
assert.match(html, /Version 15\.96\.33/);
assert.match(sw, /away-golf-v15-96-33/);

console.log("15.96.32 locked category tee recovery regression passed");
