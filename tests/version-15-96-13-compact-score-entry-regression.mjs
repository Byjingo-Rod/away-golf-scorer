import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(app, /Scoring to be completed using the App while playing/);
assert.match(
  app,
  /If the App is not being used for any round in the event, use this section to plan the scoring process/,
);
assert.match(app, /name="planAlternativeScoring"/);
assert.ok(
  app.includes('if (method === "finalStableford") return ["single", "combined", "capTeams"].includes(id);'),
);
assert.ok(
  app.includes('if (method === "finalGross") return ["stroke", "scratch"].includes(id);'),
);
assert.match(app, /competitionCompatibleDays/);
assert.match(app, /Unavailable with the selected final-score method/);
assert.match(app, /Grey days use a final-score method that cannot calculate this competition/);
assert.match(styles, /\.scoringUseQuestion/);
assert.match(styles, /\.methodUnavailableReason/);
assert.match(index, /Version 15\.96\.13/);
assert.match(sw, /away-golf-v15-96-13/);

console.log("15.96.13 compact score-entry regression checks passed");
