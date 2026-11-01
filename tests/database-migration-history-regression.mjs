import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrationDir = path.join(root, "supabase", "migrations");
const historyDir = path.join(root, "database", "history", "legacy");
const migrations = fs.readdirSync(migrationDir).filter(name => name.endsWith(".sql")).sort();

assert.ok(migrations.length >= 19, "the ordered database history must be retained");
assert.deepEqual(migrations, [...migrations].sort(), "migration filenames must sort into execution order");
assert.equal(new Set(migrations.map(name => name.slice(0, 14))).size, migrations.length, "migration timestamps must be unique");
assert.ok(migrations[0].includes("initial_secure_schema"), "the history must begin with the secure baseline");
assert.ok(migrations.some(name => name.includes("restrict_away_function_permissions")), "the Stage 2 permission migration must be present");
assert.ok(migrations.some(name => name.includes("database_catalog_efficiency")), "Recommendation 8 performance corrections must be present");

const historicalReadme = fs.readFileSync(path.join(historyDir, "README.md"), "utf8");
assert.match(historicalReadme, /Do not execute files in this directory/i);
for (const obsolete of [
  "supabase_schema.sql",
  "supabase_v15_55_organiser_tablet.sql",
  "supabase_v15_90_guest_organiser.sql",
]) {
  assert.equal(fs.existsSync(path.join(root, obsolete)), false, `${obsolete} must not remain an executable root script`);
  assert.equal(fs.existsSync(path.join(historyDir, obsolete)), true, `${obsolete} must remain available as historical evidence`);
}

const verification = fs.readFileSync(path.join(root, "supabase", "tests", "verify-production-schema.sql"), "utf8");
for (const required of ["pg_indexes", "pg_publication_tables", "relrowsecurity", "aclexplode", "pg_trigger"]) {
  assert.match(verification, new RegExp(required));
}

console.log("Database migration history regression checks passed.");
