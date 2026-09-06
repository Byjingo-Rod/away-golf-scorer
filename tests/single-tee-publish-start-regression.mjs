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

const helpers = Function(
  `${functionSource("startMethodFor")}
   ${functionSource("startHolesFor")}
   ${functionSource("groupStartingHole")}
   ${functionSource("synchroniseSingleTeeGroupStarts")}
   return { groupStartingHole, synchroniseSingleTeeGroupStarts };`,
)();

const stalePublishedEvent = {
  days: 2,
  startMethods: { day1: "single", day2: "single" },
  startHoles: { day1: [10], day2: [1] },
  groupSetup: {
    day1: { groups: [["rod"], ["david"]], starts: [1, 1], saved: true },
    day2: { groups: [["rod"], ["david"]], starts: [1, 1], saved: true },
  },
};

assert.equal(
  helpers.groupStartingHole(stalePublishedEvent, 1, 1),
  10,
  "the event-level single starting hole must override stale group data on a phone",
);
helpers.synchroniseSingleTeeGroupStarts(stalePublishedEvent);
assert.deepEqual(stalePublishedEvent.groupSetup.day1.starts, [10, 10]);
assert.deepEqual(stalePublishedEvent.groupSetup.day2.starts, [1, 1]);

assert.match(
  functionSource("cloudPayload"),
  /synchroniseSingleTeeGroupStarts\(event\)/,
  "publishing must repair stale single-tee group starts before upload",
);
for (const name of ["renderPlayerExperience", "renderHoleScoring", "renderRoundVerification"])
  assert.match(
    functionSource(name),
    /groupStartingHole\(store\.event, day, ctx\.groupIndex\)/,
    `${name} must use the authoritative starting-hole helper`,
  );

console.log("Single-tee published starting-hole regression checks passed.");
