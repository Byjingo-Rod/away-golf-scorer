import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const safe = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");

assert.match(app, /const unpublished = \(store\.eventWorkspace \|\| \[\]\)\.filter/);
assert.match(app, /publishedIdentities: JSON\.parse\(JSON\.stringify\(identities\)\)/);
assert.match(app, /cloudPlayers: \[\]/);
assert.match(app, /record => record\?\.event && !ids\.has/);

assert.match(app, /SAFETY_BACKUP_RETENTION_MS = 14 \* 24 \* 60 \* 60 \* 1000/);
assert.match(app, /expiresAt: new Date\(Date\.now\(\) \+ SAFETY_BACKUP_RETENTION_MS\)/);
assert.match(app, /function expireDeviceSafetyBackups\(\)/);
assert.match(app, /awayGolfStorageAuthorityMigrationV1/);

assert.match(app, /function removeConfirmedCourseDrafts\(library = getMasterCourseLibrary\(\)\)/);
assert.match(app, /!state\.pending\?\.\[id\].*!state\.conflicts\?\.\[id\].*!state\.proposals\?\.\[id\]/s);
assert.doesNotMatch(app, /if \(!save\(\)\)[\s\S]{0,250}localStorage\.removeItem\(draftKey\)/);

assert.match(safe, /if\(!unreadable&&prune\(\)\)storageWrite\(key,JSON\.stringify\(state\)\)/);
assert.match(app, /Unpublished-plan recovery journal/);
assert.match(app, /Unfinished course edit — retained until master save/);

console.log("Storage authority consolidation regression checks passed.");
