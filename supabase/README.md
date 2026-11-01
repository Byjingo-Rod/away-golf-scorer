# Away Golf database migrations

This directory is the authoritative database history for Away Golf.

## Migration order

Files in `migrations` are applied in timestamp order. The first six files reconstruct changes that predate the live Supabase migration ledger. Their timestamps provide deterministic replay order and are not claimed as exact installation times. Files from `20261007232742` onward were exported directly from the production migration ledger.

For the existing production project, do not run the six pre-ledger files again. Before using `supabase db push` for the first time, reconcile those six files as already applied with `supabase migration repair --status applied <timestamp>`, then confirm that `supabase migration list` shows local and remote history aligned. A clean replacement project applies every file from the beginning.

All new database changes must be created as a new timestamped file in `migrations`, tested on a disposable database or branch, reviewed, and then applied once. Do not alter the production database directly in the SQL editor and do not edit a migration after it has been applied.

## Production export

The `schema` directory is a read-only catalog export captured from production. It records tables and columns, constraints, indexes, triggers, function definitions, grants, RLS policies, Realtime publication membership and the migration ledger. Refresh the export after every accepted database migration.

Run `tests/verify-production-schema.sql` against the target database after deployment. The verification is read-only and fails when an expected schema protection is missing.

## Historical scripts

The former one-off SQL files are retained under `database/history/legacy` for audit reference. They are not deployment inputs and must not be run. The ordered migration directory supersedes them.

## Empty-project reconstruction

Before replaying the ordered history in an empty replacement project, set `away.rebuild_mode` to `fresh` for the migration session and set `away.course_owner_email` to the verified owner account email. Auth users and platform extensions must already exist. The last reconciliation performs its complete routine/ACL reconstruction only in explicit fresh mode and refuses it if event or course rows exist. In production it only retires obsolete bridge triggers/jobs. Never enable fresh mode on the working production database.

The first pre-ledger baseline includes three exported helper prerequisites missing from the historical ledger. Applied production migrations were not rewritten.

The owner approved the cross-project course access update on 2 November 2026 (Sydney). The companion `ges-course-master-identity.sql` was applied to Golf Event Scorer as migration `20261101183609_course_master_verified_identity`, and Away's `course-master` Edge Function version 2 is active. Both apps continue to use Away's single authoritative course catalogue; Event Scorer retains course references and approval projections.

Verification passed: deployed source matches the repository; isolated gateway and identity tests cover approved, suspended, unapproved, anonymous and owner identities; live read-only checks confirm existing-account permissions and grants; live HTTP requests reject missing and invalid sign-ins. A signed-in browser end-to-end test was not performed in this deployment session.

## Lifecycle acceptance in 15.97.03

Migration `20261101213243_event_lifecycle_acceptance` adds server opening, team acceptance, round locks, final sign-off and idempotent publication guards. It changes no existing event or score rows. Guest permission checks also deny the older closed-plan representation. See `docs/LIFECYCLE_15_97_03.md`. Run both the schema verifier and `supabase/tests/lifecycle-pure.sql` read-only against production; all fixture-based tests must run only in an isolated database.
