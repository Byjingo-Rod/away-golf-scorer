import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /function renderAppStorage\(\)/);
assert.match(app, /function openAppStorage\(\)\s*\{\s*try \{ renderAppStorage\(\); \}/);
assert.match(app, /Your saved information has not been deleted or changed\./);
assert.match(app, /id="storageTryAgain"/);
assert.match(app, /storageButton\.onclick=openAppStorage/);
assert.match(html, /Version 15\.96\.35/);
assert.match(sw, /away-golf-v15-96-35/);

console.log("15.96.28 App Storage opening regression passed");
