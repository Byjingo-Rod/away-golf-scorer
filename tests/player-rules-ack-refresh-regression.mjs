import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

const remoteApply = app.match(/function applyRemoteCloud\(bundle\)[\s\S]*?\n  async function syncCloudNow/)?.[0] || "";
assert.match(
  remoteApply,
  /Object\.keys\(payload\.event\?\.playerPreviewAck \|\| \{\}\)/,
  "A remote event refresh must include published rules acknowledgements.",
);
assert.match(
  remoteApply,
  /Object\.keys\(store\.event\?\.playerPreviewAck \|\| \{\}\)/,
  "A remote event refresh must preserve device-local rules acknowledgements.",
);
assert.match(
  remoteApply,
  /\.\.\.\(payload\.event\?\.playerPreviewAck\?\.\[dayKey\] \|\| \{\}\)[\s\S]*\.\.\.\(store\.event\?\.playerPreviewAck\?\.\[dayKey\] \|\| \{\}\)/,
  "Rules acknowledgements must merge by day and player instead of one empty map replacing the other.",
);

console.log("Player rules acknowledgement refresh regression passed.");
