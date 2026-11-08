# Review repairs — 8 November 2026

## Completed first repair stage

- Away 15.97.16 removes personal profiles and private history fixtures from the current public distribution. Existing device profiles, scorecards and history are preserved. The public source scan found no remaining matches for the 49 former seed identities or registration numbers. Historical GitHub commits are not erased by this release.
- Away 15.97.17 / Scorer 0.5.10 preserve course identity. Same-named clubs are flagged for review rather than merged or remapped. Locked events use only their saved course cards; a missing card pauses player scoring instead of using the current master.
- Hardcoded automatic Oatlands card replacements are disabled. Accepted corrections come through the master course workflow.
- A shared transport bounds headers and body reads, cancels the request and leaves uncertain writes to the existing revision-aware reconciliation. Scorer polling recovers after a stalled request and reports cloud freshness.
- Release files come from one installed cache. Missing scripts fail visibly; a new worker does not claim running scorecards. Explicit testing tools remain outside the production precache.
- Scorer database-test dependencies use a normal ignored installation from the pinned lockfile, replacing the tracked machine-specific symlink. Run `npm ci --prefix tests/database --ignore-scripts --no-audit --no-fund` on a fresh checkout.

No real events were closed, deleted or recalculated in this stage. No database schema was changed.

## Remaining repair stage

1. Stronger server validation of final snapshot completeness and canonical accepted-score correspondence.
2. Compact final event history before applying its immutable lock, with event-specific local cleanup receipts.
3. Individually migrate identified legacy completed events while preserving original awarded outcomes. Do not apply broad cloud deletions or silently regenerate historical prizes.
4. Persist Scorer season settings and an immutable annual award, with explicit member reconciliation and agreed tie handling.
5. Review historical public GitHub copies separately, and address measured database advisor items.
6. Validate actual phone sleep, poor reception, interrupted replies and reconnection using synthetic events before asserting field reliability.

## Verification

The maintained suites and targeted reproductions cover privacy preservation, course identity, published-card isolation, request cancellation/recovery, release-cache isolation, score acceptance and existing event workflows. Browser and real multi-phone checks remain outstanding. A successfully published build does not establish radio-network reliability.
