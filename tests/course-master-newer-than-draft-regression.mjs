import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(source, /Date\.parse\(acceptedCourse\.masterAcceptedAt \|\| ""\)/);
assert.match(source, /acceptedAt > draftSavedAt/);
assert.match(source, /A newer accepted cloud course replaced this unfinished device draft/);
assert.match(source, /localStorage\.removeItem\(draftKey\);\s*draft = null;/);

console.log("Newer accepted master courses supersede stale editor drafts safely.");
