import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
class Storage{map=new Map;get length(){return this.map.size}key(i){return [...this.map.keys()][i]}getItem(k){return this.map.get(k)??null}setItem(k,v){this.map.set(k,String(v))}removeItem(k){this.map.delete(k)}}
const storage=new Storage,window={};vm.runInNewContext(fs.readFileSync(new URL('../../test-event-purge.js',import.meta.url),'utf8'),{window,localStorage:storage});
const {isTest,purge,purgeMissing}=window.AwayTestPurge;
for(const n of ['TEST','test – Round','  TEST Round'])assert(isTest(n));for(const n of ['TESTING','Club TEST','DEMO'])assert(!isTest(n));
const put=(k,v)=>storage.setItem(k,JSON.stringify(v)),get=k=>JSON.parse(storage.getItem(k));
const event={id:'workspace-test',name:'TEST Round',cloudEventId:'live-test',publicationId:'publication-test',scoring:{1:5}},real={id:'workspace-real',name:'Club championship',cloudEventId:'live-real'};
put('awayGolf13',{event,activeEventId:'workspace-test',cloud:{eventId:'live-test'},players:[{id:'shared'}],courses:[{id:'course'}],eventWorkspace:[{id:event.id,event,cloud:{eventId:'live-test'}},{id:real.id,event:real,cloud:{eventId:'live-real'}}],closedEventRecoveries:{'live-test':{scores:1},'live-real':{scores:2}}});
put('golfSafeSaves.v1',{'live-test:event':{pending:{event},conflictId:'review'},'live-real:event':{pending:{event:real}}});
put('awayGolfPreImportBackup',{event,players:[{id:'shared'}],courses:[{id:'course'}]});put('awayGolfRecentPublishedV1',[{eventId:'live-test'},{eventId:'live-real'}]);put('awayGolfOrganiserLiveV1',{eventId:'live-test'});
assert(!purgeMissing('live-test').protected);const saved=get('awayGolf13');assert.equal(saved.event,null);assert.equal(saved.eventWorkspace.length,1);assert.equal(saved.players.length,1);assert.equal(saved.courses.length,1);assert(get('golfSafeSaves.v1')['live-real:event']);assert.equal(get('awayGolfPreImportBackup').players.length,1);
for(const [key,text]of storage.map)assert(!text.includes('live-test')&&!text.includes('TEST Round'),key);
assert(purgeMissing('live-real').protected);assert(purge({name:'TESTING',liveId:'live-real'}).protected);
// A background reconnect needs authoritative missing-event metadata. It cannot
// mistake a network/access failure for a deletion.
const app=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8'),start=app.indexOf('  async function retireDeletedTestConnection() {'),end=app.indexOf('  function watchCloudEvent()',start);
let missing=false,cleared=0,reloaded=0,closed=0;const scope={window:{AwayTestPurge:{isTest,purge:()=>{cleared++;return {protected:false}}}},store:{event,cloud:{eventId:'live-test'}},navigator:{onLine:true},AwayCloud:{isEventDeleted:async()=>missing},closeCloudConnection:()=>closed++,location:{reload:()=>reloaded++}};
vm.createContext(scope);vm.runInContext(app.slice(start,end),scope);assert.equal(await scope.retireDeletedTestConnection(),false);assert.equal(cleared,0);missing=true;assert.equal(await scope.retireDeletedTestConnection(),true);assert.equal(cleared,1);assert.equal(closed,1);assert.equal(reloaded,1);
console.log('Away local TEST purge passed: pending/review copies, backups, history, reconnect and other-event/shared-record protection.');

const routeStart=app.indexOf('  function deleteWorkspaceEvent(id) {'),routeEnd=app.indexOf('\n  function ',routeStart+5);
let selected;const routes={store:{eventWorkspace:[{id:'selected-test',event:{name:'TEST chosen'},cloud:{eventId:'published-test'}}]},window,deleteTestEventPermanently:(event,connection)=>selected={event,connection}};
vm.createContext(routes);vm.runInContext(app.slice(routeStart,routeEnd),routes);routes.deleteWorkspaceEvent('selected-test');assert.equal(selected.event.workspaceId,'selected-test');assert.equal(selected.connection.eventId,'published-test');
console.log('My Events routes only the selected TEST record into permanent deletion.');
const deleteStart=app.indexOf('  async function deleteTestEventPermanently('),deleteEnd=app.indexOf('  async function deleteCurrentEvent()',deleteStart);
let onlineCalls=0,localCalls=0,reloads=0,answer='Wrong name',alerts=[];const button={disabled:false};
const commandScope={store:{event,cloud:{eventId:'live-test'}},isPlayerDevice:()=>false,isSpectatorDevice:()=>false,isGuestOrganiser:()=>false,prompt:()=>answer,alert:m=>alerts.push(m),$:()=>button,navigator:{onLine:true},window:{AwayTestPurge:{purge:()=>{localCalls++;assert.equal(onlineCalls,1);return {protected:false}}}},AwayCloud:{deleteTestEvent:async(id,name)=>{assert.equal(id,'live-test');assert.equal(name,event.name);onlineCalls++;return {ids:['live-test']}}},closeCloudConnection(){},location:{reload:()=>reloads++}};
vm.createContext(commandScope);vm.runInContext(app.slice(deleteStart,deleteEnd),commandScope);
await commandScope.deleteTestEventPermanently();assert.equal(onlineCalls,0);assert.equal(localCalls,0);
answer=event.name;commandScope.navigator.onLine=false;await commandScope.deleteTestEventPermanently();assert.equal(onlineCalls,0);assert.equal(localCalls,0);
commandScope.navigator.onLine=true;await commandScope.deleteTestEventPermanently();assert.equal(onlineCalls,1);assert.equal(localCalls,1);assert.equal(reloads,1);
console.log('Permanent-delete command checks exact confirmation and connection, awaits cloud success, then clears/reloads locally.');
