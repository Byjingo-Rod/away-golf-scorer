import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(index, /Version 15\.86\.7/);
assert.match(app, /appVersion: "15\.86\.7"/);
assert.match(sw, /away-golf-v15-86-7/);
assert.doesNotMatch(`${index}\n${sw}`, /15\.86\.6/);

// Saved teams survive another pass through the event wizard.
assert.match(app, /groupSetup: oldGroups \|\| \{\}/);
assert.doesNotMatch(app, /store\.event\.groupSetup = \{\}/);
assert.match(app, /id="unlockGroups"/);
assert.match(app, /setup\.saved = false;[\s\S]*?store\.event\.swapPlayer = null;[\s\S]*?save\(\)/);
assert.match(app, /if \(teamsSaved\) return;/);

// Special rules use one logical rule per bullet and Enter adds another.
assert.match(app, /function specialRuleLines\(text\)/);
assert.match(app, /setRangeText\([\s\S]*?"\\n• "/);
assert.match(app, /class="specialRulesList"/);
assert.match(css, /\.specialRulesList li \+ li/);

// Final Check associates the time with its day and course, not Start Date.
assert.match(app, /label: `Start Date: \$\{displayDate\(W\.event\.date\)\}`/);
assert.match(app, /`Day 1: \$\{c1\?\.name/);
assert.match(app, /`Day 2: \$\{c2\?\.name/);

console.log("Version 15.86.7 regression checks passed.");
