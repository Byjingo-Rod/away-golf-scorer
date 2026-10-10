import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fn=app.slice(app.indexOf('  function lockAllEventTeams('),app.indexOf('  function applyMaximumPlayerMixing('));
function run({incomplete=false,fail=false,locked=false}={}){
 const event={days:5,locked,swapPlayer:'p1',teamOrderSwap:{day:1,index:0},groupSetup:Object.fromEntries([1,2,3,4,5].map(d=>['day'+d,{groups:[['p1','p2','p3','p4']],starts:[10],saved:d===2}]))};
 if(incomplete)event.groupSetup.day3.groups=[['p1','p2','p3']];
 const original=structuredClone(event);let saves=0,renders=0,checks=[];const alerts=[];
 const c={store:{event},NO_PARTNER_ID:'NP',eventDays:()=>[1,2,3,4,5],dayFieldIds:()=>['p1','p2','p3','p4'],ensureShortTeamSelections:(s,d)=>checks.push(d),save:()=>{saves++;return !fail},renderTeamsPage:()=>renders++,alert:v=>alerts.push(v)};
 vm.createContext(c);vm.runInContext(fn,c);c.lockAllEventTeams();return{event,original,saves,renders,checks,alerts};
}
let r=run();assert.equal(r.saves,1);assert.equal(r.checks.length,5);for(const [key,setup] of Object.entries(r.event.groupSetup)){assert.equal(setup.saved,true);assert.deepEqual(setup.groups,r.original.groupSetup[key].groups);assert.deepEqual(setup.starts,[10]);}assert.equal(r.event.locked,false);
r=run({incomplete:true});assert.equal(r.saves,0);assert.deepEqual(JSON.parse(JSON.stringify(r.event)),r.original);assert.equal(r.alerts.length,1);
r=run({locked:true});assert.equal(r.saves,0);assert.deepEqual(JSON.parse(JSON.stringify(r.event)),r.original);
r=run({fail:true});assert.deepEqual(JSON.parse(JSON.stringify(r.event)),r.original);assert.equal(r.alerts.length,1);
console.log('All five days saved in one operation; player/order preservation, incomplete-draw blocking and save-failure rollback passed.');
