AWAY GOLF SCORER — VERSION 15.45

VERSION 15.45 — COMPACT MASCOT POSITION

- Moves the small mascot to the top-right of the permanent player-device header.
- Restores the compact scoring header so the mascot never pushes score controls down.
- Keeps the large mascot on welcome and completed-round screens.

VERSION 15.44 — AWAY GOLF MASCOT

- Adds the approved Away Golf golfer as the permanent app mascot.
- Welcomes each player by first name once when joining an event.
- Leads the player from Welcome to Today's Rules, Got It and scoring.
- Adds a compact mascot to the player card and active scoring header.
- Adds the first completed-round greeting, ready for final winner messages.

VERSION 15.43 — PUBLISHED EVENT STARTUP PROTECTION

- The organiser PC remembers its active published event independently of an older local planning workspace.
- A published event is restored automatically from its secure cloud copy when the organiser PC starts.
- Scratch withdrawal details are locked onto one grid row so Pick-up on Hole # aligns with the player entry.

VERSION 15.42 — SCRATCH LEADERBOARD WORDING

- A disqualified Scratch row now says Withdrawn from this Competition and keeps Pick-up on Hole # alongside it on one line.
- The leaderboard note explicitly defines the displayed label with bold quoted wording: “Thru” is the number of holes with official marker scores.

VERSION 15.41 — ORGANISER EVENT RECOVERY

- The original organiser PC can recover an already-published event by entering its six-character player join code, without claiming a player position.
- Recovery confirms the published event name before replacing a stale local event and restores the event plan, eight-player field, connected-device status and uploaded round scores.
- The recovered online identity is stored again as the active organiser event so subsequent launches and score refreshes stay attached to it.

VERSION 15.40 — ON-COURSE SCORE ENTRY RELIABILITY

- Entered Score and Putts values now change to a black button with a large white number; unentered values remain grey for unmistakable confirmation in sunlight.
- An incoming cloud refresh can no longer replace the active player's newer local scoring card with an older blank server copy while a tap is uploading.
- Screen wake lock is renewed when scoring regains focus, returns from the background, is restored from a browser page cache or receives a new scoring tap, with a live status shown on the card.
- Scratch Pick-up status now has a wide single-line cell immediately to the left of the score column.

VERSION 15.39 — NEW EVENT PUBLISHING AND FINAL PLAN CHECK

- A newly created event now disconnects the previous event's online identity and receives its own player join code when published.
- Existing mismatched local/online event identities are detected safely and detached before publishing, preventing an old event's player list from appearing under a new plan.
- One-day events may have one or two NTPs, defaulting to one; two distinct Par 3 holes are proposed automatically.
- Final Check now shows the actual event name, course, start date, invited and confirmed counts, daily team structure, competition count and selected NTP hole or holes.
- NTP Final Check wording changes automatically between Hole and Holes.

VERSION 15.38 — SCRATCH ELIGIBILITY AND PUTTING VERIFICATION

- Scratch setup now includes an editable maximum daily handicap, defaulting to 10 and including players whose handicap is exactly the selected limit.
- Players above the Scratch handicap limit are omitted from that leaderboard; legacy events without the new setting retain their existing Scratch field.
- An eligible Scratch player who records a Pick-up is removed from the ranked field and shown as no longer competing, with the Pick-up hole identified.
- Scratch participation and Pick-up conditions are added automatically to the organiser and player Rules pages.
- When a Putting Competition is selected, final verification now compares marker and player putts as well as scores, identifies each discrepancy and blocks finalisation until both agree.

VERSION 15.37 — FAIR LIVE LEADERBOARDS

- Every live result shows a prominent Thru number based on completed official marker holes.
- Scratch is ranked against par during play (-2, E or +3), keeping players comparable when groups have completed different numbers of holes.
- Final Scratch standings retain gross strokes and also show the score against par.
- Live positions are identified as provisional until scorecards are finalised.
- GolfLink number is explicitly optional when adding non-golfers and corporate-event players.
- The approved automatic shotgun starting-hole design is recorded in Ideas Backlog for later implementation.

VERSION 15.36 — VISIBLE MISSED HOLES AND CLEAR WAITING RESULTS

