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

console.log("15.96.58 new-event focus regression checks passed");
