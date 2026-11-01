import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),safe=fs.readFileSync(new URL('../safe-cloud.js',import.meta.url),'utf8');
function extract(name){const start=app.search(new RegExp('  (?:async )?function '+name+'\\('));assert(start>=0);const end=app.slice(start+3).search(/\n  (?:async )?function /);return app.slice(start,start+3+end);}
const noop=()=>{};
async function phone({pending=true,durable=true}={}){
 const online={'1':{self:{gross:4}}},local=pending?{'1':{self:{gross:5}}}:online;
 const storage=new Map([['golfSafeSaves.v1',JSON.stringify({'e:score:1:p1':{base:online,revision:1,acknowledged:true,savedAt:Date.now(),...(pending?{pending:local}:{})}})]]);
 const localStorage={get length(){return storage.size;},key:i=>[...storage.keys()][i],getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const window={addEventListener(){}};vm.runInNewContext(safe,{window,localStorage,console,Date,JSON,Object,Array,Set,Map,String,Number,Boolean,Error,Promise,setTimeout,clearTimeout});
 let reviews=0,reviewed=false,closed=false;
 const api=window.GolfSafeCloud.install({loadEvent:async()=>({event:{status:'archived',event_data:{}},scores:[{day:1,scorer_player_id:'p1',score_data:online,revision:1}]}),safeControl:async(action)=>action==='retain'?(reviews++,{id:'review'}):{resolved:reviewed,data:local,revision:2}});
 const c={store:{event:{name:'Synthetic',workspaceId:'w',scoring:{day1:{p1:local}}},cloud:{eventId:'e',role:'player',playerId:'p1'},cloudPlayers:[],activeEventId:'w',eventWorkspace:[{id:'w',cloud:{eventId:'e'}},{id:'draft',event:{name:'Keep draft'}}]},workspaceShrinkAuthorised:false,
 GolfSafeCloud:window.GolfSafeCloud,AwayCloud:api,writeLocalStore:()=>durable,closeCloudConnection:()=>{closed=true;},setCloudMessage:noop,applyDeviceRole:noop,renderHome:noop,renderPlayerExperience:noop,renderLeaderboard:noop,nav:noop,console};
 vm.createContext(c);vm.runInContext(extract('retirePhoneFromArchivedEvent'),c);
 const original=c.store.event;c.retirePhoneFromArchivedEvent({event:{status:'archived'},scores:[{day:1,scorer_player_id:'p1',score_data:online}]});
 await new Promise(resolve=>setImmediate(resolve));
 return {c,api,original,storage,get reviews(){return reviews;},set reviewed(v){reviewed=v;},get closed(){return closed;}};
}
{
 const p=await phone();assert.equal(p.closed,true);assert.equal(p.c.store.cloud,undefined);assert.equal(p.c.store.eventWorkspace.length,1);assert.equal(p.c.store.eventWorkspace[0].id,'draft');assert.equal(p.c.store.activeEventId,null);
 assert(p.c.store.closedEventRecoveries.e);assert.equal(p.reviews,1);assert.match(p.storage.get('golfSafeSaves.v1'),/"gross":5/);
 p.reviewed=true;const result=await p.api.retainClosedEventCopies('e');assert.equal(result.retained,0);assert.equal(result.resolved,1);
}
{
 const p=await phone({pending:false});assert.equal(p.reviews,0);assert.equal(p.c.store.closedEventRecoveries,undefined);assert.deepEqual(JSON.parse(p.storage.get('golfSafeSaves.v1')),{});
}
{
 const p=await phone({durable:false});assert.equal(p.closed,false);assert.equal(p.c.store.event,p.original);assert.equal(p.c.store.cloud.eventId,'e');assert.equal(p.reviews,0);assert.match(p.storage.get('golfSafeSaves.v1'),/pending/);
}
{
 let archived=false;const alerts=[];const record={id:'w',event:{scoring:{day1:{p1:{}}},courseSnapshot:[{}]},cloud:{courseCards:[{}]}};
 const c={store:{event:{name:'Synthetic',workspaceId:'w',finalResults:{confirmedAt:'today'}},cloud:{eventId:'e'},eventWorkspace:[record]},workspaceShrinkAuthorised:false,confirm:()=>true,alert:s=>alerts.push(s),$:()=>null,console:{warn(){}},cloudTimeout:p=>p,
 AwayCloud:{loadEvent:async()=>({event:{event_data:{event:{finalResults:{confirmedAt:'today'}}}}}),archiveEvent:async()=>{archived=true;},saveWorkspace:async()=>{throw Error('Synthetic secondary failure');}},GolfSafeCloud:{saveHealth:()=>({}),discardEventCopies:noop},forgetPublishedEvent:noop,captureCurrentEvent:noop,closeCloudConnection:noop,forgetOrganiserEvent:noop,persistStore:()=>true,applyDeviceRole:noop,renderHome:noop,renderPlayerExperience:noop,renderLeaderboard:noop,nav:noop,setCloudMessage:noop,endScorecardUpdateProtection:noop};
 vm.createContext(c);vm.runInContext(extract('assertArchiveReady')+extract('archiveCompletedEvent'),c);await c.archiveCompletedEvent();
 assert.equal(archived,true);assert.equal(c.store.event,null);assert.match(alerts[0],/now archived/);assert.deepEqual(Object.keys(record.event.scoring),[]);assert.equal(record.cloud.courseCards,undefined);
 c.GolfSafeCloud.saveHealth=()=>({pending:1});assert.throws(()=>c.assertArchiveReady('e'),/unsent/);
}
console.log('Passed: pending archive cards retained for review, clean copies removed, drafts retained, retirement rollback on storage failure and truthful partial-archive status.');
