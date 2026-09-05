import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(index, /Version 15\.86\.8/);
assert.match(app, /appVersion: "15\.86\.8"/);
assert.match(sw, /away-golf-v15-86-8/);

// Saved teams still survive another pass through the event wizard.
assert.match(app, /groupSetup: oldGroups \|\| \{\}/);
assert.doesNotMatch(app, /store\.event\.groupSetup = \{\}/);
assert.match(app, /id="unlockGroups"/);

// Special Rules use real list items so wrapped lines retain a hanging indent.
assert.match(app, /<ul id="specialRules"[\s\S]*?contenteditable="true"/);
assert.match(app, /function specialRulesEditorHtml\(text\)/);
assert.match(css, /\.specialRulesEditor li \+ li/);

// Final Check shows the first tee holes and retains official-card confirmation.
assert.match(app, /label: `First Tee:/);
assert.doesNotMatch(app, /Scorecard: Valid · OUT/);
assert.match(app, /Course Scorecard Checked Against Official Card/);

// Phone leaderboard removes redundant Single tables and adds useful context.
assert.doesNotMatch(app, /showOnDay2: true/);
assert.match(app, /d\.scope === "overall" && !\(\+view === 1 && d\.type === "combined"\)/);
assert.match(app, /Points Gained/);
assert.match(app, /Total Par 3 Holes/);

console.log("Version 15.86.8 regression checks passed.");
