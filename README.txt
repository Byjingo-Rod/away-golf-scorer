AWAY GOLF SCORER — VERSION 15.86.6

VERSION 15.86.6 — CLEAN PLAYER-PHONE STARTUP

- A phone prepared for player use now opens directly to Player Entry after restarting.
- Prevents the empty My Events window from opening automatically on that phone.
- Clears the previous event code and status message when a player leaves an event.

VERSION 15.86.5 — FEDERAL PREPARATION AND DEVICE CLEANUP

- Gives the six-character event-code field and Join as a Player button equal width on larger screens.
- Changes the Home summary heading from Players # to Players.
- Shows events closed with the saved complete status as Completed in My Events.
- Gives Scratch a choice between Pure Stroke and Maximum Double Bogey scoring.
- In Maximum Double Bogey Scratch, a P records par plus two and numeric scores are capped at par plus two.
- Adds a two-confirmation, device-only way to prepare an old organiser phone for player use.
- Keeps a local recovery copy before clearing that phone's organiser-event list.
- Explains in My Events that organiser-event lists are stored separately on each device.

VERSION 15.86.4 — CLEAN DUPLICATES AND SPECTATOR VIEW

- Duplicating an event preserves its plan but clears every score, completion flag, result, prize and phone position.
- Spectators can use the normal event code without selecting a player name.
- Spectator View is read only and shows the live event rules, progress and leaderboards.
- Spectators cannot score, edit the event, change prizes or occupy a player connection.

VERSION 15.86.3 — PROTECTED EVENT WORKSPACE JOURNAL

- Keeps an independent protected copy of the complete My Events workspace.
- Automatically restores the protected copy if startup attempts to replace it with an older, smaller event list.
- Preserves the current event and its exact cloud identity together with the event list.
- Allows intentional deletion and controlled cleanup only through confirmed organiser actions.
- Uses a new service-worker cache identity for a clean update.

VERSION 15.86.2 — NTP JACKPOT CHOICES AND STATUS

- Offers Final NTP Jackpot for the traditional event-ending big prize.
- Offers Rolling Jackpot to carry to the next NTP and reset when won.
- Existing jackpot events retain Final NTP Jackpot behaviour.
- Shows Pending, Current holder, Winner, carried jackpot and unawarded status clearly.
- Shows the current ball prize, including any jackpot, on player scorecards.

VERSION 15.86.1 — EXACT EVENT RESTORATION
- A remembered cloud event can reopen only when its event ID or joining code matches the current saved event.
- Being locked is no longer sufficient to let an old cloud event replace another event at startup.
- Exact duplicate local event records are consolidated even if an older record lacks cloud identity.

VERSION 15.86 — RELIABLE STARTING-HOLE UPDATES
- A locked single-tee event can change starting hole until the first score is entered.
- Connected phones receive the change live, return to the new starting hole and show a clear acknowledgement notice.
- Visible player phones also check the event periodically and whenever they return to the foreground, covering delayed realtime delivery.
- A starting-hole update cannot overwrite any score: the organiser control locks as soon as scoring begins.

VERSION 15.85.4 — WORKSPACE IDENTITY REPAIR
- Reuses the existing local record when the same published cloud event reopens.
- Consolidates repeated local cards that point to one cloud event.
- Preserves the local workspace identity when organiser data refreshes from the cloud.

VERSION 15.85.3 — CLEAN SCORECARD ON EVENT CHANGE
- Joining a different cloud event clears the phone's previous local scorecard before the new event loads.
- Reconnecting to the same event preserves legitimate scores already held on the phone.
- Existing online scores for the newly joined event are then restored from the cloud normally.

VERSION 15.85.2 — SAFE MULTI-TAB WRITES
- The newest Away Golf Scorer tab becomes the only tab allowed to save the organiser workspace.
- An older tab is made read-only and clearly labelled, so stale in-memory events cannot overwrite the current event list.
- Keeps the compact two-day date range introduced in Version 15.85.1.

VERSION 15.85.1 — COMPACT EVENT DATE AND FRESH CACHE
- A two-day event uses a compact date range such as “Thu 10 – Fri 11 Sep 2026”.
- The event-date value uses smaller type so it fits the Home summary cleanly.
- A new cache identity forces browsers to load the corrected display files.

