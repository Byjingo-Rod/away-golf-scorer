import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(
  app,
  /String\(r\.gross\)\.toUpperCase\(\) === "P"\)[\s\S]*?t\.gross \+= r\.par \+ 2 \+ r\.adjustment/,
  "a pickup must count as the first gross score worth zero Stableford points",
);
assert.doesNotMatch(
  app,
  /id="finaliseRound"/,
  "the redundant manual COMPLETE ROUND action must be removed",
);

console.log("Version 15.86.15 regression checks passed.");
