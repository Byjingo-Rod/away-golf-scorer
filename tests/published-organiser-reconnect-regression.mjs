import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", source.indexOf(") {", start) + 2);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not read ${name}`);
}

for (const name of ["openPublishedEvent", "recoverOrganiserEvent"]) {
  const fn = functionSource(name);
  assert.match(fn, /store\.cloud = \{[\s\S]*?role: "organiser"/);
  assert.match(
    fn,
    /workspaceShrinkAuthorised = true;\s*persistStore\(\);/,
    `${name} must prevent the safety journal restoring a disconnected state`,
  );
}

const capture = functionSource("captureCurrentEvent");
assert.match(
  capture,
  /store\.event\.previewPublishedAt/,
  "a cloud preview must be recognised as published during workspace capture",
);
assert.match(
  functionSource("openPublishedEvent"),
  /store\.event\.joinCode = code;[\s\S]*?store\.cloud = \{/,
  "opening a published event must attach its join code before saving",
);

const captured = Function(
  `let store = {
     event: { name: "Federal", previewPublishedAt: "2026-09-06T00:00:00Z" },
     eventWorkspace: [],
     cloud: { role: "organiser", eventId: "federal-id", joinCode: "2E8089" },
     cloudPlayers: []
   };
   const uid = () => "federal-workspace";
   const forgetOrganiserEvent = () => { throw new Error("organiser mode was incorrectly removed"); };
   ${functionSource("workspaceIdFor")}
   ${functionSource("captureCurrentEvent")}
   captureCurrentEvent();
   return store;`,
)();
assert.equal(captured.cloud.role, "organiser");
assert.equal(captured.eventWorkspace[0].cloud.joinCode, "2E8089");

console.log("Published-event organiser reconnection regression checks passed.");
