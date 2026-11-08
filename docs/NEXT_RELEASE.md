# Released: tee count and Belmont correction

- Rename the existing **Bellmont** course to **Belmont** in the shared master course catalogue used by Away Golf Scorer and Golf Event Scorer. Requested by Rod on 08/11/26; there is no separate Bellmont course to retain.
- Existing seed course identity is `c4`; existing seed payloads remain untouched; the app normalises this course label when loading it. The same shared master record is updated and the existing course identity is preserved. Preserve tee cards, hole data, ratings, favourites and course references.
- Released with Away 15.97.15 / Scorer 0.5.09. Shared master c4 renamed to Belmont at revision 4; all non-name data verified unchanged.

- Fix Tee Positions reductions being undone on draft reload: completeness must count all stored cards, including hidden tees. Verified three to two, completed save/reopen, and restoration to three without changing the Red card; women’s tee count stays independent. Hidden tees remain excluded from the editor and event tee choices until re-enabled.
