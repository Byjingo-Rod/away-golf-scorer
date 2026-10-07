# Away Golf Scorer — one to seven playing days

Available from version 15.94.2.

1. Create a new event and select **Event length: 1–7 playing days**. Set the trip roster size.
2. Choose the course, start format, tee time and interval for each day. Dates default to consecutive days; change a playing date to leave a gap for a rest day. For Vietnam, select **Course time zone: Vietnam** so phones and the organiser PC use the same scoring-opening time.
3. Select the trip players. In the Confirmed Field, untick any day a golfer is resting. The golfer remains in the trip and returns to later draws. Each daily field currently needs four real players or at least six, allowing the supported teams of three/four; a five-player daily field is rejected before scoring setup.
4. Enter event GA handicaps and calculate the enabled tee handicaps for all courses. Use **Review Day N Calculations** to inspect and adjust each day's figures.
5. For each competition, tick the playing days or **All Days**. Ambrose must be scheduled on separate days from individual/Stableford competitions because it uses a team stroke card. NTP may accompany either format. Par 3 offers daily pairs, daily four-person teams, multi-day individuals, or multi-day pairs using the final day’s 4BBB partners. Multi-day Par 3 covers all days; resting golfers contribute zero. Eclectic retains its two-day same-course rule. Scratch offers daily or aggregate scoring over every day; aggregate Scratch requires a qualifying round on every day. Choose one or two NTPs on the final day in Competition Setup, then choose the actual holes on the NTP page.
6. For Single Stableford, choose **Both** to show daily winners and an overall trip winner. Set **Overall Stableford: counting rounds** to **Best 6 of 7** (or another number). Only completed rounds qualify toward the minimum. A golfer with fewer than the required completed rounds remains visible but cannot win the overall prize.
7. Review the courses and scorecards, save the plan, then inspect and save every day's Groups & Teams draw. Existing balanced short teams, virtual players, extra NTP attempts and whole-team swaps remain available. Lock and publish the event using the existing process and one event code.
8. Phones, organiser live control, paper-card entry and results show day buttons through Day 7. Select the day you want to view. Days are stored independently. The overall trip closes only after every scheduled playing day is finalised.

For trips longer than two days, ties in the overall total use the lowest counting round first, then the next lowest, comparing only counted rounds. Equal counted round totals remain tied. Existing two-day countback keeps its final-day hole rules.

## Black Cap – White Cap

Select **Black Cap – White Cap** in Competition Setup. The app assigns two fixed trip teams with equal playing strengths and balanced total GA handicaps. For an odd roster, a random golfer from the larger cap team also acts as the fixed virtual player for the smaller cap team; both cap teams then have the same number of counting slots. GA balancing includes that virtual-player slot. For up to 20 golfers it finds the smallest possible difference; larger rosters use a balanced draw with improving swaps. All golfers need GA handicaps before the teams can be generated. Plus handicaps count as negative values.

Use the two **Choose golfer to swap** lists and **Swap selected golfers** to change cap teams. **Balance GA totals again** replaces those changes with a fresh balanced split. These controls are also available on Groups & Teams. Cap teams remain separate from the daily playing groups and 4BBB pairs. Cap teams and the virtual player cannot change after the event is locked, scoring begins, or a paper day is submitted. The virtual-player donor remains in the larger cap team and cannot be swapped into the short team. Rebalancing before lock draws a new virtual player.

The competition covers every event day automatically. **y is always the full cap-team size, including its fixed virtual-player slot when present, and x = y − 1.** Each day adds the best x daily Stableford totals from that team. A golfer resting that day contributes zero and is treated as a lowest score. With one golfer absent, all golfers who play have their scores counted. With two absent, all golfers who play count and one zero remains in the counting scores. The short cap team copies its fixed virtual player’s daily Stableford score from the other cap team. If that golfer rests, their actual and copied scores both contribute zero. Daily playing-group virtual players are separate and never add extra cap-team slots. An unfinished playing golfer’s card (including the fixed virtual-player donor’s card) keeps that day pending; it is not treated as a rest day or zero. Submitted paper Single Stableford totals are supported, even when only the cap competition is selected.

The team’s completed daily totals are added for the overall result. The higher total wins; equal totals remain tied. The leaderboard shows each day’s counting total and pending days.

## Regression checks

From the repository root:

```sh
node --check app.js
node tests/seven-day-model.cjs
node tests/trip-competition-formats.cjs
node tests/multiple-short-teams.cjs app.js
node tests/yellow-ball-paper-entry.cjs app.js
```

These checks cover the planning model and generated planning/review HTML, date/time-zone behaviour, daily attendance/handicaps, competition filtering, publish payloads, overall totals and eligibility, short-team/VP/NTP arrangements, whole-team swaps, and Yellow Ball paper results. They do not replace the organiser/tablet/phone rehearsal before the trip.
