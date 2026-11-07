const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
const app=fs.readFileSync('app.js','utf8');
const probe=app.slice(app.indexOf('  async function clearKnownFinishedStorage(){'),app.indexOf('  function openAppStorage()'));
let finished=[],orphans=[],rendered=0,saved=0;
const context={window:{},console,store:{cloud:{eventId:'active'},closedEventRecoveries:{}},GolfSafeCloud:{storageRecords:()=>['federal','gone','active'].map(eventId=>({eventId})),discardDeletedEventCopies:(id,current)=>{orphans.push([id,current]);return 1;}},AwayCloud:{storageEventMetadata:async()=>[{id:'federal',name:'Federal GC',status:'archived',finished:true},{id:'gone',status:'deleted'},{id:'active',name:'Current event',status:'locked'}],loadAcceptedEvent:async()=>({})},clearFinishedEventCopies:id=>finished.push(id),writeLocalStore:()=>saved++,document:{querySelector:()=>true},renderAppStorage:()=>rendered++};
vm.createContext(context);await vm.runInContext('let finishedStorageCheck=false;'+probe+';clearKnownFinishedStorage()',context);
assert.deepEqual(finished,['federal']);assert.deepEqual(orphans,[['gone','active']]);assert.equal(context.window.AwayGolfStorageEventMetadata.federal.name,'Federal GC');assert.equal(saved,1);assert.equal(rendered,1);
const nameFn=app.slice(app.indexOf('  function isTestEventName('),app.indexOf('  function retainedTestEvent()'));
const isTest=vm.runInNewContext(nameFn+';isTestEventName');for(const name of ['TEST – One','Player Short Day 2 TEST','Record All Scores TEST — Copy','Manual Score Entry - Test 2','Away Golf - 15.38 Test'])assert(isTest(name));assert(!isTest('Federal GC'));assert(!isTest('Contest Golf'));
const finishFn=app.slice(app.indexOf('  async function finishAwardedEvent()'),app.indexOf('  async function archiveCompletedEvent()'));
async function runFinish({incomplete=false,failConfirmation=false}={}){
 const calls=[],alerts=[];const event={name:'St Georges Basin & Mollymook',date:'2026-10-29',pastCloudEventId:'trip'};
 const ctx={store:{event},Date,console,confirm:()=>true,alert:m=>alerts.push(m),australianDate:v=>v,eventDays:()=>[1,2],eventDayComplete:()=>!incomplete,leaderboardDefinitions:()=>[],summaryCompetitionResult:()=>({complete:true}),openPastEvent:async()=>true,buildFinalPlayerMessages:()=>({}),buildAwardedSnapshot:()=>({version:1}),recordCompletedEventHistory:()=>calls.push('history'),clearFinishedEventCopies:()=>calls.push('clear'),persistStore:()=>calls.push('persist'),AwayCloud:{loadAcceptedEvent:async()=>({event:{revision:17,status:'locked',event_data:{event}},scores:[{day:1,scorer_player_id:'ann',revision:3}]}),confirmEvent:async()=>{calls.push('confirm');if(failConfirmation)throw Error('Offline');return {revision:18,saved_data:{event:{...event,finalResults:{cloudAcceptedAt:'yes',confirmedAt:'now'}}}};},finishAwardedEvent:async(id,snapshot,revision)=>{calls.push('finish');assert.equal(revision,18);return {finishedAt:'sealed'};}}};
 vm.createContext(ctx);await vm.runInContext(finishFn+';finishAwardedEvent()',ctx);return {calls,alerts};
}
assert.deepEqual((await runFinish()).calls,['confirm','finish','history','clear','persist']);
assert(!(await runFinish({incomplete:true})).calls.includes('clear'));assert(!(await runFinish({failConfirmation:true})).calls.includes('clear'));
console.log('Storage repair: legacy final cleanup, named metadata, deleted-cache checks, TEST anywhere in names, and accepted-card sign-off before finishing passed; incomplete/offline events retain their copies.');
})().catch(e=>{console.error(e);process.exit(1)});
