import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

const listeners = {};
let skipWaitingCalls = 0;
const context = {
  self: {
    location: { origin: "https://example.test" },
    clients: { claim: async () => {} },
    addEventListener(type, handler) { listeners[type] = handler; },
    skipWaiting() { skipWaitingCalls += 1; },
  },
  caches: {
    open: async () => ({ addAll: async () => {}, put: async () => {} }),
    keys: async () => [],
    delete: async () => true,
    match: async () => null,
  },
  fetch: async () => ({ ok: false }),
  URL,
  Response,
  Promise,
};
vm.runInNewContext(sw, context);

let installPromise;
listeners.install({ waitUntil(promise) { installPromise = promise; } });
await installPromise;
assert.equal(skipWaitingCalls, 0, "installing an update must not activate it immediately");

listeners.message({ data: { type: "NOT_AN_UPDATE" } });
assert.equal(skipWaitingCalls, 0, "unrelated service-worker messages are ignored");
listeners.message({ data: { type: "ACTIVATE_UPDATE" } });
assert.equal(skipWaitingCalls, 1, "the App can explicitly activate a waiting update");

assert.match(app, /function activeScorecardSession\(\)[\s\S]*scorecardOpenedThisPage[\s\S]*"scoring"[\s\S]*"verify"[\s\S]*"fullCardEntry"[\s\S]*"finalEntry"/, "all editable scorecard modes are protected");
assert.match(app, /if \(activeScorecardSession\(\)\) \{[\s\S]*controllerChangedDuringScorecard = true;[\s\S]*return;[\s\S]*\}[\s\S]*location\.reload\(\);/, "controller changes cannot reload an open scorecard");
assert.match(app, /worker\.postMessage\(\{ type: "ACTIVATE_UPDATE" \}\)/, "waiting updates are activated deliberately");
assert.match(app, /beginScorecardUpdateProtection\(\);[\s\S]*requestRoundWakeLock\(\);/, "opening a scorecard starts update protection");
assert.ok((app.match(/endScorecardUpdateProtection\(\);/g) || []).length >= 6, "scorecard exits and event closure release update protection");
assert.match(app, /watchForAppUpdate\(registration\);[\s\S]*registration\.update\(\)/, "service-worker registration watches for a waiting update");
assert.match(html, /id="updateHeader"[^>]*hidden>Update ready</, "organisers have a quiet pending-update indicator");

console.log("service-worker update deferral regression checks passed");
