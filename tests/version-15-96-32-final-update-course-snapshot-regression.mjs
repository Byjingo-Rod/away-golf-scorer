import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /function authoritativeMasterCourse/);
assert.match(app, /state\.conflicts\?\.\[key\]\?\.data/);
assert.match(app, /function refreshEventCourseSnapshot/);
assert.match(app, /refreshEventCourseSnapshot\(event\)/);
assert.match(app, /eventTeeDisplayName\(day,tee,W\.event,category\)/);
assert.match(app, /refreshEventCourseSnapshot\(store\.event\)/);
assert.match(html, /Version 15\.96\.32/);
assert.match(sw, /away-golf-v15-96-32/);

console.log("15.96.32 final-update course snapshot regression passed");
