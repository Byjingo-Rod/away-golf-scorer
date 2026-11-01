import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /function consolidateWorkspaceCloudDuplicates\(\)/);
assert.match(app, /function workspaceCloudIdentity\(record\)/);
assert.match(app, /function workspaceExactIdentity\(record\)/);
assert.match(app, /Cloud links and identical contents are not event identities/);
assert.match(app, /only explicit organiser deletion may remove a plan/);
assert.match(app, /function currentEventMatchesRememberedLive\(live\)/);
assert.doesNotMatch(
  app,
  /store\.event\?\.locked \|\| !store\.event/,
  "a locked event alone must never authorise remembered-cloud restoration",
);
assert.match(app, /store\.event\.workspaceId = id;/);
assert.match(app, /store\.event\.workspaceId = id;/);

console.log("Workspace identity regression checks passed.");
