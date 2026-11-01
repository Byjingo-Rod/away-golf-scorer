import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
const cloudSource = fs.readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.match(
  cloudSource,
  /async function loadRound\([\s\S]*from\("away_round_scores"\)[\s\S]*\.eq\("day", \+day\)[\s\S]*\.eq\("scorer_player_id", String\(playerId\)\)[\s\S]*\.maybeSingle\(\)/,
  "the conflict reader requests one player's one-day scorecard only",
);
assert.match(
  appSource,
  /clearTimeout\(cloudReloadTimer\);[\s\S]*cloudReloadTimer = setTimeout\(syncCloudNow, 450\)/,
  "rapid Realtime notices are combined into one organiser refresh",
);
const storage = new Map();
const localStorage = {
  get length() { return storage.size; },
  key(index) { return [...storage.keys()][index] ?? null; },
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
const window = { addEventListener() {} };
vm.runInNewContext(source, {
  window,
  localStorage,
  console,
  Date,
  JSON,
  Object,
  Array,
  Set,
  Map,
  String,
  Number,
  Boolean,
  Error,
  Promise,
  setTimeout,
  clearTimeout,
});

let fullLoads = 0;
let roundLoads = 0;
let saveCalls = 0;
const expectedRevisions = [];
const uploadedCards = [];
let conflictOnce = false;
const baseCard = { 1: { official: { gross: 4 } } };
const adapter = {
  async loadEvent(id) {
    fullLoads += 1;
    return {
      event: { event_data: { event: { name: id } }, revision: 7 },
      scores: [{ day: 1, scorer_player_id: "p1", score_data: baseCard, revision: 1 }],
    };
  },
  async loadRound() {
    roundLoads += 1;
    return {
      day: 1,
      scorer_player_id: "p1",
      score_data: {
        1: { official: { gross: 5 } },
        2: { official: { gross: 3 } },
      },
      revision: 3,
    };
  },
  async saveRound(_id, _day, _player, data, options) {
    saveCalls += 1;
    expectedRevisions.push(options.expectedRevision);
    uploadedCards.push(JSON.parse(JSON.stringify(data)));
    if (conflictOnce && saveCalls === 2)
      throw Object.assign(new Error("revision conflict"), { code: "40001" });
    return { revision: options.expectedRevision === 3 ? 4 : 2 };
  },
  async updateEvent() { throw new Error("not used"); },
  async safeControl() { return {}; },
};
window.GolfSafeCloud.install(adapter);

await adapter.loadEvent("event-1");
fullLoads = 0;
await adapter.saveRound(
  "event-1",
  1,
  "p1",
  { ...baseCard, 2: { official: { gross: 3 } } },
  { expectedPlayerId: "p1" },
);
assert.equal(fullLoads, 0, "an ordinary card save must not download the complete event");
assert.equal(roundLoads, 0, "an ordinary card save uses its acknowledged phone revision");
assert.equal(expectedRevisions[0], 1, "the acknowledged card revision is sent with the save");

fullLoads = 0;
conflictOnce = true;
await adapter.saveRound(
  "event-1",
  1,
  "p1",
  {
    ...baseCard,
    2: { official: { gross: 3 } },
    3: { official: { gross: 4 } },
  },
  { expectedPlayerId: "p1" },
);
assert.equal(fullLoads, 0, "a card revision conflict must not download the complete event");
assert.equal(roundLoads, 1, "a card revision conflict downloads only that scorecard");
assert.deepEqual(expectedRevisions.slice(-2), [2, 3], "the retry uses the latest targeted card revision");
assert.equal(uploadedCards.at(-1)[1].official.gross, 5, "the retry retains the newer remote hole");
assert.equal(uploadedCards.at(-1)[3].official.gross, 4, "the retry also retains the phone's new hole");

console.log("phone targeted score-save regression checks passed");
