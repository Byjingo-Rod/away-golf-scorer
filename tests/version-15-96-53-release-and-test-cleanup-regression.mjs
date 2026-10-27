import assert from "node:assert/strict";
import fs from "node:fs";

const cloud = fs.readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const release = cloud.match(/async function releasePlayer[\s\S]*?\n  }/)?.[0] || "";
const releaseCode = release.replace(/\/\/.*$/gm, "");
assert.match(release, /update\(\{ member_user_id: null, joined_at: null \}\)/);
assert.doesNotMatch(releaseCode, /\.select\(/, "released rows must not be selected after RLS hides them");
assert.doesNotMatch(releaseCode, /\.single\(/, "release must not require a returned row");

const archiveTests = cloud.match(/async function archiveAllOwnedEvents[\s\S]*?\n  }/)?.[0] || "";
assert.match(archiveTests, /select\("id,name,status"\)/);
assert.match(archiveTests, /\\btest\\b/i);
assert.match(app, /Only published events with TEST in their event name/);

assert.match(index, /Version 15\.96\.53/);
assert.match(worker, /away-golf-v15-96-53/);

console.log("15.96.53 release and test-cleanup regression passed");
