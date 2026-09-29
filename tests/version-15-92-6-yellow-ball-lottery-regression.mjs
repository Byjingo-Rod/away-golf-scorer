import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.93\.1/);
assert.match(sw, /away-golf-v15-93-1/);
assert.match(app, /\["best3of4", "yellowBall"\]\.includes\(id\)/);
assert.match(app, /id === "yellowBall" \? \[5, 10, 15, 20\]/);
assert.match(app, /id === "yellowBall" \? \[1, 2, 3\]/);
assert.match(app, /id === "yellowBall" \? "Balls \/ Prize"/);
assert.match(app, /appVersion: "15\.93\.1"/);

console.log("Version 15.92.6 Yellow Ball lottery prize checks passed.");
