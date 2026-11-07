import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(app, /function homeEventDate\(event\)/);
// The shared date formatter now uses the requested Australian numeric dates.
assert.match(app, /australianDate\(event\.date\)/);
assert.match(app, /roundLabel\.textContent = isPlayerDevice\(\) \? "Marking" : "Event date"/);
assert.match(html, /<small id="homeRoundLabel">Event date<\/small>/);

assert.match(app, /const liveMismatch = \(h\) =>/);
assert.match(app, /scoreEntriesMismatch\(day, selected, h, own, ownOfficial, puttsRequired\)/);
assert.match(app, /scoreEntriesMismatch\(day, markedPlayer, h, marked, markedCheck, puttsRequired\)/);
assert.match(app, /class="holeTrack \$\{state\}"/);
assert.match(app, /class="mismatchHoleAlert"/);
assert.match(app, /data-gotohole="\$\{i\}"/);
assert.match(css, /\.holeTrack\.mismatch\s*\{/);
assert.match(css, /\.mismatchHoleAlert\s*\{/);
assert.match(css, /\.dashboard \.homeRoundBox b\s*\{[\s\S]*font-size: 16px/);

assert.match(app, /function currentEventMatchesRememberedLive\(live\)/);
assert.match(app, /localEventId && localEventId === eventId/);
assert.match(app, /joinCode && localJoinCode === joinCode/);
assert.doesNotMatch(app, /!store\.event \|\| store\.event\.publishedAt \|\| store\.event\.joinCode/);
assert.match(app, /const eventIsPublished = Boolean\(/);
assert.match(app, /record\.cloud =\s*eventIsPublished && store\.cloud/s);
assert.match(app, /if \(!eventIsPublished && store\.cloud\?\.role === "organiser"\)/);

console.log("Stage 1B live-warning regression checks passed.");
