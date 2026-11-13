import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const src=fs.readFileSync(process.argv[2]||'app.js','utf8');
function fn(name){const a=src.indexOf('  async function '+name+'('),z=src.indexOf('\n  async function ',a+10);assert(a>=0,name);return src.slice(a,z);}
let calls=0,release,durable=false;const alerts=[];
const c={store:{event:{name:'Synthetic',locked:true}},eventRosterIssue:()=>'',cloudPlayerIds:()=>[],uid:()=> 'stable-publication',setCloudMessage(){},persistStore:()=>durable,writeLocalStore:()=>true,cloudPayload:e=>({event:e,courses:[]}),cloudPlayerRows:()=>[],AwayCloud:{createEvent:async()=>{calls++;await new Promise(r=>release=r);return {event_id:'published',join_code:'SYNTH1'};},updateEvent:async()=>({})},rememberOrganiserWorkspace:async()=>{},rememberPublishedEvent(){},watchCloudEvent(){},renderCloudPanel(){},alert:m=>alerts.push(m)};
vm.createContext(c);vm.runInContext('let publicationFlight=false;'+fn('publishCloudEvent'),c);
assert.equal(await c.publishCloudEvent(),false);assert.equal(calls,0);assert.equal(c.store.event.publicationId,'stable-publication');durable=true;
const pending=c.publishCloudEvent();await Promise.resolve();assert.equal(await c.publishCloudEvent(),false);release();assert.equal(await pending,true);assert.equal(calls,1);
delete c.store.cloud;const second=c.publishCloudEvent();await Promise.resolve();c.store.event={name:'Different event'};release();assert.equal(await second,false);assert.equal(c.store.cloud,undefined);assert.equal(c.store.event.name,'Different event');
// An update read started on A cannot update B if the organiser switches events.
let updates=0,readRelease;c.store={event:{name:'A'},cloud:{role:'organiser',eventId:'A'}};c.cloudTimeout=p=>p;c.AwayCloud.loadEvent=()=>new Promise(r=>readRelease=r);c.AwayCloud.updateEvent=async()=>{updates++;};vm.runInContext(fn('updateCloudEvent'),c);
const update=c.updateCloudEvent();await Promise.resolve();c.store.event={name:'B'};c.store.cloud={role:'organiser',eventId:'B'};readRelease({event:{event_data:{event:{name:'A'}}}});assert.equal(await update,false);assert.equal(updates,0);assert.equal(c.store.event.name,'B');
console.log('Publication: durable identity, repeat-click guard, active-event switch protection and stale update-read isolation passed.');
