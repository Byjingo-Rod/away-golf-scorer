import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const start = app.indexOf("const updateScoreControl = (id, val)");
const end = app.indexOf('if ($("#yesNtp"))', start);
assert.ok(start > 0 && end > start);
const scoringHandlers = app.slice(start, end);

assert.match(scoringHandlers, /valueButton\.textContent/);
assert.match(scoringHandlers, /updateScoreControl\(id, val\)/);
assert.doesNotMatch(scoringHandlers, /renderHoleScoring\(selected, day\)/);

console.log("15.96.48 stable score controls regression passed");