- Added a high-contrast 18-hole tracker: green and ticked means scored, red with an exclamation mark means a passed hole is missing, neutral means not yet reached, and a heavy blue border identifies the current hole.
- Added a persistent missing-hole warning listing the affected holes and a Go to first missing hole button.
- Hole numbers in the tracker can be tapped directly to return to any hole.
- Pairs Putting and Best 3 of 4 now show Waiting for Marker to Score instead of a misleading zero until enough official marker scores exist.

VERSION 15.35 — COURSE DATA AND LIVE-SCORING RESILIENCE
- Restored the organiser-verified Oatlands GC card: par 70, 5,503 metres and
  complete MiScore stroke indices through handicap 54.
- Expanded course contacts to separate Club and Pro Shop phone/email fields and
  added the golf professional's name.
- Rebuilt scorecard entry for direct typing; Enter advances through every cell.
- Favourite courses now appear first with a visible star.
- Cleaned and aligned the player profile editor and repaired blank legacy
  GolfLink data from the built-in player list.
- One-day/non-NTP Final Check screens no longer show irrelevant completed items.
- Added a genuine Retry Sync control and renamed Open My Scorecard to Open
  Scoring Card.
- Live leaderboards continue from official marker entries, show missing holes as
  pending and never count an unentered hole as zero.

VERSION 15.34 — DAY 2 HANDICAP REVIEW AND GC COURSE NAMES
- Saving Day 1 handicaps in a two-day event automatically carries them into
  Day 2. A later Day 1 correction also carries forward unless the organiser
  has already entered a different Day 2 handicap for that player.
- The second setup action is now Review Day 2 Hcp. Its review screen is
  pre-filled and only genuine Day 2 changes need to be entered.
- Course names use GC instead of the fully written Golf Club. Existing saved
  course records and recorded player course handicaps are migrated on opening.

VERSION 15.33 — BEST 3 OF 4 LOTTERY PRIZE WORDING
- The winning Best 3 of 4 team's Summary prize now states clearly that it is
  the only team that does not contribute the selected amount to the Lottery Pool.
- The displayed amount continues to come from the event's competition setup.

AWAY GOLF SCORER — VERSION 15.32

VERSION 15.32 — COMPLETED SCORECARD VIEWER
- A finalised player now sees View Completed Scorecard instead of Start Round.
- Completed cards are strictly read-only and show all 18 holes, gross score,
  putts, Stableford points and the exact handicap adjustment used on each hole.
- Plus-handicap give-back holes are highlighted, making +4 and +1 calculations
  directly auditable against the course stroke indexes.
- Front nine, back nine and 18-hole totals are included, with a safe return to
  Player View.

VERSION 15.28 — GUARANTEED PLUS-HANDICAP CONTROL

VERSION 15.28 — GUARANTEED PLUS-HANDICAP CONTROL
- Replaced typed plus signs with a separate, unambiguous Plus checkbox.
- Quick handicap entry now has Player, Handicap and Plus columns. Ordinary
  handicaps retain the fast type/Enter/type/Enter workflow.
- A +4 player is entered as number 4 with Plus ticked; a +1 player is entered as
  number 1 with Plus ticked.
- Groups & Teams and Player Profile use the same separate Plus control.
- Plus handicaps are stored independently of browser number formatting and are
  visibly rendered with a + prefix.
- Verified that +4 deducts one stroke on indexes 15, 16, 17 and 18: par scores
  one point and birdie scores two on those holes; par scores two elsewhere.

VERSION 15.27 — PLUS HANDICAPS
- Added full support for plus playing handicaps such as +4.
- Plus handicaps retain and display the + sign in quick entry, Groups & Teams,
  Player Profile, course history and the player's round preview.
- Stableford scoring correctly deducts strokes on the easiest-ranked holes: a
  +4 player must birdie stroke indexes 15, 16, 17 and 18 to score two points.
- Handicap entry instructions now explicitly show the +4 input example.
- Widened Set Hcp — [Course] so longer course names fit on one line and reduced
  the adjoining player/GolfLink search area to use the available space better.
- Preserved a stacked, phone-friendly arrangement on narrow screens.

VERSION 15.26 — FAST COURSE HANDICAPS AND PROVISIONAL PLANNING
- Replaced the read-only player information panel with an editable Player Profile.
- Player Profile now prioritises Name, GolfLink No., Home Club, last Away Golf
  event, course handicap history, current event course handicap(s), Notes and Status.
