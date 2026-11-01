import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const worker = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

const metaVersion = html.match(/name="app-version" content="([^"]+)"/)?.[1];
assert.ok(metaVersion, "index.html must declare an app-version meta value");

const displayedVersion = html.match(/Away Golf • Version ([0-9.]+)/)?.[1];
assert.equal(displayedVersion, metaVersion, "displayed and metadata versions must agree");

const cacheVersion = worker.match(/const CACHE = "away-golf-v([0-9-]+)"/)?.[1]?.replaceAll("-", ".");
assert.equal(cacheVersion, metaVersion, "service-worker cache and App versions must agree");

const htmlAssetVersions = [...html.matchAll(/[?&]v=([0-9.]+)/g)].map((match) => match[1]);
assert.ok(htmlAssetVersions.length, "index.html must version its core assets");
assert.deepEqual([...new Set(htmlAssetVersions)], [metaVersion], "all HTML assets must use the current version");

const workerAssetVersions = [...worker.matchAll(/[?&]v=([0-9.]+)/g)].map((match) => match[1]);
assert.ok(workerAssetVersions.length, "the service worker must cache versioned assets");
assert.deepEqual([...new Set(workerAssetVersions)], [metaVersion], "all cached assets must use the current version");

console.log(`Release version consistency passed for ${metaVersion}.`);
