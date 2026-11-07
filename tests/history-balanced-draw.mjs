import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(process.argv[2] || new URL('../app.js', import.meta.url), 'utf8');
const players = 'ABCDEFGH'.split('');
const key = (a, b) => [a, b].sort().join('|');
const store = {event: {groupSetup: {}}, partnerHistory: {}, pairHistory: {}, players: []};
const context = vm.createContext({store, NO_PARTNER_ID: 'virtual', ambroseIsOn: () => false,
  eventDays: () => [1, 2, 3, 4, 5]});
for (const [first, last] of [
  ['pairKey', 'solveGaBalancedGroups'],
  ['historyBalancedGroups', 'maximumMixingDraw'],
  ['shuffleCopy', 'defaultStarts'],
]) {
  vm.runInContext(source.slice(source.indexOf('  function ' + first + '('),
    source.indexOf('  function ' + last + '(')), context);
}

const repeatedPartners = new Set();
for (let day = 1; day <= 5; day++) {
  const groups = context.historyBalancedGroups(players, day);
  assert.equal(groups.length, 2);
  assert(groups.every(group => group.length === 4));
  assert.equal(Array.from(groups.flat()).sort().join(''), players.join(''));
  for (const [a, b] of groups.flatMap(group => [group.slice(0, 2), group.slice(2, 4)])) {
    assert(!repeatedPartners.has(key(a, b)), '4BBB partner repeated on day ' + day);
    repeatedPartners.add(key(a, b));
  }
  store.event.groupSetup['day' + day] = {groups};
  const previous = store.event.groupSetup['day' + (day - 1)]?.groups;
  if (!previous) continue;
  const stats = context.drawMixingStats({1: previous, 2: groups});
  assert.equal(stats.groupRepeatEncounters, 4, 'minimum adjacent-day foursome overlap');
}
assert.equal(repeatedPartners.size, 20);

// A prior event counts even where the trip has no earlier playing day.
store.partnerHistory = {'A|B': 1, 'C|D': 1};
const next = context.historyBalancedGroups(players.slice(0, 4), 1)[0];
assert(!['A|B', 'C|D'].includes(key(next[0], next[1])));
console.log('Passed: five eight-player days, zero repeated 4BBB partners, minimum adjacent-day foursome overlap, and prior-event partner avoidance.');
