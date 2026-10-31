import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

const refreshStart = app.indexOf("function refreshOpenWizardFromCloud() {");
const refreshEnd = app.indexOf("\n  const stepNames", refreshStart);
assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, "wizard cloud-refresh function exists");

const refresh = app.slice(refreshStart, refreshEnd);
assert.match(
  refresh,
  /W\?\.newEvent\s*\|\|/,
  "a cloud refresh cannot replace a new event being typed",
);
assert.ok(
  refresh.indexOf("W?.newEvent") < refresh.indexOf("renderWizard()"),
  "the new-event guard runs before any wizard redraw",
);

assert.match(app, /<h3>Operation<\/h3>/, "planner rules page has an Operation heading");
assert.match(
  app,
  /Swipe left for the next hole and right for the previous hole\./,
  "the concise swipe instruction is shown consistently",
);
assert.doesNotMatch(
  app,
  /<h4>Using the scoring card<\/h4>/,
  "player instructions use Operation rather than the old heading",
);

console.log("15.96.58 new-event focus regression checks passed");
