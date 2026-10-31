import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(
  app,
  /playerPreviewAck: JSON\.parse\(/,
  "organiser cloud refresh preserves the local Player View acknowledgement",
);
assert.match(
  app,
  /playerRoundMode: store\.event\?\.playerRoundMode \|\| "preview"/,
  "organiser cloud refresh does not close an open preview scorecard",
);
assert.ok(
  app.indexOf('competitionDays("ntp", W.event).forEach((day) => {') <
    app.indexOf('const printableNtpCards = competitionDays("ntp", W.event)'),
  "automatic NTP selections exist before printable cards are rendered",
);
assert.match(
  app,
  /EVENT COMPLETE — RELEASE PHONES &amp; ARCHIVE/,
  "completed-event control clearly releases phones and archives",
);
assert.ok(
  (app.match(/GolfSafeCloud\.discardEventCopies\(/g) || []).length >= 3,
  "completed-event recovery copies are cleaned on organiser and player devices",
);
assert.match(
  app,
  /Competitions <small>\(Note: All prizes are quoted per player\)<\/small>/,
  "competition prize note is displayed",
);
assert.match(app, /id="exitScorecard"/, "an open scorecard has a clear exit control");
assert.match(
  app,
  /Your entered scores remain saved\./,
  "the exit control explains that entered scores remain saved",
);
assert.match(
  app,
  /eventGaCategory\(targetId, store\.event\) === "women" \? "her" : "his"/,
  "the NTP acknowledgement uses the recorded player category for his or her",
);
assert.ok(
  app.indexOf("${ntpAcknowledgement}") < app.indexOf('<div class="scoreEntryCard official">'),
  "the NTP acknowledgement appears before the first score-entry block",
);
assert.match(css, /\.holeHero\.isNtp > div\.ntpParCell \{[^}]*background: #ffe4e4;/s, "the NTP Par cell has a light red background");
assert.match(css, /\.runningScore b \{\s*font-size: 18px;/, "score figures are enlarged");

console.log("15.96.60 event finish and preview regression checks passed");
