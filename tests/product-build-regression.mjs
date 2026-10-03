import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
execFileSync('python3', ['tools/build-products.py'], {cwd: root});
const read = path => readFileSync(new URL(path, root), 'utf8');
for (const file of ['index.html', 'app.js', 'cloud.js', 'data.js', 'sw.js', 'manifest.webmanifest']) {
  assert.equal(read(`dist/away-golf-scorer/${file}`), read(file));
}
const ges = 'dist/golf-event-scorer/';
assert.equal(JSON.parse(read(ges + 'manifest.webmanifest')).name, 'Golf Event Scorer');
assert.ok(!read(ges + 'app.js').includes('awayGolf'));
assert.ok(read(ges + 'app.js').includes('golfEventScorer13'));
const context = {window: {}, fetch: () => {throw new Error('Unexpected network access');}};
vm.runInNewContext(read(ges + 'data.js'), context);
assert.equal(context.window.AWAY_SEED.players.length, 0);
assert.ok(context.window.AWAY_SEED.courses.length > 0);
vm.runInNewContext(read(ges + 'cloud.js'), context);
for (const method of ['ensureSignedIn', 'createEvent', 'saveWorkspace', 'joinEvent']) {
  await assert.rejects(context.window.AwayCloud[method](), /not enabled/);
}
let activate;
const deleted = [];
const currentCache = read(ges + 'sw.js').match(/const CACHE = "([^"]+)"/)[1];
const keys = ['away-golf-v15-93-2', 'unrelated-cache', 'golf-event-scorer-old', currentCache];
vm.runInNewContext(read(ges + 'sw.js'), {
  self: {addEventListener: (event, fn) => {if (event === 'activate') activate = fn;}, clients: {claim: async () => {}}},
  caches: {keys: async () => keys, delete: async key => {deleted.push(key);}}
});
await new Promise((resolve, reject) => activate({waitUntil: task => task.then(resolve, reject)}));
assert.deepEqual(deleted, ['golf-event-scorer-old']);
console.log('Product build checks passed: original source preserved, separate storage/cache, empty roster, cloud blocked.');
