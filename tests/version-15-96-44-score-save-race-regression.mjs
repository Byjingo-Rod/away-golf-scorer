import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const eventId = "00000000-0000-4000-8000-000000000044";
const record = `${eventId}:score:1:p42`;
const base = { "1": { self: { gross: 5 } }, _meta: { furthestPos: 0 } };
const complete = {
  ...base,
  "2": { self: { gross: 4 } },
  _meta: { furthestPos: 1 },
};
const state = {
  [record]: { base, revision: 1, acknowledged: true },
};
const memory = new Map([["golfSafeSaves.v1", JSON.stringify(state)]]);
const localStorage = {
  get length() { return memory.size; },
  key(index) { return [...memory.keys()][index] ?? null; },
  getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  setItem(key, value) { memory.set(key, String(value)); },
  removeItem(key) { memory.delete(key); },
};
const window = { addEventListener() {} };
vm.runInNewContext(
  fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8"),
  { window, localStorage, document: undefined, console, setTimeout, clearTimeout },
);

let releaseLoad;
const loadGate = new Promise(resolve => { releaseLoad = resolve; });
let savedPayload;
let retained = false;
const adapter = {
  async loadEvent() {
    await loadGate;
    return {
      event: { event_data: { event: {} }, revision: 1 },
      scores: [{ day: 1, scorer_player_id: "p42", score_data: complete, revision: 2 }],
    };
  },
  async saveRound(_id, _day, _player, data) {
    savedPayload = data;
    return { revision: 3 };
  },
  async updateEvent() { throw new Error("not used"); },
  async safeControl(action) {
    if (action === "retain") retained = true;
    throw new Error("retain should not be needed");
  },
};
window.GolfSafeCloud.install(adapter);

const saving = adapter.saveRound(eventId, 1, "p42", complete, {});
// Reproduce the former race: polling acknowledges the same complete card and
// removes the shared pending property while saveRound is awaiting loadEvent.
adapter.reconcile(eventId, "score", complete, complete, 2, 1, "p42");
releaseLoad();
await saving;

assert.deepEqual(JSON.parse(JSON.stringify(savedPayload)), complete);
assert.equal(retained, false);
const stored = JSON.parse(localStorage.getItem("golfSafeSaves.v1"));
assert.equal(stored[record].conflict, undefined);
assert.equal(stored[record].conflictUploadError, undefined);

const safeCloudSource = fs.readFileSync(new URL("../safe-cloud.js", import.meta.url), "utf8");
assert.match(safeCloudSource, /if\(!object\(s\.conflict\.local\)&&object\(s\.pending\)\)/);
assert.match(safeCloudSource, /s\.conflict\.local=copy\(s\.pending\)/);
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.match(html, /Version 15\.96\.50/);
assert.match(sw, /away-golf-v15-96-50/);

console.log("15.96.44 immutable score-save snapshot regression passed");
