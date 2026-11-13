# Spreadsheet player lists and GA handicaps

Prepared in both apps, unpublished. No production player records were imported for verification.

## Create a list

Create / Manage Player Lists → Create Player List now offers **Import** or **From Database**. Import accepts Excel clipboard cells separated by tabs, and CSV text. Optional headings are recognised.

Supported layouts:

- First Name | Last Name | GolfLink | GA | Category
- Full Name | GolfLink | GA | Category

GA and Category are optional. Existing categories are retained when omitted; choose the default category for new profiles or supply Men/Women in the sheet. Use No Official Handicap in the GolfLink column and blank GA for event-estimate players. Leading-zero GolfLink numbers are preserved as text. Plus handicaps accept -1.1 or +1.1.

Preview precedes every save. Matching uses the full GolfLink number, with carefully constrained unique-name matching for profiles without one. Conflicting names/IDs, repeated players and ambiguous names stop the import. Matching profiles retain their IDs, history and private contact details. Imported nonblank GAs update saved profiles; blank GAs preserve saved values. This does not automatically change GA values already fixed in another event.

A saved named list is loaded into Invited through the existing workflow. Import does not automatically confirm attendance or publish an event.

## Update event GAs

Set GA & Tee Hcps → Paste GA Handicaps accepts:

- GolfLink | GA
- Full Name | GA
- First Name | Last Name | GA
- First Name | Last Name | GolfLink | GA
- A single GA column matching exactly the displayed player order, including blank positions.

Keyed rows may be in any order. The preview always shows the resolved player and old/new GA. Blank entries leave existing values untouched. Players without an official handicap continue through the existing event-estimate process. Their blank cells do not erase an estimate.

Applying a changed GA clears that player's stale tee/daily handicaps across the event; calculate and save both categories as usual. Imports are refused once scoring has started or for permanently finished/read-only events. The bulk operation updates event GAs; normal calculation/save controls retain the existing profile and cloud-update behaviour.

## Data and failure protection

- DEMO-tagged profiles are not candidates for a genuine spreadsheet player list.
- Scorer uses the existing approved-group player-save RPC, including its revision and allowance checks. No new public RPC or migration is introduced.
- A failed local Away save rolls the import back. Scorer retains acknowledged rows and reports a partial save; re-preview reuses those profiles.
- New Scorer imports save a stable pending UUID/timestamp before the online request. An uncertain reply can be retried without inventing a different player ID. Confirmed pending identities are removed.
- The Scorer adapter can verify a lost acknowledgement against an authorised current roster read, accepting only identical meaningful profile content, GA and active status. Different concurrent edits remain an error.
- A changed player database invalidates the preview. Imported display strings are escaped.

## Verification

Parser/matching, generated-app handlers, 50-player ordering, blank cells, plus handicaps, leading-zero IDs, duplicates, contact preservation, limits, local rollback, partial saves, lost replies and scoring locks have automated coverage. Broad regression results are recorded after the final build. No live customer roster was used as a write target; no physical-phone/browser clipboard pass was performed.

Final automated runs: Away **162/162**, Scorer **306/306**, no failures. Targeted spreadsheet handlers also passed against the generated Scorer app. See `SPREADSHEET_IMPORT-EVIDENCE.json`.
