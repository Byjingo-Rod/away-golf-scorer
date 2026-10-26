import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /Keep Online Copy for All/);
assert.match(app, /id="keepOnlineSafeReviews"/);
assert.match(app, /for\(const saved of rows\)/);
assert.match(app, /choice:"remote"/);
assert.match(app, /all outstanding reviews were closed/);
assert.match(html, /Version 15\.96\.39/);
assert.match(sw, /away-golf-v15-96-39/);

console.log("15.96.39 online-review regression passed");
