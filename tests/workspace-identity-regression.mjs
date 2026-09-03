import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(app, /function consolidateWorkspaceCloudDuplicates\(\)/);
assert.match(app, /function workspaceCloudIdentity\(record\)/);
assert.match(
  app,
  /String\(item\.cloud\?\.eventId \|\| ""\) === currentCloudId/,
  "capture must reuse a record with the same cloud event ID",
);
assert.match(app, /store\.event\.workspaceId = id;/);
assert.match(
  app,
  /if \(restoreOrganiser && localWorkspaceId\)[\s\S]*store\.event\.workspaceId = localWorkspaceId;/,
  "cloud restoration must retain the local workspace identity",
);

console.log("Workspace identity regression checks passed.");
