import assert from "node:assert/strict";
import fs from "node:fs";

const safeCloud = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(safeCloud, /if\(!s\.conflict\.id\)/);
assert.match(safeCloud, /raw\.safeControl\("retain",s\.conflict\)/);
assert.match(safeCloud, /s\.conflict\.id=retained\.id/);
assert.match(safeCloud, /delete s\.conflictUploadError/);
assert.match(safeCloud, /raw\.safeControl\("status",\{event_id:id,id:s\.conflict\.id\}\)/);
assert.match(html, /Version 15\.96\.42/);
assert.match(sw, /away-golf-v15-96-42/);

console.log("15.96.42 protected-conflict retry regression passed");
