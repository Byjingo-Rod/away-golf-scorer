# Connected development review — stage 13

`/connected-review` uses an isolated Sites Worker and D1 database. Installed Away and live Supabase events are unchanged. Earlier layout and planning pages remain browser-local.

The owner signs in to the same private Site on each device. Matching test codes identify the same sample event. Alex and Parker receive distinct server-issued review sessions. Spectators cannot score. This is an owner-operated sample harness. Selecting a review role is not real-player authentication.

The SQL store uses conditional revision writes and durable command receipts. Exact retries after a lost response cannot repeat an accepted save. Tokens are hashed at rest and bound to the authenticated Site owner. Sessions expire after seven days. Test events remain until explicit cleanup is added. New codes start fresh events without deleting old tests.

The connected scoring view sends commands to the authoritative service. It has no player-switch controls. Polling pauses when hidden and backs off after failures. Unsent entries stay in local storage. A stale entry requires explicit review and removal before re-entry. It is never silently rebased.

Checks: `tests/matchplay-session.mjs`, `tests/matchplay-connection.mjs` and `tests/matchplay-connected-worker.mjs <worker-bundle> <migration>` pass. The Worker test uses actual SQLite tables with separate player sessions. It checks owner isolation, read-only spectators, score sharing, stale writes, receipt replay and concession confirmation. Hosted browser checks and physical phone tests must be reported separately.

Build: retain the existing Site project ID. Install the dependencies in `connected-review/package.json` at the Sites checkout root. Copy the reviewed static assets with `scripts/build-matchplay-review.mjs` then run `connected-review/scripts/build-connected.mjs` in that checkout. Copy `matchplay-model.mjs`, `matchplay-session.js`, `matchplay-connection.mjs` and `server/matchplay-service.mjs` to matching root paths. Use `d1: "DB"` with no static manifest field. Generate schema changes through `npm run db:generate`. Preserve applied SQL and Drizzle metadata. The packaging workflow includes migrations for platform application.

Still required for real Away: verified Away identities and canonical event membership, organiser publishing, access for every qualifier, full multi-round testing and real-phone reconnection testing. The earlier Supabase schema read did not execute because automatic approval review hit an account usage limit. This sample harness neither repeats that operation nor accesses that database.
