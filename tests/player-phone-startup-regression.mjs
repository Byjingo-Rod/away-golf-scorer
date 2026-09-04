import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(
  app,
  /!isPlayerDevice\(\)\s*&&\s*!isFreshMobileDevice\(\)\s*&&[\s\S]*setTimeout\(openMyEvents, 120\)/,
  "A fresh player phone must not automatically open My Events.",
);
assert.match(
  app,
  /function leavePlayerEvent\(\)[\s\S]*quickCode\.value = ""[\s\S]*setQuickJoinStatus\("Enter the six-character event code\."\)/,
  "Leaving an event must reset the player-entry code and message.",
);

console.log("Player-phone startup regression checks passed.");
