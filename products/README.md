# Golf Event Scorer development

Both products are generated from the existing root source files with:

    python3 tools/build-products.py

The existing Away Golf release files are unchanged. The generated Golf Event
Scorer is a local development build, not an approved service for real events.
It has a separate manifest, cache and storage namespace, no seeded personal
player list, and no connection to Away Golf's live database.

Shared fixes go into the root source and flow into both builds. Product-specific
changes belong in the product configuration/build adapters. Do not edit dist.
This is the initial shared-source build foundation; extracting scoring modules
and explicit feature controls follows as the products diverge.

Next work:

1. Separate backend and owner-approved group membership with server-enforced
   permissions. Group organisers cannot grant organiser access or create groups.
2. Cloud-saved planning, private rosters and completed event history per group.
3. History-aware team allocation and copying previous event settings.
4. End-to-end 20-player test: five groups, score entry, leaderboards and results.
   The current source already offers field sizes up to 60; that is not proof
   that every format and workflow has been validated at that size.
5. Independent releases and safe update activation between rounds.

Before any live use, audit legacy fixtures, exports/imports, hard-coded branding
and special test histories. Clearing the seed roster alone is not a complete
removal of legacy personal information embedded in source/test tools.
