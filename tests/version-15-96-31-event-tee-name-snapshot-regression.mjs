import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /function captureEventTeeNames/);
assert.match(app, /event\.teeNamesByDayCategory \|\|= \{\}/);
assert.match(app, /function eventTeeDisplayName/);
assert.match(app, /teeNamesByDayCategory\?\.\["day" \+ day\]\?\.\[category\]\?\.\[tee\]/);
assert.match(app, /captureEventTeeNames\(event, day, category, authoritativeMasterCourse\(event\["course" \+ day\]\), true\)/);
assert.match(app, /captureEventTeeNames\(store\.event, eventDay, category, authoritativeMasterCourse\(store\.event\["course" \+ eventDay\]\), true\)/);
assert.match(app, /eventTeeDisplayName\(day,tee,store\.event,category,eventCourse\)/);
assert.match(html, /Version 15\.96\.35/);
assert.match(sw, /away-golf-v15-96-35/);

console.log("15.96.32 event tee-name snapshot regression passed");
