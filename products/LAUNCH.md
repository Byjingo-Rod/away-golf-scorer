# Golf Event Scorer launch candidate

Tested source: Sites commit 585993148440a0fe35e7ccaede2316830b1670af, version 0.2.10-dev (5 October 2026, Sydney).

This branch records the tested separate app. Do not merge into Away Golf main or change its database. Build with python3 tools/build-site.py; deploy only build/ to the Golf Event Scorer site. Backend: rlkyibpyezzoadowcdre. Browser key is publishable; no server secrets belong in source.

Verified: roster, course model and layout, planner and live-client checks pass. Rod tested organiser setup, approved course list, scoring on two phones, corrections, completion and live leaderboards. A full 20-player event and all competition formats remain untested.

Before customer launch:
- Connect app.golfeventscorer.com DNS and TLS.
- Configure the separate Supabase Auth site URL and allowed callback URL for the final hostname; test email sign-in across devices.
- Remove the ChatGPT hosting gate only after customer access and owner-only administration checks pass.
- Audit and hide inherited development/test tools and personal fixtures from public delivery.
- Confirm release/rejoin never accepts scores with a released token and that unsent-score status is clear. Current local backup preserves data but does not automatically restore it on rejoin.
- Run a 20-active-player, three-approved-course acceptance test and anonymous/cross-group/suspended account checks.

Customers: owner creates identifiable group and approves organiser email; organiser requests player allowance and courses; owner checks courses and activates planning; organiser maintains their own roster and events. Players join published events by code. Changing the hosting origin does not transfer browser-local storage; online group records remain in the same GES database.
