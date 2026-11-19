# Connected development review — stage 13

`/connected-review` uses an isolated Sites Worker and D1 database. Installed Away and live Supabase events are unchanged. Earlier layout and planning pages remain browser-local.

The owner signs in to the same private Site on each device. Matching test codes identify the same sample event. Alex and Parker receive distinct server-issued review sessions. Spectators cannot score. This is an owner-operated sample harness. Selecting a review role is not real-player authentication.

The SQL store uses conditional revision writes and durable command receipts. Exact retries after a lost response cannot repeat an accepted save. Tokens are hashed at rest and bound to the authenticated Site owner. Sessions expire after seven days. Test events remain until explicit cleanup is added. New codes start fresh events without deleting old tests.

The connected scoring view sends commands to the authoritative service. It has no player-switch controls. Polling pauses when hidden and backs off after failures. Unsent entries stay in local storage. A stale entry requires explicit review and removal before re-entry. It is never silently rebased.

Checks: `tests/matchplay-session.mjs`, `tests/matchplay-connection.mjs` and `tests/matchplay-connected-worker.mjs <worker-bundle> <migration>` pass. The Worker test uses actual SQLite tables with separate player sessions. It checks owner isolation, read-only spectators, score sharing, stale writes, receipt replay and concession confirmation. Hosted browser checks and physical phone tests must be reported separately.

Build: retain the existing Site project ID. Install the dependencies in `connected-review/package.json` at the Sites checkout root. Copy the reviewed static assets with `scripts/build-matchplay-review.mjs` then run `connected-review/scripts/build-connected.mjs` in that checkout. Copy `matchplay-model.mjs`, `matchplay-session.js`, `matchplay-connection.mjs` and `server/matchplay-service.mjs` to matching root paths. Use `d1: "DB"` with no static manifest field. Generate schema changes through `npm run db:generate`. Preserve applied SQL and Drizzle metadata. The packaging workflow includes migrations for platform application.

Still required for real Away: verified Away identities and canonical event membership, organiser publishing, access for every qualifier, full multi-round testing and real-phone reconnection testing. The earlier Supabase schema read did not execute because automatic approval review hit an account usage limit. This sample harness neither repeats that operation nor accesses that database.

## Review 14 fixes

Independent player fields use score-specific preconditions so an opponent’s save does not block an unrelated entry. The atomic revision guard still retries concurrent writes with the same field precondition. Same-field changes require comparison. Request receipts preserve exact retry identity including older queued requests. Rapid score taps persist in a queue and display immediately as pending. No optimistic score is described as cloud-saved until the queue clears.

Final confirmation explicitly accepts the player’s recognised marker scores for missing own checks. Existing disagreements still block confirmation. Both opponents must confirm before advancement. Concurrent confirmations compare the marked result while ignoring the other player’s confirmation flag. Tests cover missing checks on the deciding hole and simultaneous confirmations.

The latest completed all-square hole has a small A/s marker. It advances across consecutive square holes and disappears when the next completed hole gives either player a lead.

## Review 15

Both Concede Hole buttons lock as soon as either device has a complete own/marked score pair. The model enforces the same restriction. A tapped Next Hole is retained while saving or waiting for the other player. The screen advances once the required entries are available. Previous cancels a queued advance. Saving failures update the phone’s status text immediately. The fixed grade selector retains full text contrast.

Regression checks cover the concession guard, pending-save readiness, missing entries and readiness after the other device saves. Hosted verification checks the locked controls and automatic advance without a second tap.

## Review 16

A left swipe on the scoring phone invokes the same Next Hole button action. It uses Away’s 60-pixel threshold and horizontal direction ratio. Swipes starting on controls are ignored. Multi-touch and cancellation reset the gesture. Vertical scrolling is unchanged. Saving and opponent-entry waits retain the requested advance.
