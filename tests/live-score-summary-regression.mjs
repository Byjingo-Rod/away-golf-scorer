import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(
  source,
  /data-score-summary="\$\{section\}"/,
  "each live score summary has a stable section identifier",
);
assert.match(
  source,
  /const updateScoreSummary = \(section\) => \{[\s\S]*stablefordPoints\([\s\S]*running\(section, handicap, playerId\)\.points[\s\S]*summary\.outerHTML = scoreSummary/,
  "the current Stableford score and running total are recalculated without redrawing the card",
);
assert.match(
  source,
  /updateScoreControl\(id, val\);\s*updateScoreSummary\(section\);/,
  "every accepted score entry immediately refreshes its summary",
);
assert.doesNotMatch(
  source.match(/const setField = \(id, val\) => \{[\s\S]*?\n    \};/)?.[0] || "",
  /renderHoleScoring/,
  "a score tap does not replace the entire scoring screen",
);

console.log("live score summary regression checks passed");