- Removed the stale GA Handicap from the visible Player Profile.
- Added Set Hcp — [Course] beside Manage Player List during event planning.
- The handicap screen is one vertical list of all selected players; pressing Enter
  stores the number and advances directly to the next player.
- Two-day events receive a separate handicap-entry button and list for each course.
- Entered handicaps automatically populate Groups & Teams and are retained with
  the event plan. Locked-event handicaps are recorded in each player's course history.
- Event planning can proceed when the target field is filled by accepted and/or
  awaiting-reply invitations. Awaiting players remain visibly amber in the groups.
- Lock Event is prevented until every provisional amber player is confirmed green.
- Restored a reliable Return to Setup button from the Player List for unlocked events.
- Corrected the safe-test heading for the 16-player dress rehearsal.

VERSION 15.25 — 16-PLAYER DRESS REHEARSAL
- Added a protected one-day 16-player Oatlands test matching the scale of the
  first real Away Golf event.
- Uses four groups of four, eight 4BBB pairs and four competing teams.
- Provides completed 18-hole gross scores, matched marker scores, realistic
  putts, NTP progression and finalised rounds for all 16 players.
- Simulates all 16 player phones as joined so the organiser's live event control,
  four-group display and Prize Giving Ready state can be tested at full scale.
- Covers Single Stableford, 4BBB, Team Putting, Best 3 of 4, Par 3 Pairs,
  Nearest the Pin and Scratch leaderboards plus the complete Results Summary.
- Testing Tools can switch among the 8-player one-day, 8-player two-day and
  16-player one-day tests without exposing test data to the live event system.

VERSION 15.24 — CLEAN ONE-DAY RESULT NAMES
- Removed redundant “Day 1” text from every one-day competition name.
- One-day Summary heading is now “Event Results”.
- Multi-day competition names retain their Day 1 and Day 2 identification.

VERSION 15.23 — ONE-DAY SUMMARY FIX
- Fixed the one-day Summary tab returning immediately to Today's Single Stableford.
- One-day Summary now displays all selected competition winners and prize controls.

VERSION 15.22 — NTP PROGRESSION
- Daily NTP leaderboard retains each successive provisional holder and time.
- The last recorded holder is clearly labelled Winner.
- Prize Summary remains uncluttered and shows only the final NTP winner.
- Protected test now includes realistic multi-player NTP progressions.

VERSION 15.21 — ONE-DAY TEST AND EVENT OPTIONS
- Added a protected one-day eight-player Oatlands test.
- Testing Tools can switch safely between one-day and two-day tests.
- One-day test covers Single Stableford, 4BBB, Team Putting, Best 3 of 4,
  Par 3 Pairs, Nearest the Pin and Scratch.
- Added Event Options on Home.
- Cancel Event closes scoring and archives a published join code while retaining
  the cancelled event as a record.
- Delete Event from This Device removes the current event and local scores after
  two confirmations while retaining players, courses and organiser preferences.

VERSION 15.20 — SINGLE STABLEFORD FORMAT CHOICE
- One-day events retain the normal optional Single Stableford.
- Two-day events can run daily Single Stableford, two-day aggregate, or both.
- The protected Oatlands test uses the two-day aggregate only.
- Team Putting and Best 3 of 4 summary winners include all four player names.

VERSION 15.19 — PROTECTED EIGHT-PLAYER OATLANDS TEST
- Added a reusable two-day test event based on genuine Oatlands scorecards supplied by the organiser.
- Uses eight existing Away Golf players, two four-player groups and four 4BBB pairs each day.
- Day 2 partnerships differ from Day 1, allowing the draw and daily team results to be tested properly.
- Includes realistic completed gross scores, inferred putts and NTP results.
- Tests Single Stableford, 4BBB, four-player Putting, Best 3 of 4, Par 3 pairs, Scratch, Eclectic, NTP and prize giving.
- Testing Tools can show no scores, completed Day 1, or both completed days.
- The existing event, cloud connection and course records are backed up before test mode begins.
- The test event remains local and cannot accidentally be published to connected players.
- Restore My Previous Event returns the organiser to the exact event that was open before testing.

