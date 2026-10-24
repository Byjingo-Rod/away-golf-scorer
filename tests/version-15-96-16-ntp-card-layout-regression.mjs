import fs from "node:fs";
import assert from "node:assert/strict";

const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.96\.16/);
assert.match(sw, /away-golf-v15-96-16/);
assert.match(css, /width:90mm;height:78mm/);
assert.match(css, /font-family:"Trebuchet MS","Arial Rounded MT Bold",Arial,sans-serif/);
assert.match(css, /justify-content:flex-end;gap:3mm;padding:1\.5mm 3mm 1\.5mm 17mm/);
assert.match(css, /\.ntpPrintLines\{height:46mm/);

console.log("15.96.16 NTP card layout regression checks passed");
