import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = fs.readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const sql = fs.readFileSync(
  new URL("../supabase_v15_86_19_spectator_count.sql", import.meta.url),
  "utf8",
);

assert.match(html, /Version 15\.86\.19/);
assert.match(sw, /away-golf-v15-86-19/);
assert.match(app, /const TEE_MARKER_COLOURS = \["Black", "Blue", "White", "Yellow", "Red"\]/);
assert.match(app, /id="\$\{key\}Colour"/);
assert.match(app, /const teeEntryOrder = \[\.\.\.\$\$\('\.teeDetailEntry'\)\]/);
assert.match(app, /eventTeeMarkerColour\(day\).* Tee<\/h3>/);
assert.match(app, /<small>Playing Tee<\/small><b>\$\{previewStage \? esc\(eventTeeMarkerColour\(day\)\)/);
assert.match(app, /<summary>View Complete Draw<\/summary>/);
assert.match(app, /<b>Spectators<\/b><span>\$\{\+\(store\.cloudSpectatorCount \|\| 0\)\}<\/span>/);
assert.match(cloud, /away_event_spectator_count/);
assert.match(sql, /create table if not exists public\.away_event_spectators/);
assert.match(sql, /last_seen >= now\(\) - interval '30 seconds'/);

console.log("Version 15.86.19 regression checks passed.");
