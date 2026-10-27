import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = app.indexOf("function safeCloudBundle");
const end = app.indexOf("async function reviewSafeCloudConflicts", start);
assert.ok(start >= 0 && end > start, "safeCloudBundle must remain available");
const source = app.slice(start, end);

assert.match(
  source,
  /String\(row\.scorer_player_id\) === String\(store\.cloud\.playerId\)/,
  "the active-round guard must identify the phone's own score row",
);
assert.match(
  source,
  /\["scoring", "verify"\]\.includes\(store\.event\?\.playerRoundMode\)/,
  "scoring and verification must both protect the live safety base",
);
assert.match(
  source,
  /if\(ownActiveRound\)continue;[\s\S]*AwayCloud\.reconcile/,
  "the own active row must bypass safety reconciliation before it can create a false conflict",
);

console.log("15.96.51 active save reconciliation regression passed");
