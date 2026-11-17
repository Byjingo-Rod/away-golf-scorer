# Away TEST event deletion — 15.97.41

An event whose first word is TEST (case insensitive; leading whitespace ignored)
uses permanent event deletion from both My Events and Event Options. The original
organiser types the exact name; published deletion requires an online connection
and current server revision. Shared players, courses and unrelated events remain.
TESTING, DEMO and names with TEST later in the title retain existing behaviour.
Player-phone departure is still a local departure, not organiser deletion.

The server atomically deletes the event, scores, participants, spectators,
organiser/guest keys, retained reviews/corrections and final/awarded results.
All eight dependent tables cascade from the event. Matching workspace references
are removed. Later writes cannot restore a dangling published-event pointer.
The privileged RPC implementation lives in a non-exposed private schema and
verifies identity, ownership, exact TEST name and revision on every request.
Ordinary awarded results remain immutable.

Updated clients clear event identities from workspaces, journals, pending copies,
review copies, safety snapshots, history and remembered connections. Reconnecting
clients confirm absence through server metadata, then clear/reload; network or
access errors do not authorise deletion. Offline/closed clients must reconnect
and run this update. Provider backups/logs and exported files are outside this
operation. No retained deletion tombstone is created.

Verification: isolated PostgreSQL tests exercise both migrations, ownership,
anonymous/outsider denial, exact names, stale revisions, all eight cascade paths,
workspace cleanup, stale-pointer prevention, completed TEST purge and genuine
awarded-result protection. Client tests cover naming boundaries, both delete
entry points, offline protection, cloud-before-local ordering, pending/review
copies, snapshots, history, shared records and reconnect confirmation. Syntax
checks passed for app, cloud adapter, purge helper and service worker. Ten existing
scoring/recovery/retention regression checks passed against the release app.
Four additional Scorer checks also failed on unmodified Away 15.97.40 (different
wording/source format or historical checks); no failure was introduced here.

No production customer event was deleted during implementation or verification.

Run the isolated suite with `npm ci --prefix tests/test-purge` followed by
`npm test --prefix tests/test-purge`. Dependencies are version pinned.