VERSION 15.18 — ORGANISER'S LIVE EVENT CONTROL
- Added a phone-friendly organiser panel on Home for locked events.
- Shows live Joined, Playing, Attention and Finalised counts for each day.
- Shows every player's group, phone connection, holes entered, next hole and round status.
- Flags scorecards needing attention when player and marker entries are missing or disagree.
- A round's finalised status now travels with its live score data from the player's phone.
- Leaderboard winners remain In Progress until the required player scorecards are checked and finalised.
- When all players are finalised, Prize Giving Ready opens the Results Summary directly.
- Editing a score after finalisation automatically returns that round to In Progress until it is checked again.

VERSION 15.17 — FAST PRIZE GIVING
- Results Summary now displays the configured prize or win benefit beside every competition.
- Final results with a configured prize show an organiser-only Award Prize button.
- Awarded results are dimmed and clearly marked ✓ Awarded to prevent accidental duplicate prize giving.
- Award status is saved with the event and shared with connected player phones.
- An awarded result can be changed back after a confirmation if the organiser makes a mistake.

VERSION 15.16 — LEADERBOARD RANKING CORRECTION
- Players and teams marked Not Started now always appear below competitors with recorded scores.
- Corrects live Scratch and Putting leaderboards where a zero from no entries could otherwise appear to lead.
- Uses the correct golf nomenclature Single Stableford throughout.
- Two-day leaderboards now have Day 1, Day 2 and Summary views.
- Day 2 retains Day 1 Single Stableford and the continuing two-day competitions, while completed Day 1-only competitions move off the active display.
- Added a results summary with Day 1, Day 2 and overall event winners; every result can be opened to see its full standings.

VERSION 15.15 — LIVE LEADERBOARDS
- Added live leaderboard tabs for every competition selected in Event Setup.
- Supports one-day and two-day Single Stableford, daily 4BBB, Putting pairs/teams, Best 3 of 4, daily or two-day Par 3 pairs, Scratch, Eclectic and NTP holders.
- Shows each result as Not Started, Thru holes, or Final as shared scores arrive.
- Applies automatic back 9, last 6, last 3 and hole-by-hole countback to Single Stableford, 4BBB and Scratch ties.
- Two-day Single Stableford uses Day 2 first for countback.
- Leaderboards are available on organiser and joined-player devices.
- Joined-player navigation now labels the scoring area My Golf.

VERSION 15.14 — PLAYER-ONLY PHONES
- Joined players now see a true player-only interface: Home and My Golf only.
- Player devices cannot open Players, Courses, Teams or event-setup screens.
- The organiser can see which players have connected to the live event.
- The organiser can release a player's phone connection so that player may join again on a replacement device.

VERSION 15.13 — SECURE SHARED EVENTS
- Added Supabase-backed shared events with Row Level Security.
- Devices sign in anonymously without requiring player passwords or accounts.
- Organisers publish a locked event and receive a six-character player join code.
- Players join by event code and select their own name.
- A joined player is restricted to that player's scorecard on the device.
- Round entries remain saved locally first and synchronise automatically when online.
- Live event changes and other players' score records refresh through Supabase Realtime.
- Added secure organiser workspace storage for later cross-device setup synchronisation.

VERSION 15.12
- Enlarged and separated player response controls on phones.
- Player selection lists retain their scroll position after each response.
- Scoring automatically requests a screen wake lock and restores it when the app becomes visible again.
- The wake lock releases when the player exits or finalises the round.
- NTP setup shows each day's starting tee arrangement beside the day heading.
- Two-hole NTP days include a one-click Swap NTP Order control.
- Competitions & Rules explicitly labels Putting Competition as 2 Player or 4 Player.
- Best 3 of 4 live totals use bold type.
- Automatic Day 2 draws prohibit repeat Day 1 4BBB partnerships when another pairing is possible; Manual mode remains the override.
- Player rules identify the Putting Competition as 2 Player or 4 Player.
- Day 2 live scoring shows Day 1 hole points and the progressive Eclectic total when Eclectic is selected.
- Refined Score and Best 3 of 4 live-card alignment.
- Fixed Day 1 / Day 2 navigation on the locked Groups & Teams screen.
- Day tabs remain available for viewing while all planning controls remain locked.
- Putting Competition now offers 4BBB Pairs or Four-Player Team format in Competition Setup.
- Putting rules and Groups & Teams wording follow the selected format.
- Live scoring shows both current pair members' progressive putts.
- Live scoring adds Pairs Total or Team Total, using other-pair entries when available.
- Added live Best 3 of 4 current-hole and progressive totals.