VERSION 15.85 — LIVE DISCREPANCY WARNING
- The Home summary displays the event date instead of the unhelpful Round / Marker value.
- During play, the hole strip compares each player's checking entry with the corresponding official marker entry as cloud records arrive.
- Blue with an exclamation mark identifies a hole where strokes or putts disagree; both affected phones receive the warning automatically.
- The blue warning names the hole and opens it directly for immediate checking.
- Red remains reserved for an entry this phone left incomplete; green means complete with no known disagreement.
- Unpublished drafts cannot retain or resume an unrelated remembered cloud event, preventing a previous live event from replacing a saved plan.

VERSION 15.84.1 — ORGANISER CORRECTION COMPLETION
- When a saved organiser correction resolves every discrepancy, a previously completed player card automatically returns to Complete.

VERSION 15.84 — AFTER THE RIDGE SCORE INTEGRITY
- Organiser card corrections are stored as authoritative event records and cannot be replaced by an older marker-phone upload.
- “Correct a Player’s Card” shows Select Hole beside a persistent Unconfirmed Holes worklist.
- A complete marker card no longer counts as a completed round when the player checking card is absent.
- Normal completion requires both cards to agree; emergency completion requires an explicit recorded recovery.
- The latest round must save online and current cloud cards must reload before COMPLETE ROUND succeeds.
- The organiser must freshly reload cloud scorecards before closing the event.

VERSION 15.83.1 — MOBILE SCORING-OPEN REFRESH

- Rechecks the scoring-opening time every five seconds while a locked scorecard is waiting.
- Rechecks immediately whenever a phone wakes or the app returns to the foreground.

VERSION 15.83 — TIMED SCORECARD OPENING

- Keeps every scorecard locked until 15 minutes before the event's first tee time.
- Opens all groups together, including events with two tees or a shotgun start.
- Adds an organiser Open Scoring Now override and bypasses the clock in Testing Tools.
- Keeps emergency missing-player replacement available until the affected group records its first score.
- Adds the scoring-opening rule automatically to every event's Rules and Information.

VERSION 15.82.2 — DRAFT CLOUD-SEPARATION HOTFIX

- Discards a stale published-event connection carried inside an older draft workspace record.
- Guarantees that selecting The Ridge draft cannot reopen Another 2 Day test.

VERSION 15.82.1 — MY EVENTS LIVE-EVENT HOTFIX

- Keeps a selected local draft current instead of immediately reopening the previously remembered published event.

VERSION 15.82 — EMERGENCY MISSING PLAYER

- Removes a selected late withdrawal before play and randomly assigns a locked virtual player from outside the short group.
- Changes the remaining three golfers to a closed marking loop and automatically includes the virtual score in multiplayer competitions.
- Rotates the extra NTP attempt between different real players when two NTP holes are selected.
- Adds the arrangement to Special Rules and a compact, view-only dropdown below the hole navigation buttons.
- Repairs My Events switching when an archived current event carries a stale workspace identity.
- Preserves the horizontal Leaderboard competition-strip position after selecting a result.

VERSION 15.81 — SINGLE STABLEFORD RESULTS PRESENTATION

- Daily-only two-day events show one prize-winning Single Stableford result
  for each day and no overall aggregate result.
- Aggregate-only events show the daily leaders without prize wording or prize
  buttons, then the prize-winning aggregate result under Overall Event Results.
- Events running both formats show one prize-winning daily result for each day
  and the prize-winning aggregate result under Overall Event Results.
- Removes duplicate daily Single Stableford rows from two-day results.
- Moves the My Events Close button beside New Event at the top of the window.

VERSION 15.80 — TWO-CARD ROUND CHECKING

- A player must confirm both their own card and the card they marked before
  completing the round.
- Red disagreements on the marked card open the relevant scoring hole.
- Day 1 and Day 2 legs of the two-day Stableford show results without separate
  Award Prize buttons; the overall two-day event retains its prize control.
- Added spacing below the NTP Holes Jackpot option.

