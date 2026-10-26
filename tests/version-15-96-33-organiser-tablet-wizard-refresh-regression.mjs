import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = fs.readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /if \(restoreOrganiser\) refreshOpenWizardFromCloud\(\)/);
assert.match(app, /!store\.cloud\.restorePublished && !store\.cloud\.secondaryOrganiser/);
assert.match(app, /function refreshOpenWizardFromCloud\(\)/);
assert.match(app, /classList\.contains\("open"\)/);
assert.match(app, /event: JSON\.parse\(JSON\.stringify\(store\.event\)\)/);
assert.match(app, /competitions: new Set\(store\.event\.competitions \|\| \[\]\)/);
assert.match(app, /renderWizard\(\)/);
assert.match(app, /eventWorkspaceStatus\(record\.event\) !== "Draft"/);
assert.match(app, /await openPublishedEvent\(/);
assert.match(app, /Published events belong to the live organiser workspace/);
assert.match(cloud, /function isExpiredSessionError\(error\)/);
assert.match(cloud, /client\.auth\.refreshSession\(\)/);
assert.match(cloud, /async function retryAfterSessionRefresh\(operation\)/);
assert.match(cloud, /client\.rpc\("golf_safe_away_save",args\)/);
assert.match(cloud, /Your scores remain saved on this phone/);
assert.match(app, /Scores safe on phone · secure connection retrying/);
assert.match(html, /Version 15\.96\.35/);
assert.match(sw, /away-golf-v15-96-35/);

console.log("15.96.33 organiser tablet wizard refresh regression passed");
