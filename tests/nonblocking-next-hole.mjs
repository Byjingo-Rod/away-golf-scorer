import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync(process.argv[2] || 'app.js', 'utf8');
function nextHandler(functionName) {
  const start = source.indexOf('  function ' + functionName + '(');
  const next = source.indexOf('    $("#nextHole").onclick = ', start);
  const end = source.indexOf('\n    };', next) + 7;
  return source.slice(next, end);
}
for (const pos of [0, 17]) {
  const calls = [], button = {};
  const rec = {ntp: {confirmedAt: 'test'}}, round = {};
  const context = { $: () => button, store: {event: {playerHolePos: pos}},
    day: 5, selected: 'Dom', pos, ntp: true, rec, round,
    writeLocalStore: () => calls.push('local'), queueCloudRound: () => calls.push('queue'),
    flushCloudRound: () => {calls.push('network'); return new Promise(() => {});},
    save: () => calls.push('save'), renderHoleScoring: () => calls.push('next'),
    renderRoundVerification: () => calls.push('verify')};
  vm.createContext(context); vm.runInContext(nextHandler('renderHoleScoring'), context);
  button.onclick();
  assert.equal(calls.includes('network'), false);
  assert.equal(calls[0], 'local'); assert.equal(calls[1], 'queue');
  assert.equal(calls.at(-1), pos === 17 ? 'verify' : 'next');
  assert.equal(rec.ntp.locked, true);
  if (pos === 0) {assert.equal(context.store.event.playerHolePos, 1); assert.equal(round._meta.furthestPos, 1);}
  else assert.equal(context.store.event.playerRoundMode, 'verify');
}
// Ambrose still validates score/drive selection, then progresses without a save response.
for (const invalid of [false, true]) {
  const calls = [], button = {}, context = {$: () => button,
    warnIncompleteEntry: () => invalid, editable: true, day: 5, entryScorerId: 'Dom',
    position: 0, selected: 'Dom', store: {event: {playerHolePos: 0}},
    writeLocalStore: () => calls.push('local'), queueCloudRound: () => calls.push('queue'),
    flushCloudRound: () => {calls.push('network'); return new Promise(() => {});},
    save: () => calls.push('save'), renderAmbroseScoring: () => calls.push('next')};
  vm.createContext(context); vm.runInContext(nextHandler('renderAmbroseScoring'), context);
  await button.onclick(); assert.equal(calls.includes('network'), false);
  assert.equal(context.store.event.playerHolePos, invalid ? 0 : 1);
  assert.equal(calls.includes('queue'), !invalid);
}
console.log('Passed: Next and Finish proceed without network responses, local scores/NTP saved first, cloud queued, Ambrose validation retained.');
