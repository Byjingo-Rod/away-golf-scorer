# Away Golf Scorer — one to seven playing days

Available from version 15.94.0.

1. Create a new event and select **Event length: 1–7 playing days**. Set the trip roster size.
2. Choose the course, start format, tee time and interval for each day. Dates default to consecutive days; change a playing date to leave a gap for a rest day. For Vietnam, select **Course time zone: Vietnam** so phones and the organiser PC use the same scoring-opening time.
3. Select the trip players. In the Confirmed Field, untick any day a golfer is resting. The golfer remains in the trip and returns to later draws. Each daily field currently needs four real players or at least six, allowing the supported teams of three/four; a five-player daily field is rejected before scoring setup.
4. Enter event GA handicaps and calculate the enabled tee handicaps for all courses. Use **Review Day N Calculations** to inspect and adjust each day's figures.
5. For each competition, tick the playing days or **All Days**. Ambrose must be scheduled on separate days from individual/Stableford competitions because it uses a team stroke card. NTP may accompany either format. Existing two-day Par 3 aggregate and Eclectic formats retain their two-day rules.
6. For Single Stableford, choose **Both** to show daily winners and an overall trip winner. Set **Overall Stableford: counting rounds** to **Best 6 of 7** (or another number). Only completed rounds qualify toward the minimum. A golfer with fewer than the required completed rounds remains visible but cannot win the overall prize.
7. Review the courses and scorecards, save the plan, then inspect and save every day's Groups & Teams draw. Existing balanced short teams, virtual players, extra NTP attempts and whole-team swaps remain available. Lock and publish the event using the existing process and one event code.
8. Phones, organiser live control, paper-card entry and results show day buttons through Day 7. Select the day you want to view. Days are stored independently. The overall trip closes only after every scheduled playing day is finalised.

For trips longer than two days, ties in the overall total use the lowest counting round first, then the next lowest, comparing only counted rounds. Equal counted round totals remain tied. Existing two-day countback keeps its final-day hole rules.

White Shirts versus Black Shirts is not included in this release; its scoring rules still need to be confirmed.

## Regression checks

From the repository root:

```sh
node --check app.js
node tests/seven-day-model.cjs
node tests/multiple-short-teams.cjs app.js
node tests/yellow-ball-paper-entry.cjs app.js
```

These checks cover the planning model and generated planning/review HTML, date/time-zone behaviour, daily attendance/handicaps, competition filtering, publish payloads, overall totals and eligibility, short-team/VP/NTP arrangements, whole-team swaps, and Yellow Ball paper results. They do not replace the organiser/tablet/phone rehearsal before the trip.
