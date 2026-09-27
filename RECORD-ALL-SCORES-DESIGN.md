# Record All Scores — Functional Design

## Purpose

Allow an Owner or Guest Organiser to enter signed paper team cards after a round when phone reception prevents normal scoring. Manual entry may be used for Day 1, Day 2, or both. A manually entered day must combine correctly with a normally phone-scored day in every selected competition and two-day aggregate.

## Entry point

Add **Record All Scores** to Organiser's Live Event Control beside Emergency Score Recovery.

The opening screen contains:

1. Day 1 / Day 2 selector (only when the event has two days).
2. One card for each team, showing Draft, Ready, or Submitted.
3. A warning if phone scores already exist for the selected day/team.
4. **Open Team Card**, **Edit**, and **Complete Day Results** actions.

Only the Owner or delegated Guest Organiser may use this feature.

## Adaptive team card

The card is generated from the event's selected competitions and configuration. It does not show irrelevant fields.

| Competition | Required paper-card entry |
| --- | --- |
| Single Stableford — daily | Each player's total points. Countback: back 9, last 6, last 3; optional hole-by-hole tie breaker if still tied. |
| Single Stableford — two-day aggregate | Each player's selected-day total. The app combines manual and/or phone-scored days. Countback for the aggregate follows the final day's result. |
| 4BBB | Each pair's total points and countback figures. Pair membership comes from that day's saved teams. |
| Best 3 of 4 | Team total points and, if required, team countback figures. |
| Putting — daily team | Team total putts and countback figures only. |
| Putting — pairs or two-day pairs | Each player's daily putt total and countback figures. The app derives pair totals using the configured partnerships, including Day 2 4BBB partners for the two-day option. |
| Par 3 Pairs | Each player's gross score on every par-3 used by the competition. The app calculates handicap points and pair totals. |
| Scratch | Each eligible player's gross total and scratch countback figures; include Withdrawn/Pick-up when applicable. |
| NTP | Winner for each nominated NTP hole, or Not Won. |
| Eclectic | All 18 gross scores for every player. |
| Yellow Ball | Team Yellow Ball points by hole and the lost-ball hole, if any. |
| Ambrose | Team gross score by hole and selected drive player by hole. This uses the Ambrose team-card rules rather than the standard four-player card. |

When individual putting totals are entered, team or pair putting totals are calculated automatically and are not entered a second time.

## Tablet interaction

- One team card is visible at a time.
- Player names and partnerships are pre-filled and cannot be changed here.
- Inputs use the numeric keyboard where appropriate.
- Enter/Next advances left-to-right and then down to the next required field.
- The active row and field are strongly highlighted.
- A sticky footer contains **Back**, **Save Draft**, and **Review Team Card**.
- Saving displays a persistent **Saved ✓** state.
- The organiser can leave and resume at the first incomplete field.
- Countback fields are collapsed under each result initially. They become required only when the entered totals produce a tie; they may also be opened manually.
- If back 9, last 6 and last 3 remain tied, the card asks for scores from Hole 18 backwards until the tie is resolved, or allows the organiser to record a manually adjudicated winner.

## Storage model

Store manual results separately from normal phone scorecards:

```text
event.manualScorecards.day1.groups[groupId]
event.manualScorecards.day2.groups[groupId]
```

Each group record contains:

- status: draft | submitted
- source: paper-team-card
- updatedAt and submittedAt
- organiser identity
- event revision and team/draw signature
- player summaries
- pair summaries
- team summaries
- par-3 gross scores
- NTP decisions
- optional hole-level data for competitions that require it

Keeping summary records separate prevents fabricated hole scores from appearing on player scorecards, Emergency Score Recovery, or Round Progress.

## Results precedence

For a given day and competition:

1. A submitted manual result is authoritative for the covered team/unit.
2. Draft manual data never appears on a leaderboard.
3. If a submitted manual card covers a team, later phone uploads for that team/day do not replace it.
4. The organiser must explicitly **Reopen Manual Card** before replacing a submitted result.
5. Teams without a submitted manual card continue to use normal phone scores. This permits mixed recovery if only one team loses reception.

## Conflict protection

Before opening a manual card, detect existing phone scores for the team/day.

- No phone scores: open normally.
- Partial phone scores: offer **Continue Phone Scoring** or **Use Paper Card Instead**.
- Completed phone scores: require a clear confirmation before manual entry can supersede results.
- Never delete the underlying phone scores. Record which source is authoritative so the action can be reversed.

## Completing a day

**Complete Day Results** is enabled when every team is either:

- normally completed through phone scoring; or
- covered by a submitted manual team card.

Completion then:

1. validates all fields needed by selected competitions;
2. checks pair/team membership against the saved draw;
3. checks totals and countback relationships;
4. marks the relevant teams and competition units complete;
5. refreshes the normal leaderboards and prize summary;
6. synchronises the event when a connection is available.

## Offline behaviour

Manual drafts save locally immediately. When internet is unavailable, the screen shows **Saved on this tablet — waiting to synchronise**. Submission and results remain available locally; cloud synchronisation retries when connectivity returns.

## Paper-card alignment

The printable emergency team card should be revised to include:

- the event's selected competitions only;
- total, back 9, last 6 and last 3 boxes beside applicable results;
- Hole 18 backwards tie-break boxes;
- individual putt totals when pair/two-day putting is selected;
- selected par-3 holes and individual gross scores;
- NTP winner / Not Won;
- scorer signature and organiser-check box.

## First implementation scope

The first Shoalhaven/Mollymook build will support:

- Day 1 or Day 2 selection;
- team-by-team Save Draft and resume;
- Single Stableford, 4BBB, Best 3 of 4, Putting, Par 3 Pairs and NTP;
- countback totals and organiser adjudication;
- manual Day 1 combined with normally scored Day 2;
- manual completion of both days;
- normal leaderboards and results summary.

Scratch, Eclectic, Yellow Ball and Ambrose use the same framework but should be enabled only after their additional entry requirements have dedicated regression tests.

## Acceptance scenarios

1. Two teams complete Day 1 on paper; both manual cards populate every selected Day 1 result.
2. Day 1 is manual and Day 2 is scored normally; the two-day Single and Par 3 Pairs aggregates are correct.
3. Day 1 is scored normally and Day 2 is manual; final results are correct.
4. Both days are manual; all daily and aggregate results are correct.
5. Daily team putting requests only team totals.
6. Two-day pairs putting requests individual totals and derives Day 2-partner totals.
7. A tied result requests countback details and ranks the winner correctly.
8. A saved draft survives closing and reopening the app.
9. A submitted manual card cannot be silently overwritten by a phone upload.
10. Existing normal phone-scoring events behave exactly as before.
