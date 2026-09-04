import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.86\.6/);
assert.match(worker, /away-golf-v15-86-6/);
assert.match(app, /awayGolfWorkspaceJournalV1/);
assert.match(app, /function restoreWorkspaceFromJournalIfShrunk\(\)/);
assert.match(app, /savedWorkspaceCount\(saved\) <= savedWorkspaceCount\(store\)/);
assert.match(app, /store\.eventWorkspace = JSON\.parse\(/);
assert.match(app, /store\.activeEventId = saved\.activeEventId/);
assert.match(app, /restoreWorkspaceFromJournalIfShrunk\(\);\s*localStorage\.setItem\("awayGolf13"/s);
assert.match(app, /workspaceShrinkAuthorised = true;\s*store\.eventWorkspace = store\.eventWorkspace\.filter/s);
assert.match(app, /workspaceShrinkAuthorised = true;\s*store = JSON\.parse\(JSON\.stringify\(imported\)\)/s);

console.log("Workspace journal regression checks passed.");
