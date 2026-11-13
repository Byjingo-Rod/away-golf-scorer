const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(process.argv[2]||'app.js','utf8');
function fn(name){const a=src.indexOf('  function '+name+'(');assert(a>=0,name);const z=src.indexOf('\n  function ',a+10);return src.slice(a,z);}
const real={id:'r',name:'Member',ga:12,gaUpdatedAt:'original'},demo={id:'d',name:'Member',ga:22,demoBatch:'batch'},other={id:'e',name:'Other',demoBatch:'second'};
const c={window:{},Date,NO_PARTNER_ID:'system-no-partner',store:{players:[real,demo,other]},ensureEventGaHandicaps(){},player:id=>c.store.players.find(p=>p.id===id),eventGaHandicap:()=>44,eventGaCategory:()=> 'women'};
vm.createContext(c);for(const name of ['isTestEvent','eventRosterIssue','playerMatchesEventRoster','saveEventGaToPlayerProfiles'])vm.runInContext(fn(name),c);
for(const event of [{testMode:true},{ridgeTestMode:true},{demoBatch:'batch'},{demonstration:true},{name:'Club DEMO day'},{name:'Training TEST day'},{confirmed:['d']}])assert(c.isTestEvent(event));
assert(!c.isTestEvent({name:'Club monthly round',confirmed:['r']}));assert(!c.isTestEvent({name:'Latest tournament',confirmed:['r']}));
assert(c.eventRosterIssue({},['r','d']));assert(c.eventRosterIssue({},['d']));assert(c.eventRosterIssue({demoBatch:'batch'},['r']));assert(c.eventRosterIssue({demoBatch:'batch'},['d','e']));assert.equal(c.eventRosterIssue({demoBatch:'batch'},['d','system-no-partner']),'');assert.equal(c.eventRosterIssue({},['r']),'');
assert(!c.playerMatchesEventRoster(demo,{}));assert(!c.playerMatchesEventRoster(real,{demoBatch:'batch'}));assert(c.playerMatchesEventRoster(demo,{demoBatch:'batch'}));
c.saveEventGaToPlayerProfiles(['r'],{name:'DEMO club round'});assert.equal(real.ga,12);assert.equal(real.gaUpdatedAt,'original');
c.saveEventGaToPlayerProfiles(['d'],{demoBatch:'batch'});assert.equal(demo.ga,44);c.saveEventGaToPlayerProfiles(['r'],{name:'Club round'});assert.equal(real.ga,44);
c.window.GES_PLANNER_CONTEXT={group:{is_test_customer:true},selectedWorkspaceId:'workspace'};assert(c.isTestEvent({workspaceId:'workspace'}));assert(!c.isTestEvent({workspaceId:'other'}));assert(!c.isTestEvent({}));
for(const name of ['finishEvent','publishCloudEvent','updateCloudEvent','eventFinalChecks']){const a=src.indexOf('function '+name+'(');assert(a>=0);assert(src.slice(a,src.indexOf('\n  function ',a+10)).includes('eventRosterIssue('),name+' must guard mixed rosters');}
console.log('DEMO isolation: batch/genuine selection, mixed and unclassified roster rejection, all test flags, test-group scoping, real-profile GA protection, genuine GA save and finish/publication guards passed.');

// A closed TEST event did not necessarily add history. Never subtract on a timestamp alone.
c.writeLocalStore=()=>true;c.pairKey=(a,b)=>[a,b].sort().join('|');c.competitionIsOn=(id,day,e)=>e.competitions?.includes(id);c.store.pairHistory={'r|s':3};c.store.partnerHistory={'r|s':2};
const old={name:'TEST local',workspaceId:'unrecorded',days:1,historyRecordedAt:'closed',groupSetup:{day1:{groups:[['r','s']]}},competitions:[]};c.store.eventWorkspace=[{event:old}];
vm.runInContext(fn('removeRecordedTestEventHistory'),c);c.removeRecordedTestEventHistory();assert.equal(c.store.pairHistory['r|s'],3);assert.equal(c.store.partnerHistory['r|s'],2);
const counted={...old,name:'DEMO renamed',workspaceId:'recorded'};c.store.completedHistoryReceipts={recorded:'counted'};c.store.eventWorkspace=[{event:counted},{event:JSON.parse(JSON.stringify(counted))}];c.removeRecordedTestEventHistory();assert.equal(c.store.pairHistory['r|s'],2);assert.equal(c.store.partnerHistory['r|s'],2,'Non-4BBB events cannot decrement 4BBB partner history');c.removeRecordedTestEventHistory();assert.equal(c.store.pairHistory['r|s'],2);
console.log('History cleanup: unrecorded test counters unchanged, recorded contribution removed once, duplicate workspace copies and non-4BBB history protected.');

// Selecting DEMO does not enable the special local-test bypass used by older test tools.
const fields={'#availablePlayerList':{value:'demo-list'}},demos={id:'demo-list',name:'DEMO',demoBatch:'batch',playerIds:['d']};c.store.playerLists=[demos];c.store.event=null;c.store.cloud=null;c.W={newEvent:true,event:{name:'Draft',gaHandicaps:{r:12},dayFields:{day1:['r']},sharedPositions:{r:{day2:'s'}}},invites:new Map([['r','accepted']])};c.$=id=>fields[id]||={};c.alert=()=>{};c.confirm=()=>true;c.draw=()=>{};
const loadStart=src.indexOf('      $("#loadPlayerList").onclick = '),loadEnd=src.indexOf('      if ($("#wizardAllGreen"))',loadStart);vm.runInContext(src.slice(loadStart,loadEnd),c);fields['#loadPlayerList'].onclick();assert.equal(c.W.event.demonstration,true);assert.equal(c.W.event.testMode,undefined);assert.equal(c.W.event.gaHandicaps,undefined);assert.equal(c.W.event.sharedPositions,undefined);assert.deepEqual([...c.W.invites.keys()],['d']);
c.W={newEvent:false,event:{name:'Genuine published',previewPublishedAt:'published'},invites:new Map([['r','accepted']])};fields['#loadPlayerList'].onclick();assert.equal(c.W.event.demoBatch,undefined);assert.deepEqual([...c.W.invites.keys()],['r']);
console.log('DEMO list switch clears draft-only genuine assignments, preserves normal publication validation and refuses conversion of published genuine events.');