VERSION 15.79.1 — NTP JACKPOT, STARTING HOLE AND COURSE-CARD CORRECTION

CORRECTED REBUILD
- Every saved My Events record remains visible.
- Stores one authoritative scorecard for each course and removes incomplete
  duplicate course records after redirecting events and handicaps safely.
- Restores the complete Oatlands two-rating scorecard if the incomplete first
  15.78 test package was opened.
- Preserves Oatlands contact details and the correct 5502 m course total.

- Two-day events can select NTP Holes Jackpot. Each earlier NTP with no winner carries its ball prize to the final NTP hole of the event.
- Results show each NTP winner's actual ball prize, including any accumulated jackpot.
- A locked single-tee event's Starting Hole can be changed before any score or putt is recorded.
- The updated Starting Hole is sent to connected phones and every scorecard opens on the new hole.
- If scoring has begun, the organiser is shown the player device and hole blocking the change.

VERSION 15.77 — PRIZE COUNT-BACKS AND NTP COMPLETION

- Team and Pairs Putting ties now use automatic count-back: back nine, last six, last three, then Hole 18 backwards.
- Par 3 Pairs ties now use the last Par 3 then each earlier Par 3 working backwards, including multiway ties.
- Completed NTP holes with no recorded holder now say "No one recorded as NTP. Prize not awarded."

VERSION 15.76 — RULES ACCESS AND PLAYER HOME
==============================================

- Makes Today's Special Rules open the complete event rules from Home.
- Includes the automatic Putting Competition and Scratch Competition rules in the player display.
- Returns an active player directly to the scorecard without changing the current hole or entered scores.
- Gives long event names the full width of the player Home summary and shows the player being marked.
- Removes the redundant Check for Event Updates button from Player View.
- Keeps the Competitions & Rules control in position when it is opened or closed.
- Enlarges the completed-scorecard confirmation wording.
- Corrects the agreed comma style in app wording.
- Preserves all existing event records and scores.

VERSION 15.75 — CLEAN PLAYER FAREWELL
=======================================

- Uses the full-size mascot artwork on the player finish screen so it remains sharp on a phone.
- Replaces winner lists and non-winner messages with the same simple personal farewell for every player.
- Removes the View Final Results button from the finish screen.
- Leaves the organiser's complete results, winners and prize controls unchanged.
- Preserves all existing event records and scores.

VERSION 15.74 — COMPLETED ROUND FINISH
=========================================

- Replaces the final-details banner with “All Set — your scores are recorded. Time to play the 19th.” when that player's round is complete.
- Keeps the final-details banner unchanged until the scorecard is genuinely complete.
- Confirms that Eclectic remains Thru 18 after Day 1 and changes to Final only after Day 2 is complete.
- Preserves all existing event records and scores.

VERSION 15.73 — TWO-DAY EVENT STABILITY
==========================================

- Keeps players on the selected Day 2 screen instead of reverting to Day 1.
- Keeps two-day leaderboards available without forcing navigation back to scoring.
- Shows Final for two-day and Eclectic competitions only after Day 2 is complete.
- Reports completed Day 1 competitions as Completed and unstarted Day 2 competitions as Not started.
- Keeps aggregate-only Single Stableford out of the separate Day 1 results.
- Adds prize-awarding controls to completed results in the Results Summary.
- Preserves all existing event records and scores.

VERSION 15.69 — TABLET JOIN AND LIVE ORGANISER STATUS
======================================================

- Makes Join as a Player a true form action for more reliable installed-tablet handling.
- Adds a direct tablet tap path where an installed web app does not forward form submission correctly.
- Makes the Join button prominent and retains Enter/Go keyboard joining.
- Refreshes organiser player connections automatically every eight seconds.
- Refreshes immediately when the organiser window regains focus or becomes visible.
- Keeps manual Refresh available and leaves the successful Version 15.68 phone recovery unchanged.

VERSION 15.68 — PLAYER CONNECTION RECOVERY
============================================

