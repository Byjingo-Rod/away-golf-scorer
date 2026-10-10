import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[2]||'app.js','utf8');
function extract(name){const start=source.indexOf('  function '+name+'(');assert(start>=0,name);const open=source.indexOf('{',source.indexOf(') {',start)+2);let depth=0;for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error(name);}
const ctx={store:{event:{}},NO_PARTNER_ID:'system-no-partner',player:id=>({name:id}),dayFieldIds:day=>ctx.store.event.fields[day],eventDayComplete:day=>ctx.store.event.finished.includes(day),scratchHandicapLimit:()=>10,playerDailyHandicap:(id,day)=>ctx.store.event.handicaps?.[id]?.[day]??5,eventCourseScorecard:day=>({par:Array(18).fill(day===5?5:4)}),scratchGrossScores:(day,id)=>ctx.store.event.gross[id][day]||Array(18).fill(null),scratchPickupHole:(day,id)=>ctx.store.event.pickups?.[id]?.[day]||null,yellowBallIsOn:()=>false,leaderSum:a=>a.reduce((n,v)=>n+(v==null?0:+v),0),manualPlayerSummary:()=>null,manualTeamSummary:()=>null,manualDayFinalised:()=>false,leaderboardPlayerPoints:()=>Array(18).fill(2),leaderboardUnits:()=>ctx.store.event.units||[]};vm.createContext(ctx);
for(const name of ['eventDays','par3Mode','competitionDays','competitionIsOn','countingRounds','leaderRow','manualLeaderRow','leaderCountback','rankLeaderRows','leaderboardDefinitions','calculateLeaderboard','leaderboardComplete'])vm.runInContext(extract(name),ctx);
function fixture(){ctx.store.event={days:5,scratchFormat:'bestAggregate',competitions:['scratch'],fields:{},finished:[1,2,3,4,5],gross:{a:{}},pickups:{}};for(let d=1;d<=5;d++){ctx.store.event.fields[d]=['a'];ctx.store.event.gross.a[d]=Array(18).fill(d===5?5:4);}ctx.store.event.gross.a[1][0]=10;}
function result(){const def=ctx.leaderboardDefinitions()[0];return [ctx.calculateLeaderboard(def)[0],def];}
fixture();let [row,def]=result();assert.equal(def.label,'Scratch — Best 4 of 5 rounds');assert.equal(row.total,0);assert.equal(row.grossTotal,306);assert.equal(row.thru,72);assert(row.detail.includes('Counting days 2, 3, 4, 5'));assert(ctx.leaderboardComplete(def,[row]));
// A missed day may be the dropped round; two missed days cannot meet best four.
fixture();ctx.store.event.fields[3]=[];[row,def]=result();assert(!row.disqualified);assert.equal(row.thru,72);ctx.store.event.fields[4]=[];[row]=result();assert(row.disqualified);assert.match(row.disqualificationReason,/4 required/);
// Stroke-mode pickups invalidate that round only; two invalidate the aggregate.
fixture();ctx.store.event.pickups={a:{1:7}};[row]=result();assert(!row.disqualified);ctx.store.event.pickups.a[2]=5;[row]=result();assert(row.disqualified);
// All-round legacy format still requires every day and retains existing totals.
fixture();ctx.store.event.scratchFormat='aggregate';[row]=result();assert.equal(row.thru,90);assert.equal(row.grossTotal,384);assert.equal(row.total,6);ctx.store.event.fields[3]=[];assert(result()[0].disqualified);
// Future empty cards are not counting rounds; an absent player remains eligible.
fixture();ctx.store.event.finished=[1,2,3];ctx.store.event.fields[3]=[];ctx.store.event.gross.a[4]=ctx.store.event.gross.a[5]=Array(18).fill(null);[row,def]=result();assert(!row.disqualified);assert.equal(row.thru,36);assert(row.detail.includes('Counting days 1, 2'));assert(!ctx.leaderboardComplete(def,[row]));
// A fifth round in progress cannot displace a completed counting round.
fixture();ctx.store.event.finished=[1,2,3,4];ctx.store.event.gross.a[5]=[5,...Array(17).fill(null)];[row]=result();assert.equal(row.thru,72);assert(row.detail.includes('Counting days 1, 2, 3, 4'));
// Handicap qualification applies per round.
fixture();ctx.store.event.handicaps={a:{1:11}};assert(!result()[0].disqualified);ctx.store.event.handicaps.a[2]=11;assert(result()[0].disqualified);
// Day counts cover one to seven days; daily remains available without an aggregate.
fixture();ctx.store.event.days=2;def=ctx.leaderboardDefinitions()[0];assert.equal(def.label,'Scratch — Best 1 of 2 rounds');ctx.store.event.scratchFormat='daily';assert(ctx.leaderboardDefinitions().every(d=>d.type==='scratch'));
// Best 3 of 4 equal totals now resolve by countback, with a CB badge.
fixture();ctx.store.event.competitions=['best3of4'];ctx.store.event.units=[{id:'g1',name:'Group 1',ids:['a','b','c','d']},{id:'g2',name:'Group 2',ids:['e','f','g','h']}];ctx.leaderboardPlayerPoints=(day,id)=>Array.from({length:18},(_,i)=>id<'e'?(i<9?1:3):(i<9?3:1));const best=ctx.leaderboardDefinitions()[0];assert.equal(best.countback,true);const rows=ctx.calculateLeaderboard(best);assert.equal(rows[0].id,'g1');assert.equal(rows[0].cb,true);assert.equal(rows[0].tied,false);
console.log('Passed: Scratch best rounds, distinct course pars, absence/pickup/handicap eligibility, partial progress, legacy all/daily, counting days, and Best 3 countback.');
