import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const start = app.indexOf("function safeCloudBundle");
const end = app.indexOf("async function reviewSafeCloudConflicts", start);
assert.ok(start > 0 && end > start);
const safeBundle = app.slice(start, end);

// Passive organiser displays must accept the player phone's verified online
// card instead of comparing it with an older score previously rendered on the
// organiser PC or tablet.
assert.match(safeBundle, /for\(const row of clone\.scores\|\|\[\]\)\s*\{/);
assert.match(safeBundle, /if\(store\.cloud\?\.role==="organiser"\)continue;/);
assert.ok(
  safeBundle.indexOf('if(store.cloud?.role==="organiser")continue;') <
    safeBundle.indexOf('AwayCloud.reconcile(id,"score"'),
);

assert.match(css, /\.courseTransferActions > \.backupImportLabel\s*\{[\s\S]*?font-size:\s*13\.3333px/);
assert.match(html, /Version 15\.96\.52/);
assert.match(sw, /away-golf-v15-96-52/);

console.log("15.96.46 organiser score authority regression passed");
