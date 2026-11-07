# Awarded results and event cleanup

Prepared versions: Away 15.97.13; Golf Event Scorer 0.5.07.

After prize-giving, the organiser chooses **Finish Event and Keep Final Results**, naming the event and its date. This differs from an ordinary archive: it makes the accepted results permanent. Apply the matching awarded-results migration before deploying the client. Installation never finishes an event automatically.

The database transaction locks the event, checks its revision and accepted score revisions, retains the accepted official cards and a snapshot of the final competition rows/results, marks the event archived, then removes obsolete conflicts and correction copies. Guards reject later changes from old clients, returning phones and organiser correction routes. A repeated finish request returns the same receipt.

Returning devices recognise the online finish marker, delete local unsent/review copies and use canonical final results. App Storage checks older saved events for this marker. Unavailable or unfinished events stay protected. Other events, player records and master courses remain intact. Older archived events need a valid online sign-off before finishing.

Scorer adds **Annual Single Stableford** in the group planner. The organiser selects a calendar year, eligible finished events and a drop allowance of 1–5. For y included rounds, x=max(0,y−allowance). Each member’s missed rounds are zero, and only their best x results count. Further absences remain zero. Member IDs, rather than names, join the history. Substitutes use their actual profile identity. Equal totals share a place. The report shows played rounds, aggregate, and every counted/dropped result.

Individual Stableford totals can be retained even when the daily prize was only 4BBB. Ambrose, gross-only and incomplete individual-total rounds are excluded; a pair’s combined score cannot be turned into individual Stableford points. TEST events never enter annual totals. Group history is read from the cloud without a 100-event client limit.

No live events have been finished and no production data has been deleted while developing this update.

Validation: Away release suite 138/138; Scorer current checks 270/270; isolated database tests verify finalization, permissions, revision checks, immutable scores and results, retry receipts, and retention. Annual calculation and returning-phone cleanup tests pass. A graphical browser check could not run in this execution environment. Production migrations and app publication are pending.

## Older-storage repair (Away 15.97.14 / Scorer 0.5.08)

App Storage now resolves cloud event names/dates in one metadata request. Unchanged caches whose original cloud events have been deleted can be removed; pending edits, conflicts, and the current event remain protected. TEST is recognised as a whole word anywhere in an event name.

Away recognises already-archived historical prize sign-offs, using a local receipt without altering any cloud scores, emergency recoveries, correction records or recorded prize outcomes. These copies are then eligible for automatic local cleanup. The metadata repair also provides a named route for older events whose accepted cards are complete but whose organiser never pressed Close. Only an explicit organiser confirmation can finish such an event, using atomic online sign-off before any local deletion.

Safety review rejected the earlier broad cloud backfill/deletion. The published repair uses read-only metadata and local cache cleanup instead; no cloud event, score, recovery or correction record is deleted by the repair.
