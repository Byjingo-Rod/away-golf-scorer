import assert from 'node:assert/strict';
import * as M from '../matchplay-model.mjs';
import S from '../matchplay-session.js';
function setup(){const s=M.sampleDivision(18);s.config.format='handicapped';s.config.finalMode='players';s.players.forEach((p,i)=>p.playingHcp=i===0?-2:2);M.freezeQualifyingHandicaps(s);s.published=true;return s;}
let s=setup();const [a,b]=M.opponents(s,'r0m0');const save=()=>true;
assert.throws(()=>S.enter(M,s,a,'r0m0',1,4,5,save),/Got it/);
assert.equal(S.welcome(M,s,a,'r0m0').opponentAllowance,4);
S.acknowledge(M,s,a,'r0m0',save);S.acknowledge(M,s,b,'r0m0',save);
S.enter(M,s,a,'r0m0',1,4,5,save);assert.equal(M.matchState(s,'r0m0').played,0,'One player cannot invent the opponent marker entry');
S.enter(M,s,b,'r0m0',1,5,4,save);assert.equal(M.matchState(s,'r0m0').played,1);
const before=structuredClone(s);assert.throws(()=>S.enter(M,s,a,'r0m0',2,4,4,()=>false),/Not saved/);assert.deepEqual(s,before,'Failed storage rolls back the score and handicap snapshot');
s.players[15].playingHcp=30;assert.equal(M.matchHandicaps(s,'r0m0').allowances[1],4,'Qualifying snapshot stays fixed');
assert.equal(S.holeInfo(M,s,'r0m0',1).dual,false);assert.equal(S.holeInfo(M,s,'r0m0',19).dual,true);
// Complete by concession, then require both players to confirm before advancement.
M.concede(s,'r0m0','b',true);assert.equal(S.confirm(M,s,a,'r0m0',save),false);assert.equal(s.matches.r0m0.result,null);assert.equal(S.confirm(M,s,b,'r0m0',save),true);
assert.equal(M.playerJourney(s,b).status,'eliminated');assert.equal(M.playerJourney(s,b).canScore,false);assert.equal(M.playerJourney(s,a).lastWin.nextRound,'Quarterfinals');assert.throws(()=>S.enter(M,s,b,'r0m0',2,4,4,save));
// Finished but unconfirmed matches still allow corrections to earlier holes.
s=setup();for(const id of [a,b])S.acknowledge(M,s,id,'r0m0',save);for(let h=1;h<=10;h++){S.enter(M,s,a,'r0m0',h,3,7,save);S.enter(M,s,b,'r0m0',h,7,3,save);}assert.equal(M.playerJourney(s,a).status,'confirmation');S.enter(M,s,a,'r0m0',1,4,7,save);assert.equal(s.matches.r0m0.holes[1].selfA,4);
// Later rounds use their own course/index/par snapshot before any stroke is allocated.
s=setup();s.config.indexSource='club';s.config.roundSettings=[{courseName:'First',teeLabel:'Back Tee',clubIndex:M.UNIVERSAL_INDEX,par:Array(18).fill(4)},{courseName:'Second',teeLabel:'Front Tee',clubIndex:[...M.UNIVERSAL_INDEX].reverse(),par:Array(18).fill(5)}];S.prepareRound(M,s,'r1m0');assert.equal(s.config.course,'Second');assert.equal(s.config.tee,'Front Tee');assert.deepEqual(s.config.clubIndex,[...M.UNIVERSAL_INDEX].reverse());
console.log('Match Play session checks passed');
// A conceded hole is complete without inventing scores, from either player's view.
s=setup();for(const id of [a,b])S.acknowledge(M,s,id,'r0m0',save);
assert.throws(()=>S.nextHole(M,s,'r0m0',1,null,null),/Enter both/);
M.concede(s,'r0m0','b',false,1);
assert.equal(S.nextHole(M,s,'r0m0',1,null,null),2);
assert.equal(M.matchState(s,'r0m0').played,1);
assert.equal(s.matches.r0m0.holes[1].selfA,undefined);
assert.equal(s.matches.r0m0.holes[1].selfB,undefined);
assert.equal(s.matches.r0m0.holes[1].concededTo,'a');
assert.throws(()=>M.concede(s,'r0m0','b',false,1),/current unfinished hole/);
const reopened=JSON.parse(JSON.stringify(s));
assert.equal(S.nextHole(M,reopened,'r0m0',1,null,null),2);
assert.throws(()=>S.nextHole(M,reopened,'r0m0',2,null,null),/Enter both/);
console.log('Concession navigation and score-free recovery checks passed');
