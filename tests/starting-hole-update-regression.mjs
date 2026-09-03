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

const eventStartingHoleForPlayer = Function(
  `return (${functionSource("eventStartingHoleForPlayer")})`,
)();

const event = {
  startHoles: { day1: [7] },
  groupSetup: {
    day1: {
      groups: [["rod", "jerry"], ["ralph", "david"]],
      starts: [7, 7],
    },
  },
};

assert.equal(eventStartingHoleForPlayer(event, "rod", 1), 7);
assert.equal(eventStartingHoleForPlayer(event, "david", 1), 7);
assert.equal(eventStartingHoleForPlayer(event, "unknown", 1), null);

assert.match(
  source,
  /startingHoleChanged[\s\S]*playerHolePos: startingHoleChanged[\s\S]*\? 0/,
  "a changed starting hole must return the phone to position zero",
);
assert.match(source, /Starting hole changed to Hole \$\{start\}/);
assert.match(source, /setInterval\(pollPlayerEvent, 10000\)/);
assert.match(source, /const blocker = firstDayScoreEntry\(day\)/);
assert.match(source, /store\.event\.startingHoleUpdate = \{/);

console.log("Starting-hole update regression checks passed.");
