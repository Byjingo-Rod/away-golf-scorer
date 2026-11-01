import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = fs.readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const safe = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /Your phone will retain every score you enter but transmission/);
assert.doesNotMatch(app, /enter, but transmission/);
assert.match(app, /Swipe left for the next hole and right for the previous hole/);
assert.match(app, /function enableHoleSwipe/);
assert.match(app, /Math\.abs\(dx\) < 60/);
assert.match(app, /\$\("#nextHole"\)\?\.click\(\)/);
assert.match(styles, /\.scoringPhone\s*\{\s*touch-action: pan-y/);

assert.match(app, /Delete This Event from This Phone and Join Another/);
assert.match(app, /GolfSafeCloud\.discardEventCopies\(eventId\)/);
assert.match(app, /still has scores saved only on this phone/);
assert.match(safe, /function discardEventCopies/);

assert.match(cloud, /async function eventAccess/);
assert.match(cloud, /client\.auth\.getUser\(\)/);
assert.match(app, /async function correctStoredCloudRole/);
assert.match(app, /store\.cloud\.role = "player"/);
assert.match(app, /store\.cloud\.role = "spectator"/);

assert.match(app, /playerHoleHandicap/);
assert.match(app, /Hcp \$\{esc\(formatPlayingHandicap/);

console.log("15.96.56 player experience regression passed");
