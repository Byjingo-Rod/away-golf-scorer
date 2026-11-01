# Production schema export

This directory is the catalog export of the Away Golf production database captured on 1 November 2026 after the Recommendation 8 migration was verified.

The export contains no event, player, score or credential data. It records schema definitions only: tables and columns, constraints, indexes, triggers, functions, grants, RLS policies, Realtime publication membership and migration history.

After an accepted database migration, regenerate these files from the live catalog and run `supabase/tests/verify-production-schema.sql`. The ordered SQL in `supabase/migrations` remains the deployment source; these JSON files are the drift-review reference.
