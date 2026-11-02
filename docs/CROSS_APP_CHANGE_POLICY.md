# Changes shared by Away Golf and Golf Event Scorer

Every Away change must be checked for relevance to Event Scorer before release. Port shared planning, display, competition and scoring changes into the Event Scorer source, preserve its customer accounts, seven-day fields and approved-course access, and test the generated product. Do not copy personal Away seed players or account/cloud configuration into Event Scorer. Both apps use the existing single course authority.

## Release 15.97.06 / 0.4.87

- Same GA Balanced solver, signed GA handling, day-specific shared-position lookup, missing-value rejection and GA group totals.
- Draw changes only the selected unsaved/unlocked unscored day. All other days' existing 4BBB pairs are excluded. Existing group sizes remain; virtual player GA is excluded from the real-player total.
- Fields up to 16: exact minimum maximum-minus-minimum total GA among permitted groupings; squared totals break ties. Larger fields: repeated cross-group improvement, explicitly described as closest totals found. Balance is by total, including unequal-sized groups.
- Prior 15.97.05 profile blank-merge protection, left-aligned Scratch options and ONLY eligibility wording are ported. Original Away seed recovery remains guarded from Event Scorer planner use.
- Group totals are calculated afresh when displayed, including after a manual swap. Re-draw after GA changes to rebalance.
- Existing scoring, sign-off, course authority and customer cloud permissions are unchanged. Tests use isolated local data; no customer event is redrawn by deployment.

Release checklist: review both sources; apply relevant ports with product-specific adapters retained; update source provenance; run both product checks; inspect display; publish each product; report any remaining device verification.