VERSION 15.6
- Added Add Course to Favourites checkbox directly to Course Details.
- Replaced the hole-position line with the player's progressive Total Putts.
- Replaced the Stableford pill with a Score panel for each golfer.
- Score panel shows current-hole Stableford points and the progressive round Stableford total.
- Progressive totals follow the actual playing order, including shotgun starts.

VERSION 15.5
- Replaced the long setup dropdown with a mouse-first Choose Course panel.
- Added persistent course Favourites using the + / tick control beside each course.
- Added editable Golf Region data and same-region Nearby Courses suggestions for Day 2.
- Renamed the player heading to Competitions & Rules.
- Added each selected competition's prize or win benefit beside its name.
- Kept the expanded Competitions & Rules panel compact and internally scrollable on a phone.

VERSION 15.4
- Fixed the missing competition-name table that interrupted Player View redraws.
- Event Rules & Competitions now opens and closes correctly.
- Got It now acknowledges the selected player and enables the round when all other requirements are met.
- Changing the player selector now redraws the phone for the selected golfer.

VERSION 15.3
- Event Rules & Competitions now opens and closes reliably as an inline panel in Player View.
- Day 1 and Day 2 selectors retain their full wording on narrow screens.
- Size of Field now uses a clear minus / number / plus control instead of the browser's tiny spinner.

Clean production-foundation rebuild.

Included and working:
- Step 1 Event Details: event name, date, length, start format, field size, Day 1/Day 2 courses.
- Step 2 Players: surname sorting, visible GolfLink, invite/await/accept/decline, confirmed field, inactive historical members.
- Player administration: Add, Make Inactive, Reactivate, information panel.
- Course administration: Add, Make Inactive, Reactivate, Course Details (address, map link, phone, website, email, notes, active tee/scorecard summary).
- Step 3 Competition Setup: Single Stableford, 4BBB Stableford, Putting, Best 3 of 4, Par 3, NTP, Scratch, automatic Eclectic for same-course two-day events.
- Win Benefit controls are hidden until a selected competition's Set Win Benefit button is pressed.
- Best 3 of 4 supports Lottery Pool or Prize, with $10-$50 losing-team contribution.
- Organiser competition choices are retained as the starting template for the next event.
- NTP uses Selected wording and automatic easiest-rated Par 3 selection.

Deliberately not carried forward yet:
- Legacy Teams/Scoring/Verification implementation. These will be rebuilt on this clean architecture next.

Existing Away Golf player/course data is seeded, and Version 13 attempts to migrate existing player and course edits from the prior awayGolfV11 browser data store.

VERSION 13.1
- Restored wizard margin/padding and shortened heading to Create New Event.
- Player list now locks into a fixed-height 3-column board with independent scrolling.
- Visible red/amber/green traffic lights and legend restored.
- + Add Player, Make Inactive and Reactivate restored inside event setup.
- Course Details can be opened from Step 1 and stores location, Pro Shop phone, map link, website, email, notes, Back/Middle/Front tee data and editable scorecard data.
- Course list now shows data status and known slope/par/length/contact detail.
- Specify Prize replaces Specify only if required.
- Best 3 of 4 Lottery Pool displays $ contribution and "per team member".
- Eclectic is shown on every 2-day setup: selected for same-course events, greyed out for different-course events.

VERSION 13.2
- Front Nine and Back Nine displayed side by side in Course Details.
- Compact scorecard columns and sticky headings.
- Index accepts composite values such as 14/30/48.
- Return to Setup added for Course and Player administration opened from the wizard.
- Manage Player List added to Step 2.
- Spacing added between field number and TARGET FIELD.
- Stable competition benefit columns and better spacing before Optional prize description.
- Two-day Par 3 choices corrected: one event each day OR one aggregate event over 2 days using Day 2 4BBB partners.
- Same-course Eclectic detection hardened and previous Par 3 template values migrated.

