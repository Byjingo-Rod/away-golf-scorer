import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(
  app,
  /event\.status === "complete"[\s\S]*event\.status === "completed"[\s\S]*return "Completed"/,
  "My Events must recognise the status written when results are confirmed and the event is closed.",
);

console.log("Completed workspace status regression checks passed.");
