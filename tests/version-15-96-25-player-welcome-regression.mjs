import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.96\.26/);
assert.match(worker, /away-golf-v15-96-26/);
assert.match(app, /function openPlayerRulesFromWelcome\(playerId\)/);
assert.match(
  app,
  /function openPlayerRulesFromWelcome[\s\S]*rememberPlayerWelcome\(playerId\)[\s\S]*playerRulesOpen = true[\s\S]*writeLocalStore\(\)[\s\S]*renderPlayerExperience\(\)/,
  "the player welcome button must use a local player-safe transition",
);
assert.doesNotMatch(
  app,
  /continueFromWelcome[\s\S]{0,250}\bsave\(\)/,
  "the player welcome button must not call the broad organiser save routine",
);

console.log("Player welcome-to-rules regression checks passed.");