VERSION 13.3
- Fixed Return to Setup navigation: Course and Player admin pages are now redrawn after the wizard return step is set, so the button actually appears.
- Eclectic same-course detection now accepts either the same course ID or matching course names, eliminating false grey-out when the same club is selected twice.
- Best 3 of 4 heading changed to Losing Team(s) Contribution.

VERSION 13.4
- Eclectic is now an organiser-selectable competition when a two-day event uses the same course on both days.
- Eclectic is no longer forced/disabled when available.
- With different courses, Eclectic remains unavailable and greyed out.

VERSION 13.5
- Page 4 Rules redesigned.
- Preferred Lies is a dedicated Yes/No control and ALWAYS starts at No for every new event.
- No displays "Play the ball as it lies".
- Yes reveals a choice between "In the General Area" and "On the closely mown part of the fairway".
- Preferred Lies is deliberately not inherited from the previous event template.
- Special Rules remains available for event-specific instructions.
- Added a compact player-facing preview using the informal "Got It" acknowledgement.
- Review page now summarises Preferred Lies and Special Rules.

VERSION 13.6
- Rules page Preferred Lies control simplified:
  * shows one status only — No by default;
  * default text reads "Default for every new event is play the ball as it lies.";
  * Change switches Preferred Lies on/off;
  * when on, status becomes green Yes and the location selector appears.
- Putting Competition Rules appear automatically on Page 4 whenever Putting Competition was selected on Page 3.
- Putting rules include winning condition, on-course putting rules and appropriate one-day/two-day count-back.
- Special Rules remains beneath the automatic competition rules.

VERSION 13.7
- Page 5 is now NTP Hole Selection.
- Automatically selects the easiest-rated Par 3; two Day-2 NTPs select the easiest and second easiest.
- Change opens only the Par 3 choices for that course and prevents duplicate NTP holes on the same day.
- No prize input is repeated on Page 5.
- NTP play logic locked in for scoring build: "Click Yes if you put your name on the NTP sheet."; Yes requires confirmation; confirmed entries receive timestamps; latest confirmed entry on each NTP hole is current holder; entry locks after leaving the hole; live leaderboard can show current holder; final holder becomes winner.

VERSION 13.8
- Page 6 Start built as the final event review and launch page.
- Shows event details, courses, confirmed players, competitions, rules and NTP selections.
- Includes a clear final checklist and disables START EVENT if required setup is incomplete.
- Large green START EVENT button launches the configured event after confirmation.
- Shotgun start is identified and notes that starting holes will be assigned with playing groups.
- Preferred Lies wording corrected to "On the closely mown part of the course".

VERSION 13.9
- Page 6 Event date now displays in DD/MM/YYYY format.
- Page 6 NTP summary uses natural wording:
  * one NTP: "Hole X"
  * two NTPs: "Hole X and Hole Y"
- Page 6 review/start layout otherwise unchanged.

VERSION 14.0
- First Groups & Teams operating page built.
- START EVENT now opens Groups & Teams rather than simply closing the wizard.
- Day 1 and Day 2 group setups are stored independently.
- Confirmed players are divided into four-person playing groups.
- Randomise Groups shuffles the field while preserving groups of four for normal Away Golf field sizes.
- Reset Alphabetically restores a simple surname-order starting layout.
- Manual player movement uses a two-click Swap system.
- 4BBB Pair A and Pair B are shown within each four-person group when 4BBB is selected.
- Putting and Best 3 of 4 identify the full four-person playing group as the team.
- Single Tee shows group tee order.
- Two Tee events provide 1st Tee / 10th Tee selection per group.
- Shotgun events provide Starting Hole 1–18 per group.
- Each day has its own Save Groups action.
- Score page remains deliberately untouched for the next design stage.

VERSION 14.1
- Fixed manual Swap on Groups & Teams:
  * first click visibly selects a player;
  * second click swaps the two players;
  * clicking the selected player again cancels the selection.
- Removed the redundant full four-person team statement.
- Reworked 4BBB display:
  * one heading: "Partners in 4BBB";
  * two separate partner boxes;
  * removed Pair A / Pair B labels.

VERSION 14.2
- Groups & Teams now offers History Balanced, Random and Manual.
- History Balanced tests 500 candidate draws and selects the lowest-repeat layout.
- Repeat 4BBB partnerships carry extra weighting over simply sharing a four-person group.
- Manual mode shows times played together and previous 4BBB partnerships.
- Group-level history advice helps the organiser choose a less repetitive destination.
- Random remains a genuine quick random draw.
- Pair-history and 4BBB-partner-history stores are included for automatic future event history.
- Legacy history can be seeded later without altering the draw engine.

