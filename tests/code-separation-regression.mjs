import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const development = fs.readFileSync(new URL("../development-tests.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

for (const name of [
  "buildOatlandsTestEvent",
  "buildOatlandsOneDayTestEvent",
  "buildOatlandsSixteenPlayerTestEvent",
  "makeRidgeTestScoring",
  "loadRidgeEventTest",
]) {
  assert.doesNotMatch(app, new RegExp(`function ${name}\\(`), `${name} must not remain in production app.js`);
  assert.match(development, new RegExp(`function ${name}\\(`), `${name} belongs in the development-only module`);
}

assert.match(app, /script\.src = "development-tests\.js\?v=15\.97\.02"/);
assert.match(app, /if \(e\.target\.id === "testEventTools"\) openTestEventTools\(\)/);
assert.doesNotMatch(html, /development-tests\.js/, "ordinary page startup must not download test builders");
assert.doesNotMatch(worker, /development-tests\.js/, "service worker must not pre-cache test builders");
assert.match(development, /window\.AwayGolfDevelopmentTests/);

// Smoke-test the lazy module adapter without loading an event or touching
// production data. Opening Testing Tools must render the safe chooser.
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { innerHTML: "", classList: { add() {}, remove() {} } });
  return nodes.get(id);
};
const context = { window: {}, localStorage: { getItem: () => null }, confirm: () => false, alert() {}, console };
vm.createContext(context);
vm.runInContext(development, context);
const tools = context.window.AwayGolfDevelopmentTests.create({
  store: { event: null, courses: [], cloudPlayers: [] },
  $: node, $$: () => [], NO_PARTNER_ID: "none", version: () => null,
  stablefordPoints: () => 0, player: () => null, writeLocalStore() {},
  renderHome() {}, nav() {}, closeCloudConnection() {}, renderCoursesAdmin() {},
  watchCloudEvent() {}, syncCloudNow() {}, course: () => null, dayFieldIds: () => [],
  playerDailyHandicap: () => 0, stablefordStrokeCount: () => 0,
  renderLeaderboard() {}, renderPlayerExperience() {},
});
tools.open();
assert.match(node("#modalContent").innerHTML, /Oatlands Test Events/);

console.log("Production/development code separation regression checks passed.");
