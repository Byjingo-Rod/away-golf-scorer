import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const start = app.indexOf("function renderPlayerExperienceAfterCloudRefresh");
const end = app.indexOf("function safeCloudBundle", start);
assert.ok(start > 0 && end > start);
const refresh = app.slice(start, end);

// Realtime updates may merge into memory during scoring, but they must not
// replace the touch controls and swallow a player's in-progress tap.
assert.match(refresh, /store\.cloud\?\.role === "player"/);
assert.match(refresh, /store\.event\?\.playerRoundMode === "scoring"/);
assert.ok(refresh.indexOf('playerRoundMode === "scoring"') < refresh.indexOf("renderPlayerExperience();"));
assert.match(css, /\.scoreStepper button\s*\{[\s\S]*?touch-action:\s*manipulation/);
assert.match(css, /\.holeNav button,[\s\S]*?touch-action:\s*manipulation/);
assert.match(html, /Version 15\.96\.47/);
assert.match(sw, /away-golf-v15-96-47/);

console.log("15.96.47 score tap stability regression passed");
