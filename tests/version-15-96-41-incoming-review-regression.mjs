import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /Keep Incoming Device Copy for All/);
assert.match(app, /id="keepIncomingSafeReviews"/);
assert.match(app, /resolveAllSafeReviews\("local"\)/);
assert.match(app, /choice\}\)\)\)/);
assert.match(app, /complete incoming device copy was saved online/);
assert.match(app, /setCloudMessage\("Live event opened"\)/);
assert.doesNotMatch(app, /cloudMessage = "Live event opened"/);
assert.match(html, /Version 15\.96\.41/);
assert.match(sw, /away-golf-v15-96-41/);

console.log("15.96.41 incoming-review regression passed");
