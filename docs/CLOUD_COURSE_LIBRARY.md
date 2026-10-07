# Shared Away Golf course library — 15.94.9

Open Courses and press Refresh / Sync Courses. A verified owner or an existing approved organiser tablet can use the cloud master. Use your existing verified owner sign-in; anonymous player access and single-event guest access do not grant master-edit permission.

The first authorised connection uploads existing device courses that are not already in the master. New courses enter the shared master after Course Details is completed and saved. Country additions sync too. Favourites remain personal to each device.

Saved course changes queue locally first, then upload with an expected revision. Courses download on opening Courses, reconnecting, returning to the app, or pressing Refresh / Sync Courses. An open editor is not replaced by a background refresh. Offline or failed uploads remain pending after closing/reopening.

On the first connection from another device, differing existing courses require review; matching IDs alone do not authorise an overwrite. Compare both cards, choose the cloud copy, or explicitly save this device's copy as a new revision. The cloud's previous revisions remain in History. Choosing a cloud copy retains the replaced local copy inside the organiser backup. Restoring History creates a new revision.

Published event cards remain tied to the shared event's course snapshot until an explicit event update. Master changes do not rewrite cloud event payloads or results. This release does not change event-plan storage or connect Golf Event Scorer's separate database.

Database setup is recorded in database/course-library.sql. Configure the existing verified owner privately using the database-session setting away.course_owner_email when applying to a new environment. Owner details are deliberately excluded from this repository. The live Supabase migration also adds the required JSON identity constraint. Database tests roll back their fixture changes. Client tests exercise two independent devices, offline restart, stale revisions, in-flight edits, and API pagination; installed-device testing remains necessary.
