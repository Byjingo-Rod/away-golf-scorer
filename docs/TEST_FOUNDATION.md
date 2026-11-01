# Away Golf test foundation

## Purpose

The release suite must answer two separate questions:

1. Does each protected feature still behave as designed?
2. Is the release version consistent across the visible App and cached files?

Historical feature tests therefore do not assert the version that was current when the feature was introduced. Version consistency is checked once by `release-version-consistency.mjs`.

## Running the suite

From the Away Golf repository root:

```text
node tests/run-release-suite.mjs
```

The runner executes every `.mjs` and `.cjs` test in a stable order, reports each result and exits unsuccessfully if any test fails.

## Repair rules

- Preserve a test when it still protects current behaviour.
- Update its harness when the production function has gained a dependency.
- Update wording assertions only after confirming the new wording is intentional.
- Investigate behavioural mismatches before changing either the App or the test.
- Retire a test only when the behaviour itself has been deliberately removed or replaced, and record the reason here.
- Do not publish an App version for test-only changes.

## Stage 1 record

- Removed historical exact-version assertions from feature tests.
- Added a single release-version consistency test.
- Added a deterministic release-suite runner.
- Repaired harness drift without changing production App behaviour.
- Confirmed the complete release suite passes: 114 tests passed, 0 failed.

### Superseded checks removed

- Removed the one-off 2026 Ridge history-recovery test after that migration code was retired.
- Removed assertions tied to superseded HTML attributes and internal variable names for Yellow Ball, Ambrose, paper-card entry and saved-copy review.
- Removed checks for the former two-choice score-entry panel; current per-day score-entry controls remain protected by current tests.
- Removed the former automatic restoration of a generic Middle tee. Category-specific named tee planning is now authoritative.
- Removed implementation-specific checks for the former Special Rules editor and leaderboard renderer while retaining their current behavioural protections.
- Removed the former local-only automatic-finalisation assertion. Current completion protection waits for the authoritative scorecard state and is covered by the score-save and reconciliation tests.
- Removed six legacy source-snapshot files from versions 15.86–15.93. They asserted exact internal variable names and HTML fragments rather than outcomes. Their current behaviour remains covered by the Yellow Ball, short-team, paper-card, tee-planning, spectator and event-history behavioural tests.
- Removed obsolete display-copy checks for the discarded course-draft notice and the compact NTP prize line. The underlying draft-authority and NTP jackpot calculations remain tested.
- Updated workspace tests to protect the current rule: matching cloud links or identical contents do not authorise automatic plan deletion; only an explicit organiser action may remove a saved plan.
- Replaced the former incomplete-course-draft recovery expectation. A more complete accepted course card now remains authoritative and the incomplete device draft is removed.
