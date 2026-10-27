import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const start = app.indexOf("async function flushCloudRound");
const end = app.indexOf("function renderCloudPanel", start);
assert.ok(start > 0 && end > start);
const flush = app.slice(start, end);

assert.match(flush, /const ownActiveRound\s*=/);
assert.match(flush, /store\.event\?\.playerRoundMode === "scoring"/);
assert.match(flush, /if \(!ownActiveRound\) \{/);
assert.ok(
  flush.indexOf("if (!ownActiveRound) {") <
    flush.indexOf("GolfSafeCloud.merge(snapshot,latest,result.saved_data)"),
);
assert.match(html, /Version 15\.96\.52/);
assert.match(sw, /away-golf-v15-96-52/);

console.log("15.96.50 save acknowledgement regression passed");
