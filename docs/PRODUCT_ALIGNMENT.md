# Product alignment — 8 October 2026

Prepared versions: Away Golf 15.95.0 and Golf Event Scorer 0.3.0.
All four production database migrations were installed on 8 October 2026 after on-screen approval. The signed course bridge is configured and the initial exchange completed with no pending deliveries. Seven differing course cards are retained in both review queues. Frontend publication follows validation.

## Shared engine

Golf Event Scorer imports Away Golf 15.94.9 plus the shared location controls. Both builds now contain the same 1–7 day model, attendance/rest days, daily competition schedules, best counting-round Stableford, independent daily/overall prizes, Black Cap–White Cap, expanded Par 3 and Scratch, final-day NTP controls and day-specific putting validation. Existing Ambrose, Yellow Ball, virtual-player and whole-team swap behaviour is retained.

Golf Event Scorer retains its own blue assets, group accounts, customer activation, approved courses, player limits, isolated storage, live API and group draft saves. The build adapter preserves newer shared helper functions and explicitly disables Away's master API inside Golf Event Scorer. The canonical shared source remains Away Golf's GitHub repository. Use `tools/sync-shared-source.py --checkout <clean committed Away checkout>` in Golf Event Scorer before rebuilding after future shared changes. The imported commit and content hashes are recorded; generated files are never edited.

## Course alignment

Both editors use Australia by default; retained Country, State/Province and Region/Area values; the seven requested alphabetical Australian areas; retained new areas; and metres/yardage with canonical rounded metres. Golf Event Scorer has tee-colour selection and organiser corrections with an owner audit notice.

The prepared course bridge replicates courses and location vocabulary only. It does not replicate organisers, customers, players, events or scores. Both databases keep their existing IDs, permissions and revision checks. Incoming differences are retained for explicit owner review instead of overwriting another saved card. Private snapshots preserve previous details. Published events continue using their snapshots. New master cards do not silently alter live events.

The bridge uses authenticated HMAC-signed server-to-server messages, a private durable outbox, replay-safe inbox, conflict review and minute-based retry. The shared secret belongs only in private database settings, never source, browser code or logs. Configuration and the initial queued catalogue exchange are complete. Mollymook, Pennant Hills, Federal, Shoalhaven Heads, Lynwood, Cypress Lakes and Oatlands have differing saved cards requiring an explicit owner choice.

## Required deployment sequence

1. Apply `products/golf-event-scorer-seven-day.sql` to Golf Event Scorer. This additive migration keeps Days 1–2 in the existing score table and adds Days 3–7 in a private companion table; both are returned through the existing scoring API. Every playing day's course is checked against its group's approvals.
2. Apply `database/course-bridge-away.sql` to Away Golf and `database/course-bridge-ges.sql` to Golf Event Scorer. Configure their private settings with one fresh high-entropy secret and each peer's verified URL/publishable key. Populate location vocabulary from existing saved courses/countries; enqueue each existing course using the private enqueue function. Review differing initial copies before treating them as one accepted catalogue.
3. Apply `products/golf-event-scorer-course-corrections.sql` to Golf Event Scorer. Public save remains an invoker wrapper; private validated writes allow only the owner or an active organiser of a group approved for that course. Direct organiser table updates stay unavailable.
4. Run rollback SQL checks for day-seven saves, unauthorised course/day saves, group limits, suspension, signed-message rejection, duplicate delivery, stale conflicts and organiser correction notices; run database security advisors.
5. Build both products, run the alignment/client checks, publish Golf Event Scorer through Sites and Away Golf through its normal GitHub release. Confirm installation on organiser PC/tablet and a player phone.

## Verification completed locally

Generated Golf Event Scorer engine parity; seven-day planning; competition formats and cap teams; balanced short teams/NTP; Yellow Ball paper results; course models and copies; yardage/putting/location editor handlers; group planner mapping; live API client; SQL statement parsing and PL/pgSQL syntax parsing (private row types substituted with generic records for the offline parser).

Live rollback tests passed for seven-day event publication/scoring, player limits, token access/release, suspension, owner course persistence, stale saves, invalid cards and unauthorised course writes. Both database security advisors were reviewed; existing warnings and intentional permission-checked RPC warnings remain. No installed-device verification is claimed.
