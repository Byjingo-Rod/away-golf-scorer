import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.86\.14/);
assert.match(sw, /away-golf-v15-86-14/);
assert.match(
  app,
  /store\.cloud\.secondaryOrganiser = true;[\s\S]*?await syncCloudNow\(\);/,
  "a connected organiser tablet must immediately adopt the cloud plan",
);
assert.match(
  app,
  /store\.cloud\.restorePublished \|\|[\s\S]*?store\.cloud\.secondaryOrganiser/,
  "secondary organiser refreshes must continue applying the authoritative cloud plan",
);
assert.match(
  app,
  /newerFinalOrganiser[\s\S]*?remoteFinalTime > localFinalTime/,
  "any organiser device must adopt a newer final cloud update",
);
assert.match(
  app,
  /A newer final event update was already online[\s\S]*?instead of replacing it with older event details/,
  "a stale organiser must be stopped before it overwrites a newer final event",
);

const start = app.indexOf("function normaliseTwoDaySingleStableford(");
const end = app.indexOf("\n  function cloudPayload", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const normalise = Function(`${app.slice(start, end)}; return normaliseTwoDaySingleStableford;`)();
const event = {
  days: 2,
  competitions: ["single", "combined", "fourball"],
  singleStablefordFormat: "aggregate",
};
normalise(event);
assert.deepEqual(event.competitions, ["combined", "fourball"]);

console.log("Version 15.86.14 regression checks passed.");
