import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const block=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)));
const code=block('  const competitionNames =','  function capRoster(')+block('  function competitionDays(','  function countingRounds(');
const ctx={};vm.createContext(ctx);vm.runInContext(code,ctx);
const event={days:5,singleStablefordFormat:'both',par3Mode:'overallPairs',scratchFormat:'daily',competitions:['combined','fourball','teamPutts','best3of4','yellowBall','par3','ntp','capTeams','scratch'],competitionDays:{teamPutts:[1,3,5],yellowBall:[1]}};
assert.equal(event.competitions.length,9);
assert.deepEqual([1,2,3,4,5].map(d=>ctx.dailyCompetitionSummary(d,event).length),[10,8,9,8,9]);
const first=ctx.dailyCompetitionSummary(1,event);
assert.equal(first.filter(x=>x.aggregate).length,3);
assert.equal(first.filter(x=>x.id.startsWith('stableford')).length,2);
assert.equal(ctx.dailyCompetitionChecks(event)[0].label,'Day 1 Competitions: 10 (including 3 aggregate rounds)');
for(const format of ['daily','aggregate']){
 const result=ctx.dailyCompetitionSummary(1,{...event,singleStablefordFormat:format});
 assert.equal(result.length,9);assert.equal(result.filter(x=>x.id.startsWith('stableford')).length,1);
}
assert.equal(ctx.dailyCompetitionSummary(1,{...event,competitions:[...event.competitions,'single','combined']}).length,10);
assert.equal(ctx.dailyCompetitionSummary(1,{days:1,competitions:['combined','ntp']}).length,2);
assert.equal(ctx.dailyCompetitionSummary(2,{...event,competitionDays:{ntp:[1],teamPutts:[1],yellowBall:[1]}}).length,7);
assert.equal(ctx.dailyCompetitionSummary(3,{days:3,competitions:['fourball'],competitionDays:{fourball:[1,2]}}).length,0);
assert.ok(!app.includes('Competitions Selected:'));
console.log('Day-specific counts, separate daily/aggregate Stableford, aggregate labels, scheduled omissions and both final-check screens verified.');
