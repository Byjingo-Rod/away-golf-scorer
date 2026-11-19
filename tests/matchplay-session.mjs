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
// Either device can record a hole concession. Only the other device can confirm its record.
for(const recordedBy of ['a','b'])for(const by of ['a','b']){
 s=setup();for(const id of [a,b])S.acknowledge(M,s,id,'r0m0',save);
 const actor=recordedBy==='a'?a:b,other=recordedBy==='a'?b:a;
 S.requestConcession(M,s,actor,'r0m0',1,by,save);
 assert.equal(M.matchState(s,'r0m0').played,0);
 assert.equal(M.matchState(s,'r0m0').lead,0);
 assert.equal(s.matches.r0m0.holes[1].pendingConcession.by,by);
 assert.throws(()=>S.confirmConcession(M,s,actor,'r0m0',1,save),/other player/);
 assert.throws(()=>S.nextHole(M,s,'r0m0',1,null,null),/confirm the concession/);
 assert.throws(()=>S.enter(M,s,actor,'r0m0',1,4,4,save),/Confirm the concession/);
 assert.throws(()=>S.requestConcession(M,s,other,'r0m0',1,by,save),/already waiting/);
 const saved=JSON.parse(JSON.stringify(s));
 assert.throws(()=>S.confirmConcession(M,s,other,'r0m0',1,()=>false),/Not saved/);
 assert.deepEqual(s,saved);
 S.confirmConcession(M,s,other,'r0m0',1,save);
 assert.equal(M.matchState(s,'r0m0').played,1);
 assert.equal(M.matchState(s,'r0m0').lead,by==='a'?-1:1);
 assert.equal(S.nextHole(M,s,'r0m0',1,null,null),2);
 assert.equal(s.matches.r0m0.holes[1].concessionRecord.confirmedBy,recordedBy==='a'?'b':'a');
 assert.throws(()=>S.confirmConcession(M,s,other,'r0m0',1,save),/no concession/);
}
assert.ok(S.STANDING_RULES.some(rule=>rule.includes('3 strokes')&&rule.includes('enter 4')));
assert.ok(S.STANDING_RULES.every(rule=>!/,\s*(and|but|or|nor)\b|\b(and|but|or|nor)\s*,/i.test(rule)));
console.log('Two-player concession recording and standing rule checks passed');
assert.ok(S.standingRules(M,{gender:'female'})[2].includes('on her screen'));
assert.ok(S.standingRules(M,{gender:'male'})[2].includes('on his screen'));
assert.ok(S.standingRules(M,{gender:'female'},false)[0].includes('Handicap strokes do not apply'));
assert.ok(S.standingRules(M,{gender:'male'})[0].includes('rules of Match Play'));
assert.equal(S.progressLabel({text:'Parker Price 6 up',played:10}),'Parker Price 6 up after 10');
assert.equal(S.progressLabel({text:'All square',played:0}),'All square · 0 holes played');
assert.equal(S.progressLabel({text:'All square',played:4}),'All square after 4');
assert.equal(S.progressLabel({text:'6&4',played:14,winnerId:'winner'}),'6&4');
console.log('Gender wording and match progress labels passed');
// Course details follow the selected round and mapped course hole.
s=setup();s.config.format='scratch';s.config.roundSettings=[{par:Array(18).fill(4),metres:[323,...Array(16).fill(300),390]},{par:Array(18).fill(5),metres:Array(18).fill(450)}];
assert.equal(S.holeInfo(M,s,'r0m0',1).metres,323);
assert.equal(S.holeInfo(M,s,'r1m0',1).metres,450);
s.config.scheduled=36;assert.equal(S.holeInfo(M,s,'r0m0',19).metres,323);
s.config.playoff=[18,1];assert.equal(S.holeInfo(M,s,'r0m0',37).metres,390);
s.config.roundSettings[0].metres=[];assert.equal(S.holeInfo(M,s,'r0m0',1).metres,null);
assert.ok(S.standingRules(M,{gender:'male'})[0].includes('Enter total strokes for each hole.'));
console.log('Round course distances and missing-distance handling passed');
// Graph switches at each completed nine and preserves the last block of a decided match.
const graphState=n=>({played:n,rows:Array.from({length:n},(_,i)=>({hole:i+1,lead:i%3-1,text:'Test'}))});
assert.equal(S.graphWindow(graphState(0),18).start,1);
assert.equal(S.graphWindow(graphState(8),18).end,9);
let graph=S.graphWindow(graphState(9),18);assert.equal(graph.start,10);assert.equal(graph.turn.hole,9);assert.equal(graph.rows.length,0);
graph=S.graphWindow(graphState(18),18);assert.equal(graph.start,19);assert.equal(graph.playoff,true);assert.equal(graph.turn.hole,18);
assert.equal(S.graphWindow(graphState(18),36).playoff,false);
assert.equal(S.graphWindow(graphState(27),36).start,28);
assert.equal(S.graphWindow(graphState(36),36).playoff,true);
assert.equal(S.graphWindow({...graphState(9),winnerId:'a'},18).start,1);
assert.equal(S.graphWindow({...graphState(18),winnerId:'a'},18).start,10);
assert.equal(S.graphWindow({...graphState(19),winnerId:'a'},18).start,19);
console.log('Nine-hole graph windows and playoff transitions passed');
assert.equal(S.holeScoreLabel({b:5,strokesB:1,netB:4},'b'),'5/4');
assert.equal(S.holeScoreLabel({a:5,strokesA:2,netA:3},'a'),'5/3');
assert.equal(S.holeScoreLabel({a:4,strokesA:0,netA:4},'a'),'4');
assert.equal(S.holeScoreLabel({},'a'),'—');
console.log('Compact strokes taken/net score labels passed');
