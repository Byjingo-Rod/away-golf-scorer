import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /function preparePhoneForJoinedEvent\(eventId\)/);
assert.match(
  app,
  /if \(previousEventId && previousEventId === nextEventId\) return false;/,
  "rejoining the same event must preserve local scoring",
);
assert.match(
  app,
  /store\.event\.scoring = \{ day1: \{\}, day2: \{\} \};/,
  "joining another event must clear the previous phone scorecard",
);
assert.match(app, /store\.event\.playerHolePos = 0;/);

const joinPreparation = app.indexOf("preparePhoneForJoinedEvent(eventId);");
const playerRoleAssignment = app.indexOf(
  'store.cloud = {\n              role: "player",',
  joinPreparation,
);
assert.ok(joinPreparation >= 0 && playerRoleAssignment > joinPreparation);

console.log("Clean event-join regression checks passed.");
