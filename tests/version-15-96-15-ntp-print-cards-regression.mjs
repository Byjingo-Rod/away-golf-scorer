import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.96\.15/);
assert.match(sw, /away-golf-v15-96-15/);
assert.match(app, /Printable NTP Cards/);
assert.match(app, /printableNtpCards\.map/);
assert.match(app, /id="printNtpCards"/);
assert.match(app, /window\.print\(\)/);
assert.match(app, /record their name on the NTP marker\?/);
assert.doesNotMatch(app, /Did \$\{esc\(target\?\.name[^\n]+mark down as Nearest the Pin\?/);
assert.match(css, /width:90mm;height:55mm/);
assert.match(css, /@media print/);

console.log("15.96.15 printable NTP card regression checks passed");
