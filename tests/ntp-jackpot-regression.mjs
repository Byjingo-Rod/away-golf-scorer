import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(app, /ntpJackpotMode: "final"/);
assert.match(app, /name="ntpJackpotMode" value="final"/);
assert.match(app, /name="ntpJackpotMode" value="rolling"/);
assert.match(app, /function ntpJackpotState\(day, hole\)/);
assert.match(app, /mode === "rolling"/);
assert.match(app, /mode === "final" && targetIndex !== finalIndex/);
assert.match(app, /complete \? "Winner" : "Current holder"/);
assert.match(app, /No Winner —.*carries to Hole/s);

console.log("NTP jackpot regression checks passed.");
