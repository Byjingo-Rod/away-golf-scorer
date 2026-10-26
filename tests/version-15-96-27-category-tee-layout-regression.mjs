import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /class="eventTeeCategoryGrid"/);
assert.match(app, /<section class="categoryPlayingTee">/);
assert.match(app, /category==="women"\?"Women's":"Men's"/);
assert.match(css, /\.eventTeeCategoryGrid\s*\{[^}]*grid-column:\s*2\s*\/\s*-1/s);
assert.match(css, /\.eventTeeCategoryGrid \.eventTeeButtons\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
assert.match(css, /@media \(max-width: 1000px\)[\s\S]*?\.eventTeePanel[\s\S]*?grid-template-columns:\s*1fr/s);
assert.match(html, /15\.96\.27/);
assert.match(sw, /away-golf-v15-96-27/);

console.log("15.96.27 category tee layout regression passed");
