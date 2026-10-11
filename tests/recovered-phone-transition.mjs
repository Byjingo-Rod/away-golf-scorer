import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const src = fs.readFileSync(process.argv[2] || 'app.js', 'utf8');
function extract(name) {
  const start = src.indexOf('  function ' + name + '(');
  assert(start >= 0, name);
  const open = src.indexOf('{', src.indexOf(') {', start) + 2);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    if (src[i] === '}' && !--depth) return src.slice(start, i + 1);
  }
  throw Error(name);
}
let accepted = true, complete = true, finalised = true, route, saves = 0;
const nodes = new Map();
const host = {innerHTML: ''};
const ctx = {document: {getElementById: () => host}, store: {event: {}, cloud: {role: 'player', playerId: 'Dom'}},
  $: id => id === '#playerExperience' ? host : nodes.get(id) || (nodes.set(id, {}), nodes.get(id)),
  explicitlyRecoveredPlayer: () => accepted, roundFinalisedFor: () => finalised,
  officialCardProgress: () => ({complete}), releaseRoundWakeLock() {},
  writeLocalStore() {saves++}, persistStore() {}, save() {}, initialiseGroups() {},
  manualDayFinalised: () => false, dayFieldIds: () => ['Dom', 'David'],
  eventDays: () => [1,2,3,4,5], eventDayComplete: day => day < 5,
  scheduleScoringOpening() {}, scoringIsOpen: () => true, isPlayerDevice: () => true,
  ambroseIsOn: () => false, renderHoleScoring: () => {route = 'scoring'},
  renderRoundVerification: () => {route = 'verify'},
  renderCompletedScorecard: () => {route = 'completed'}, NO_PARTNER_ID: 'none'};
vm.createContext(ctx);
if (src.includes('  function gesRenderPlayerExperience() {')) vm.runInContext(extract('gesRenderPlayerExperience'), ctx);
for (const name of ['recoveredRoundAccepted', 'syncRecoveredPlayerRound', 'renderPlayerExperience']) vm.runInContext(extract(name), ctx);
function reset(mode = 'scoring', playerId = 'Dom') {
  ctx.store.cloud.playerId = playerId;
  ctx.store.event = {days: 5, playerPreviewDay: 4, playerPreviewId: playerId,
    playerRoundMode: mode, playerHolePos: 10, playerVerificationStage: 'marked',
    returnToMarkedVerification: true, scoring: {day4: {Dom: {'10': {self: {gross: 5}}}}}};
}
// Both a failed phone and its marker leave their saved scoring/checking route.
for (const [id, mode] of [['Dom', 'scoring'], ['David', 'verify']]) {
  reset(mode, id); const scores = JSON.stringify(ctx.store.event.scoring);
  ctx.renderPlayerExperience(); assert.equal(route, 'completed');
  assert.equal(ctx.store.event.playerVerificationStage, 'mine');
  assert.equal(ctx.store.event.returnToMarkedVerification, false);
  assert.equal(JSON.stringify(ctx.store.event.scoring), scores);
}
// An unfinished ordinary round resumes at the same hole; incomplete/unaccepted
// recovery never bypasses checking. Preview remains available after completion.
accepted = false; reset(); ctx.renderPlayerExperience(); assert.equal(route, 'scoring');
assert.equal(ctx.store.event.playerHolePos, 10);
reset('verify'); ctx.renderPlayerExperience(); assert.equal(route, 'verify');
accepted = true; complete = false; reset(); ctx.renderPlayerExperience(); assert.equal(route, 'scoring');
complete = true; finalised = false; reset('verify'); ctx.renderPlayerExperience(); assert.equal(route, 'verify');
finalised = true; reset('preview'); assert.equal(ctx.syncRecoveredPlayerRound(4, 'Dom'), false);
// Exercise the actual read-only card's next-day button, without writing scores.
Object.assign(ctx, {player: () => ({name: 'Dom'}), course: () => ({name: 'Laguna'}),
  eventCourseScorecard: () => ({par: Array(18).fill(4), index: Array.from({length: 18}, (_,i) => i+1)}),
  playerDailyHandicap: () => 12, playerGroupContext: () => ({groupIndex: 0, setup: {starts: [1]}}),
  scoreSequence: () => Array.from({length: 18}, (_,i) => i+1), playerHoleEntry: () => ({gross: 5}),
  stablefordStrokeCount: () => 1, stablefordPoints: () => 2, scoreEntered: v => v != null && v !== '',
  formatPlayingHandicap: String, playerFirstName: () => 'Dom', esc: String});
vm.runInContext(extract('renderCompletedScorecard'), ctx);
reset('completed'); ctx.renderCompletedScorecard('Dom', 4);
assert(host.innerHTML.includes('VIEW DAY 5'));
assert(host.innerHTML.includes('organiser accepted this round'));
const before = JSON.stringify(ctx.store.event.scoring);
ctx.renderPlayerExperience = () => {route = 'preview'};
ctx.$('#nextFromCompletedCard').onclick();
assert.equal(ctx.store.event.playerPreviewDay, 5);
assert.equal(ctx.store.event.playerRoundMode, 'preview');
assert.equal(ctx.store.event.playerHolePos, 0);
assert.equal(JSON.stringify(ctx.store.event.scoring), before);
assert(saves > 0);
console.log('Passed: accepted recovery releases scoring and verification; next-day navigation preserves scores; unfinished reconnect, incomplete/unaccepted recovery and preview retain normal behaviour.');