VERSION 14.3
- Manual mode now visibly activates and remains highlighted.
- Swap rebuilt with a simple two-click handler and clear "Selected for swap" feedback.
- Day 2 History Balanced now treats Day 1 as fresh history:
  * strong penalty for repeating Day 1 group-mates;
  * even stronger penalty for repeating a Day 1 4BBB partnership.
- History Balanced now evaluates up to 1,800 unique candidate draws.
- Repeated clicks can return different near-optimal draws rather than always giving exactly the same layout.
- Legacy history image set reviewed: source is now readable after compositing onto a light background, but no uncertain counts have been guessed into the production history store.

VERSION 14.5 — VERIFIED REBUILD
- Competition Setup: Set/Change Win Benefit plus visible current setting / Not Yet Set.
- Rules: Putting Rules Edit/Done, Special Rules Clear, Got It visible acknowledgement.
- Review & Start: only the large milestone START EVENT button; Cancel and Back remain below.
- Groups & Teams: Swap selection is preserved through rerender so the second Swap click can complete the exchange.
- Browser cache-busting added to CSS/JS references and service-worker strategy changed to network-first.

VERSION 14.6 — EVENT PLAN / SHORT-FIELD DESIGN
- Review milestone renamed SAVE EVENT PLAN – PROCEED TO SET UP SCORING.
- Saving the plan no longer locks the event.
- Groups & Teams now has Back to Event Setup so the organiser can revise the plan until Lock Event.
- LOCK EVENT is a separate final control and is enabled only after every day's groups are saved.
- Two-day events now support day-by-day player availability. A golfer can play Day 1 only, Day 2 only, or both days.
- Daily field completeness is checked independently against the target field size.
- Added special system entry No Partner for the one-player-short situation.
- If No Partner is used on a day:
  * the app identifies the real player who needs a virtual partner;
  * randomly chooses a Virtual Player from the other genuine golfers, excluding that player;
  * displays the Virtual Player in blue with (VP);
  * uses the VP in the 4BBB partnership display and future team-score logic;
  * selects one of the three actual golfers in the short group as NTP Extra Shot Player when NTP is selected;
  * explains the arrangement beneath the team draw.
- Virtual Player and NTP Extra Shot selections are independent.
- Competition “Currently Set at …” badges are aligned to the right for quick scanning.

VERSION 14.7 — PLAYER HOME / EVENT DAY FIRST DRAFT
- New Player View replaces the scoring placeholder and provides a phone-first personalised event screen.
- Organiser can preview the screen as any golfer and switch Day 1 / Day 2.
- Shows event/course/date, starting position, player's group and 4BBB partner.
- No Partner / Virtual Player and NTP Extra Shot instructions appear only when relevant to that golfer.
- Event Rules & Competitions opens from the player screen.
- Got It acknowledgement works in the preview.
- Start Round remains disabled until Lock Event; scoring comes next.
- Select Players search focus bug fixed so multi-character typing works.
- Traffic-light controls aligned.
- Initial Day 2 group draw now runs History Balanced after Day 1 exists, rather than initially cloning the same arrangement.
- If No Partner is required both days, Day 2 avoids assigning No Partner to the same golfer where an alternative exists.

VERSION 14.8 — TWO-TEE STARTING HOLES
- Step 6 heading changed to "Review and Move to Scoring".
- Selecting Two Tees on Step 1 now reveals organiser-controlled starting holes.
- Day 1 and Day 2 each have their own Starting Tee 1 / Starting Tee 2 choices.
- Defaults remain Holes 1 and 10, but any two different holes can be selected (e.g. Oatlands 1 and 13).
- Review page shows the actual configured starting holes.
- Groups & Teams uses those selected holes rather than hard-coded 1/10.
- Player View displays the golfer's actual starting Hole.
- Underlying starting-hole value is now ready for wrap-around scoring (e.g. 13→18→1→12).

