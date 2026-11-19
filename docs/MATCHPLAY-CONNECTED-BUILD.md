# Match Play connected build — prepared, not activated

The current owner review remains Development Review 8 with browser-local scoring. No connected endpoint is deployed. No production database rows or permissions have changed.

## Implemented

- `server/matchplay-service.mjs`: authoritative commands using the reviewed scoring model. Identity comes only from authenticated server membership. Player requests cannot replace a draw or choose another actor. Match/round access is checked on every write. Spectators and organisers cannot impersonate a player's score entry through this service.
- `server/matchplay-handler.mjs`: bounded JSON requests, explicit origin allowlist, no-cache responses and authentication adapter boundary. Internal errors are not returned to clients.
- `matchplay-connection.mjs`: durable pending command storage, exact-request retries after lost responses and conflict review. A stale entry is retained for review. It is never automatically rebased onto another player's newer save.
- The store contract requires an atomic revision compare-and-swap. Request receipts are kept for the event lifetime so a reconnect cannot repeat an accepted command. A spectator snapshot excludes registration identifiers and the audit record.

Run `node tests/matchplay-connection.mjs`. This invokes the HTTP request/response handler with two independent client stores and an in-memory canonical server store. Authentication and event membership are controlled test fixtures. It is not a live Supabase verification.

## Remaining activation work

1. Inspect current Away event membership, organiser and spectator policies through an approved database read. Do not trust client JSON or user-editable auth metadata.
2. Bind the authentication adapter to verified Away Auth identities and the membership adapter to canonical event records. Preserve the existing event-code flow. A name selection alone must not grant access to an already claimed player.
3. Implement and test a grade store with atomic conditional writes and durable receipts on an isolated database. Create a migration through the supported CLI workflow. No migration is included or applied in this build.
4. Wire the asynchronous transport into the player view. Show pending, connected and conflict states. Remove test role switching from connected sessions. Poll only visible connected views with backoff and one request in flight. Stop polling when leaving the event. Preserve unsent commands through reload.
5. Publish a separate connected development review after checking its audience and authentication flow. Verify two actual browser sessions plus a spectator. Exercise lost connectivity, corrections, concessions and next-round access before enabling installed Away.

## Blocker observed

The live schema read was not executed. Automatic approval review could not complete because the account usage limit had been reached. Do not route the same database operation through another tool to bypass this check. The development code can be prepared and tested locally while activation remains blocked.
