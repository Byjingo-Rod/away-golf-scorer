import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.87/);
assert.match(sw, /away-golf-v15-87/);
assert.match(app, /yellowBall:\s*"Yellow Ball"/);
assert.match(app, /id:\s*"yellowBall"/);
assert.match(app, /function yellowBallPlayerForHole/);
assert.match(app, /scoreSequence\(start\)\.indexOf\(\+hole\)/);
assert.match(app, /team\[position % team\.length\]/);
assert.match(app, /record\?\.yellowBall\?\.lost/);
assert.match(app, /id="yellowBallLost"/);
assert.match(app, /def\.type === "yellowBall"/);
assert.match(app, /data-yellowballday="1"/);
assert.match(app, /data-yellowballday="2"/);
assert.match(app, /yellowBallIsOn\(day\)/);
assert.match(app, /Result announced at the end of play/);
assert.match(app, /Yellow Ball standings remain hidden/);
assert.match(app, /function yellowBallViewerGroupIndex/);
assert.match(app, /store\.cloud\?\.role !== "player"/);
assert.match(app, /yellowBallOwnTeam/);
assert.match(app, /Score hidden until end of play/);
assert.match(css, /#ffe600/);
assert.match(css, /\.yellowBallDays small/);

assert.match(app, />Release All Phones</);
assert.match(app, />Release Phone</);
assert.match(app, /No emergency replacement is available/);

console.log("Version 15.87 Yellow Ball regression checks passed.");