VERSION 14.9 — PER-DAY START FORMAT & STARTING TEE
- Day 1 and Day 2 start arrangements are independent.
- Each day can be Single Tee, Two Tees or Shotgun.
- Single Tee requires the organiser to nominate the actual starting hole (default Hole 1).
- Two Tees requires the two actual starting holes for that day.
- Review page shows both days' starting arrangements and has Confirm / Change Starting Tee.
- This allows last-minute changes before Lock Event, e.g. a club moves the field from Hole 1 to Hole 10.
- Groups & Teams and Player View inherit the actual start for that day.

VERSION 15.0 — FIRST HOLE-BY-HOLE SCORING PROTOTYPE
- Daily Handicaps are entered by day before Lock Event.
- Player START ROUND now opens at the assigned starting hole and wraps through all 18 holes.
- Hole screen shows Hole, Par, Index and Metres.
- Each phone records the partner/marker official score and the golfer's own verification score, plus Putts.
- Stableford is calculated automatically from the Daily Handicap and course index.
- NTP holes show the name-on-sheet YES flow with a second-click confirmation, Undo before leaving the hole, timestamped current holder and lock after Next Hole.
- Finish Round opens verification comparing the golfer's own entries with the official entries made for that golfer by their marker.
- Banked UI changes included: one-line setup-complete message and Change Starting Tee wording.


VERSION 15.1 — PLAYER VIEW AND SCORING REFINEMENTS
- Event Rules & Competitions expands in the phone view.
- Removed redundant Tee field from player preview.
- Player name is prominent and group display places the 4BBB partner beside the player.
- Score and Putts use minus/value/plus steppers, centred on Par and 2 putts.
- NTP confirmation now records the golfer being marked, shows a confirmation time, and uses the marker-specific question.
- Round verification wording clarified.

VERSION 15.2 — SCORING REFINEMENT
- Day 1 Daily Handicap automatically pre-fills Day 2 when the Day 2 value is blank; Day 2 remains editable.
- Event Rules & Competitions now opens in a dedicated player modal even after Lock Event.
- Gross score control is now four-part: minus / score / plus / P.
- P records Pick-up and immediately gives 0 Stableford points.
- Putts remains a narrower three-part minus / 2 / plus control.
- Verification accepts either an identical gross score OR identical Stableford points.
  Example: Marker P (0 pts) and Player 8 (0 pts) verifies successfully.
- Verification rows show both entered gross/P value and Stableford points.
- Existing NTP confirmation/time/lock behaviour is unchanged.
VERSION 15.12 UPDATE
--------------------
- Player traffic-light selections no longer focus the search box or open the phone keyboard.
- The player-selection page remains at its current scroll position after a response is changed.
VERSION 15.29 — ONE-DAY WORDING CLEANUP
========================================

- One-day event screens no longer display unnecessary Day 1 wording.
- Course setup, NTP setup, event review, Groups & Teams, live progress,
  verification and the player phone view now use uncluttered one-day wording.
- Day 1 and Day 2 labels remain fully visible throughout multi-day events.
- Includes the Version 15.28 plus-handicap input and Stableford calculation fix.
VERSION 15.30 — THE RIDGE 16-PLAYER FULL EVENT TEST
===================================================

- Adds a protected test loader for the user's locked one-day Ridge event.
- Simulates and finalises 16 complete rounds (288 holes) using the actual
  players, groups, 4BBB pairs, Ridge handicaps, competitions and NTP hole.
- Includes realistic Stableford variation, putts and progressive NTP holders.
- Sam Reece (+4) scores 40 points; Jeremy Ward (+1) scores 38; Rod Ruston
  retains his poor-round pattern and scores 25 points.
- The locked event is backed up before testing and isolated from cloud data.
- Remove Test Scores & Restore Event returns the event exactly to its
  pre-test state for future live use.
- Completes the Version 15.29 one-day wording cleanup on the live score screen
  and one-day 4BBB leaderboard details.
VERSION 15.31 — ONE-DAY SINGLE STABLEFORD REPORT CORRECTION
===========================================================

- Removes an obsolete two-day Single Stableford flag that could be carried
  into a one-day event by an older competition template.
- Prevents the incorrect Single Stableford — 2 Days result from appearing in
  a one-day Results Summary.
- Preserves the correct one-day Single Stableford result and all test scores.
- Cleans the flag both when the app opens and when Ridge test data is removed.
