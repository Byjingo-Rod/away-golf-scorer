# Away Match Play integration — development stage 2

Match Play is selected in Event Details before player selection, uses Away’s round dates/courses/tees, defaults to Back Tee and excludes the other competitions. The club’s 16 seeded qualifiers and up to five reserves are pasted per grade. Qualifying playing handicaps stay separate from GA and are frozen for the playoffs. Scratch disables handicap controls.

The Teams page saves the fixed knockout tree and opening tee groups. Its player review now opens the event-code/name selection, personalised welcome and Got it acknowledgement, gross-score controls, automatic browser saving, concessions, accepted-hole overview, two-player result confirmation and personal win/elimination pages. Confirmed winners progress in the fixed tree; eliminated players can continue viewing the leaderboard. No separate Save My Scores action exists. Grey par is not an entered score until tapped or changed.

The session transaction rolls back changes if durable storage fails. Marker entries determine the recognised result; missing checks/disagreements prevent player confirmation. Unconfirmed decided matches allow existing entries to be corrected. Later rounds use their course/tee/index/par snapshots. Handicap values remain locked against later profile changes.

## Review delivery

`scripts/build-matchplay-review.mjs <absolute-output-directory>` packages an isolated copy of Away. It excludes `cloud.js` and `supabase.js`, disables network connections with CSP, does not install the live service worker, and offers 18-hole handicap and 36-hole scratch samples plus instructions. Review code PLAY26 is a simulation on that browser, not an authenticated player credential. The separate owner-private review Site does not change the installed Away app.

## Release boundary

This branch is not a live Match Play release. Cloud publication and update remain blocked. Server-side identity/round access, score permissions, multi-device sync, offline queue reconciliation, referee/organiser operations and full grade-range/print integration are subsequent work. Browser-local role switching is a review facility, not an authorisation system. No database changes are applied by this stage. Do not merge/release it as a fully playable online event.

The reviewed standalone design remains the reference for the remaining integration. Its referee-final model is retained; the current player review focuses on player-scored playoff rounds.

## Validation

- Match Play planning, model, handicaps and session checks pass.
- Existing spreadsheet workflow, player-profile handicap, phone-team handicap, code separation and organiser wizard refresh regressions pass.
- Browser checks cover code/name selection, both welcome perspectives (+2 versus 2 = four strokes), acknowledgement, automatic score entry, opponent marker/check agreement, accepted overview, refresh recovery, match concession, both confirmations and winner progression.
- Rebuild the classic model wrapper with `node scripts/build-matchplay-core.mjs`.

## Two-player concession records and opening rules

Either player can record which opponent conceded the current unfinished hole. The record includes the conceding side and the device role that entered it. Only the other player can confirm the record. Until that happens the displayed hole stays pending with no score entry or advance. Once confirmed the hole is awarded without invented gross scores. Existing direct concession records remain readable. The confirmation acknowledges the app entry rather than changing when a concession is valid under the Rules.

Opening rules are acknowledged with Got it. They distinguish a given putt from conceding the whole hole and explain that a given putt adds one stroke to the total. The same text is available in Scoring reminders. Existing review players acknowledge the updated rules before further scoring.

Development Review 6 uses each round's selected tee card for par and metres. The isolated review includes a read-only Oatlands master card snapshot. Missing distances display a dash. Scoring reminders reopens the acknowledged opening rules. The allowance summary uses “plays off”.

Development Review 7 restores feeder-centred bracket cards. The leaderboard offers match cards or line-and-bars with one selected round (up to eight matches). Each hole bar shows the cumulative lead. Green rises above the baseline and blue extends below it. Each match reserves space for its full positive and negative lead history so bars cannot overlap adjacent matches. Full screen TV uses the browser Fullscreen API. Casting uses the user's normal device or browser controls. The review still saves only on this device.

Development Review 8 gives both graph player names the same 16px bold treatment and heads each row with Match No. The graph advances in nine-hole blocks with a carried status column after each completed nine. A decided match retains its concluding block. Tied matches enter playoff blocks after the scheduled 18 or 36 holes. All-square holes produce no bar.

Development Review 9 highlights each carried nine-hole milestone with a light-blue column and a charcoal bar. A bold +N beneath it records the lead magnitude. The bar position identifies the leading player. All square remains an empty bar with +0 at the milestone. The caption reads “after 9 holes” (or the appropriate completed nine). A separate milestone-review.html sample page demonstrates a six-hole lead after nine without modifying saved review scores.
