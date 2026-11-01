# Away Golf 15.97.03 — lifecycle corrections

This release implements the nine findings from the 2 November 2026 review of 15.97.02. It preserves the Away-owned single course master and makes no change to Event Scorer's separate project.

| Finding | Delivered behaviour |
| --- | --- |
| F1 Ambrose acknowledgement | A durable pending submission survives failed reception. Each device submits only its own card. Player and organiser entry wait for the exact accepted receipt; all required submissions must be accepted before team completion. |
| F2 Ambrose validation | Cloud checks published scorer/marker roles, team drives, gross/drive agreement and drive compliance. A correctly declared non-compliant result can be submitted and excluded. |
| F3 Truthful event close | The client saves a retry intent and submits a dedicated confirmation request. It applies complete status and records history only after the exact receipt. A later refresh recovers a lost close response. |
| F4 Guest expiry | Successful close sets the authoritative complete status and revokes guest access in the same transaction. The trigger also watches event data; permission checks deny guests on older closed-plan representations. Owner/co-organiser authority is preserved. |
| F5 No eligible winner | Finished Scratch/Ambrose competitions can show Completed — No eligible winner with no award. Ambrose NTP completion uses the accepted team round rather than nonexistent individual cards. |
| F6 Publication retries | One persisted publication ID belongs to the organiser's event. Client exclusion, a server advisory lock and a unique index prevent duplicate creation. Closed publication identities cannot reopen their old event. |
| F7 Scoring gate | Player uploads require the published opening time in the course timezone or an explicit organiser early opening. Missing legacy timezones default to Sydney; new payloads record the organiser device timezone when local time is chosen. Published TEST overrides remain explicit. |
| F8 Final sign-off | Final confirmation verifies accepted cards, unresolved reviews and the score revisions the organiser reviewed. It records the actor and cloud acceptance time. Result-affecting corrections invalidate the prior seal. Corrected archived results can be confirmed without reactivating joining. |
| F9 Started-round locks | Final totals count as scores. The affected round's identities, handicaps, course, tees, start positions, scoring method and Ambrose roles/drives policy cannot be changed by a stale or modified plan. Unstarted later rounds retain permitted changes. |

The close request bypasses the ordinary pending-plan merge: an unacknowledged close must never be presented as an authoritative completed event during polling. The ordinary Safe Cloud adapter can also consume a server-returned event receipt without a second read after guest revocation.

The server keeps original sign-off information in `lastFinalResults` when corrections change results. Existing correction audit records retain the before/after values. Routine prize-award and history updates preserve the accepted seal; score and paper-result corrections require renewed confirmation. New event creation cannot seed a final sign-off.

## Validation

`tests/event-lifecycle-behaviour.mjs` executes the actual client handlers for failed storage, offline and stale receipts, separate marker submission, failed close/retry, no-winner completion, final-total locks and overlapping publication. Existing receipt, archive, workspace and score tests remain in the release suite.

`supabase/tests/event-lifecycle.sql` runs only on a disposable database. It tests publication identity, scheduled/early opening, incomplete/stale sign-off, three-player Ambrose with both role modes, guest expiry, correction invalidation, final-total locks, paper confirmation and archived reconfirmation for full-card/final-total methods. The ordinary four-player score RPC fixture also exercises final sign-off. Fixtures roll back.

The full ordered migration replay uses PGlite with explicit Supabase platform shims. This is not a hosted restore drill or a signed-in Samsung/Windows trial. The practical test described in the review remains the final device acceptance step. The existing unresolved archived review is retained for the organiser's decision.
