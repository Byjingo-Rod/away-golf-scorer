import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /awayGolfWorkspaceJournalV1/);
assert.match(app, /function restoreWorkspaceFromJournalIfShrunk\(\)/);
assert.match(app, /const missing = \(saved\.eventWorkspace \|\| \[\]\)\.filter/);
assert.match(app, /store\.eventWorkspace = current\.concat\(JSON\.parse\(JSON\.stringify\(missing\)\)\)/);
assert.match(app, /if \(!playerOnly\) restoreWorkspaceFromJournalIfShrunk\(\)/);
assert.match(app, /GolfSafeCloud\.storageWrite\("awayGolf13", JSON\.stringify\(durableStore\)\)/);
assert.match(app, /workspaceShrinkAuthorised = true;\s*store\.eventWorkspace = store\.eventWorkspace\.filter/s);
assert.match(app, /workspaceShrinkAuthorised = true;\s*store = JSON\.parse\(JSON\.stringify\(imported\)\)/s);

console.log("Workspace journal regression checks passed.");
