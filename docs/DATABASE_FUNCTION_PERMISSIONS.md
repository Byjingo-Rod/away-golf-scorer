# Away Golf database function permissions

This document records the intentional public-schema function surface after
Stage 2 of the technical audit.

## Roles

- `anon`: no Away Golf function execution. A phone signs in before using the App.
- `authenticated`: deliberate App RPC gateways and the authority helpers used by
  row-level security policies.
- `service_role`: internal course-transfer and support operations, except trigger
  functions which have no direct caller.
- `PUBLIC`: no function execution inherited by every database role.

## Authenticated App gateways

| Purpose | Functions |
| --- | --- |
| Event discovery and joining | `away_event_invitation`, `join_away_event`, `spectate_away_event` |
| Organiser access | `claim_away_organiser_access`, `create_away_organiser_key`, `claim_away_guest_organiser_access`, `create_away_guest_organiser_key`, `revoke_away_guest_organiser`, `away_guest_organiser_active` |
| Event creation and status | `create_away_event`, `away_event_spectator_count` |
| Score and event control | `golf_safe_away_save`, `golf_safe_control` |
| Course management | `away_course_master_identity`, `golf_catalogue_reviews` and the authenticated course editing functions |

Each gateway performs its own identity, membership, organiser or owner check.

## RLS authority helpers

The following functions remain executable by `authenticated` because policies
on events, players and scorecards call them while evaluating row access:

- `is_away_event_organiser`
- `is_away_event_member`
- `is_away_event_spectator`
- `can_write_away_round`

They answer questions about the current signed-in identity; they do not accept
an identity supplied by the caller.

## Trigger-only functions

`away_touch_revision` and `away_revoke_guests_when_event_closes` are invoked only
by database triggers. Direct execution is revoked from `PUBLIC`, `anon`,
`authenticated` and `service_role`.

## Future functions

Default execution is revoked from `PUBLIC`, `anon` and `authenticated`. Every
new authenticated RPC must receive an explicit grant in the same migration that
creates it.

