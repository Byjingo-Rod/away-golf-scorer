import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const code=app.slice(app.indexOf('  function drawMixingStats('),app.indexOf('  function mixingSummaryHtml('));
const ctx={NO_PARTNER_ID:'NP',pairKey:(a,b)=>[String(a),String(b)].sort().join('|'),shuffleCopy:a=>[...a].sort(()=>Math.random()-.5),makeGroups:(ids)=>{let gs=[];for(let i=0;i<ids.length;i+=4)gs.push(ids.slice(i,i+4));return gs;}};
ctx.store={event:{}};ctx.ambroseIsOn=()=>false;
vm.createContext(ctx);vm.runInContext(app.slice(app.indexOf("  function makeGroups("),app.indexOf("  function defaultStarts("))+code,ctx);
const roster=Array.from({length:16},(_,i)=>'p'+i);
for(let trial=0;trial<40;trial++){
 const fields=Object.fromEntries([1,2,3,4,5].map(day=>[day,roster]));const before=JSON.stringify(fields),draw=ctx.maximumMixingDraw(fields);
 assert.equal(JSON.stringify(fields),before);
 for(const teams of Object.values(draw)){assert.equal(teams.length,4);assert.deepEqual([...teams.flat()].sort(),[...roster].sort());assert.ok(teams.every(g=>g.length===4));}
 const stats=ctx.drawMixingStats(draw);assert.equal(stats.partnerRepeats.length,0);assert.equal(stats.groupRepeats.length,0);assert.ok(Object.values(stats.distinctMates).every(n=>n===15));
}
for(const [count,days] of [[8,2],[12,3],[16,7],[20,4],[8,3]]){
 const fields=Object.fromEntries(Array.from({length:days},(_,i)=>[i+1,Array.from({length:count},(_,j)=>'p'+j)]));
 const draw=ctx.maximumMixingDraw(fields);
 for(const [day,teams] of Object.entries(draw))assert.deepEqual([...teams.flat()].sort(),[...fields[day]].sort());
}
const changing={1:roster,2:roster.slice(0,12),3:roster.slice(4)};const changedDraw=ctx.maximumMixingDraw(changing);
for(const [day,teams] of Object.entries(changedDraw))assert.deepEqual([...teams.flat()].sort(),[...changing[day]].sort());
const repeated=ctx.drawMixingStats({1:[['a','b','c','NP']],2:[['a','b','c','NP']]});assert.equal(repeated.groupRepeats.length,3);assert.equal(repeated.partnerRepeats.length,1);assert.equal(repeated.distinctMates.a,2);
// The actual action must not mutate an event when locked, scoring or cancelled.
const action=app.slice(app.indexOf('  function applyMaximumPlayerMixing('),app.indexOf('  function playerHistoryAgainstGroup('));
for(const [locked,scoring,approve] of [[true,false,true],[false,true,true],[false,false,false]]){
 const event={locked,days:5,groupSetup:{day1:{groups:[roster.slice(0,4)],saved:true}}},before=JSON.stringify(event);
 const c={store:{event},eventDays:()=>[1,2,3,4,5],firstDayScoreEntry:()=>scoring,alert:()=>{},confirm:()=>approve,dayFieldIds:()=>roster};vm.createContext(c);vm.runInContext(action,c);c.applyMaximumPlayerMixing();assert.equal(JSON.stringify(event),before);
}
console.log('40 perfect five-day draws, alternate sizes/durations, changing attendance, repeat statistics and locked/scoring/cancel protection passed.');
