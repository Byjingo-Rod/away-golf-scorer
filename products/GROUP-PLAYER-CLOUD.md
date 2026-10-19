# Online group players

Use **Group Players · Online** from the scoring preview or **Open Group Players** from Groups & Organiser Accounts. Sign in through Groups & Organiser Accounts first. An enabled group with an activated setup is required. Owners may manage any activated customer; organisers only their own authorised groups.

Complete player details, optional GA, inactive status and revisions are saved in the separate Golf Event Scorer Supabase project. Refresh Players fetches the current list on another signed-in device. Search checks this saved roster only. No external registration-number lookup is performed.

Local preview players are not automatically uploaded or merged. The local scoring planner and event drafts are not yet connected to this roster. No claims of event publishing or live phone scoring are made.

Apply `golf-event-scorer-player-cloud.sql` after the existing database and customer setup scripts. It adds a details column and a guarded RPC; direct table mutations remain denied. Save requires current group access, activated/enabled group and expected record revision. New records use client-generated UUIDs so identical initial-save retries do not duplicate players. The RPC retains the established security-definer API pattern with an empty search path, explicit authorisation checks and no anonymous execute grant.

Verification:

- `node tests/golf-event-roster-model.mjs`
- `tests/golf-event-roster-access.sql`, a transaction with disposable fixtures and final rollback, verifies details/retries/inactive/reactivate/conflict, cross-group read and write denial, organiser revocation and anonymous denial.
- Supabase security advisor checked. Its authenticated security-definer warning is expected for the guarded RPCs; review guidance: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable . Existing leaked-password-protection warning remains: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection . This release does not introduce password sign-in.

Customer release still requires configured email delivery (Supabase's default email service was insufficient for customer sign-in), Site customer sharing, full group-scoped planner/event integration, phone publishing and an end-to-end customer test. The Site remains owner-private during development.
