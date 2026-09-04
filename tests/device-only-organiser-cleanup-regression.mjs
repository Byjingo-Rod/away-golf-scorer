import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = app.indexOf("async function prepareDeviceForPlayerUse()");
const end = app.indexOf("function updateDeviceClearRecoveryButton()", start);
assert.ok(start >= 0 && end > start, "Device-only cleanup function must exist.");
const cleanup = app.slice(start, end);

assert.match(cleanup, /organiserBackupPayload\(\)/, "Cleanup must save a recovery copy first.");
assert.match(cleanup, /workspaceShrinkAuthorised = true/);
assert.match(cleanup, /store\.eventWorkspace = \[\]/);
assert.match(cleanup, /store\.event = null/);
assert.match(cleanup, /delete store\.cloud/);
assert.match(cleanup, /localStorage\.removeItem\(RECENT_PUBLISHED_KEY\)/);
assert.doesNotMatch(
  cleanup,
  /AwayCloud\.(?:archive|update|delete|save)/,
  "Device-only cleanup must never alter cloud data.",
);
assert.match(index, /Restore Organiser Events on This Device/);
assert.match(app, /Changes made on another phone, tablet or PC do not remove this device's saved copies/);

console.log("Device-only organiser cleanup regression checks passed.");
