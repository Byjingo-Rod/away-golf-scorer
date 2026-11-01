import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL("../database/stage-2-function-permissions.sql", import.meta.url),
  "utf8",
);
const record = readFileSync(
  new URL("../docs/DATABASE_FUNCTION_PERMISSIONS.md", import.meta.url),
  "utf8",
);

assert.match(
  sql,
  /revoke execute on all functions in schema public from public, anon/i,
  "raw unauthenticated and inherited PUBLIC execution must be removed",
);
for (const triggerFunction of [
  "away_touch_revision",
  "away_revoke_guests_when_event_closes",
]) {
  assert.match(
    sql,
    new RegExp(`revoke execute on function public\\.${triggerFunction}\\(\\)[\\s\\S]*?from authenticated, service_role`, "i"),
    `${triggerFunction} must not be a directly callable API function`,
  );
  assert.match(record, new RegExp(`\\b${triggerFunction}\\b`));
}
assert.match(
  sql,
  /alter default privileges for role postgres in schema public[\s\S]*revoke execute on functions from public, anon, authenticated/i,
  "future functions must require deliberate grants",
);
for (const helper of [
  "is_away_event_organiser",
  "is_away_event_member",
  "is_away_event_spectator",
  "can_write_away_round",
]) {
  assert.match(record, new RegExp(`\\b${helper}\\b`));
}

console.log("Passed: database function execution is restricted and documented.");
