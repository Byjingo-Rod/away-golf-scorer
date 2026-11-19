# Away Match Play integration — development stage 1

Match Play is selected in Event Details, before player selection. Its plan uses Away's normal day dates, courses, start times and tee controls. All existing tee positions remain selectable; Back is the initial selection.

The qualifier page accepts Excel tab-separated cells, with optional recognised headings. Each enabled men's/ladies' grade has 16 seeds and up to five reserves. Playing handicaps are event-only qualifying figures, including plus handicaps. Scratch displays disabled GA/handicap fields. Importing does not modify saved player GA profiles. Other competition options are disabled and removed from the Match Play plan.

Saving produces the fixed 16-seed knockout tree and four opening tee groups: match 1 with 8, 2 with 7, 3 with 6, 4 with 5. Each grade has its own model. Round dates/times and round course/tee snapshots are retained. The first four normal playing days correspond to the four knockout rounds. Normal golf-event pairing stays on its existing path.

## Release boundary

This branch is a development integration, not a live Match Play release. Match Play cloud publication and update are blocked until the match-specific player joining, score operations, confirmations, event permissions, offline recovery and multi-device synchronisation are connected. No database changes are applied by this branch. Do not merge/release it as a fully playable Match Play event.

The reviewed standalone Match Play design remains the reference for player screens, match overviews, grade-range editing, referee allocation and print stages. Subsequent work must complete those full integrations, including per-round starts/index selection and qualifier handicap snapshots on the server.

## Checks

- `node tests/matchplay-planning.mjs`
- `node tests/matchplay-model.test.mjs`
- `node tests/matchplay-handicaps.test.mjs`
- `node tests/spreadsheet-workflow.cjs`
- `node tests/player-profile-handicap.mjs`
- `node tests/phone-team-handicap.cjs`
- `node tests/code-separation-regression.mjs`
- `node tests/version-15-96-33-organiser-tablet-wizard-refresh-regression.mjs`

Browser-tested: new event selection; all tee options with Back default; handicapped qualifier paste; plus handicap; side-competition exclusion; save fixed draw; reopen all 16 qualifiers; Scratch disables the handicap controls.

Shared rules source: `matchplay-model.mjs`. Rebuild its classic-browser wrapper using `node scripts/build-matchplay-core.mjs` after model changes.
