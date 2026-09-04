import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(index, /Version 15\.86\.5/);
assert.doesNotMatch(index, /Players #/);
assert.match(css, /\.joinEventRow\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(app, /appVersion: "15\.86\.5"/);
assert.match(sw, /away-golf-v15-86-5/);
assert.doesNotMatch(`${index}\n${sw}`, /15\.86\.4/);

console.log("Version 15.86.5 regression checks passed.");
