# Golf Event Scorer group accounts — development setup

This is a development milestone, not a live event release. It adds database
permissions, an owner/group account screen, a private roster and monthly draft
details. Full event setup, phone joining/scoring, completed-result import and
history-aware draws are not yet connected to the group database.

## Separate project

Create a new Supabase project for Golf Event Scorer. Do not run this migration
in the Away Golf project. Run `products/golf-event-scorer-database.sql` once in
the new project's SQL Editor. The migration creates only `ges_` tables/functions.

Configure email authentication and set the permitted sign-in redirect to the
development site's `groups.html` URL. A confirmed individual email account is
required. Signing in creates an account but gives it no group permissions.

Update `products/golf-event-scorer-assets/account-config.js` with the new project
URL and its `sb_publishable_...` key. Never put a secret/service-role key in this
file. The account client rejects the existing Away Golf database address.

Build with `npm run build:products` and serve `dist/golf-event-scorer` over HTTP
on localhost for development, or HTTPS on an isolated development host.

## Register Rod as owner

First sign in to Groups & organiser accounts with Rod's email. After that email
is verified, run the following in the NEW project's SQL Editor, replacing the
example email with Rod's actual sign-in email:

```sql
insert into public.ges_owners(user_id)
select id from auth.users
where lower(email) = lower('YOUR_VERIFIED_EMAIL')
  and email_confirmed_at is not null
  and coalesce(is_anonymous, false) = false
on conflict do nothing;
```

Refresh the group account page. Only a trusted SQL operator can register an
owner; the app cannot register itself as owner.

## Approve a group organiser

Rod creates a group. The proposed organiser signs in and verifies their own
email, then Rod enters that email in Approve organiser for the selected group.
There is no email invitation issued automatically by the approval operation.
The organiser refreshes to see the approved group and can add players and
create/edit event drafts. Rod can suspend an organiser or the entire group.
Suspension blocks subsequent database operations while retaining records.
Previously downloaded information cannot be remotely erased.

Each record carries a group ID. Organisers cannot grant access, create another
group, edit owner records or move events/players between groups. Writes run
through checked functions. Draft edits include a revision to prevent one
device silently overwriting another. Results/status updates are reserved for
the next scoring integration; browsers cannot arbitrarily mark events complete.

## Verification

`npm ci` then `npm run test:groups` runs the migration and permission cases in
embedded PostgreSQL (PGlite), with a minimal Supabase Auth fixture. This validates
SQL/RLS behavior but does not validate hosted email delivery or the configured
Supabase project. Before live use, run a staging test with Rod, an approved
organiser, another group organiser and an unapproved account.
