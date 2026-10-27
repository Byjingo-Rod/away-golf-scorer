import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const start = app.indexOf("(bundle?.scores || []).forEach");
const end = app.indexOf("store.cloudPlayers =", start);
assert.ok(start > 0 && end > start);
const scoreMerge = app.slice(start, end);

assert.match(scoreMerge, /const ownActiveRound\s*=/);
assert.match(scoreMerge, /if \(!ownActiveRound\)/);
assert.doesNotMatch(scoreMerge, /!ownActiveRound \|\| AwayCloud\.reconcile/);
assert.match(html, /Version 15\.96\.50/);
assert.match(sw, /away-golf-v15-96-50/);

console.log("15.96.49 active round authority regression passed");
