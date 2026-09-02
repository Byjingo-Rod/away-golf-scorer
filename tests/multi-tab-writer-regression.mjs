import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const rawStoreWrites = app.match(
  /localStorage\.setItem\("awayGolf13", JSON\.stringify\(store\)\)/g,
) || [];

assert.equal(
  rawStoreWrites.length,
  1,
  "all organiser-store writes must pass through writeLocalStore",
);
assert.match(app, /AWAY_GOLF_WRITER_LEASE_KEY/);
assert.match(app, /window\.addEventListener\("storage"/);
assert.match(app, /Older tab — close this copy/);
assert.match(
  app,
  /localStorage\.getItem\(AWAY_GOLF_WRITER_LEASE_KEY\) !== appTabId/,
);

console.log("Multi-tab writer regression checks passed.");
