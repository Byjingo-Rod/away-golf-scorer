# Away Golf Scorer — Ideas Backlog

This file stores ideas that are valuable but are not required for the 2 September Version 1.0 release.

## How to use this backlog

- Record each idea briefly when it occurs.
- Do not interrupt current development unless the idea is essential for Version 1.0.
- Review the backlog after the first live event.
- Move approved ideas into a future release plan.

---

## Approved Design — Automatic Shotgun Starting Holes

**Status:** Recorded; implementation deferred until after the current live tests

- The organiser chooses a designated starting hole after playing groups are formed.
- Group 1 starts there; each following group uses the preceding hole, wrapping from Hole 1 to Hole 18.
- Example: four groups with designated Hole 13 start on 13, 12, 11 and 10.
- Provide **Modify Starting Holes** and **Reset Automatic Assignment** safety controls.
- Final Check confirms that every group has one unique starting hole.
- Each player's card opens at the assigned hole and wraps to finish immediately before it.
- Version 1.0 supports one group per hole. Two groups on selected holes is a later large-field enhancement.

---

## Approved Core Work — Live Leaderboards and Countback

**Status:** Approved for the Supabase stage

- Live provisional and verified leaderboards for every selected competition.
- Automatic Golf Australia countback for Scratch, Single Stableford and 4BBB: holes 10–18, then 13–18, then 16–18, then hole-by-hole from Hole 18 backwards.
- Display countback winners with the suffix **CB** and provide a tappable explanation.
- If every comparison remains identical, display **TIED — Organiser Decision**.
- Organiser Results screen shows rankings, ties and the prizes configured during event setup.

---

## AGI-001 — Search Previous Events by Location

**Status:** Backlog  
**Target release:** After Version 1.0  
**Priority:** Review after the 2 September event

### Idea

Add a search facility to the event history so the organiser can search by location, such as **Hunter Valley**, and see all previous Away Golf events held in that area.

### Purpose

When planning a new event, the organiser can quickly review:

- courses previously played in that location;
- dates of past events;
- players and groups;
- competitions used;
- special rules;
- event results;
- organiser notes;
- useful observations recorded after the event.

### Example

Search:

`Hunter Valley`

Possible results:

- Hunter Valley Weekend — 2023
- Cypress Lakes Trip — 2024
- Vintage and Hunter Valley Event — 2025

The organiser can open a previous event as a reference or copy selected settings into a new event.

---

### AGI-002 — Spectator Leaderboard Access

**Status:** Backlog; explicitly deferred until after the first live event
**Target release:** After Version 1.0
**Priority:** Review after live-event scoring is proven

**Idea:**
Add **Spectator — Leaderboard Access Only** at the bottom of the player check-in list. A spectator uses the normal event code but cannot claim a player, open a scorecard or enter or alter scores.

**Reason:**
Friends who are not playing could follow the live event without being included in the field, groups or connected-player count.

---

### AGI-003 — Bullet-Point Special Rules

**Status:** Included in Version 15.86.7
**Target release:** Version 15.86.7
**Priority:** Review with other findings from the Federal event

**Idea:**
Format organiser-entered Special Rules as a bulleted list. The first rule begins with a bullet, and pressing Enter starts the next bullet automatically.

**Presentation:**

- use normal line spacing when one bullet wraps onto another line;
- add slightly more vertical space between separate bullet points;
- preserve the same clear bullet formatting wherever players read the rules, including the preview, final event and player acknowledgement screens.

**Reason:**
Each instruction will be visually distinct and easier for players to scan on a phone.

---

### AGI-004 — Put Each Day's First Tee Time Beside Its Course in Final Check

**Status:** Included in Version 15.86.7
**Target release:** Version 15.86.7
**Priority:** High — accurate tee times are critical event information

**Idea:**
Revise the two-column **Final Check** so each day's first tee time appears in the same line as that day's course.

**Changes:**

- remove **First Tee Time** from the **Start Date** line;
- remove the word **Course** from the Day 1 and Day 2 headings to preserve room for long course names;
- show the Day 1 course and its first tee time in the left column;
- show the Day 2 course and its first tee time in the right column.

**Example:**

- Left: **Day 1: Federal GC · First Tee Time: 11:30**
- Right: **Day 2: Federal GC · First Tee Time: 08:28**

The layout must also accommodate longer names such as **Shoalhaven Heads GC** without obscuring the tee time.

**Reason:**
Placing the course and tee time together makes the organiser explicitly verify the correct starting time for each day, particularly in a two-day event.

---

## New Idea Template

### AGI-___ — Short title

**Status:** Backlog  
**Target release:**  
**Priority:**  

**Idea:**  
One or two sentences describing the idea.

**Reason:**  
Why it would be useful.
