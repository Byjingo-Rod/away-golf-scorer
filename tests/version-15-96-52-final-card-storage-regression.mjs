import fs from "node:fs";
import assert from "node:assert/strict";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const safe = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(
  app,
  /store\.event\?\.playerRoundMode === "completed"/,
  "live refresh must not displace a visible completed scorecard",
);
assert.match(
  app,
  /if \(!playerOnly\) writeWorkspaceJournal\(\)/,
  "player phones must not duplicate the organiser workspace journal",
);
assert.match(
  app,
  /durableStore\.eventWorkspace = \[\]/,
  "the durable player copy must omit the organiser event workspace",
);
assert.match(
  app,
  /\["player", "spectator"\]\.includes\(journal\?\.data\?\.cloud\?\.role\)[\s\S]*localStorage\.removeItem\(AWAY_GOLF_WORKSPACE_JOURNAL_KEY\)/,
  "an already-duplicated player journal must be removed without touching an organiser journal",
);
assert.match(
  app,
  /SAVE AND FINALISE AGREED CARDS/,
  "agreed cards must have an explicit final cloud-save gate",
);
assert.match(
  app,
  /uploaded && current\.acknowledged && !current\.pending && !current\.conflict && !current\.blocked/,
  "a card must not close until the final complete upload is acknowledged",
);
assert.match(
  safe,
  /adapter\.roundSaveState=/,
  "Safe Cloud must expose the final round acknowledgement state",
);
assert.match(sw, /away-golf-v15-96-52/);

console.log("15.96.52 final-card and player-storage regression passed");
