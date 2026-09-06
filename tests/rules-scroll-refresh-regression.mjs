import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf("{", source.indexOf(") {", start) + 2);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Could not read ${name}`);
}

const refresh = functionSource("renderPlayerExperienceAfterCloudRefresh");
assert.match(refresh, /#scorePage\.active/);
assert.match(refresh, /#playerExperience \.playerRulesPanel/);
assert.match(refresh, /rulesScrollTop/);
assert.match(refresh, /rules\.scrollTop = rulesScrollTop/);
assert.match(refresh, /renderPlayerExperience\(\)/);
assert.match(refresh, /requestAnimationFrame/);
assert.match(
  functionSource("applyRemoteCloud"),
  /renderPlayerExperienceAfterCloudRefresh\(\)/,
  "cloud updates must preserve the phone's reading position",
);

console.log("Rules scroll-position refresh regression checks passed.");
