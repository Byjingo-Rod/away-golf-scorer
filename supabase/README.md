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