- Adds Leave This Event and Join Another for phones retained in an old event.
- Clears only that device's old local connection; submitted scores remain safe online.
- Shows Finding Event and a plain-language status while a player code is checked.
- Stops a stalled cloud request after 12 seconds instead of leaving Join apparently inactive.
- Restores the entered code after a failed lookup so it can be checked and tried again.
- Applies the same timeout protection when refreshing an existing event connection.

VERSION 15.67 — RIDGE-READY SCORING
=====================================

- Removes Exit Round from every live scoring hole, eliminating the risk of pressing it instead of Finish Round.
- Keeps Previous, Next Hole and Finish Round as the only round-navigation controls.
- Retains the Version 15.66 two-tee default with an optional third tee.
- Moves Return down each tee-handicap column before continuing at the top of the next column.
- Displays automatic OUT, IN and TOTAL metres and par beneath every course scorecard.
- Includes the Select your name here join prompt, clearer rule acknowledgement and All Green invitation control.
- Shows Preferred Lies as the first special rule only when it has been enabled for the event.

VERSION 15.62 — MY EVENTS WORKSPACE
====================================

- Keeps multiple Away Golf events safely on the organiser device at the same time.
- Shows the current event first, followed by other events in date order.
- Switches events without replacing their plans, scores or cloud connection details.
- Creates new events without deleting the event previously being planned.
- Duplicates an event as a clean draft while retaining its planning setup.
- Archives or restores old events without deleting them.
- Uses two deliberate confirmations before deleting only the selected event.
- Includes the complete event collection in Organiser Backup files.

VERSION 15.61 — OFFICIAL CARD ROUND PROGRESS
================================================

- Makes Round Progress follow each player's official marker card rather than the self-check entries stored on that player's phone.
- Shows recovered players at 18/18 when all official strokes and required putts are present.
- Treats organiser-accepted emergency recovery and organiser corrections as completion of the recovered official card.
- Automatically recognises a complete official card when the player's checking card agrees or no checking card was available.
- Uses Complete consistently for finished players and for the Round Progress counter.
- Retrospectively corrects completed field-test cards without requiring the organiser to repeat recovery.

VERSION 15.60 — FIELD-TEST RELIABILITY
========================================

- Validates every 18-hole scorecard before it can be used in an event plan.
- Accepts only Par 3, 4 or 5 and checks distances and primary indexes 1–18.
- Requires the organiser to confirm Card checked against the official card.
- Renames the live scoring roles Player and Marker.
- Shows Shots, Score and Total together without reducing the score numerals.
- Lists available and previously connected players when joining.
- Adds one-button Reset Player Connections without deleting scores.
- Adds a safe Leave Organiser Mode and Join as a Player action.
- Serialises score uploads and confirms Hole saved online before moving on.
- Makes emergency self-score recovery editable and blocks incomplete recovery.
- Adds an audited organiser correction for one isolated official hole.
- Forces installed apps to take the latest service-worker update on reopening.

VERSION 15.59 — LATE TEE SELECTION SAFETY
==========================================

- Stores separate Back, Middle and Front Tee handicaps for every event player.
- Gives each tee its own independent Plus-handicap tick.
- Allows a provisional playing tee to be chosen during relaxed event planning.
- Allows the organiser to change and finalise the tee after locking and publishing the event.
- Holds player scoring until the organiser finalises the playing tee.
- Shares the final tee and its matching handicaps to connected players.
- Prevents any tee change after the first score or putt is entered.
- Allows a finalised tee to be reopened safely before scoring if the course changes its instruction again.

VERSION 15.58 — ORGANISER BACKUP AND PUBLISHED EVENT SAFETY
===========================================================

- Exports players, courses, history, event plans and scores into one organiser backup file.
- Imports a validated organiser backup without transferring a stale device or cloud connection.
- Creates an automatic local safety copy before every import and permits one-click restoration.
- Published Events now verifies each cloud record against its actual stored event contents.
- Shows the real event name, date and field size and warns when an old cloud label is misleading.
- Allows one incorrect published event to be archived without clearing every other event.

VERSION 15.57 — VIRTUAL CARD CLARITY
====================================

