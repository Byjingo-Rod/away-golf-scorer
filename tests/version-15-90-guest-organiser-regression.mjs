import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase_v15_90_guest_organiser.sql", import.meta.url), "utf8");

assert.match(html, /Version 15\.90\.4/);
assert.match(html, /id="guestOrganiserAccess"/);
assert.match(app, /function openGuestOrganiserAccess/);
assert.match(app, /function claimGuestOrganiser/);
assert.match(app, /Guest Organiser — this event only/);
assert.match(app, /Guest Organiser access is limited to the delegated event/);
assert.match(app, /endGuestOrganiserSession/);
assert.match(cloud, /createGuestOrganiserKey/);
assert.match(cloud, /claimGuestOrganiserAccess/);
assert.match(cloud, /revokeGuestOrganiser/);
assert.match(cloud, /guestOrganiserActive/);
assert.match(cloud, /async function syncEventPlayers/);
assert.match(app, /AwayCloud\.syncEventPlayers[\s\S]*cloudPlayerRows\(\)/);
assert.match(sql, /away_event_guest_keys/);
assert.match(sql, /access_type in \('tablet', 'guest'\)/);
assert.match(sql, /create_away_guest_organiser_key/);
assert.match(sql, /claim_away_guest_organiser_access/);
assert.match(sql, /revoke_away_guest_organiser/);
assert.match(sql, /away_revoke_guests_when_event_closes/);
assert.match(sql, /e\.status not in \('complete', 'archived'\)/);
assert.match(sql, /interval '14 days'/);
assert.doesNotMatch(sql, /service_role|sb_secret_/i);

console.log("Version 15.90.4 Guest Organiser regression checks passed.");
