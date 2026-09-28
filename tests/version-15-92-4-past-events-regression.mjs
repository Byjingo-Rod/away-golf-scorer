import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.92\.6/);
assert.match(sw, /away-golf-v15-92-6/);
assert.match(html, /id="pastEvents"/);
assert.match(cloud, /async function loadPastOwnedEvents/);
assert.match(cloud, /\.eq\("status", "archived"\)/);
assert.match(app, /async function openPastEvents/);
assert.match(app, /async function openPastEvent/);
assert.match(app, /if \(!actual \|\| isTestEvent\(actual\)\) return null/);
assert.match(app, /pastEventReadOnly = true/);
assert.match(app, /store\.event\.joinCode = ""/);
assert.match(app, /nav\("leaderboardPage"\)/);

console.log("Version 15.92.4 past-event results checks passed.");
