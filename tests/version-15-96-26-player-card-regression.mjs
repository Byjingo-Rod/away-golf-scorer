import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.96\.32/);
assert.match(worker, /away-golf-v15-96-32/);
assert.match(
  app,
  /eventCourseCategory\(day,store\.event,selected\)/,
  "player card tee lookup must use the selected player",
);
assert.doesNotMatch(
  app,
  /eventCourseCategory\(day,store\.event,me\)/,
  "player card must not refer to the undefined variable me",
);

console.log("Player scoring-card render regression checks passed.");
