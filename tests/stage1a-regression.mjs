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

const mergeOrganiserCorrections = Function(
  `return (${functionSource("mergeOrganiserCorrections")})`,
)();

const oldPhone = {
  day1: { p1: { 7: { gross: 6, correctedAt: "2026-09-02T08:00:00Z" } } },
};
const organiser = {
  day1: { p1: { 7: { gross: 5, correctedAt: "2026-09-02T09:00:00Z" } } },
};
const merged = mergeOrganiserCorrections(organiser, oldPhone);
assert.equal(merged.day1.p1[7].gross, 5, "older data must not beat organiser correction");

const newerOrganiser = {
  day1: { p1: { 7: { gross: 4, correctedAt: "2026-09-02T10:00:00Z" } } },
};
assert.equal(
  mergeOrganiserCorrections(merged, newerOrganiser).day1.p1[7].gross,
  4,
  "newer organiser correction must win",
);

assert.ok(
  !source.includes("official.complete && (organiserAccepted || selfEntered === 0)"),
  "missing checking cards must not be treated as complete",
);
assert.match(source, /const uploaded = await flushCloudRound\(day, selected\)/);
assert.match(source, /const refreshed = await syncCloudNow\(\)/);
assert.match(source, /The event cannot be closed until the latest online scorecards/);
assert.match(source, /UNCONFIRMED HOLES/);
assert.match(
  source,
  /verificationIssueCount\(day, playerId\) === 0[\s\S]*emergencyFinaliseIfVerified\(day, playerId, false\)/,
  "a resolved organiser correction must restore Complete status",
);

console.log("Stage 1A regression checks passed.");
