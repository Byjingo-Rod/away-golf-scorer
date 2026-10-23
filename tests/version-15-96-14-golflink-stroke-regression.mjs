import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(
  styles,
  /\.groupPlayerName small \{[\s\S]*?font-size: 12px;[\s\S]*?font-weight: 700;/,
  "GolfLink numbers must remain clear in screenshots and printed team sheets",
);
assert.match(app, /W\.event\.strokeResult = "net";/);
assert.match(app, /<b>Stroke Result<\/b><strong>Net only<\/strong>/);
assert.doesNotMatch(app, /name="strokeResult"/);
assert.doesNotMatch(app, /Stroke Gross/);
assert.match(app, /Gross scoring is available as a separate Scratch competition/);
assert.match(index, /Version 15\.96\.14/);
assert.match(sw, /away-golf-v15-96-14/);

console.log("15.96.14 GolfLink and net Stroke regression checks passed");