- Shows the selected course prominently above emergency Player–Marker entry.
- Makes clear that the organiser enters gross strokes, not Stableford points.
- Accepts either P or a dash as Pickup and stores the entry consistently as P.
- Greys unavailable recovery buttons so they cannot look ready to press.

VERSION 15.56 — EMERGENCY SCORE RECOVERY
=========================================

- Adds an organiser-only Emergency Score Recovery button to live round management.
- Recovers missing official holes from a player's available self-check scores after a marker's phone fails.
- Provides a fast 18-hole Player–Marker virtual card for MiScore or manual-card entry.
- Uses Return to advance through player score, player putts, partner official score and partner putts.
- Treats zero putts as valid and warns only about missing or impossible entries.
- Preserves existing phone scores, records a recovery audit trail and feeds accepted entries into every result.

VERSION 15.54 — PUBLISHED EVENTS MENU
========================================

- Adds Published Events beside Today’s Special Rules.
- Lists the organiser’s five most recently published events.
- Opens the selected event directly with its connected players and scores.
- Changes the player entry label to Insert the Event Code Provided.

VERSION 15.53 — SAFE ORGANISER REOPENING
========================================

- Removes the misleading attempt to recover organiser control with a player code.
- Existing organiser app copies continue reopening their saved live event automatically.
- A blank browser copy clearly directs the organiser back to the established copy.
- Explains that player codes cannot grant organiser control in a different browser.
- Preserves all event data, scores and connected-player records during upgrades.

VERSION 15.52 — CLEAR PHONE INSTALLATION INSTRUCTIONS
=====================================================

- Replaces technical APK wording with the actual Android choices shown.
- Tells Android players to select Install, not Create shortcut.
- Adds the separate Safari and Add to Home Screen instruction for iPhone.
- Confirms that players can also score directly from the browser page.

VERSION 15.51 — RETIRE OLD CLOUD TEST
=====================================

- Permanently disconnects the obsolete Away Golf 15.39 Test (code 2A40BC).
- Stops a device from guessing and reopening the latest old cloud event.
- Preserves the genuine Oatlands Saturday field test (code BE8C94).
- Organiser recovery remains available when its code is deliberately entered.

VERSION 15.49 — CLEAN FIELD-TEST RESET

- Adds an organiser-only Clear All Previous Test Events action under Event Options.
- Archives all active published events belonging to the organiser.
- Clears the PC's current event, scores, join code and saved test backups.
- Causes connected player devices to leave an archived test automatically.
- Preserves players, GolfLink details, courses, scorecards and app settings.

VERSION 15.48 — FIELD-TEST STARTUP PROTECTION

- Restores the organiser's active published event from its secure workspace at startup.
- If that workspace lookup is unavailable, finds the organiser's newest active published event directly.
- Prevents an older locked local event from replacing the published field-test event.
- Leaves protected local tests and unfinished new event plans untouched.
- Includes the compact Version 15.47 scoring screen.

VERSION 15.47 — COMPACT SCORING SCREEN

- Removes the duplicate Away Golf and course panel above the hole controls.
- Moves Screen awake beside Cloud connected in the permanent player header.
- Moves Exit Round below the Previous and Next Hole controls.
- Pulls the hole tracker and scoring controls further up the phone screen.

VERSION 15.46 — MINIATURE MASCOT AND ORGANISER WORKSPACE

- Adds a separate wordless miniature mascot beside Away Golf Scorer.
- Places the miniature in the app root so it loads with the core app files.
- Saves the active published-event identity to the organiser's secure workspace.
- Restores that published event automatically if an old PC planning copy appears.

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

VERSION 15.50 — PLAYER JOINING PAGE
===================================

- Fresh phones now open on a dedicated player-only joining page.
- Removes the confusing organiser recovery field from the player's path.
- Places the six-character event code box and Find My Event button at the top.
- Shows visible finding, success and error messages after the code is entered.
- Explains that no APK download is required and the app can run in the browser.
VERSION 15.64 — EVENT PREVIEW PUBLICATION HOTFIX
=================================================

- Fixes Event Preview publication against the existing cloud status rules.
- Recovers the exact preview row created by an interrupted Version 15.63 attempt.
- Prevents a retry from creating a duplicate event or joining code.
