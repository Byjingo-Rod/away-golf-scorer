import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = fs.readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sql = fs.readFileSync(new URL("../supabase_v15_86_4_spectator.sql", import.meta.url), "utf8");
const spectatorReadSql = fs.readFileSync(
  new URL("../supabase_v15_96_54_spectator_read_access.sql", import.meta.url),
  "utf8",
);

assert.match(app, /role: "spectator"/);
assert.match(app, /Watch as Spectator/);
assert.match(app, /Watching live · read only/);
assert.match(app, /if \(isSpectatorDevice\(\)\) return;/);
assert.match(app, /!\["player", "spectator"\]\.includes\(store\.cloud\?\.role\)/);
assert.match(cloud, /async function spectateEvent\(code\)/);
assert.match(cloud, /client\.rpc\("spectate_away_event"/);
assert.match(css, /body\.spectatorDevice nav button\[data-nav="scorePage"\]/);
assert.match(sql, /security definer/);
assert.match(sql, /grant execute on function public\.spectate_away_event\(text\) to authenticated/);
assert.match(spectatorReadSql, /function public\.is_away_event_spectator/);
assert.match(spectatorReadSql, /event participants read scores[\s\S]*is_away_event_spectator\(event_id\)/);
assert.doesNotMatch(spectatorReadSql, /for (insert|update|delete)/i);

console.log("Spectator View regression checks passed.");
