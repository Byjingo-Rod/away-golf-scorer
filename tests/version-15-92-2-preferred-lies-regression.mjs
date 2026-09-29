import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.93\.1/);
assert.match(sw, /away-golf-v15-93-1/);
assert.match(app, /preferredLiesByDay/);
assert.match(app, /preferredLiesAreaByDay/);
assert.match(app, /function preferredLiesSetting/);
assert.match(app, /Day \$\{day\} — Preferred Lies/);
assert.match(app, /eventRuleSections\(store\.event, day\)/);
assert.match(app, /data-change-preferred/);
assert.match(app, /data-pref-area/);
assert.match(css, /\.preferredDayGrid\.twoDays/);

console.log("Version 15.92.2 Preferred Lies by day regression checks passed.");
