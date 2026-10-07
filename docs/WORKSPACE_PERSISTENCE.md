# Saved event protection — 15.94.6

Confirmed code defects, not a definitive reconstruction of the missing Test Vietnam and St Georges Basin plans:

- Save Draft previously reported success when the writer lease rejected persistence from an older window.
- Startup deduplication could remove distinct workspace records sharing copied cloud links or identical contents.
- Capture could overwrite a different workspace record through a cloud-ID fallback.
- Journal protection checked counts rather than missing IDs, and replaced the active event when restoring.

Each saved plan now retains its own workspace identity. Journal recovery adds missing records without replacing current edits. Explicit delete/import operations retain their existing intentional-removal exemption. Save Draft keeps the editor open on rejected writes or storage errors; a new draft captures the prior event first and retains its ID on repeat saves.

A closing window releases its writer lease. An older editor can retry after the other window closes, reloads the latest stored data before resuming, and preserves the other window's plans. Abrupt process termination may leave the lease behind; reopening the app establishes a new lease. The warning does not promise automatic recovery after a crash.

These changes do not recover records already absent from both the local store and its journal. They do not add cross-device planning synchronisation or transfer seven-day features to Golf Event Scorer.

Validation: node tests/workspace-persistence.cjs, trip-competition-formats.cjs, seven-day-model.cjs, multiple-short-teams.cjs, yellow-ball-paper-entry.cjs and node --check app.js. Persistence tests execute the actual source functions with a simulated browser storage backend; they are not live installed-PWA tests.
