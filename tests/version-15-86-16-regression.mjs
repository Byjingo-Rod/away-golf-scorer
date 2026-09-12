import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.86\.16/);
assert.match(sw, /away-golf-v15-86-16/);
assert.match(
  app,
  /if \(W\.newEvent\) resetDuplicatedEventRuntime\(store\.event\);/,
  "a brand-new event must clear every previous event runtime value",
);
assert.match(
  app,
  /clearImpossibleDraftRuntime\(store\.event\);[\s\S]*?clearImpossibleDraftRuntime\(record\?\.event\)/,
  "an already-saved unlocked plan must also discard impossible inherited scoring",
);
assert.match(
  app,
  /function clearImpossibleDraftRuntime\(event\)[\s\S]*?event\.locked \|\| event\.status !== "planned"[\s\S]*?event\.scoring = \{ day1: \{\}, day2: \{\} \}/,
);
assert.match(app, /function teamsFinalCheckHtml\(\)/);
assert.match(app, /Final Check — Event Setup Record/);
assert.match(app, /\$\{teamsFinalCheckHtml\(\)\}/);
assert.match(
  app,
  /\]\.filter\(\(check\) => check\.ok\)/,
  "the persistent setup record must contain green-tick checks only",
);

console.log("Version 15.86.16 regression checks passed.");
