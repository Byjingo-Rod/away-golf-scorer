import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(process.argv[2]||'app.js','utf8');
const start=source.indexOf('  function solveGaBalancedGroups('),end=source.indexOf('  function groupGaTotal(',start);
assert(start>=0 && end>start);
const ctx={Set,Map,Math};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const solve=ctx.solveGaBalancedGroups;
const pair=(a,b)=>[String(a),String(b)].sort().join('|');
function check(ids,sizes,ga,forbidden=new Set(),placeholder='np'){
 const result=solve(ids,sizes,ga,forbidden,placeholder);assert(result,'draw exists');
 assert.deepEqual([...result.groups.flat().filter(id=>id!==placeholder)].sort(),[...ids].sort());
 assert.deepEqual(Array.from(result.groups,g=>g.filter(id=>id!==placeholder).length).sort(),[...sizes].sort());
 for(const g of result.groups)for(let i=0;i<g.length;i+=2)if(g[i+1] && !g.slice(i,i+2).includes(placeholder))assert(!forbidden.has(pair(g[i],g[i+1])));
 const totals=result.groups.map(g=>g.filter(id=>id!==placeholder).reduce((n,id)=>n+ga[id],0));
 assert(Math.abs(result.spread-(Math.max(...totals)-Math.min(...totals)))<1e-7);
 return result;
}
let ids=Array.from({length:8},(_,i)=>String(i)),ga=Object.fromEntries(ids.map((id,i)=>[id,[-4,1,5,8,25,25,25,25][i]]));
let r=check(ids,[4,4],ga);assert(r.exact);
let optimum=Infinity;for(let mask=0;mask<256;mask++){const selected=ids.filter((_,i)=>mask&(1<<i));if(selected.length!==4)continue;const sum=selected.reduce((n,id)=>n+ga[id],0),total=ids.reduce((n,id)=>n+ga[id],0);optimum=Math.min(optimum,Math.abs(total-2*sum));}
assert.equal(r.spread,optimum,'matches independent exhaustive optimum');
const forbidden=new Set(['0|1','0|2','0|3','4|5','4|6']);r=check(ids,[4,4],ga,forbidden);
for(const n of [1,3,6,7,10,12,15,16,20,60]){
 ids=Array.from({length:n},(_,i)=>String(i));ga=Object.fromEntries(ids.map((id,i)=>[id,Math.round(((i*7)%37-4)*10)/10]));
 const count=Math.ceil(n/4),base=Math.floor(n/count),sizes=Array.from({length:count},(_,i)=>base+(i<n%count?1:0));
 r=check(ids,sizes,ga);if(n<=16)assert(r.exact);
}
ids=['a','b','c','d'];ga={a:0,b:0,c:1.3,d:-1.3};r=check(ids,[4],ga);assert.equal(r.spread,0);
assert.equal(solve(ids,[4],{...ga,a:''}),null);assert.equal(solve(ids,[4],{...ga,a:NaN}),null);
const all=new Set();for(const a of ids)for(const b of ids)if(a!==b)all.add(pair(a,b));assert.equal(solve(ids,[4],ga,all),null);
assert(source.includes('id="gaBalanced"'));assert(source.includes('setup.saved || firstDayScoreEntry(day)'));
assert(source.includes('GA total: incomplete'));assert(source.includes("event.gaBalanceSearch=result.exact?'exact':'bestFound'"));
console.log('GA balance passed: independent optimum, signed GA, odd fields, 60 players, partner exclusions and missing-data rejection.');
// Exercise the real draw action with isolated planning state.
const actionStart=source.indexOf('  function applyGaBalancedDraw('),actionEnd=source.indexOf('\n  function ',actionStart+10);
const action={store:{event:{days:2,groupSetup:{day1:{groups:[['a','b'],['c','d']],saved:false},day2:{groups:[['a','c'],['b','d']],saved:true}}}},firstDayScoreEntry:()=>false,dayFieldIds:()=>['a','b','c','d'],NO_PARTNER_ID:'np',groupGaTotal:([id])=>({a:1,b:5,c:20,d:24}[id]),eventPlayerName:id=>id,competitionIsOn:()=>true,eventDays:()=>[1,2],makeGroups:()=>[['a','b'],['c','d']],ambroseIsOn:()=>false,startMethodFor:()=> 'single',defaultStarts:()=>[1,1],ensureShortTeamSelections:()=>{},writeLocalStore:()=>action.saved++,renderTeamsPage:()=>action.rendered++,alert:()=>action.alerts++,solveGaBalancedGroups:solve,saved:0,rendered:0,alerts:0};
vm.createContext(action);vm.runInContext(source.slice(actionStart,actionEnd),action);
const otherDay=JSON.stringify(action.store.event.groupSetup.day2);
action.applyGaBalancedDraw(1);assert.equal(action.saved,1);assert.equal(action.store.event.drawMode,'ga');assert.equal(JSON.stringify(action.store.event.groupSetup.day2),otherDay);
for(const guard of ['locked','saved','score','manual']){
 const event=action.store.event,setup=event.groupSetup.day1;event.locked=guard==='locked';setup.saved=guard==='saved';action.firstDayScoreEntry=()=>guard==='score';event.manualScorecards=guard==='manual'?{day1:{groups:{one:{}}}}:{};
 action.applyGaBalancedDraw(1);assert.equal(action.saved,1,guard+' must block draw');
}
action.store.event.locked=false;action.store.event.groupSetup.day1.saved=false;action.store.event.manualScorecards={};action.firstDayScoreEntry=()=>false;action.groupGaTotal=()=>null;
action.applyGaBalancedDraw(1);assert.equal(action.saved,1);assert.equal(action.alerts,1);
console.log('GA draw action passed: other days unchanged; locked, saved, scored, manual cards and missing GA protected.');
const totalsCtx={NO_PARTNER_ID:'np',sharedActualId:(id,day)=>id==='slot'?(day===1?'first':'second'):id,eventPlayer:(id)=>id==='sub'?{profileId:'replacement',ga:-4}:{name:id},eventGaHandicap:id=>({first:5,second:25,zero:0,sub:30}[id]??'')};
vm.createContext(totalsCtx);const totalsStart=source.indexOf('  function groupGaTotal('),totalsEnd=source.indexOf('  function applyGaBalancedDraw(',totalsStart);vm.runInContext(source.slice(totalsStart,totalsEnd),totalsCtx);
assert.equal(totalsCtx.groupGaTotal(['slot','zero','np'],1),5);assert.equal(totalsCtx.groupGaTotal(['slot','zero','np'],2),25);assert.equal(totalsCtx.groupGaTotal(['sub'],1),-4);assert.equal(totalsCtx.groupGaTotal(['unknown'],1),null);assert.equal(totalsCtx.groupGaLabel(['slot'],2),'GA total: 25.0');
console.log('GA totals passed: shared-position occupant by day, zero, plus-handicap substitution, missing GA and virtual-player exclusion.');
